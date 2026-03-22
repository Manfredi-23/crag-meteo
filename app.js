// ═══════════════════════════════════════════════════════
// BitWet — app.js v2
// Scoring Engine v2: climbing-window weighted, MeteoSwiss ICON-CH2,
// rock-type drying, altitude-aware fog, terrain/overhang, dry streak bonus
// ═══════════════════════════════════════════════════════

let crags = [];
let forecastCache = {};
let exploreFcCache = {};
let currentSort = 'weekend';
let exploreSort = 'weekend';
let expandedDays = {};
let expandedExplore = {};
const STORAGE_KEY = 'bitWet_v1';
const THEME_KEY = 'bitWet_theme';

// ─── 10-STEP SCORE LABELS ───
function scoreWord(s) {
  if (s >= 95) return 'Send It';
  if (s >= 85) return 'Atta Boy';
  if (s >= 75) return 'Decent';
  if (s >= 65) return 'Alright';
  if (s >= 55) return 'Maybe';
  if (s >= 45) return 'Meh';
  if (s >= 35) return 'Bit Wet';
  if (s >= 25) return 'Nicht Gut';
  if (s >= 15) return 'Hopeless';
  return 'Stay Home';
}

// ─── THEME / DARK MODE ───
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  else if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.setAttribute('data-theme', 'dark');
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem(THEME_KEY)) document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  });
}
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
}

// ─── STATUS ───
function setStatus(state, text) {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  dot.className = 'status-dot ' + (state === 'ok' ? 'ok' : state === 'error' ? 'err' : '');
  txt.textContent = text;
}

// ─── STORAGE ───
function loadCrags() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) { try { crags = JSON.parse(raw); return; } catch(e) {} }
  crags = DEFAULT_CRAGS.map(c => ({ ...c }));
  saveCrags();
}
function saveCrags() { localStorage.setItem(STORAGE_KEY, JSON.stringify(crags)); }

// ═══════════════════════════════════════════════════════
// WEATHER FETCHING — MeteoSwiss ICON-CH2 + ECMWF IFS
// ═══════════════════════════════════════════════════════
const API = 'https://api.open-meteo.com/v1/forecast';
const HOURLY_VARS = 'precipitation,wind_direction_10m,weather_code,temperature_2m,wind_speed_10m,wind_gusts_10m';
const DAILY_VARS = 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,weather_code,sunshine_duration,uv_index_max';

async function fetchForecast(lat, lon) {
  const base = `latitude=${lat}&longitude=${lon}&daily=${DAILY_VARS}&hourly=${HOURLY_VARS}&timezone=auto&past_days=2`;
  // MeteoSwiss ICON-CH2: 5-day forecast at 2km resolution for Switzerland
  // ECMWF IFS: 7-day global backup
  const [ch2, ecmwf] = await Promise.allSettled([
    fetch(`${API}?${base}&forecast_days=5&models=meteoswiss_icon_ch2`).then(r => r.json()),
    fetch(`${API}?${base}&forecast_days=7&models=ecmwf_ifs`).then(r => r.json()),
  ]);
  return {
    best: ch2.status === 'fulfilled' && !ch2.value.error ? ch2.value : null,
    ecmwf: ecmwf.status === 'fulfilled' && !ecmwf.value.error ? ecmwf.value : null,
  };
}

async function fetchAllForecasts() {
  setStatus('loading', 'updating...');
  let ok = 0;
  const tasks = crags.map(async c => {
    try { forecastCache[c.id] = await fetchForecast(c.lat, c.lon); ok++; }
    catch(e) { forecastCache[c.id] = { error: true }; }
  });
  await Promise.all(tasks);
  const now = new Date();
  setStatus(ok > 0 ? 'ok' : 'error', `updated ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`);
  renderCards();
}

// ═══════════════════════════════════════════════════════
// SCORING ENGINE v2
// ═══════════════════════════════════════════════════════

// Season profiles — ideal climbing temperature windows
function getSeasonProfile(ds) {
  const m = ds ? new Date(ds + 'T00:00:00').getMonth() : new Date().getMonth();
  if (m >= 11 || m <= 1) return { idealMin: 4, idealMax: 16 };
  if (m >= 2 && m <= 4) return { idealMin: 8, idealMax: 22 };
  if (m >= 5 && m <= 7) return { idealMin: 14, idealMax: 28 };
  return { idealMin: 10, idealMax: 24 };
}

// Rock drying multiplier: granite=fast, gneiss=medium, limestone=slow
function rockDryingFactor(rock) {
  const r = (rock || '').toLowerCase();
  if (r.includes('granite')) return 0.6;
  if (r.includes('gneiss')) return 0.8;
  if (r.includes('limestone')) return 1.2;
  if (r.includes('sandstone')) return 1.4;
  return 1.0;
}

// Terrain rain reduction: overhang stays dry, slab gets soaked
function terrainRainFactor(terrain) {
  if (terrain === 'overhang') return 0.3;  // 70% rain reduction
  if (terrain === 'vertical') return 0.7;
  return 1.0; // slab: full rain impact
}

// Drying hours: walk backwards from 9am (climbing start) through hourly precip
function calcDryingHours(fc, dayIndex, rock) {
  const src = fc.best || fc.ecmwf;
  if (!src?.hourly?.precipitation || !src?.hourly?.time || !src?.daily?.time) return null;
  const dayStr = src.daily.time[dayIndex];
  const targetTime = dayStr + 'T09:00';
  const times = src.hourly.time;
  const targetIdx = times.findIndex(t => t >= targetTime);
  if (targetIdx < 0) return null;
  const precip = src.hourly.precipitation;
  for (let i = targetIdx; i >= 0; i--) {
    if (precip[i] > 0.1) {
      const rawHours = targetIdx - i;
      // Apply rock drying factor: granite dries faster
      return rawHours / rockDryingFactor(rock);
    }
  }
  return targetIdx > 0 ? targetIdx : 72;
}

// Dry streak: count consecutive dry days before this day
function calcDryStreak(fc, dayIndex) {
  const src = fc.best || fc.ecmwf;
  if (!src?.daily?.precipitation_sum || !src?.daily?.time) return 0;
  let streak = 0;
  for (let i = dayIndex - 1; i >= 0; i--) {
    if ((src.daily.precipitation_sum[i] || 0) < 0.5) streak++;
    else break;
  }
  return streak;
}

// Wind direction (circular mean during climbing hours 9–18)
function getDayWindDirection(fc, dayIndex) {
  const src = fc.best || fc.ecmwf;
  if (!src?.hourly?.wind_direction_10m || !src?.hourly?.time || !src?.daily?.time) return null;
  const dayStr = src.daily.time[dayIndex];
  const times = src.hourly.time;
  const dirs = src.hourly.wind_direction_10m;
  let sinSum = 0, cosSum = 0, count = 0;
  for (let i = 0; i < times.length; i++) {
    if (times[i] >= dayStr + 'T09:00' && times[i] <= dayStr + 'T18:00' && dirs[i] != null) {
      const rad = dirs[i] * Math.PI / 180;
      sinSum += Math.sin(rad); cosSum += Math.cos(rad); count++;
    }
  }
  if (count === 0) return null;
  let avg = Math.atan2(sinSum / count, cosSum / count) * 180 / Math.PI;
  if (avg < 0) avg += 360;
  return Math.round(avg);
}

