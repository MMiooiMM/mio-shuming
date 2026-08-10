// Generates src/data/solar-terms.json — the instant of each of the twelve 節
// (the solar terms that start a 月支), plus an equation-of-time table.
//
// Supersedes the earlier gen-lichun.mjs: 立春 is simply the 節 at 315°, and
// SPEC-v2 #11 requires 年柱 (生肖) and 月柱 to share one source of truth.
//
// Why the twelve 節 and not all twenty-four terms
//   https://zh.wikipedia.org/wiki/节气
//   「二十四節氣每一個分別相應於太阳在黄道上每運動15°所到達之位置。二十四節氣又
//     分為12個節令和12個中氣，一一相間。……12個節令也是干支纪月中的每个月支的
//     起始之日，例如，立春为寅月之始，惊蜇为卯月之始。」
//   中氣 never starts a 月支, so v2 does not need them.
//
// Algorithm: Jean Meeus, *Astronomical Algorithms* 2nd ed.
//   - ch. 25 "Solar Coordinates", low-accuracy method (25.2-25.10): apparent
//     solar longitude to ~0.01° (~15 minutes of time)
//   - ch. 28 "Equation of Time" (28.1)
//   - ΔT from the Espenak & Meeus polynomial expressions,
//     https://eclipse.gsfc.nasa.gov/SEhelp/deltatpoly2004.html
//
// Verified against 交通部中央氣象署《天文年曆》 — see GOLDEN below.
//
// Run: node tools/gen-solar-terms.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'data', 'solar-terms.json');

const FIRST_YEAR = 1900;
const LAST_YEAR = 2100;

/**
 * The twelve 節, in Gregorian calendar order — exactly one falls in each month.
 * `deg` is the sun's apparent longitude at that instant; `branch` is the 月支
 * the 節 starts; `about` is the nominal day of month, used only to bracket the
 * root-finder.
 */
const JIE = [
  { name: '小寒', deg: 285, branch: '丑', month: 1, about: 6 },
  { name: '立春', deg: 315, branch: '寅', month: 2, about: 4 },
  { name: '驚蟄', deg: 345, branch: '卯', month: 3, about: 6 },
  { name: '清明', deg: 15, branch: '辰', month: 4, about: 5 },
  { name: '立夏', deg: 45, branch: '巳', month: 5, about: 6 },
  { name: '芒種', deg: 75, branch: '午', month: 6, about: 6 },
  { name: '小暑', deg: 105, branch: '未', month: 7, about: 7 },
  { name: '立秋', deg: 135, branch: '申', month: 8, about: 8 },
  { name: '白露', deg: 165, branch: '酉', month: 9, about: 8 },
  { name: '寒露', deg: 195, branch: '戌', month: 10, about: 8 },
  { name: '立冬', deg: 225, branch: '亥', month: 11, about: 7 },
  { name: '大雪', deg: 255, branch: '子', month: 12, about: 7 },
];

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const norm360 = (d) => ((d % 360) + 360) % 360;

/** Sun's geometric mean longitude L0 and mean anomaly M, in degrees. */
function sunMean(T) {
  return {
    L0: 280.46646 + 36000.76983 * T + 0.0003032 * T * T,
    M: 357.52911 + 35999.05029 * T - 0.0001537 * T * T,
  };
}

/** Apparent geocentric longitude of the Sun, in degrees, for a JDE in TT. */
function sunApparentLongitude(jde) {
  const T = (jde - 2451545.0) / 36525;
  const { L0, M } = sunMean(T);
  const Mr = rad(M);
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) +
    0.000289 * Math.sin(3 * Mr);
  const omega = rad(125.04 - 1934.136 * T);
  return norm360(L0 + C - 0.00569 - 0.00478 * Math.sin(omega));
}

/** Mean obliquity of the ecliptic, in degrees (Meeus 22.2). */
function obliquity(T) {
  return (
    23 + 26 / 60 + 21.448 / 3600
    - (46.815 * T + 0.00059 * T * T - 0.001813 * T * T * T) / 3600
  );
}

/**
 * Equation of time (apparent solar time − mean solar time), in minutes,
 * for a JDE in TT. Meeus 28.1: E = L0 − 0.0057183 − α (+ nutation term,
 * omitted: it is under 0.03 s of time).
 */
