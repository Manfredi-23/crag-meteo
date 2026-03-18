// ═══════════════════════════════════════════════════
// BitWet — app.js
// Application logic: scoring, API, rendering, UI
// Depends on: data.js, icons.js
// ═══════════════════════════════════════════════════

const STORAGE_KEY = 'bitWet_v1';
const ORIENTATIONS = ['N','NE','E','SE','S','SW','W','NW'];
const DAILY_VARS = 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,weather_code,sunshine_duration,uv_index_max';
const HOURLY_VARS = 'precipitation,wind_direction_10m';

// ─── STATE ───
let crags = [];
let forecastCache = {};
let regionCache = {};
let cragExploreCache = {};
let currentSort = 'score';
let editingId = null;
let expandedDay = {};
let expandedRegion = null;
let selectedOrientations = [];

// ─── PERSISTENCE ───
function loadCrags() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    crags = s ? JSON.parse(s) : [...DEFAULT_CRAGS];
    if (!s) saveCragsToStorage();
  } catch (e) { crags = [...DEFAULT_CRAGS]; }
}
function saveCragsToStorage() { localStorage.setItem(STORAGE_KEY, JSON.stringify(crags)); }

// ─── DUAL-MODEL FETCH ───
async function fetchDual(lat, lon) {
  const base = { latitude: lat, longitude: lon, daily: DAILY_VARS, hourly: HOURLY_VARS, timezone: 'Europe/Zurich', forecast_days: 7, past_days: 2 };
  const urlBest = `https://api.open-meteo.com/v1/forecast?${new URLSearchParams(base)}`;
  const urlECMWF = `https://api.open-meteo.com/v1/forecast?${new URLSearchParams({...base, models: 'ecmwf_ifs'})}`;
  try {
    const [rB, rE] = await Promise.all([fetch(urlBest), fetch(urlECMWF)]);
    const best = rB.ok ? await rB.json() : null;
    const ecmwf = rE.ok ? await rE.json() : null;
    if (!best && !ecmwf) throw new Error('Both models failed');
    return { best, ecmwf };
  } catch (e) {
    const sb = (window.self !== window.top) || (window.location.protocol === 'blob:');
    if (sb || e.message?.includes('Failed to fetch') || e.name === 'TypeError')
      throw new Error('Preview mode — open in browser');
    throw e;
  }
}

// ─── SCORING (season-aware + drying time + wind shelter) ───
function getSeasonProfile(ds) {
  const m = ds ? new Date(ds + 'T00:00:00').getMonth() : new Date().getMonth();
  if (m >= 11 || m <= 1) return { idealMin: 4, idealMax: 16 };
  if (m >= 2 && m <= 4) return { idealMin: 8, idealMax: 22 };
  if (m >= 5 && m <= 7) return { idealMin: 14, idealMax: 28 };
  return { idealMin: 10, idealMax: 24 };
}

// Calculate hours since last significant rain (>0.1mm/h) looking back from start of given day
// Uses hourly precipitation data from the forecast (which includes past_days:2)
function calcDryingHours(fc, dayIndex) {
  const src = fc.best || fc.ecmwf;
  if (!src?.hourly?.precipitation || !src?.hourly?.time || !src?.daily?.time) return null;

  const dayStr = src.daily.time[dayIndex];
  // Find the hourly index for 8:00 on this day (typical climbing start)
  const targetTime = dayStr + 'T08:00';
  const hourlyTimes = src.hourly.time;
  const targetIdx = hourlyTimes.findIndex(t => t >= targetTime);
  if (targetIdx < 0) return null;

  // Walk backwards from target hour to find last rain >0.1mm
  const precip = src.hourly.precipitation;
  for (let i = targetIdx; i >= 0; i--) {
    if (precip[i] > 0.1) {
      return targetIdx - i; // hours since last rain
    }
  }
  // No rain found in available data — very dry
  return targetIdx > 0 ? targetIdx : 48; // cap at available data
}