function orientationToDeg(dir) {
  const map = { 'N': 0, 'NE': 45, 'E': 90, 'SE': 135, 'S': 180, 'SW': 225, 'W': 270, 'NW': 315 };
  return map[dir] ?? null;
}

function calcWindShelter(windDeg, orientations) {
  if (windDeg == null || !orientations?.length) return { label: 'unknown', factor: 1.0 };
  let minExposure = 180;
  for (const dir of orientations) {
    const faceDeg = orientationToDeg(dir);
    if (faceDeg == null) continue;
    const exposedWindDir = (faceDeg + 180) % 360;
    let angleDiff = Math.abs(windDeg - exposedWindDir);
    if (angleDiff > 180) angleDiff = 360 - angleDiff;
    minExposure = Math.min(minExposure, angleDiff);
  }
  if (minExposure <= 30) return { label: 'Exposed', factor: 1.0 };
  if (minExposure <= 60) return { label: 'Crosswind', factor: 0.6 };
  if (minExposure >= 120) return { label: 'Sheltered', factor: 0.15 };
  return { label: 'Partial', factor: 0.35 };
}

// ─── CLIMBING-WINDOW WEIGHTED SCORE ───
// Scores based on hourly data within 9:00–18:00, weighted by time block importance.
// Night/evening only used for backward-looking drying.

const TIME_WEIGHTS = [
  { start: 'T09:00', end: 'T10:00', weight: 0.7, label: 'early' },
  { start: 'T10:00', end: 'T14:00', weight: 1.0, label: 'peak' },
  { start: 'T14:00', end: 'T17:00', weight: 0.8, label: 'afternoon' },
  { start: 'T17:00', end: 'T18:00', weight: 0.5, label: 'last burns' },
];

function computeScoreV2(fc, dayIndex, crag) {
  const src = fc.best || fc.ecmwf;
  if (!src?.hourly?.time || !src?.daily?.time) return null;
  const dayStr = src.daily.time[dayIndex];
  const times = src.hourly.time;
  const precip = src.hourly.precipitation;
  const wxCodes = src.hourly.weather_code;
  const temps = src.hourly.temperature_2m;
  const winds = src.hourly.wind_speed_10m;
  const gusts = src.hourly.wind_gusts_10m;
  const dd = extractDay(src, dayIndex);
  const orientation = crag.orientation || [];
  const terrain = crag.terrain || 'vertical';
  const rock = crag.rock || '';
  const alt = crag.alt || 0;
  const sn = getSeasonProfile(dayStr);

  // --- Compute weighted hourly metrics within climbing window ---
  let totalWeight = 0;
  let wRainMm = 0, wRainProb = 0, wTemp = 0, wWind = 0, wGusts = 0, wMaxWx = 0;
  let hasSevere = false;

  for (const block of TIME_WEIGHTS) {
    const bs = dayStr + block.start;
    const be = dayStr + block.end;
    let blockPrecip = 0, blockMaxWx = 0, blockTempSum = 0, blockWindMax = 0, blockGustMax = 0, cnt = 0;

    for (let i = 0; i < times.length; i++) {
      if (times[i] >= bs && times[i] < be) {
        blockPrecip += (precip?.[i] || 0);
        const wx = wxCodes?.[i] || 0;
        if (wx > blockMaxWx) blockMaxWx = wx;
        if (wx >= 95) hasSevere = true;
        blockTempSum += (temps?.[i] || 0);
        const ws = winds?.[i] || 0;
        const gs = gusts?.[i] || 0;
        if (ws > blockWindMax) blockWindMax = ws;
        if (gs > blockGustMax) blockGustMax = gs;
        cnt++;
      }
    }
    if (cnt === 0) continue;

    const w = block.weight;
    totalWeight += w;
    wRainMm += blockPrecip * w;
    wTemp += (blockTempSum / cnt) * w;
    wWind += blockWindMax * w;
    wGusts += blockGustMax * w;
    if (blockMaxWx > wMaxWx) wMaxWx = blockMaxWx;
  }

  if (totalWeight === 0) return null;

  // Normalize weighted values
  const avgRainMm = wRainMm / totalWeight;
  const avgTemp = wTemp / totalWeight;
  const avgWind = wWind / totalWeight;
  const avgGusts = wGusts / totalWeight;
  const rainProb = dd.precipitation_probability_max || 0;

  // === START SCORING (from 100) ===
  let s = 100;

  // 1. RAIN — probability weighted heavier, terrain-adjusted
  const rainFactor = terrainRainFactor(terrain);
  const effectiveRain = avgRainMm * rainFactor;
  // Probability penalty (heavier weight): up to -25
  s -= (rainProb / 100) * 25;
  // Amount penalty (lighter weight): up to -35
  if (effectiveRain > 4) s -= 35;
  else if (effectiveRain > 2) s -= 25;
  else if (effectiveRain > 0.5) s -= 15;
  else if (effectiveRain > 0.1) s -= 5;

  // 2. TEMPERATURE — season-adjusted
  if (avgTemp < sn.idealMin - 10) s -= 25;
  else if (avgTemp < sn.idealMin - 5) s -= 15;
  else if (avgTemp < sn.idealMin) s -= 6;
  else if (avgTemp > sn.idealMax + 8) s -= 20;
  else if (avgTemp > sn.idealMax + 3) s -= 10;
  else if (avgTemp > sn.idealMax) s -= 3;
  else s += 3; // sweet spot bonus

  // 3. WIND — lenient, heavily modified by shelter
  const windDeg = getDayWindDirection(fc, dayIndex);
  const shelter = calcWindShelter(windDeg, orientation);
  const effectiveGusts = avgGusts * shelter.factor;
  const effectiveWind = avgWind * shelter.factor;
  if (effectiveGusts > 50) s -= 15;
  else if (effectiveGusts > 35) s -= 8;
  else if (effectiveWind > 25) s -= 4;
  // Small bonus for calm + sheltered
  if (avgWind < 10 && shelter.factor < 0.5) s += 2;

  // 4. SEVERE WEATHER — thunderstorm/snow only (no double-counting rain)
  if (hasSevere) s -= 20; // thunderstorm in climbing window = serious
  else if (wMaxWx >= 71 && wMaxWx <= 77) s -= 12; // snow

  // 5. FOG — altitude-aware
  if (wMaxWx >= 45 && wMaxWx <= 48) {
    if (alt < 800) s -= 10;       // valley fog, bad
    else if (alt < 1400) s -= 5;  // might be in it
    else s -= 1;                   // likely above
  }

  // 6. DRYING TIME — rock-type adjusted
  const dryHours = calcDryingHours(fc, dayIndex, rock);
  if (dryHours != null) {
    if (dryHours < 3) s -= 18;
    else if (dryHours < 6) s -= 10;
    else if (dryHours < 12) s -= 4;
    else if (dryHours < 24) s -= 1;
  }

  // 7. DRY STREAK BONUS
  const dryStreak = calcDryStreak(fc, dayIndex);
  if (dryStreak >= 5) s += 5;
  else if (dryStreak >= 3) s += 3;
  else if (dryStreak >= 2) s += 1;

  // 8. SUNSHINE bonus (if available)
  const sunH = dd.sunshine_duration ? dd.sunshine_duration / 3600 : null;
  if (sunH != null) {
    if (sunH > 8) s += 2;
    else if (sunH < 2) s -= 3;
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(s))),
    dryHours,
    dryStreak,
    windDeg,
    windShelter: shelter,
    effectiveRain: avgRainMm,
    avgTemp: Math.round(avgTemp),
    avgWind: Math.round(avgWind),
    avgGusts: Math.round(avgGusts),
  };
}