function equationOfTime(jde) {
  const T = (jde - 2451545.0) / 36525;
  const { L0 } = sunMean(T);
  const lambda = rad(sunApparentLongitude(jde));
  const eps = rad(obliquity(T));
  const alpha = deg(Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)));
  let E = norm360(L0) - 0.0057183 - norm360(alpha);
  // Bring into (−180, 180]; E is only ever a few tenths of a degree.
  if (E > 180) E -= 360;
  if (E < -180) E += 360;
  return E * 4; // 1° of hour angle = 4 minutes of time
}

/** ΔT = TT − UT, in seconds (Espenak & Meeus polynomial expressions). */
function deltaT(year, month) {
  const y = year + (month - 0.5) / 12;
  if (y < 1900) {
    const t = y - 1860;
    return 7.62 + 0.5737 * t - 0.251754 * t ** 2 + 0.01680668 * t ** 3
      - 0.0004473624 * t ** 4 + t ** 5 / 233174;
  }
  if (y < 1920) {
    const t = y - 1900;
    return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4;
  }
  if (y < 1941) {
    const t = y - 1920;
    return 21.20 + 0.84493 * t - 0.076100 * t ** 2 + 0.0020936 * t ** 3;
  }
  if (y < 1961) {
    const t = y - 1950;
    return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547;
  }
  if (y < 1986) {
    const t = y - 1975;
    return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718;
  }
  if (y < 2005) {
    const t = y - 2000;
    return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3
      + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5;
  }
  if (y < 2050) {
    const t = y - 2000;
    return 62.92 + 0.32217 * t + 0.005589 * t ** 2;
  }
  if (y < 2150) return -20 + 32 * ((y - 1820) / 100) ** 2 - 0.5628 * (2150 - y);
  const u = (y - 1820) / 100;
  return -20 + 32 * u * u;
}

/** Gregorian date -> Julian Day at 0h (Meeus 7.1). */
function toJD(year, month, day) {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + B - 1524.5;
}

/**
 * Julian Day -> calendar date and time, rounded to the minute (Meeus ch. 7,
 * inverse). The JD is snapped to a whole minute *before* being decomposed, so
 * the day fraction can never round up to 1440 minutes and spill into the next
 * day — rounding after the split needs a carry, and a carry that lands exactly
 * on midnight does not terminate.
 */
function fromJD(jd) {
  const wholeMinutes = Math.round((jd + 0.5) * 1440);
  const z = Math.floor(wholeMinutes / 1440);
  const f = (wholeMinutes - z * 1440) / 1440;
  let a = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const dayFrac = b - d - Math.floor(30.6001 * e) + f;
  const day = Math.floor(dayFrac);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;
  const minutes = Math.round((dayFrac - day) * 1440); // 0..1439 by construction
  return { year, month, day, hour: Math.floor(minutes / 60), minute: minutes % 60 };
}