// Get dominant wind direction for a given day (average of daytime hours 8-18)
function getDayWindDirection(fc, dayIndex) {
  const src = fc.best || fc.ecmwf;
  if (!src?.hourly?.wind_direction_10m || !src?.hourly?.time || !src?.daily?.time) return null;

  const dayStr = src.daily.time[dayIndex];
  const startTime = dayStr + 'T08:00';
  const endTime = dayStr + 'T18:00';
  const times = src.hourly.time;
  const dirs = src.hourly.wind_direction_10m;

  // Collect wind directions during climbing hours
  let sinSum = 0, cosSum = 0, count = 0;
  for (let i = 0; i < times.length; i++) {
    if (times[i] >= startTime && times[i] <= endTime && dirs[i] != null) {
      const rad = dirs[i] * Math.PI / 180;
      sinSum += Math.sin(rad);
      cosSum += Math.cos(rad);
      count++;
    }
  }
  if (count === 0) return null;
  // Circular mean
  let avg = Math.atan2(sinSum / count, cosSum / count) * 180 / Math.PI;
  if (avg < 0) avg += 360;
  return Math.round(avg);
}

// Convert compass direction string to degrees
function orientationToDeg(dir) {
  const map = { 'N': 0, 'NE': 45, 'E': 90, 'SE': 135, 'S': 180, 'SW': 225, 'W': 270, 'NW': 315 };
  return map[dir] ?? null;
}

// Calculate wind shelter factor: how exposed is this wall to the wind?
// Returns: 'sheltered' (wind from behind wall), 'crosswind', or 'exposed' (wind hitting face)
function calcWindShelter(windDeg, orientations) {
  if (windDeg == null || !orientations?.length) return { label: 'unknown', penalty: 0 };

  // For each wall face, check angle difference to wind direction
  // Wind hitting the face directly = exposed (wind direction ≈ opposite of wall orientation)
  // Wall faces S (180°), wind from N (0°) = wind hitting face directly
  let minExposure = 180; // worst case = no exposure

  for (const dir of orientations) {
    const faceDeg = orientationToDeg(dir);
    if (faceDeg == null) continue;

    // The wall "faces" faceDeg, meaning wind hitting it comes from the opposite direction
    const exposedWindDir = (faceDeg + 180) % 360;
    let angleDiff = Math.abs(windDeg - exposedWindDir);
    if (angleDiff > 180) angleDiff = 360 - angleDiff;
    minExposure = Math.min(minExposure, angleDiff);
  }

  if (minExposure <= 30) return { label: 'exposed', penalty: -12 };
  if (minExposure <= 60) return { label: 'crosswind', penalty: -4 };
  if (minExposure >= 120) return { label: 'sheltered', penalty: 5 };
  return { label: 'partial shelter', penalty: 0 };
}