function extractDay(fc, i) {
  return {
    temperature_2m_max: fc.daily.temperature_2m_max[i],
    temperature_2m_min: fc.daily.temperature_2m_min[i],
    precipitation_sum: fc.daily.precipitation_sum[i],
    precipitation_probability_max: fc.daily.precipitation_probability_max[i],
    wind_speed_10m_max: fc.daily.wind_speed_10m_max[i],
    wind_gusts_10m_max: fc.daily.wind_gusts_10m_max[i],
    weather_code: fc.daily.weather_code[i],
    sunshine_duration: fc.daily.sunshine_duration?.[i],
    uv_index_max: fc.daily.uv_index_max?.[i],
  };
}

// Blended score: average CH2 + ECMWF
function blendedScore(fc, di, crag) {
  const cragObj = typeof crag === 'object' ? crag : { orientation: crag || [] };
  const r1 = fc.best ? computeScoreV2({ best: fc.best, ecmwf: null }, di, cragObj) : null;
  const r2 = fc.ecmwf ? computeScoreV2({ best: null, ecmwf: fc.ecmwf }, di, cragObj) : null;
  const s1 = r1?.score ?? null;
  const s2 = r2?.score ?? null;
  // Use whichever result has more data for metadata
  const meta = r1 || r2 || {};
  if (s1 !== null && s2 !== null) {
    const avg = Math.round((s1 + s2) / 2);
    const diff = Math.abs(s1 - s2);
    return { ...meta, score: avg, confidence: diff <= 10 ? 'high' : diff <= 25 ? 'medium' : 'low', sB: s1, sE: s2 };
  }
  return { ...meta, score: s1 ?? s2 ?? 0, confidence: 'single', sB: s1, sE: s2 };
}

// ─── HELPERS ───
function scorePillClass(s) { return s >= 80 ? 's-great' : s >= 60 ? 's-good' : s >= 40 ? 's-ok' : s >= 20 ? 's-poor' : 's-bad'; }
function scoreColorHex(s) { return s >= 80 ? '#5BAD6A' : s >= 60 ? '#7EC98A' : s >= 40 ? '#D4A843' : s >= 20 ? '#E8725A' : '#9A9490'; }
function confTag(c) { return c === 'high' ? '' : c === 'medium' ? '<div class="conf-tag">uncertain</div>' : c === 'low' ? '<div class="conf-tag">models split</div>' : ''; }

function dryingLabel(hours) {
  if (hours == null) return '—';
  if (hours >= 48) return '48h+ (dry)';
  if (hours >= 24) return Math.round(hours) + 'h (good)';
  if (hours >= 12) return Math.round(hours) + 'h (ok)';
  if (hours >= 6) return Math.round(hours) + 'h (damp)';
  return Math.round(hours) + 'h (wet)';
}
function dryingClass(hours) {
  if (hours == null) return '';
  if (hours >= 24) return '';
  if (hours >= 6) return 'warn';
  return 'bad';
}

