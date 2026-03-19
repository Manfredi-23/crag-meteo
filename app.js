// ═══════════════════════════════════════════
// BitWet — app.js
// All logic: fetching, scoring, rendering, dark mode
// ═══════════════════════════════════════════

let crags = [];
let forecastCache = {};
let exploreFcCache = {};
let currentSort = 'weekend';
let expandedDays = {};     // cragId -> dayIndex
let expandedExplore = {};  // regionName -> { open: bool, crags: { cragKey -> open } }
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
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem(THEME_KEY)) {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
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

// ─── WEATHER FETCHING ───
const API = 'https://api.open-meteo.com/v1/forecast';
const HOURLY_VARS = 'precipitation,wind_direction_10m,weather_code,temperature_2m';
const DAILY_VARS = 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,weather_code,sunshine_duration,uv_index_max';

async function fetchForecast(lat, lon) {
  const params = `latitude=${lat}&longitude=${lon}&daily=${DAILY_VARS}&hourly=${HOURLY_VARS}&timezone=auto&past_days=2&forecast_days=7`;
  const [best, ecmwf] = await Promise.allSettled([
    fetch(`${API}?${params}`).then(r => r.json()),
    fetch(`${API}?${params}&models=ecmwf_ifs`).then(r => r.json()),
  ]);
  return {
    best: best.status === 'fulfilled' && !best.value.error ? best.value : null,
    ecmwf: ecmwf.status === 'fulfilled' && !ecmwf.value.error ? ecmwf.value : null,
  };
}

async function fetchAllForecasts() {
  setStatus('loading', 'updating...');
  let ok = 0;
  const tasks = crags.map(async c => {
    try {
      forecastCache[c.id] = await fetchForecast(c.lat, c.lon);
      ok++;
    } catch(e) { forecastCache[c.id] = { error: true }; }
  });
  await Promise.all(tasks);
  const now = new Date();
  setStatus(ok > 0 ? 'ok' : 'error', `updated ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`);
  renderCards();
}

// ─── SCORING ENGINE ───
function getSeasonProfile(ds) {
  const m = ds ? new Date(ds + 'T00:00:00').getMonth() : new Date().getMonth();
  if (m >= 11 || m <= 1) return { idealMin: 4, idealMax: 16 };
  if (m >= 2 && m <= 4) return { idealMin: 8, idealMax: 22 };
  if (m >= 5 && m <= 7) return { idealMin: 14, idealMax: 28 };
  return { idealMin: 10, idealMax: 24 };
}

function calcDryingHours(fc, dayIndex) {
  const src = fc.best || fc.ecmwf;
  if (!src?.hourly?.precipitation || !src?.hourly?.time || !src?.daily?.time) return null;
  const dayStr = src.daily.time[dayIndex];
  const targetTime = dayStr + 'T08:00';
  const hourlyTimes = src.hourly.time;
  const targetIdx = hourlyTimes.findIndex(t => t >= targetTime);
  if (targetIdx < 0) return null;
  const precip = src.hourly.precipitation;
  for (let i = targetIdx; i >= 0; i--) {
    if (precip[i] > 0.1) return targetIdx - i;
  }
  return targetIdx > 0 ? targetIdx : 48;
}

function getDayWindDirection(fc, dayIndex) {
  const src = fc.best || fc.ecmwf;
  if (!src?.hourly?.wind_direction_10m || !src?.hourly?.time || !src?.daily?.time) return null;
  const dayStr = src.daily.time[dayIndex];
  const startTime = dayStr + 'T08:00';
  const endTime = dayStr + 'T18:00';
  const times = src.hourly.time;
  const dirs = src.hourly.wind_direction_10m;
  let sinSum = 0, cosSum = 0, count = 0;
  for (let i = 0; i < times.length; i++) {
    if (times[i] >= startTime && times[i] <= endTime && dirs[i] != null) {
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
  if (windDeg == null || !orientations?.length) return { label: 'unknown', penalty: 0 };
  let minExposure = 180;
  for (const dir of orientations) {
    const faceDeg = orientationToDeg(dir);
    if (faceDeg == null) continue;
    const exposedWindDir = (faceDeg + 180) % 360;
    let angleDiff = Math.abs(windDeg - exposedWindDir);
    if (angleDiff > 180) angleDiff = 360 - angleDiff;
    minExposure = Math.min(minExposure, angleDiff);
  }
  if (minExposure <= 30) return { label: 'Exposed', penalty: -12 };
  if (minExposure <= 60) return { label: 'Crosswind', penalty: -4 };
  if (minExposure >= 120) return { label: 'Sheltered', penalty: 5 };
  return { label: 'Partial', penalty: 0 };
}

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
  if (hours >= 12) return '';
  if (hours >= 6) return 'warn';
  return 'bad';
}

function computeScore(d, ds, dryHours, windShelter) {
  let s = 100;
  const p = d.precipitation_sum || 0, pp = d.precipitation_probability_max || 0;
  if (p > 5) s -= 60; else if (p > 2) s -= 40; else if (p > 0.5) s -= 20; else if (p > 0) s -= 8;
  s -= (pp / 100) * 15;
  const w = d.wind_speed_10m_max || 0, g = d.wind_gusts_10m_max || 0;
  if (g > 60) s -= 35; else if (g > 40) s -= 20; else if (w > 30) s -= 15; else if (w > 20) s -= 5;
  const sn = getSeasonProfile(ds);
  const t = d.temperature_2m_max;
  if (t !== undefined) {
    if (t < sn.idealMin - 10) s -= 30;
    else if (t < sn.idealMin - 5) s -= 18;
    else if (t < sn.idealMin) s -= 8;
    else if (t > sn.idealMax + 8) s -= 25;
    else if (t > sn.idealMax + 3) s -= 12;
    else if (t > sn.idealMax) s -= 4;
    else s += 3;
  }
  const wc = d.weather_code || 0;
  if (wc >= 95) s -= 30; else if (wc >= 71) s -= 25; else if (wc >= 61) s -= 20; else if (wc >= 51) s -= 10; else if (wc >= 45) s -= 8;
  if (dryHours != null) {
    if (dryHours < 3) s -= 20;
    else if (dryHours < 6) s -= 12;
    else if (dryHours < 12) s -= 6;
    else if (dryHours < 24) s -= 2;
    else if (dryHours >= 48 && p === 0) s += 2;
  }
  if (windShelter) s += windShelter.penalty;
  return Math.max(0, Math.min(100, Math.round(s)));
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

function blendedScore(fc, di, orientation) {
  const src = fc.best || fc.ecmwf;
  const ds = src?.daily?.time?.[di] || null;
  const dryHours = calcDryingHours(fc, di);
  const windDeg = getDayWindDirection(fc, di);
  const windShelter = calcWindShelter(windDeg, orientation);
  const bD = fc.best ? extractDay(fc.best, di) : null;
  const eD = fc.ecmwf ? extractDay(fc.ecmwf, di) : null;
  const sB = bD ? computeScore(bD, ds, dryHours, windShelter) : null;
  const sE = eD ? computeScore(eD, ds, dryHours, windShelter) : null;
  if (sB !== null && sE !== null) {
    const avg = Math.round((sB + sE) / 2);
    const diff = Math.abs(sB - sE);
    return { score: avg, confidence: diff <= 10 ? 'high' : diff <= 25 ? 'medium' : 'low', sB, sE, dryHours, windDeg, windShelter };
  }
  return { score: sB ?? sE ?? 0, confidence: 'single', sB, sE, dryHours, windDeg, windShelter };
}

// ─── HELPERS ───
function scorePillClass(s) { return s >= 80 ? 's-great' : s >= 60 ? 's-good' : s >= 40 ? 's-ok' : s >= 20 ? 's-poor' : 's-bad'; }
function scoreColorHex(s) { return s >= 80 ? '#5BAD6A' : s >= 60 ? '#7EC98A' : s >= 40 ? '#D4A843' : s >= 20 ? '#E8725A' : '#9A9490'; }
function confTag(c) { return c === 'high' ? '' : c === 'medium' ? '<div class="conf-tag">uncertain</div>' : c === 'low' ? '<div class="conf-tag">models split</div>' : ''; }

function getBestBlended(id) {
  const fc = forecastCache[id]; if (!fc || fc.error) return -1;
  const src = fc.best || fc.ecmwf; if (!src?.daily) return -1;
  const c = crags.find(x => x.id === id);
  const orient = c?.orientation || [];
  return Math.max(...src.daily.time.map((_, i) => blendedScore(fc, i, orient).score));
}

// Weekend score: best score across Fri evening + Sat + Sun
function getWeekendScore(id) {
  const fc = forecastCache[id]; if (!fc || fc.error) return -1;
  const src = fc.best || fc.ecmwf; if (!src?.daily) return -1;
  const c = crags.find(x => x.id === id);
  const orient = c?.orientation || [];
  let best = -1;
  const today = new Date();
  src.daily.time.forEach((ds, i) => {
    const d = new Date(ds + 'T00:00:00');
    const dow = d.getDay(); // 0=Sun, 5=Fri, 6=Sat
    if (dow === 5 || dow === 6 || dow === 0) {
      const s = blendedScore(fc, i, orient).score;
      if (s > best) best = s;
    }
  });
  return best;
}

function getTodayScore(id) {
  const fc = forecastCache[id]; if (!fc || fc.error) return -1;
  const src = fc.best || fc.ecmwf; if (!src?.daily) return -1;
  const c = crags.find(x => x.id === id);
  const orient = c?.orientation || [];
  const today = new Date().toISOString().slice(0, 10);
  const idx = src.daily.time.indexOf(today);
  if (idx < 0) return blendedScore(fc, 0, orient).score;
  return blendedScore(fc, idx, orient).score;
}

// ─── TIME-OF-DAY BREAKDOWN ───
function getTimeSlots(fc, dayIndex) {
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

  return slots.map(slot => {
    const s = dayStr + slot.start;
    const e = dayStr + slot.end;
    let totalPrecip = 0, maxWx = 0, count = 0, tempSum = 0;
    for (let i = 0; i < times.length; i++) {
      if (times[i] >= s && times[i] < e) {
        totalPrecip += (precip?.[i] || 0);
        if ((wxCodes?.[i] || 0) > maxWx) maxWx = wxCodes[i];
        tempSum += (temps?.[i] || 0);
        count++;
      }
    }
    // Quick score for time slot
    let slotScore = 100;
    if (totalPrecip > 2) slotScore -= 50;
    else if (totalPrecip > 0.5) slotScore -= 25;
    else if (totalPrecip > 0) slotScore -= 10;
    if (maxWx >= 95) slotScore -= 30;
    else if (maxWx >= 61) slotScore -= 15;
    else if (maxWx >= 51) slotScore -= 8;
    slotScore = Math.max(0, Math.min(100, slotScore));
    return {
      label: slot.label,
      wx: wxLabel(maxWx),
      wxCode: maxWx,
      score: Math.round(slotScore),
      precip: totalPrecip.toFixed(1),
    };
  });
}

// Trend: compare first half vs second half of day
function getDayTrend(slots) {
  if (!slots || slots.length < 4) return 'Stable';
  const first = (slots[0].score + slots[1].score) / 2;
  const second = (slots[3].score + slots[4].score) / 2;
  const diff = second - first;
  if (diff > 15) return 'Improving';
  if (diff < -15) return 'Getting worse';
  return 'Stable';
}

// ─── SORT ───
function setSort(btn) {
  currentSort = btn.dataset.sort;
  document.querySelectorAll('.sort-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCards();
}

function sortedCrags() {
  const list = [...crags];
  switch (currentSort) {
    case 'weekend':
      return list.sort((a, b) => getWeekendScore(b.id) - getWeekendScore(a.id));
    case 'score':
      return list.sort((a, b) => getTodayScore(b.id) - getTodayScore(a.id));
    case 'name':
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case 'region':
      return list.sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name));
    default:
      return list;
  }
}

// ─── RENDER CARDS ───
function renderCards() {
  const grid = document.getElementById('cragGrid');
  if (!grid) return;
  const sorted = sortedCrags();

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
        const dd = extractDay(src, di);
        const bl = blendedScore(fc, di, c.orientation);
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
        const bl = blendedScore(fc, expIdx, c.orientation);
        const p = dd.precipitation_sum || 0, pp = dd.precipitation_probability_max || 0;
        const w = dd.wind_speed_10m_max || 0, g = dd.wind_gusts_10m_max || 0;
        const sh = dd.sunshine_duration ? (dd.sunshine_duration / 3600).toFixed(1) : '—';
        const uv = dd.uv_index_max != null ? dd.uv_index_max.toFixed(0) : '—';
        const wc = g > 50 ? 'bad' : g > 35 || w > 25 ? 'warn' : '';
        const rc = p > 0.5 ? 'rain' : '';
        const dl = new Date(src.daily.time[expIdx] + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        const expDateStr = src.daily.time[expIdx];

        // Time-of-day slots
        const slots = getTimeSlots(fc, expIdx);
        const trend = getDayTrend(slots);
        const trendClass = trend === 'Improving' ? 'improving' : trend === 'Getting worse' ? 'worsening' : '';

        let slotsHTML = '';
        if (slots) {
          slotsHTML = `<div class="detail-times">` +
            slots.map(sl =>
              `<div class="detail-time-row">
                <span class="detail-time-label">${sl.label}</span>
                <span class="detail-time-wx">${sl.wx} <span class="detail-time-score">(${sl.score})</span></span>
              </div>`
            ).join('') + `</div>`;
        }

        // Model comparison
        let modelHTML = '';
        if (fc.best && fc.ecmwf) {
          const db = extractDay(fc.best, expIdx), de = extractDay(fc.ecmwf, expIdx);
          modelHTML = `<div class="model-row"><div class="model-box"><strong>Best-match</strong>Rain: ${(db.precipitation_sum || 0).toFixed(1)}mm · ${db.precipitation_probability_max || 0}%<br>Wind: ${Math.round(db.wind_speed_10m_max || 0)} Km/h<br>Score: ${computeScore(db, expDateStr, bl.dryHours, bl.windShelter)}</div><div class="model-box"><strong>ECMWF IFS</strong>Rain: ${(de.precipitation_sum || 0).toFixed(1)}mm · ${de.precipitation_probability_max || 0}%<br>Wind: ${Math.round(de.wind_speed_10m_max || 0)} Km/h<br>Score: ${computeScore(de, expDateStr, bl.dryHours, bl.windShelter)}</div></div>`;
        }

        detailHTML = `<div class="detail-panel">
          <div class="detail-header">
            <span class="detail-date">${dl}</span>
          </div>
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
            <div class="detail-stat"><div class="detail-stat-label">Drying Time</div><div class="detail-stat-val ${dryingClass(bl.dryHours)}">${dryingLabel(bl.dryHours)}</div></div>
          </div>
          <div class="detail-trend ${trendClass}">${trend}</div>
          ${modelHTML}
        </div>`;
      }
      fHTML = `<div class="forecast-area"><div class="forecast-scroll"><div class="forecast-track">${cells}</div></div>${detailHTML}</div>`;
    }

    return `<div class="crag-card" style="animation-delay:${ci * 0.06}s">
      <div class="card-head">
        <div class="card-head-row">
          <div class="crag-name">${c.name}</div>
          <div class="meta-pipe">${metaHTML}</div>
          <div class="card-actions"><button class="card-act" onclick="editCrag('${c.id}')">✎</button><button class="card-act" onclick="removeCrag('${c.id}')">✕</button></div>
        </div>
      </div>
      <hr class="card-hr">
      ${c.notes ? `<div class="card-notes">${c.notes}</div>` : ''}
      ${fHTML}</div>`;
  }).join('');
}