// Drying time label for display
function dryingLabel(hours) {
  if (hours == null) return '—';
  if (hours >= 48) return '48h+ (dry)';
  if (hours >= 24) return Math.round(hours) + 'h (good)';
  if (hours >= 12) return Math.round(hours) + 'h (ok)';
  if (hours >= 6) return Math.round(hours) + 'h (damp risk)';
  return Math.round(hours) + 'h (wet!)';
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

  // Phase 2: Drying time penalty
  if (dryHours != null) {
    if (dryHours < 3) s -= 20;
    else if (dryHours < 6) s -= 12;
    else if (dryHours < 12) s -= 6;
    else if (dryHours < 24) s -= 2;
    // Bonus for very dry conditions
    else if (dryHours >= 48 && p === 0) s += 2;
  }

  // Phase 2: Wind shelter adjustment
  if (windShelter) {
    s += windShelter.penalty;
  }

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

  // Phase 2: compute drying time and wind shelter
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
function scoreWord(s) { return s >= 80 ? 'Send it' : s >= 60 ? 'Good' : s >= 40 ? 'Maybe' : s >= 20 ? 'Nicht Gut' : 'Rest day'; }
function confTag(c) { return c === 'high' ? '' : c === 'medium' ? '<div class="conf-tag">uncertain</div>' : '<div class="conf-tag">models split</div>'; }
function getBestBlended(id) { const fc = forecastCache[id]; if (!fc || fc.error) return -1; const src = fc.best || fc.ecmwf; if (!src?.daily) return -1; const c = crags.find(x => x.id === id); const orient = c?.orientation || []; return Math.max(...src.daily.time.map((_, i) => blendedScore(fc, i, orient).score)); }

// ─── RENDER CRAGS ───
function renderCards() {
  const grid = document.getElementById('cragGrid');
  let sorted = [...crags];
  if (currentSort === 'score') sorted.sort((a, b) => getBestBlended(b.id) - getBestBlended(a.id));
  else if (currentSort === 'region') sorted.sort((a, b) => (a.region || '').localeCompare(b.region || ''));
  else sorted.sort((a, b) => a.name.localeCompare(b.name));

  if (!sorted.length) { grid.innerHTML = '<div class="empty-state">No crags yet. Tap Add One.</div>'; return; }
  const today = new Date().toISOString().slice(0, 10);

  grid.innerHTML = sorted.map((c, ci) => {
    const fc = forecastCache[c.id];
    const metaParts = [c.region || '', c.alt ? c.alt + 'm' : '', c.rock || '', (c.orientation || []).join(' · ')].filter(Boolean);
    const metaHTML = metaParts.map(p => `<span>${p}</span>`).join('');

    let fHTML;
    if (!fc) fHTML = `<div class="forecast-area"><div class="forecast-loading">${'<div class="day-skel"></div>'.repeat(4)}</div></div>`;
    else if (fc.error) fHTML = `<div class="forecast-area"><div class="forecast-error">${fc.error}</div></div>`;
    else {
      const src = fc.best || fc.ecmwf;
      if (!src?.daily) { fHTML = `<div class="forecast-area"><div class="forecast-error">No data</div></div>`; }
      else {
        const expIdx = expandedDay[c.id];
        const cells = src.daily.time.map((t, di) => {
          const dt = new Date(t + 'T00:00:00');
          const bl = blendedScore(fc, di, c.orientation);
          const dd = extractDay(fc.best || fc.ecmwf, di);
          const isExp = expIdx === di;
          const dayLabel = dt.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase() + ' ' + dt.getDate();
          return `<div class="fday ${isExp ? 'active-day' : ''}" onclick="toggleExpand('${c.id}',${di})">
            <div class="fday-label">${dayLabel}</div>
            <div class="fday-icon">${wxSVG(dd.weather_code)}</div>
            <div class="fday-wx-label">${wxLabel(dd.weather_code)}</div>
            <div class="fday-temp">[ ${dd.temperature_2m_min != null ? Math.round(dd.temperature_2m_min) : '?'}° / ${dd.temperature_2m_max != null ? Math.round(dd.temperature_2m_max) : '?'}° ]</div>
            <div class="score-pill ${scorePillClass(bl.score)}">${bl.score}</div>
            ${confTag(bl.confidence)}
          </div>`;
        }).join('');

        let detailHTML = '';
        if (expIdx != null && src.daily.time[expIdx]) {
          const dd = extractDay(fc.best || fc.ecmwf, expIdx);
          const bl = blendedScore(fc, expIdx, c.orientation);
          const p = dd.precipitation_sum || 0, pp = dd.precipitation_probability_max || 0;
          const w = dd.wind_speed_10m_max || 0, g = dd.wind_gusts_10m_max || 0;
          const sh = dd.sunshine_duration ? (dd.sunshine_duration / 3600).toFixed(2) : '—';
          const uv = dd.uv_index_max != null ? dd.uv_index_max.toFixed(0) : '—';
          const wc = g > 50 ? 'bad' : g > 35 || w > 25 ? 'warn' : '';
          const rc = p > 0.5 ? 'rain' : '';
          const dl = new Date(src.daily.time[expIdx] + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
          const expDateStr = src.daily.time[expIdx];

          let modelHTML = '';
          if (fc.best && fc.ecmwf) {
            const db = extractDay(fc.best, expIdx), de = extractDay(fc.ecmwf, expIdx);
            modelHTML = `<div class="model-row"><div class="model-box"><strong>Best-match (local)</strong>Rain: ${(db.precipitation_sum || 0).toFixed(1)}mm · ${db.precipitation_probability_max || 0}%<br>Wind: ${Math.round(db.wind_speed_10m_max || 0)} Km/h<br>Score: ${computeScore(db, expDateStr, bl.dryHours, bl.windShelter)}</div><div class="model-box"><strong>ECMWF IFS</strong>Rain: ${(de.precipitation_sum || 0).toFixed(1)}mm · ${de.precipitation_probability_max || 0}%<br>Wind: ${Math.round(de.wind_speed_10m_max || 0)} Km/h<br>Score: ${computeScore(de, expDateStr, bl.dryHours, bl.windShelter)}</div></div>`;
          }

          detailHTML = `<div class="detail-panel">
            <span class="detail-date">${dl}</span><span class="detail-score-label">Climbability score: ${bl.score} ${scoreWord(bl.score)}</span>
            <div class="detail-grid">
              <div class="detail-item"><label>Temperature</label><span>${dd.temperature_2m_min != null ? Math.round(dd.temperature_2m_min) : '?'}° / ${dd.temperature_2m_max != null ? Math.round(dd.temperature_2m_max) : '?'}°</span></div>
              <div class="detail-item"><label>Rain</label><span class="${rc}">${p.toFixed(1)}mm (${pp}%)</span></div>
              <div class="detail-item"><label>Wind</label><span class="${wc}">${Math.round(w)} Km/h</span></div>
              <div class="detail-item"><label>Gusts</label><span class="${wc}">${Math.round(g)} Km/h</span></div>
              <div class="detail-item"><label>Sunshine</label><span>${sh} h</span></div>
              <div class="detail-item"><label>UV Index</label><span>${uv}</span></div>
              <div class="detail-item"><label>Drying time</label><span class="${dryingClass(bl.dryHours)}">${dryingLabel(bl.dryHours)}</span></div>
              <div class="detail-item"><label>Wind dir</label><span>${bl.windDeg != null ? bl.windDeg + '°' : '—'}</span></div>
              <div class="detail-item"><label>Shelter</label><span class="${bl.windShelter?.label === 'exposed' ? 'bad' : bl.windShelter?.label === 'crosswind' ? 'warn' : ''}">${bl.windShelter?.label || '—'}</span></div>
            </div>${modelHTML}
          </div>`;
        }
        fHTML = `<div class="forecast-area"><div class="forecast-grid">${cells}</div>${detailHTML}</div>`;
      }
    }
    return `<div class="crag-card" style="animation-delay:${ci * 0.08}s">
      <div class="card-head">
        <div class="card-head-row">
          <div class="crag-name">${c.name}</div>
          <div class="meta-pipe">${metaHTML}</div>
          <div class="card-actions"><button class="card-act" onclick="editCrag('${c.id}')">✎</button><button class="card-act" onclick="removeCrag('${c.id}')">✕</button></div>
        </div>
      </div>
      ${c.notes ? `<div class="card-notes">${c.notes}</div>` : ''}
      ${fHTML}</div>`;
  }).join('');
}

// ─── EXPLORE ───
function toggleExpand(id, di) { expandedDay[id] = expandedDay[id] === di ? null : di; renderCards(); }

function toggleRegion(rid) {
  if (expandedRegion === rid) expandedRegion = null;
  else {
    expandedRegion = rid;
    const rc = REGION_CRAGS[rid] || [];
    if (rc.some(c => !cragExploreCache[rid + '_' + c.name])) fetchRegionCrags(rid);
  }
  renderExplore();
}

async function fetchRegionCrags(rid) {
  const rc = REGION_CRAGS[rid] || [];
  await Promise.all(rc.map(async c => {
    const k = rid + '_' + c.name;
    if (cragExploreCache[k]) return;
    try { cragExploreCache[k] = await fetchDual(c.lat, c.lon); }
    catch (e) { cragExploreCache[k] = { error: e.message }; }
  }));
  renderExplore();
}

function renderExplore() {
  const grid = document.getElementById('exploreGrid');
  const sel = document.getElementById('exploreDaySelect');
  const any = Object.values(regionCache).find(r => r && !r.error && (r.best || r.ecmwf));

  if (any && sel.options.length <= 1) {
    const src = any.best || any.ecmwf;
    if (src?.daily?.time) {
      sel.innerHTML = '<option value="best">best day (7-day)</option>';
      src.daily.time.forEach((t, i) => {
        const dt = new Date(t + 'T00:00:00');
        sel.innerHTML += `<option value="${i}">${dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</option>`;
      });
    }
  }

  const mode = sel.value;
  let ranked = REGIONS.map(r => {
    const fc = regionCache[r.id];
    if (!fc || fc.error || (!fc.best && !fc.ecmwf)) return { ...r, scores: [], bestScore: 0, bestDay: '—', avgConf: '', error: fc?.error };
    const src = fc.best || fc.ecmwf;
    const scores = []; for (let i = 0; i < src.daily.time.length; i++) scores.push(blendedScore(fc, i, []));
    let ss; if (mode === 'best') ss = Math.max(...scores.map(s => s.score)); else { const di = parseInt(mode); ss = scores[di] ? scores[di].score : 0; }
    const bi = scores.reduce((b, s, i) => s.score > scores[b].score ? i : b, 0);
    const bd = new Date(src.daily.time[bi] + 'T00:00:00');
    return { ...r, scores, sortScore: ss, bestScore: scores[bi].score, bestDay: bd.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }), avgConf: scores.some(s => s.confidence === 'low') ? 'some disagreement' : scores.some(s => s.confidence === 'medium') ? 'mostly aligned' : 'models agree' };
  });
  ranked.sort((a, b) => (b.sortScore || 0) - (a.sortScore || 0));

  grid.innerHTML = ranked.map((r, ri) => {
    if (r.error) return `<div class="region-card" style="animation-delay:${ri * 0.06}s"><div class="region-toggle"><div class="region-header"><span class="region-rank">${ri + 1}</span><span class="region-name">${r.name}</span></div><div class="forecast-error">${r.error}</div></div></div>`;
    if (!r.scores.length) return `<div class="region-card" style="animation-delay:${ri * 0.06}s"><div class="region-toggle"><div class="region-header"><span class="region-rank">${ri + 1}</span><span class="region-name">${r.name}</span></div><div style="padding:8px 28px;font-size:.75rem;color:var(--ink-faint)">Loading…</div></div></div>`;

    const pips = r.scores.map(s => `<div class="region-pip" style="background:${scoreColorHex(s.score)}"></div>`).join('');
    const src2 = regionCache[r.id].best || regionCache[r.id].ecmwf;
    const labels = `<span>${new Date(src2.daily.time[0] + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</span><span>${new Date(src2.daily.time[r.scores.length - 1] + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</span>`;
    const isExp = expandedRegion === r.id;

    let cHTML = '';
    if (isExp) {
      const rc = REGION_CRAGS[r.id] || [];
      const sc = rc.map(c => {
        const k = r.id + '_' + c.name;
        const fc = cragExploreCache[k];
        let bs = null, bd = '';
        if (fc && !fc.error && (fc.best || fc.ecmwf)) {
          const s = fc.best || fc.ecmwf;
          let b = 0, bi = 0;
          s.daily.time.forEach((_, i) => { const v = blendedScore(fc, i, c.orientation || []).score; if (v > b) { b = v; bi = i; } });
          bs = b; bd = new Date(s.daily.time[bi] + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
        }
        return { ...c, bs, bd };
      }).sort((a, b) => (b.bs ?? -1) - (a.bs ?? -1));

      cHTML = `<div class="region-crags">${sc.map(c =>
        c.bs === null
          ? `<div class="rcrag"><div><div class="rcrag-name">${c.name}</div><div class="rcrag-meta">${c.alt}m · ${c.rock} · ${c.grades}</div></div><div class="rcrag-score"><div class="rcrag-score-num" style="color:var(--ink-ghost)">…</div></div></div>`
          : `<div class="rcrag"><div><div class="rcrag-name">${c.name}</div><div class="rcrag-meta">${c.alt}m · ${c.rock} · ${c.grades}</div></div><div class="rcrag-score"><div class="rcrag-score-num" style="color:${scoreColorHex(c.bs)}">${c.bs}</div><div class="rcrag-score-day">${c.bd}</div></div></div>`
      ).join('')}${sc.some(c => c.bs === null) ? '<div class="region-crags-loading">fetching forecasts…</div>' : ''}</div>`;
    }

    return `<div class="region-card" style="animation-delay:${ri * 0.06}s"><div class="region-toggle" onclick="toggleRegion('${r.id}')">
      <div class="region-header"><span class="region-rank">${ri + 1}</span><span class="region-name">${r.name}</span><div class="region-best"><div class="region-best-score" style="color:${scoreColorHex(r.bestScore)}">${r.bestScore}</div><div class="region-best-label">best · ${r.bestDay}</div></div></div>
      <div class="region-meta">${r.sub} · ${r.alt}m</div>
      <div class="region-pips">${pips}</div>
      <div class="region-pip-labels">${labels}</div>
      <div class="region-conf">${r.avgConf}</div>
      <div class="region-hint">${isExp ? '▲ collapse' : '▼ tap for top crags'}</div>
    </div>${cHTML}</div>`;
  }).join('');
}

// ─── FETCH ───
async function fetchAllForecasts() {
  setStatus('loading', 'updating…');
  let e = false;
  await Promise.all(crags.map(async c => {
    try { forecastCache[c.id] = await fetchDual(c.lat, c.lon); }
    catch (er) { forecastCache[c.id] = { error: er.message }; e = true; }
    renderCards();
  }));
  if (e) setStatus('error', 'connection issue');
  else { const t = new Date(); setStatus('ok', `updated ${t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`); }
}

async function fetchAllRegions() {
  setStatus('loading', 'updating regions…');
  let e = false;
  await Promise.all(REGIONS.map(async r => {
    try { regionCache[r.id] = await fetchDual(r.lat, r.lon); }
    catch (er) { regionCache[r.id] = { error: er.message }; e = true; }
    renderExplore();
  }));
  if (!e) { const t = new Date(); setStatus('ok', `updated ${t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`); }
}

function refreshAll() {
  forecastCache = {}; regionCache = {}; cragExploreCache = {};
  expandedDay = {}; expandedRegion = null;
  renderCards(); renderExplore();
  fetchAllForecasts().then(() => fetchAllRegions());
}

function setStatus(s, t) {
  const d = document.getElementById('statusDot'), x = document.getElementById('statusText');
  d.className = 'status-dot';
  if (s === 'loading') d.classList.add('loading');
  if (s === 'error') d.classList.add('error');
  x.textContent = t;
}

// ─── TABS & SORT ───
function switchTab(name, btn) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('pane-' + name).classList.add('active');
  if (name === 'explore' && !Object.keys(regionCache).length) fetchAllRegions();
}