/** Instant (JDE, TT) at which the sun's apparent longitude reaches `target`. */
function solveLongitude(year, term) {
  const centre = toJD(year, term.month, term.about);
  // Signed distance to the target, wrap-safe: the sun moves ~1°/day, so within
  // a two-week bracket the difference never legitimately exceeds ±15°.
  const f = (jde) => {
    let d = sunApparentLongitude(jde) - term.deg;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  };
  let lo = centre - 8;
  let hi = centre + 8;
  if (f(lo) > 0 || f(hi) < 0) {
    throw new Error(`${year} ${term.name} not bracketed by ${term.month}/${term.about} ±8d`);
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const pad = (n) => String(n).padStart(2, '0');

// --- twelve 節 per year, in UTC+8 -------------------------------------------

const years = {};
for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
  years[y] = JIE.map((term) => {
    const jdeTT = solveLongitude(y, term);
    const t = fromJD(jdeTT - deltaT(y, term.month) / 86400 + 8 / 24);
    if (t.year !== y || t.month !== term.month) {
      throw new Error(`${y} ${term.name} resolved outside its month: ${JSON.stringify(t)}`);
    }
    return `${pad(t.month)}-${pad(t.day)}T${pad(t.hour)}:${pad(t.minute)}`;
  });
}

// --- equation of time, by day of year ---------------------------------------
//
// EoT depends on the date and only very slightly on the year. The table is
// computed for the middle of the covered range; `eotDriftSeconds` below records
// the largest disagreement across 1900-2100, measured rather than asserted.

const EOT_EPOCH_YEAR = 2000;
const equationOfTimeTable = [];
for (let doy = 1; doy <= 366; doy++) {
  const jde = toJD(EOT_EPOCH_YEAR, 1, 1) + (doy - 1) + 0.5; // local noon-ish
  equationOfTimeTable.push(Number(equationOfTime(jde).toFixed(2)));
}

let maxDriftSeconds = 0;
for (const probeYear of [FIRST_YEAR, 1950, 2050, LAST_YEAR]) {
  for (let doy = 1; doy <= 365; doy += 7) {
    const jde = toJD(probeYear, 1, 1) + (doy - 1) + 0.5;
    const drift = Math.abs(equationOfTime(jde) - equationOfTimeTable[doy - 1]) * 60;
    if (drift > maxDriftSeconds) maxDriftSeconds = drift;
  }
}

const payload = {
  $comment:
    '十二節時刻表（UTC+8）與均時差表，由 tools/gen-solar-terms.mjs 天文計算產生，請勿手改。',
  source: {
    algorithm:
      'Jean Meeus, Astronomical Algorithms 2nd ed. ch.25（太陽視黃經，低精度法 ±0.01°≈±15 分）與 ch.28（均時差）',
    deltaT: 'ΔT 採 Espenak & Meeus 多項式表達式',
    deltaTUrl: 'https://eclipse.gsfc.nasa.gov/SEhelp/deltatpoly2004.html',
    verifiedAgainst: '交通部中央氣象署《天文年曆》2016／2023／2025 年版公布之節氣時刻',
    verifiedAgainstUrl: 'https://www.cwa.gov.tw/Data/service/notice/download/Publish_20241209150048.pdf',
    jieRule:
      '十二節（非中氣）為干支紀月各月支之始，見 https://zh.wikipedia.org/wiki/节气：「12個節令也是干支纪月中的每个月支的起始之日」',
    timezone: 'UTC+8（台北）',
  },
  range: [FIRST_YEAR, LAST_YEAR],
  format: 'years[年] 為 12 個節的時刻，順序同 jie 陣列，格式 MM-DDTHH:mm',
  jie: JIE.map(({ name, deg: d, branch }) => ({ name, deg: d, branch })),
  years,
  equationOfTime: {
    $comment:
      '均時差（真太陽時 − 平太陽時），單位分鐘，索引為一年中的第幾天（1 起算，含閏日）。',
    epochYear: EOT_EPOCH_YEAR,
    maxDriftSecondsOverRange: Number(maxDriftSeconds.toFixed(1)),
    minutes: equationOfTimeTable,
  },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload), 'utf8');

// --- golden check against 中央氣象署《天文年曆》 -------------------------------
//
// Values transcribed from the 節氣 tables of the CWA astronomical yearbooks.
// 2025 covers all twelve 節 (a full year, every season); 2016 and 2023 pin down
// 立春 and 驚蟄 at the far ends of the ΔT range actually exercised.

const GOLDEN = {
  2025: {
    小寒: '01-05T10:33', 立春: '02-03T22:10', 驚蟄: '03-05T16:07', 清明: '04-04T20:49',
    立夏: '05-05T13:57', 芒種: '06-05T17:56', 小暑: '07-07T04:05', 立秋: '08-07T13:52',
    白露: '09-07T16:52', 寒露: '10-08T08:41', 立冬: '11-07T12:04', 大雪: '12-07T05:05',
  },
  2023: { 立春: '02-04T10:43', 驚蟄: '03-06T04:36' },
  2016: { 立春: '02-04T17:46', 驚蟄: '03-05T11:44' },
};

const TOLERANCE_MINUTES = 15; // the low-accuracy solar longitude is ±0.01° ≈ ±15 min