function windDirLabel(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function toggleDay(cragId, dayIdx) {
  if (expandedDays[cragId] === dayIdx) {
    delete expandedDays[cragId];
  } else {
    expandedDays[cragId] = dayIdx;
  }
  renderCards();
}

// ─── EXPLORE ───
async function fetchAllRegions() {
  for (const region of REGIONS) {
    const crgs = REGION_CRAGS[region] || [];
    for (const rc of crgs) {
      const key = region + ':' + rc.name;
      if (exploreFcCache[key]) continue;
      try {
        exploreFcCache[key] = await fetchForecast(rc.lat, rc.lon);
      } catch(e) { exploreFcCache[key] = { error: true }; }
    }
  }
  renderExplore();
}

function renderExplore() {
  const grid = document.getElementById('exploreGrid');
  if (!grid) return;
  const selVal = document.getElementById('exploreDaySelect').value;

  // Fill day selector if empty
  const sel = document.getElementById('exploreDaySelect');
  if (sel.options.length <= 1) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      sel.appendChild(opt);
    }
  }

  grid.innerHTML = REGIONS.map(region => {
    const crgs = REGION_CRAGS[region] || [];
    const isOpen = expandedExplore[region]?.open;

    // Region best score
    let regionBest = -1;
    crgs.forEach(rc => {
      const key = region + ':' + rc.name;
      const fc = exploreFcCache[key];
      if (!fc || fc.error) return;
      const src = fc.best || fc.ecmwf;
      if (!src?.daily) return;
      src.daily.time.forEach((_, di) => {
        if (selVal !== 'best' && di !== parseInt(selVal)) return;
        const s = blendedScore(fc, di, rc.orientation || []).score;
        if (s > regionBest) regionBest = s;
      });
    });

    const badge = regionBest >= 0
      ? `<span class="region-score-badge ${scorePillClass(regionBest)}">${regionBest}</span>`
      : '';

    // Crag list
    let cragsHTML = '';
    if (isOpen) {
      cragsHTML = crgs.map(rc => {
        const key = region + ':' + rc.name;
        const fc = exploreFcCache[key];
        const cragOpen = expandedExplore[region]?.crags?.[rc.name];
        let scoreHTML = '';
        let detailHTML = '';

        if (fc && !fc.error) {
          const src = fc.best || fc.ecmwf;
          if (src?.daily) {
            // Mini forecast row
            const scores = src.daily.time.map((ds, di) => {
              const bl = blendedScore(fc, di, rc.orientation || []);
              const dayName = new Date(ds + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
              return `<span style="color:${scoreColorHex(bl.score)};font-weight:700">${dayName} ${bl.score}</span>`;
            }).slice(0, 4).join(' · ');
            scoreHTML = `<div style="font-family:var(--font-data);font-size:10px;margin-top:4px">${scores}</div>`;

            if (cragOpen) {
              const cells = src.daily.time.map((ds, di) => {
                const dd = extractDay(src, di);
                const bl = blendedScore(fc, di, rc.orientation || []);
                const dayName = new Date(ds + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                const dayNum = new Date(ds + 'T00:00:00').getDate();
                return `<div class="fday">
                  <div class="fday-name">${dayName} ${dayNum}</div>
                  <div class="fday-icon">${wxSVG(dd.weather_code)}</div>
                  <div class="fday-wx-label">${wxLabel(dd.weather_code)}</div>
                  <div class="fday-temp">[ ${dd.temperature_2m_min != null ? Math.round(dd.temperature_2m_min) : '?'}° / ${dd.temperature_2m_max != null ? Math.round(dd.temperature_2m_max) : '?'}° ]</div>
                  <div class="score-pill ${scorePillClass(bl.score)}">${bl.score}</div>
                </div>`;
              }).join('');

              const alreadyAdded = crags.some(uc => uc.name === rc.name && Math.abs(uc.lat - rc.lat) < 0.01);
              const addBtn = alreadyAdded
                ? `<button class="add-to-usuals-btn" disabled style="opacity:0.4;cursor:default">Already in Usuals</button>`
                : `<button class="add-to-usuals-btn" onclick="addExploreToUsuals('${region}','${rc.name.replace(/'/g,"\\'")}')">+ Add to Usuals</button>`;

              detailHTML = `<div class="explore-crag-detail open">
                <div class="forecast-area"><div class="forecast-scroll"><div class="forecast-track">${cells}</div></div></div>
                ${addBtn}
              </div>`;
            }
          }
        } else if (!fc) {
          scoreHTML = '<div style="font-family:var(--font-data);font-size:10px;color:var(--ink-faint);margin-top:4px">loading...</div>';
        }

        return `<div class="explore-crag" onclick="toggleExploreCrag('${region}','${rc.name.replace(/'/g,"\\'")}',event)">
          <div class="explore-crag-head">
            <span class="explore-crag-name">${rc.name}</span>
            <span class="explore-crag-meta">${rc.alt}m · ${rc.rock}</span>
          </div>
          ${scoreHTML}
          ${detailHTML}
        </div>`;
      }).join('');
    }

    return `<div class="region-card">
      <div class="region-head" onclick="toggleRegion('${region}')">${region} ${badge}</div>
      <div class="region-crags ${isOpen ? 'open' : ''}">${cragsHTML}</div>
    </div>`;
  }).join('');
}

function toggleRegion(region) {
  if (!expandedExplore[region]) expandedExplore[region] = { open: false, crags: {} };
  expandedExplore[region].open = !expandedExplore[region].open;
  renderExplore();
  // Lazy-load if opening
  if (expandedExplore[region].open) {
    const crgs = REGION_CRAGS[region] || [];
    crgs.forEach(async rc => {
      const key = region + ':' + rc.name;
      if (exploreFcCache[key]) return;
      try {
        exploreFcCache[key] = await fetchForecast(rc.lat, rc.lon);
      } catch(e) { exploreFcCache[key] = { error: true }; }
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
  crags.push({
    id, name: rc.name, region, lat: rc.lat, lon: rc.lon, alt: rc.alt,
    rock: rc.rock, orientation: rc.orientation || [], notes: ''
  });
  saveCrags();
  // Fetch weather for new crag
  fetchForecast(rc.lat, rc.lon).then(fc => {
    forecastCache[id] = fc;
    renderCards();
  });
  renderExplore();
  renderCards();
}

// ─── TABS ───
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('pane-' + tab).classList.add('active');
  btn.classList.add('active');
  if (tab === 'explore') {
    renderExplore();
    // Start loading regions
    const anyLoaded = REGIONS.some(r => (REGION_CRAGS[r] || []).some(rc => exploreFcCache[r + ':' + rc.name]));
    if (!anyLoaded) fetchAllRegions();
  }
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
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  og.innerHTML = dirs.map(d => `<button type="button" class="orient-btn ${c?.orientation?.includes(d) ? 'sel' : ''}" onclick="this.classList.toggle('sel')">${d}</button>`).join('');
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); editingId = null; }
function closeModalOutside(e) { if (e.target === e.currentTarget) closeModal(); }
function editCrag(id) { openModal(id); }
function removeCrag(id) {
  if (!confirm('Remove this crag?')) return;
  crags = crags.filter(c => c.id !== id);
  saveCrags(); renderCards();
}
function saveCrag() {
  const name = document.getElementById('inputName').value.trim();
  if (!name) return;
  const orient = [...document.querySelectorAll('.orient-btn.sel')].map(b => b.textContent);
  const data = {
    name,
    region: document.getElementById('inputRegion').value.trim(),
    lat: parseFloat(document.getElementById('inputLat').value) || 0,
    lon: parseFloat(document.getElementById('inputLon').value) || 0,
    alt: parseInt(document.getElementById('inputAlt').value) || 0,
    rock: document.getElementById('inputRock').value.trim(),
    orientation: orient,
    notes: document.getElementById('inputNotes').value.trim(),
  };
  if (editingId) {
    const idx = crags.findIndex(c => c.id === editingId);
    if (idx >= 0) crags[idx] = { ...crags[idx], ...data };
  } else {
    data.id = name.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now();
    crags.push(data);
  }
  saveCrags(); closeModal(); renderCards();
  // Fetch weather for new/edited crag
  const c = editingId ? crags.find(x => x.id === editingId) : crags[crags.length - 1];
  if (c) {
    fetchForecast(c.lat, c.lon).then(fc => {
      forecastCache[c.id] = fc;
      renderCards();
    });
  }
}

function refreshAll() {
  forecastCache = {};
  renderCards();
  fetchAllForecasts();
}

// ─── INIT ───
function init() {
  initTheme();
  // Inject SVG icons from icons.js
  document.querySelectorAll('.nav-icon').forEach(el => {
    const key = el.dataset.icon;
    if (key && ICON[key]) el.innerHTML = ICON[key];
  });
  loadCrags(); renderCards(); renderExplore();
  const sb = (window.self !== window.top) || (window.location.protocol === 'blob:');
  if (sb) {
    const b = document.createElement('div');
    b.className = 'sandbox-banner';
    b.textContent = 'Preview mode — download and open in your browser for live weather data.';
    document.querySelector('main').prepend(b);
    setStatus('error', 'preview only');
    return;
  }
  fetchAllForecasts();
  setInterval(() => {
    fetchAllForecasts();
  }, 30 * 60 * 1000);
}
init();