function setSort(b) {
  document.querySelectorAll('.sort-btn').forEach(p => p.classList.remove('active'));
  b.classList.add('active');
  currentSort = b.dataset.sort;
  renderCards();
}

// ─── MODAL ───
function buildOrientationButtons() {
  document.getElementById('orientationBtns').innerHTML = ORIENTATIONS.map(o =>
    `<button type="button" class="orient-btn ${selectedOrientations.includes(o) ? 'active' : ''}" onclick="toggleOrientation('${o}',this)">${o}</button>`
  ).join('');
}

function toggleOrientation(o, b) {
  const i = selectedOrientations.indexOf(o);
  if (i >= 0) { selectedOrientations.splice(i, 1); b.classList.remove('active'); }
  else { selectedOrientations.push(o); b.classList.add('active'); }
}

function openModal(id) {
  editingId = id || null;
  selectedOrientations = [];
  if (editingId) {
    const c = crags.find(x => x.id === editingId);
    if (!c) return;
    document.getElementById('modalTitle').textContent = 'Edit crag';
    document.getElementById('inputName').value = c.name;
    document.getElementById('inputRegion').value = c.region || '';
    document.getElementById('inputLat').value = c.lat;
    document.getElementById('inputLon').value = c.lon;
    document.getElementById('inputAlt').value = c.alt || '';
    document.getElementById('inputRock').value = c.rock || '';
    document.getElementById('inputNotes').value = c.notes || '';
    selectedOrientations = [...(c.orientation || [])];
  } else {
    document.getElementById('modalTitle').textContent = 'Add a crag';
    ['inputName','inputRegion','inputLat','inputLon','inputAlt','inputRock'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('inputNotes').value = '';
  }
  buildOrientationButtons();
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('inputName').focus(), 100);
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); editingId = null; }
function closeModalOutside(e) { if (e.target === document.getElementById('modalOverlay')) closeModal(); }