// The golden comparison below cannot police ΔT. ΔT is ~1 minute over the
// covered range, an order of magnitude under the ±15 min accuracy of the
// low-precision solar longitude, so dropping the TT→UT conversion would still
// pass — for 2025 立春 it would even land marginally closer to the published
// time, purely by cancelling part of the longitude error. Tightening the
// tolerance would therefore reward the wrong code.
//
// ΔT is instead guarded directly, against published values of ΔT itself.
// Sources: Espenak & Meeus, https://eclipse.gsfc.nasa.gov/SEhelp/deltatpoly2004.html
// (the polynomial is a fit to observation, hence the few-seconds tolerance).
const DELTA_T_GOLDEN = [
  { year: 1900, seconds: -2.8 },
  { year: 1950, seconds: 29.1 },
  { year: 2000, seconds: 63.8 },
  { year: 2020, seconds: 69.4 },
];
const DELTA_T_TOLERANCE_SECONDS = 3;

const deltaTFailures = DELTA_T_GOLDEN.flatMap(({ year, seconds }) => {
  const got = deltaT(year, 1);
  return Math.abs(got - seconds) > DELTA_T_TOLERANCE_SECONDS
    ? [`ΔT ${year}: 得 ${got.toFixed(1)} 秒，公布值 ${seconds} 秒`]
    : [];
});

// The check above only proves deltaT() itself is right — the pipeline could
// still drop the call. Recompute one term end-to-end here, independently, and
// require the emitted table to match the *with-ΔT* answer and differ from the
// without-ΔT one. Deleting `- deltaT(...) / 86400` from the main loop then
// fails loudly instead of silently shifting every instant by ~a minute.
{
  const probeYear = 2100; // largest ΔT in range, so the two answers differ most
  const term = JIE[1]; // 立春
  const jdeTT = solveLongitude(probeYear, term);
  const fmt = (t) => `${pad(t.month)}-${pad(t.day)}T${pad(t.hour)}:${pad(t.minute)}`;
  const withDeltaT = fmt(fromJD(jdeTT - deltaT(probeYear, term.month) / 86400 + 8 / 24));
  const withoutDeltaT = fmt(fromJD(jdeTT + 8 / 24));
  const emitted = years[probeYear][1];
  if (emitted !== withDeltaT) {
    deltaTFailures.push(`ΔT 未套用於產出：${probeYear} ${term.name} 得 ${emitted}，應為 ${withDeltaT}`);
  }
  if (withDeltaT === withoutDeltaT) {
    deltaTFailures.push(
      `ΔT 探針失效：${probeYear} ${term.name} 有無 ΔT 的結果相同（${withDeltaT}），此檢查無鑑別力`,
    );
  }
}
const minutesOf = (s) => {
  const [d, hm] = s.split('T');
  return (Number(d.split('-')[1]) * 24 + Number(hm.split(':')[0])) * 60 + Number(hm.split(':')[1]);
};

const failures = [];
let checked = 0;
let worstDelta = 0;
for (const [y, terms] of Object.entries(GOLDEN)) {
  for (const [name, want] of Object.entries(terms)) {
    const got = years[y][JIE.findIndex((t) => t.name === name)];
    checked++;
    const delta = Math.abs(minutesOf(got) - minutesOf(want));
    if (got.slice(0, 5) !== want.slice(0, 5)) {
      failures.push(`${y} ${name}: 日期不符 — 得 ${got}，公布 ${want}`);
    } else if (delta > TOLERANCE_MINUTES) {
      failures.push(`${y} ${name}: 得 ${got}，公布 ${want}（差 ${delta} 分，超過容差）`);
    }
    if (delta > worstDelta) worstDelta = delta;
  }
}

console.log(`節: ${JIE.length} × ${FIRST_YEAR}-${LAST_YEAR} = ${JIE.length * (LAST_YEAR - FIRST_YEAR + 1)} 筆`);
console.log(`均時差表: 366 筆，跨 ${FIRST_YEAR}-${LAST_YEAR} 最大漂移 ${maxDriftSeconds.toFixed(1)} 秒`);
console.log(`written: ${OUT} (${(JSON.stringify(payload).length / 1024).toFixed(0)} KB)`);
const allFailures = [...failures, ...deltaTFailures];
if (allFailures.length) {
  console.error('GOLDEN CHECK FAILED:\n  ' + allFailures.join('\n  '));
  process.exit(1);
}
console.log(`golden check: ${checked} 筆全數與中央氣象署公布值同日，最大時刻差 ${worstDelta} 分（容差 ${TOLERANCE_MINUTES} 分）`);
console.log(`ΔT check: ${DELTA_T_GOLDEN.length} 筆與公布值相差 ${DELTA_T_TOLERANCE_SECONDS} 秒內`);