function windDirLabel(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

// ─── SCORE LOOKUPS (for sorting) ───
function getBestBlended(id) {
  const fc = forecastCache[id]; if (!fc || fc.error) return -1;
  const src = fc.best || fc.ecmwf; if (!src?.daily) return -1;
  const c = crags.find(x => x.id === id);
  return Math.max(...src.daily.time.map((_, i) => blendedScore(fc, i, c).score));
}

function getWeekendScore(id) {
  const fc = forecastCache[id]; if (!fc || fc.error) return -1;
  const src = fc.best || fc.ecmwf; if (!src?.daily) return -1;
  const c = crags.find(x => x.id === id);
  let satBest = -1, sunBest = -1;
  src.daily.time.forEach((ds, i) => {
    const dow = new Date(ds + 'T00:00:00').getDay();
    const s = blendedScore(fc, i, c).score;
    if (dow === 6 && s > satBest) satBest = s;
    if (dow === 0 && s > sunBest) sunBest = s;
  });
  if (satBest >= 0 && sunBest >= 0) return Math.round((satBest + sunBest) / 2);
  return Math.max(satBest, sunBest);
}

function getTodayScore(id) {
  const fc = forecastCache[id]; if (!fc || fc.error) return -1;
  const src = fc.best || fc.ecmwf; if (!src?.daily) return -1;
  const c = crags.find(x => x.id === id);
  const today = new Date().toISOString().slice(0, 10);
  const idx = src.daily.time.indexOf(today);
  return blendedScore(fc, idx >= 0 ? idx : 0, c).score;
}

// ─── TIME-OF-DAY SLOTS (full scoring, lazy) ───
function getTimeSlots(fc, dayIndex, crag) {
  const src = fc.best || fc.ecmwf;
  if (!src?.hourly?.time || !src?.daily?.time) return null;
  const dayStr = src.daily.time[dayIndex];
  const slots = [
    { label: 'Sunrise', start: 'T05:00', end: 'T08:00' },
    { label: 'Morning', start: 'T08:00', end: 'T11:00' },
    { label: 'Midday', start: 'T11:00', end: 'T14:00' },
    { label: 'Afternoon', start: 'T14:00', end: 'T17:00' },
    { label: 'Evening', start: 'T17:00', end: 'T20:00' },
  ];
  const times = src.hourly.time;
  const precip = src.hourly.precipitation;
  const wxCodes = src.hourly.weather_code;
  const temps = src.hourly.temperature_2m;
  const windDirs = src.hourly.wind_direction_10m;
  const orientation = crag.orientation || [];
  const terrain = crag.terrain || 'vertical';
  const rock = crag.rock || '';
  const alt = crag.alt || 0;

  return slots.map(slot => {
    const s = dayStr + slot.start;
    const e = dayStr + slot.end;
    let totalPrecip = 0, maxWx = 0, count = 0, tempMax = -100, tempMin = 100;
    let windSinSum = 0, windCosSum = 0, windCount = 0;
    for (let i = 0; i < times.length; i++) {
      if (times[i] >= s && times[i] < e) {
        totalPrecip += (precip?.[i] || 0);
        if ((wxCodes?.[i] || 0) > maxWx) maxWx = wxCodes[i];
        const t = temps?.[i];
        if (t != null) { tempMax = Math.max(tempMax, t); tempMin = Math.min(tempMin, t); count++; }
        if (windDirs?.[i] != null) {
          const rad = windDirs[i] * Math.PI / 180;
          windSinSum += Math.sin(rad); windCosSum += Math.cos(rad); windCount++;
        }
      }
    }
    let slotWindDeg = null;
    if (windCount > 0) {
      slotWindDeg = Math.atan2(windSinSum / windCount, windCosSum / windCount) * 180 / Math.PI;
      if (slotWindDeg < 0) slotWindDeg += 360;
      slotWindDeg = Math.round(slotWindDeg);
    }
    const slotShelter = calcWindShelter(slotWindDeg, orientation);
    let slotDryHours = null;
    const slotStartIdx = times.findIndex(t => t >= s);
    if (slotStartIdx >= 0) {
      for (let i = slotStartIdx; i >= 0; i--) {
        if ((precip?.[i] || 0) > 0.1) { slotDryHours = (slotStartIdx - i) / rockDryingFactor(rock); break; }
      }
      if (slotDryHours == null) slotDryHours = 48;
    }
    const dayRecord = {
      temperature_2m_max: tempMax > -100 ? tempMax : null,
      temperature_2m_min: tempMin < 100 ? tempMin : null,
      precipitation_sum: totalPrecip * terrainRainFactor(terrain),
      precipitation_probability_max: totalPrecip > 0 ? 80 : 10,
      wind_speed_10m_max: 0, wind_gusts_10m_max: 0,
      weather_code: maxWx,
    };
    // Use legacy computeScore for slots (simpler, no hourly weighting needed)
    const sn = getSeasonProfile(dayStr);
    let slotScore = 100;
    const ep = dayRecord.precipitation_sum;
    slotScore -= (dayRecord.precipitation_probability_max / 100) * 25;
    if (ep > 4) slotScore -= 35; else if (ep > 2) slotScore -= 25; else if (ep > 0.5) slotScore -= 15; else if (ep > 0.1) slotScore -= 5;
    const st = dayRecord.temperature_2m_max;
    if (st != null) {
      if (st < sn.idealMin - 5) slotScore -= 12;
      else if (st < sn.idealMin) slotScore -= 5;
      else if (st > sn.idealMax + 5) slotScore -= 10;
      else if (st > sn.idealMax) slotScore -= 3;
    }
    if (maxWx >= 95) slotScore -= 20;
    else if (maxWx >= 71) slotScore -= 12;
    if (maxWx >= 45 && maxWx <= 48) { if (alt < 800) slotScore -= 8; else if (alt < 1400) slotScore -= 3; }
    if (slotDryHours != null && slotDryHours < 6) slotScore -= 10;
    slotScore = Math.max(0, Math.min(100, Math.round(slotScore)));
    return { label: slot.label, wx: wxLabel(maxWx), wxCode: maxWx, score: slotScore, precip: totalPrecip.toFixed(1) };
  });
}

function getDayTrend(slots) {
  if (!slots || slots.length < 4) return 'Stable';
  const first = (slots[0].score + slots[1].score) / 2;
  const second = (slots[3].score + slots[4].score) / 2;
  if (second - first > 15) return 'Improving';
  if (second - first < -15) return 'Getting worse';
  return 'Stable';
}

// ─── ROCK TEMPERATURE ESTIMATE ───
function estimateRockTemp(fc, dayIndex, orientation, alt, rock) {
  const src = fc.best || fc.ecmwf;
  if (!src?.hourly?.time || !src?.daily?.time) return null;
  const dayStr = src.daily.time[dayIndex];
  const times = src.hourly.time;
  const temps = src.hourly.temperature_2m;
  const dd = extractDay(src, dayIndex);
  let airSum = 0, airCount = 0;
  for (let i = 0; i < times.length; i++) {
    if (times[i] >= dayStr + 'T10:00' && times[i] < dayStr + 'T15:00' && temps?.[i] != null) {
      airSum += temps[i]; airCount++;
    }
  }
  if (airCount === 0) { if (dd.temperature_2m_max == null) return null; airSum = dd.temperature_2m_max; airCount = 1; }
  const airTemp = airSum / airCount;
  const sunFraction = dd.sunshine_duration ? Math.min(dd.sunshine_duration / (14 * 3600), 1) : 0;
  let orientFactor = 0.3;
  if (orientation?.length) {
    const southish = orientation.some(d => ['S','SE','SW'].includes(d));
    const northOnly = orientation.every(d => ['N','NE','NW'].includes(d));
    if (northOnly) orientFactor = 0.08;
    else if (southish) orientFactor = 0.85;
    else orientFactor = 0.5;
  }
  let rockFactor = 1.0;
  const r = (rock || '').toLowerCase();
  if (r.includes('granite') || r.includes('gneiss')) rockFactor = 1.15;
  else if (r.includes('limestone')) rockFactor = 0.85;
  const altBoost = 1 + ((alt || 0) / 1000) * 0.02;
  const solarGain = 15 * sunFraction * orientFactor * rockFactor * altBoost;
  const wind = dd.wind_speed_10m_max || 0;
  const windCooling = wind > 5 ? Math.min((wind - 5) * 0.15, 5) : 0;
  return Math.round(airTemp + solarGain - windCooling);
}
function frictionLabel(rt) {
  if (rt == null) return { text: '—', cls: '' };
  if (rt < 5) return { text: 'Cold rock', cls: 'rain' };
  if (rt < 12) return { text: 'Cool · good friction', cls: '' };
  if (rt < 25) return { text: 'Ideal friction', cls: '' };
  if (rt < 35) return { text: 'Warm · friction ok', cls: 'warn' };
  return { text: 'Hot · sweaty', cls: 'bad' };
}

// ─── SORT ───
function setSort(btn) {
  currentSort = btn.dataset.sort;
  document.querySelectorAll('#sortBar .sort-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCards();
}
function sortedCrags() {
  const list = [...crags];
  switch (currentSort) {
    case 'weekend': return list.sort((a, b) => getWeekendScore(b.id) - getWeekendScore(a.id));
    case 'score': return list.sort((a, b) => getTodayScore(b.id) - getTodayScore(a.id));
    case 'name': return list.sort((a, b) => a.name.localeCompare(b.name));
    default: return list;
  }
}

// ─── RENDER CARDS ───
function renderCards() {
  const grid = document.getElementById('cragGrid');
  if (!grid) return;
  const sorted = sortedCrags();
  const todayStr = new Date().toISOString().slice(0, 10);

  grid.innerHTML = sorted.map((c, ci) => {
    const fc = forecastCache[c.id];
    const src = fc ? (fc.best || fc.ecmwf) : null;
    const metaParts = [c.region, c.alt ? c.alt + 'm' : '', c.rock, c.orientation?.length ? c.orientation.join(' · ') : ''].filter(Boolean);
    const metaHTML = metaParts.map(m => `<span>${m}</span>`).join('');
    const expIdx = expandedDays[c.id] ?? null;

    let fHTML = '';
    if (!fc) {
      fHTML = '<div class="card-loading">fetching forecast</div>';
    } else if (fc.error || !src?.daily) {
      fHTML = '<div class="card-loading">no data available</div>';
    } else {
      const cells = src.daily.time.map((ds, di) => {
        if (ds < todayStr) return '';
        const dd = extractDay(src, di);
        const bl = blendedScore(fc, di, c);
        const dayName = new Date(ds + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
        const dayNum = new Date(ds + 'T00:00:00').getDate();
        const isSelected = expIdx === di;
        const isFaded = expIdx != null && !isSelected;
        return `<div class="fday ${isSelected ? 'selected' : ''} ${isFaded ? 'faded' : ''}" onclick="toggleDay('${c.id}',${di})">
          <div class="fday-name">${dayName} ${dayNum}</div>
          <div class="fday-icon">${wxSVG(dd.weather_code)}</div>
          <div class="fday-wx-label">${wxLabel(dd.weather_code)}</div>
          <div class="fday-temp">[ ${dd.temperature_2m_min != null ? Math.round(dd.temperature_2m_min) : '?'}° / ${dd.temperature_2m_max != null ? Math.round(dd.temperature_2m_max) : '?'}° ]</div>
          <div class="score-pill ${scorePillClass(bl.score)}">${bl.score}</div>
          ${confTag(bl.confidence)}
        </div>`;
      }).join('');

      let detailHTML = '';
      if (expIdx != null && src.daily.time[expIdx]) {
        const dd = extractDay(src, expIdx);
        const bl = blendedScore(fc, expIdx, c);
        const p = dd.precipitation_sum || 0, pp = dd.precipitation_probability_max || 0;
        const w = dd.wind_speed_10m_max || 0, g = dd.wind_gusts_10m_max || 0;
        const sh = dd.sunshine_duration ? (dd.sunshine_duration / 3600).toFixed(1) : '—';
        const uv = dd.uv_index_max != null ? dd.uv_index_max.toFixed(0) : '—';
        const wc = g > 50 ? 'bad' : g > 35 || w > 25 ? 'warn' : '';
        const rc = p > 0.5 ? 'rain' : '';
        const dl = new Date(src.daily.time[expIdx] + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        const expDateStr = src.daily.time[expIdx];

        const slots = getTimeSlots(fc, expIdx, c);
        const trend = getDayTrend(slots);
        const trendClass = trend === 'Improving' ? 'improving' : trend === 'Getting worse' ? 'worsening' : '';
        const rockTemp = estimateRockTemp(fc, expIdx, c.orientation, c.alt, c.rock);
        const friction = frictionLabel(rockTemp);
        const streakLabel = bl.dryStreak >= 2 ? `${bl.dryStreak} days dry` : '';

        let slotsHTML = '';
        if (slots) {
          slotsHTML = `<div class="detail-times">` + slots.map(sl =>
            `<div class="detail-time-row"><span class="detail-time-label">${sl.label}</span><span class="detail-time-wx">${sl.wx} <span class="detail-time-score">(${sl.score})</span></span></div>`
          ).join('') + `</div>`;
        }

        let modelHTML = '';
        if (bl.sB != null && bl.sE != null) {
          modelHTML = `<div class="model-row"><div class="model-box"><strong>MeteoSwiss CH2</strong>Score: ${bl.sB}</div><div class="model-box"><strong>ECMWF IFS</strong>Score: ${bl.sE}</div></div>`;
        }

        detailHTML = `<div class="detail-panel">
          <div class="detail-header"><span class="detail-date">${dl}</span></div>
          <div class="detail-verdict">${scoreWord(bl.score)}</div>
          ${slotsHTML}
          <div class="detail-stats">
            <div class="detail-stat"><div class="detail-stat-label">Wind</div><div class="detail-stat-val ${wc}">${Math.round(w)} Km/h</div></div>
            <div class="detail-stat"><div class="detail-stat-label">Wind Dir.</div><div class="detail-stat-val">${bl.windDeg != null ? bl.windDeg + '° (' + windDirLabel(bl.windDeg) + ')' : '—'}</div></div>
            <div class="detail-stat"><div class="detail-stat-label">Shelter</div><div class="detail-stat-val ${bl.windShelter?.label === 'Exposed' ? 'bad' : bl.windShelter?.label === 'Crosswind' ? 'warn' : ''}">${bl.windShelter?.label || '—'}</div></div>
            <div class="detail-stat"><div class="detail-stat-label">Temperature</div><div class="detail-stat-val">${dd.temperature_2m_min != null ? Math.round(dd.temperature_2m_min) : '?'}° / ${dd.temperature_2m_max != null ? Math.round(dd.temperature_2m_max) : '?'}°</div></div>
            <div class="detail-stat"><div class="detail-stat-label">UV Index</div><div class="detail-stat-val">${uv}</div></div>
            <div class="detail-stat"><div class="detail-stat-label">Sunshine</div><div class="detail-stat-val">${sh} h</div></div>
            <div class="detail-stat"><div class="detail-stat-label">Rain</div><div class="detail-stat-val ${rc}">${p.toFixed(1)}mm (${pp}%)</div></div>
            <div class="detail-stat"><div class="detail-stat-label">Drying</div><div class="detail-stat-val ${dryingClass(bl.dryHours)}">${dryingLabel(bl.dryHours)}${streakLabel ? ' · ' + streakLabel : ''}</div></div>
            <div class="detail-stat"><div class="detail-stat-label">Rock ~</div><div class="detail-stat-val ${friction.cls}">${rockTemp != null ? '~' + rockTemp + '°' : '—'}</div></div>
          </div>
          <div class="detail-trend ${trendClass}">${trend}</div>
          ${modelHTML}
        </div>`;
      }
      fHTML = `<div class="forecast-area"><div class="forecast-scroll"><div class="forecast-track">${cells}</div></div>${detailHTML}</div>`;
    }

    return `<div class="crag-card" style="animation-delay:${ci * 0.06}s">
      <div class="card-head"><div class="card-head-row">
        <div class="crag-name">${c.name}</div>
        <div class="meta-pipe">${metaHTML}</div>
        <div class="card-actions">
          <button class="card-overflow" onclick="toggleCardMenu('${c.id}',event)" aria-label="Options">···</button>
          <div class="card-menu" id="menu-${c.id}">
            <button onclick="editCrag('${c.id}');closeCardMenus()">Edit crag</button>
            <button class="card-menu-danger" onclick="removeCrag('${c.id}');closeCardMenus()">Remove</button>
          </div>
        </div>
      </div></div>
      <hr class="card-hr">
      ${c.notes ? `<div class="card-notes">${c.notes}</div>` : ''}
      ${fHTML}</div>`;
  }).join('');
}

function toggleDay(cragId, dayIdx) {
  expandedDays[cragId] = expandedDays[cragId] === dayIdx ? undefined : dayIdx;
  renderCards();
}

// ─── CARD MENU ───
function toggleCardMenu(cragId, event) {
  event.stopPropagation();
  const menu = document.getElementById('menu-' + cragId);
  const wasOpen = menu.classList.contains('open');
  closeCardMenus();
  if (!wasOpen) menu.classList.add('open');
}
function closeCardMenus() { document.querySelectorAll('.card-menu.open').forEach(m => m.classList.remove('open')); }
document.addEventListener('click', closeCardMenus);

// ─── EXPLORE ───
function setExploreSort(btn) {
  exploreSort = btn.dataset.sort;
  document.querySelectorAll('#exploreSortBar .sort-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderExplore();
}

function getRegionWeekendScore(region) {
  const crgs = REGION_CRAGS[region] || [];
  let best = -1;
  crgs.forEach(rc => {
    const key = region + ':' + rc.name;
    const fc = exploreFcCache[key];
    if (!fc || fc.error) return;
    const src = fc.best || fc.ecmwf;
    if (!src?.daily) return;
    let satBest = -1, sunBest = -1;
    src.daily.time.forEach((ds, i) => {
      const dow = new Date(ds + 'T00:00:00').getDay();
      const s = blendedScore(fc, i, rc).score;
      if (dow === 6 && s > satBest) satBest = s;
      if (dow === 0 && s > sunBest) sunBest = s;
    });
    let avg = Math.max(satBest, sunBest);
    if (satBest >= 0 && sunBest >= 0) avg = Math.round((satBest + sunBest) / 2);
    if (avg > best) best = avg;
  });
  return best;
}

function getRegionTodayScore(region) {
  const crgs = REGION_CRAGS[region] || [];
  const today = new Date().toISOString().slice(0, 10);
  let best = -1;
  crgs.forEach(rc => {
    const key = region + ':' + rc.name;
    const fc = exploreFcCache[key];
    if (!fc || fc.error) return;
    const src = fc.best || fc.ecmwf;
    if (!src?.daily) return;
    const idx = src.daily.time.indexOf(today);
    if (idx < 0) return;
    const s = blendedScore(fc, idx, rc).score;
    if (s > best) best = s;
  });
  return best;
}

function renderExplore() {
  const grid = document.getElementById('exploreGrid');
  if (!grid) return;
  let sortedRegions = [...REGIONS];
  switch (exploreSort) {
    case 'weekend': sortedRegions.sort((a, b) => getRegionWeekendScore(b) - getRegionWeekendScore(a)); break;
    case 'score': sortedRegions.sort((a, b) => getRegionTodayScore(b) - getRegionTodayScore(a)); break;
    case 'name': sortedRegions.sort((a, b) => a.localeCompare(b)); break;
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  grid.innerHTML = sortedRegions.map(region => {
    const crgs = REGION_CRAGS[region] || [];
    const isOpen = expandedExplore[region]?.open;
    let regionScore = exploreSort === 'weekend' ? getRegionWeekendScore(region) : exploreSort === 'score' ? getRegionTodayScore(region) : -1;
    if (regionScore < 0) {
      crgs.forEach(rc => { const key = region + ':' + rc.name; const fc = exploreFcCache[key]; if (!fc || fc.error) return; const src = fc.best || fc.ecmwf; if (!src?.daily) return; src.daily.time.forEach((_, di) => { const s = blendedScore(fc, di, rc).score; if (s > regionScore) regionScore = s; }); });
    }
    const badge = regionScore >= 0 ? `<span class="region-score-badge ${scorePillClass(regionScore)}">${regionScore}</span>` : '';

    let cragsHTML = '';
    if (isOpen) {
      cragsHTML = crgs.map(rc => {
        const key = region + ':' + rc.name;
        const fc = exploreFcCache[key];
        const cragOpen = expandedExplore[region]?.crags?.[rc.name];
        let scoreHTML = '', detailHTML = '';
        if (fc && !fc.error) {
          const src = fc.best || fc.ecmwf;
          if (src?.daily) {
            const scores = src.daily.time.map((ds, di) => {
              if (ds < todayStr) return '';
              const bl = blendedScore(fc, di, rc);
              const dayName = new Date(ds + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
              return `<span style="color:${scoreColorHex(bl.score)};font-weight:700">${dayName} ${bl.score}</span>`;
            }).filter(Boolean).slice(0, 4).join(' · ');
            scoreHTML = `<div style="font-family:var(--font-data);font-size:10px;margin-top:4px">${scores}</div>`;
            if (cragOpen) {
              const cells = src.daily.time.map((ds, di) => {
                if (ds < todayStr) return '';
                const dd = extractDay(src, di);
                const bl = blendedScore(fc, di, rc);
                const dayName = new Date(ds + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                const dayNum = new Date(ds + 'T00:00:00').getDate();
                return `<div class="fday"><div class="fday-name">${dayName} ${dayNum}</div><div class="fday-icon">${wxSVG(dd.weather_code)}</div><div class="fday-wx-label">${wxLabel(dd.weather_code)}</div><div class="fday-temp">[ ${dd.temperature_2m_min != null ? Math.round(dd.temperature_2m_min) : '?'}° / ${dd.temperature_2m_max != null ? Math.round(dd.temperature_2m_max) : '?'}° ]</div><div class="score-pill ${scorePillClass(bl.score)}">${bl.score}</div></div>`;
              }).join('');
              const alreadyAdded = crags.some(uc => uc.name === rc.name && Math.abs(uc.lat - rc.lat) < 0.01);
              const addBtn = alreadyAdded ? `<button class="add-to-usuals-btn" disabled style="opacity:0.4;cursor:default">Already in Usuals</button>` : `<button class="add-to-usuals-btn" onclick="addExploreToUsuals('${region}','${rc.name.replace(/'/g,"\\'")}')">+ Add to Usuals</button>`;
              detailHTML = `<div class="explore-crag-detail open"><div class="forecast-area"><div class="forecast-scroll"><div class="forecast-track">${cells}</div></div></div>${addBtn}</div>`;
            }
          }
        } else if (!fc) { scoreHTML = '<div style="font-family:var(--font-data);font-size:10px;color:var(--ink-faint);margin-top:4px">loading...</div>'; }
        return `<div class="explore-crag" onclick="toggleExploreCrag('${region}','${rc.name.replace(/'/g,"\\'")}',event)"><div class="explore-crag-head"><span class="explore-crag-name">${rc.name}</span><span class="explore-crag-meta">${rc.alt}m · ${rc.rock}</span></div>${scoreHTML}${detailHTML}</div>`;
      }).join('');
    }
    return `<div class="region-card"><div class="region-head" onclick="toggleRegion('${region}')">${region} ${badge}</div><div class="region-crags ${isOpen ? 'open' : ''}">${cragsHTML}</div></div>`;
  }).join('');
}

function toggleRegion(region) {
  if (!expandedExplore[region]) expandedExplore[region] = { open: false, crags: {} };
  expandedExplore[region].open = !expandedExplore[region].open;
  renderExplore();
  if (expandedExplore[region].open) {
    (REGION_CRAGS[region] || []).forEach(async rc => {
      const key = region + ':' + rc.name;
      if (exploreFcCache[key]) return;
      try { exploreFcCache[key] = await fetchForecast(rc.lat, rc.lon); } catch(e) { exploreFcCache[key] = { error: true }; }
      renderExplore();
    });
  }
}
function toggleExploreCrag(region, name, event) {
  event.stopPropagation();
  if (!expandedExplore[region]) expandedExplore[region] = { open: true, crags: {} };
  expandedExplore[region].crags[name] = !expandedExplore[region].crags[name];
  renderExplore();
}
function addExploreToUsuals(region, name) {
  const rc = (REGION_CRAGS[region] || []).find(c => c.name === name);
  if (!rc) return;
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now();
  crags.push({ id, name: rc.name, region, lat: rc.lat, lon: rc.lon, alt: rc.alt, rock: rc.rock, orientation: rc.orientation || [], terrain: 'vertical', notes: '' });
  saveCrags();
  fetchForecast(rc.lat, rc.lon).then(fc => { forecastCache[id] = fc; renderCards(); });
  renderExplore(); renderCards();
}

// ─── TABS ───
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('pane-' + tab).classList.add('active');
  btn.classList.add('active');
  if (tab === 'explore') {
    renderExplore();
    const anyLoaded = REGIONS.some(r => (REGION_CRAGS[r] || []).some(rc => exploreFcCache[r + ':' + rc.name]));
    if (!anyLoaded) fetchAllRegions();
  }
  if (tab === 'planner') initPlannerDays();
}
async function fetchAllRegions() {
  for (const region of REGIONS) {
    for (const rc of (REGION_CRAGS[region] || [])) {
      const key = region + ':' + rc.name;
      if (exploreFcCache[key]) continue;
      try { exploreFcCache[key] = await fetchForecast(rc.lat, rc.lon); } catch(e) { exploreFcCache[key] = { error: true }; }
    }
  }
  renderExplore();
}

// ─── MODAL / CRUD ───
let editingId = null;
function openModal(id) {
  editingId = id || null;
  document.getElementById('modalTitle').textContent = id ? 'Edit crag' : 'Add a crag';
  const c = id ? crags.find(x => x.id === id) : null;
  document.getElementById('inputName').value = c?.name || '';
  document.getElementById('inputRegion').value = c?.region || '';
  document.getElementById('inputLat').value = c?.lat || '';
  document.getElementById('inputLon').value = c?.lon || '';
  document.getElementById('inputAlt').value = c?.alt || '';
  document.getElementById('inputRock').value = c?.rock || '';
  document.getElementById('inputNotes').value = c?.notes || '';
  // Orientation buttons
  const og = document.getElementById('orientationBtns');
  og.innerHTML = ['N','NE','E','SE','S','SW','W','NW'].map(d => `<button type="button" class="orient-btn ${c?.orientation?.includes(d) ? 'sel' : ''}" onclick="this.classList.toggle('sel')">${d}</button>`).join('');
  // Terrain buttons
  const tg = document.getElementById('terrainBtns');
  const curTerrain = c?.terrain || 'vertical';
  tg.innerHTML = ['slab','vertical','overhang'].map(t => `<button type="button" class="orient-btn ${curTerrain === t ? 'sel' : ''}" onclick="document.querySelectorAll('#terrainBtns .orient-btn').forEach(b=>b.classList.remove('sel'));this.classList.add('sel')" data-terrain="${t}">${t}</button>`).join('');
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); editingId = null; }
function closeModalOutside(e) { if (e.target === e.currentTarget) closeModal(); }
function editCrag(id) { openModal(id); }
function removeCrag(id) { if (!confirm('Remove this crag?')) return; crags = crags.filter(c => c.id !== id); saveCrags(); renderCards(); }
function saveCrag() {
  const name = document.getElementById('inputName').value.trim();
  if (!name) return;
  const orient = [...document.querySelectorAll('#orientationBtns .orient-btn.sel')].map(b => b.textContent);
  const terrainBtn = document.querySelector('#terrainBtns .orient-btn.sel');
  const terrain = terrainBtn?.dataset.terrain || 'vertical';
  const data = {
    name, region: document.getElementById('inputRegion').value.trim(),
    lat: parseFloat(document.getElementById('inputLat').value) || 0,
    lon: parseFloat(document.getElementById('inputLon').value) || 0,
    alt: parseInt(document.getElementById('inputAlt').value) || 0,
    rock: document.getElementById('inputRock').value.trim(),
    orientation: orient, terrain,
    notes: document.getElementById('inputNotes').value.trim(),
  };
  if (editingId) { const idx = crags.findIndex(c => c.id === editingId); if (idx >= 0) crags[idx] = { ...crags[idx], ...data }; }
  else { data.id = name.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now(); crags.push(data); }
  saveCrags(); closeModal(); renderCards();
  const c = editingId ? crags.find(x => x.id === editingId) : crags[crags.length - 1];
  if (c) fetchForecast(c.lat, c.lon).then(fc => { forecastCache[c.id] = fc; renderCards(); });
}
function refreshAll() { forecastCache = {}; renderCards(); fetchAllForecasts(); }

// ═══════════════════════════════════════════════════════
// PLANNER
// ═══════════════════════════════════════════════════════

// Haversine distance (km, straight-line)
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Parse location: accepts "47.37, 8.55" or city name (geocoded via Open-Meteo)
async function parseLocation(input) {
  const trimmed = input.trim();
  // Try lat,lon
  const parts = trimmed.split(/[,\s]+/).map(Number);
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && Math.abs(parts[0]) <= 90 && Math.abs(parts[1]) <= 180) {
    return { lat: parts[0], lon: parts[1] };
  }
  // Geocode via Open-Meteo
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=1&language=en&format=json`);
    const data = await res.json();
    if (data.results?.length) return { lat: data.results[0].latitude, lon: data.results[0].longitude };
  } catch(e) {}
  return null;
}

// Build the day selector buttons
function initPlannerDays() {
  const container = document.getElementById('plannerDays');
  if (!container || container.children.length > 0) return;
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = d.getDate();
    const ds = d.toISOString().slice(0, 10);
    const dow = d.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'planner-day-btn' + (isWeekend ? ' sel' : '');
    btn.dataset.date = ds;
    btn.textContent = dayName + ' ' + dayNum;
    btn.onclick = () => btn.classList.toggle('sel');
    container.appendChild(btn);
  }
}

// Gather all candidate crags based on source filter
function getPlannerCandidates(source) {
  const candidates = [];
  if (source === 'usuals' || source === 'both') {
    crags.forEach(c => candidates.push({ ...c, source: 'usuals' }));
  }
  if (source === 'explore' || source === 'both') {
    for (const region of REGIONS) {
      (REGION_CRAGS[region] || []).forEach(rc => {
        // Avoid duplicates if crag is already in usuals
        const isDup = candidates.some(c => c.name === rc.name && Math.abs(c.lat - rc.lat) < 0.01);
        if (!isDup) {
          candidates.push({
            id: region + ':' + rc.name,
            name: rc.name, region, lat: rc.lat, lon: rc.lon, alt: rc.alt,
            rock: rc.rock, orientation: rc.orientation || [],
            terrain: rc.terrain || 'vertical', notes: '',
            source: 'explore'
          });
        }
      });
    }
  }
  return candidates;
}

let plannerAbort = null;

async function runPlanner() {
  const resultsDiv = document.getElementById('plannerResults');
  resultsDiv.innerHTML = '<div class="planner-loading">Searching crags</div>';

  // Parse location
  const locInput = document.getElementById('plannerLocation').value;
  const homeLoc = await parseLocation(locInput);

  // Gather filters
  const selectedDays = [...document.querySelectorAll('#plannerDays .planner-day-btn.sel')].map(b => b.dataset.date);
  const selectedRocks = [...document.querySelectorAll('#plannerRock .orient-btn.sel')].map(b => b.dataset.val);
  const selectedTerrain = [...document.querySelectorAll('#plannerTerrain .orient-btn.sel')].map(b => b.dataset.val);
  const selectedFacing = [...document.querySelectorAll('#plannerFacing .orient-btn.sel')].map(b => b.dataset.val);
  const minScore = parseInt(document.getElementById('plannerMinScore').value) || 0;
  const maxResults = parseInt(document.getElementById('plannerMaxResults').value) || 5;
  const source = document.getElementById('plannerSource').value;

  if (selectedDays.length === 0) {
    resultsDiv.innerHTML = '<div class="planner-empty">Select at least one day.</div>';
    return;
  }

  // Get candidates
  const candidates = getPlannerCandidates(source);

  // Filter by rock, terrain, facing
  const filtered = candidates.filter(c => {
    if (selectedRocks.length > 0 && !selectedRocks.some(r => (c.rock || '').toLowerCase().includes(r.toLowerCase()))) return false;
    if (selectedTerrain.length > 0 && !selectedTerrain.includes(c.terrain || 'vertical')) return false;
    if (selectedFacing.length > 0) {
      const cragFaces = c.orientation || [];
      if (!selectedFacing.some(f => cragFaces.includes(f))) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    resultsDiv.innerHTML = '<div class="planner-empty">No crags match your filters. Try broadening your search.</div>';
    return;
  }

  // Fetch forecasts for all candidates (use cache when available)
  resultsDiv.innerHTML = `<div class="planner-loading">Checking weather for ${filtered.length} crags</div>`;

  const fcMap = {};
  const batchSize = 6;
  for (let i = 0; i < filtered.length; i += batchSize) {
    const batch = filtered.slice(i, i + batchSize);
    await Promise.all(batch.map(async c => {
      const cacheKey = c.source === 'usuals' ? c.id : c.id;
      // Check existing caches
      if (forecastCache[c.id]) { fcMap[c.id] = forecastCache[c.id]; return; }
      if (exploreFcCache[c.id]) { fcMap[c.id] = exploreFcCache[c.id]; return; }
      try {
        const fc = await fetchForecast(c.lat, c.lon);
        fcMap[c.id] = fc;
        // Also populate caches for future use
        if (c.source === 'usuals') forecastCache[c.id] = fc;
        else exploreFcCache[c.id] = fc;
      } catch(e) { fcMap[c.id] = { error: true }; }
    }));
    // Update progress
    const pct = Math.min(100, Math.round(((i + batchSize) / filtered.length) * 100));
    resultsDiv.innerHTML = `<div class="planner-loading">Checking weather... ${pct}%</div>`;
  }

  // Score each crag for each selected day, find best day
  const scored = [];
  for (const c of filtered) {
    const fc = fcMap[c.id];
    if (!fc || fc.error) continue;
    const src = fc.best || fc.ecmwf;
    if (!src?.daily?.time) continue;

    let bestScore = -1, bestDay = null, bestDayIdx = -1;
    let totalDayScore = 0, dayCount = 0;
    for (const ds of selectedDays) {
      const di = src.daily.time.indexOf(ds);
      if (di < 0) continue;
      const bl = blendedScore(fc, di, c);
      totalDayScore += bl.score;
      dayCount++;
      if (bl.score > bestScore) {
        bestScore = bl.score;
        bestDay = ds;
        bestDayIdx = di;
      }
    }
    if (bestScore < minScore) continue;
    const avgScore = dayCount > 0 ? Math.round(totalDayScore / dayCount) : bestScore;

    const dist = homeLoc ? Math.round(haversineKm(homeLoc.lat, homeLoc.lon, c.lat, c.lon)) : null;

    scored.push({
      crag: c, fc, bestScore, bestDay, bestDayIdx, dist, avgScore,
      sortKey: avgScore * 1000 - (dist || 0),
    });
  }

  // Sort: best score first, then closest distance as tiebreaker
  scored.sort((a, b) => b.sortKey - a.sortKey);
  const results = scored.slice(0, maxResults);

  if (results.length === 0) {
    resultsDiv.innerHTML = '<div class="planner-empty">No crags above your minimum score for the selected days. Try lowering the threshold or adding more days.</div>';
    return;
  }

  // Render results
  resultsDiv.innerHTML = results.map((r, ri) => {
    const c = r.crag;
    const dayLabel = new Date(r.bestDay + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const distLabel = r.dist != null ? r.dist + ' km' : '';
    const metaParts = [c.region, c.alt + 'm', c.rock, (c.orientation || []).join('·'), c.terrain].filter(Boolean);

    // Mini forecast for selected days
    const src = (r.fc.best || r.fc.ecmwf);
    let daysHTML = '';
    if (src?.daily?.time) {
      daysHTML = selectedDays.map(ds => {
        const di = src.daily.time.indexOf(ds);
        if (di < 0) return '';
        const dd = extractDay(src, di);
        const bl = blendedScore(r.fc, di, c);
        const dn = new Date(ds + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
        const num = new Date(ds + 'T00:00:00').getDate();
        return `<div class="fday">
          <div class="fday-name">${dn} ${num}</div>
          <div class="fday-icon">${wxSVG(dd.weather_code)}</div>
          <div class="fday-wx-label">${wxLabel(dd.weather_code)}</div>
          <div class="fday-temp">[ ${dd.temperature_2m_min != null ? Math.round(dd.temperature_2m_min) : '?'}° / ${dd.temperature_2m_max != null ? Math.round(dd.temperature_2m_max) : '?'}° ]</div>
          <div class="score-pill ${scorePillClass(bl.score)}">${bl.score}</div>
        </div>`;
      }).join('');
    }

    return `<div class="planner-result" style="animation-delay:${ri * 0.06}s" onclick="togglePlannerDetail('pr-${ri}')">
      <div class="planner-result-head">
        <div>
          <div class="planner-result-name">${c.name}</div>
          <div class="planner-result-meta">${metaParts.map(m => `<span>${m}</span>`).join('')}</div>
        </div>
        <div class="planner-result-score">
          <div class="score-pill ${scorePillClass(r.avgScore)}" style="padding:5px 14px;font-size:18px">${r.avgScore}</div>
        </div>
      </div>
      <div class="planner-result-best">${scoreWord(r.avgScore)}${distLabel ? ' · ' + distLabel + ' away' : ''} · Best: ${dayLabel} (${r.bestScore})</div>
      <div class="planner-result-detail" id="pr-${ri}">
        <div class="forecast-area"><div class="forecast-scroll"><div class="forecast-track">${daysHTML}</div></div></div>
      </div>
    </div>`;
  }).join('');
}

function togglePlannerDetail(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
}

// ─── INIT ───
function init() {
  initTheme();
  document.querySelectorAll('.nav-icon').forEach(el => { const key = el.dataset.icon; if (key && ICON[key]) el.innerHTML = ICON[key]; });
  loadCrags(); renderCards(); renderExplore(); initPlannerDays();
  const sb = (window.self !== window.top) || (window.location.protocol === 'blob:');
  if (sb) {
    const b = document.createElement('div'); b.className = 'sandbox-banner';
    b.textContent = 'Preview mode — download and open in your browser for live weather data.';
    document.querySelector('main').prepend(b); setStatus('error', 'preview only'); return;
  }
  fetchAllForecasts();
  setInterval(() => fetchAllForecasts(), 30 * 60 * 1000);
}
init();