async function saveCrag() {
  const name = document.getElementById('inputName').value.trim();
  const region = document.getElementById('inputRegion').value.trim();
  const lat = parseFloat(document.getElementById('inputLat').value);
  const lon = parseFloat(document.getElementById('inputLon').value);
  const alt = parseInt(document.getElementById('inputAlt').value) || null;
  const rock = document.getElementById('inputRock').value.trim();
  const notes = document.getElementById('inputNotes').value.trim();

  if (!name || isNaN(lat) || isNaN(lon)) { alert('Name, latitude, and longitude are required.'); return; }

  if (editingId) {
    const i = crags.findIndex(c => c.id === editingId);
    if (i >= 0) { crags[i] = { ...crags[i], name, region, lat, lon, alt, rock, notes, orientation: [...selectedOrientations] }; delete forecastCache[editingId]; }
  } else {
    crags.push({ id: name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now(), name, region, lat, lon, alt, rock, notes, orientation: [...selectedOrientations] });
  }
  saveCragsToStorage(); closeModal(); renderCards(); fetchAllForecasts();
}

function editCrag(id) { openModal(id); }

function removeCrag(id) {
  const c = crags.find(x => x.id === id);
  if (!c || !confirm(`Remove ${c.name}?`)) return;
  crags = crags.filter(x => x.id !== id);
  delete forecastCache[id];
  saveCragsToStorage(); renderCards();
}

// ─── INIT ───
function init() {
  // Inject SVG icons from icons.js
  document.querySelectorAll('.nav-icon').forEach(el => {
    const key = el.dataset.icon;
    if (key && ICON[key]) el.innerHTML = ICON[key];
  });
  const refreshEl = document.querySelector('.refresh-btn .refresh-icon');
  if (refreshEl) refreshEl.innerHTML = ICON.refresh;

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
    if (document.getElementById('pane-explore').classList.contains('active')) fetchAllRegions();
  }, 30 * 60 * 1000);
}

document.addEventListener('DOMContentLoaded', init);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
