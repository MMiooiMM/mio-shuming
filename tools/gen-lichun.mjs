// Generates src/data/lichun.json — the instant of 立春 (solar longitude 315°)
// for each year, in UTC+8 (台北時間), which is the zodiac-year boundary used by
// 生肖姓名學.
//
// Algorithm: Jean Meeus, *Astronomical Algorithms* 2nd ed.
//   - ch. 25 "Solar Coordinates", low-accuracy method (25.2-25.10), apparent
//     solar longitude to ~0.01° (~15 minutes of time)
//   - ΔT (TT - UT) from the Espenak & Meeus polynomial expressions,
//     https://eclipse.gsfc.nasa.gov/SEhelp/deltatpoly2004.html
//
// Run: node tools/gen-lichun.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'data', 'lichun.json');

const FIRST_YEAR = 1900;
const LAST_YEAR = 2100;

const rad = (d) => (d * Math.PI) / 180;
const norm360 = (d) => ((d % 360) + 360) % 360;

/** Apparent geocentric longitude of the Sun, in degrees, for a JDE in TT. */
function sunApparentLongitude(jde) {
  const T = (jde - 2451545.0) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = rad(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M);
  const trueLong = L0 + C;
  const omega = rad(125.04 - 1934.136 * T);
  return norm360(trueLong - 0.00569 - 0.00478 * Math.sin(omega));
}

/** ΔT = TT - UT, in seconds (Espenak & Meeus polynomial expressions). */
function deltaT(year, month) {
  const y = year + (month - 0.5) / 12;
  let dt;
  if (y < 1900) {
    const t = y - 1860;
    dt = 7.62 + 0.5737 * t - 0.251754 * t ** 2 + 0.01680668 * t ** 3
       - 0.0004473624 * t ** 4 + t ** 5 / 233174;
  } else if (y < 1920) {
    const t = y - 1900;
    dt = -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4;
  } else if (y < 1941) {
    const t = y - 1920;
    dt = 21.20 + 0.84493 * t - 0.076100 * t ** 2 + 0.0020936 * t ** 3;
  } else if (y < 1961) {
    const t = y - 1950;
    dt = 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547;
  } else if (y < 1986) {
    const t = y - 1975;
    dt = 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718;
  } else if (y < 2005) {
    const t = y - 2000;
    dt = 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3
       + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5;
  } else if (y < 2050) {
    const t = y - 2000;
    dt = 62.92 + 0.32217 * t + 0.005589 * t ** 2;
  } else if (y < 2150) {
    dt = -20 + 32 * ((y - 1820) / 100) ** 2 - 0.5628 * (2150 - y);
  } else {
    const u = (y - 1820) / 100;
    dt = -20 + 32 * u * u;
  }
  return dt;
}

/** Gregorian calendar date -> Julian Day (Meeus 7.1). */
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

/** Julian Day -> {year, month, day, hour, minute} (Meeus ch. 7, inverse). */
function fromJD(jd) {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
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
  let minutes = Math.round((dayFrac - day) * 1440);
  // Rounding to the minute can spill into the next day.
  if (minutes >= 1440) return fromJD(jd + 1e-9 + (1440 - minutes) / 1440);
  return { year, month, day, hour: Math.floor(minutes / 60), minute: minutes % 60 };
}

/**
 * Instant of 立春 for a given Gregorian year, as a JDE in TT.
 * 立春 is where the Sun's apparent longitude reaches 315°; it always falls in
 * early February, i.e. on the 315°..360° arc of the previous tropical year.
 */
function lichunJDE(year) {
  // Bracket: 立春 is always between Feb 2 and Feb 6.
  let lo = toJD(year, 2, 1);
  let hi = toJD(year, 2, 7);
  // Work on longitude measured from 315° so the target is a zero crossing
  // without a 360° wrap inside the bracket.
  const f = (jde) => {
    const diff = sunApparentLongitude(jde) - 315;
    return diff > 180 ? diff - 360 : diff < -180 ? diff + 360 : diff;
  };
  if (f(lo) > 0 || f(hi) < 0) throw new Error(`立春 ${year} not bracketed by Feb 1-7`);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const years = {};
for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
  const jdeTT = lichunJDE(y);
  // TT -> UT -> UTC+8
  const jdUT = jdeTT - deltaT(y, 2) / 86400;
  const t = fromJD(jdUT + 8 / 24);
  if (t.year !== y || t.month !== 2) throw new Error(`立春 ${y} resolved to ${JSON.stringify(t)}`);
  years[y] = `${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}T${String(
    t.hour,
  ).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}

const payload = {
  $comment: '立春時刻表（UTC+8），由 tools/gen-lichun.mjs 天文計算產生，請勿手改。',
  source: {
    algorithm:
      "Jean Meeus, Astronomical Algorithms 2nd ed., ch.25 低精度太陽視黃經（±0.01°，約 ±15 分）；解 apparent solar longitude = 315°",
    url: 'https://eclipse.gsfc.nasa.gov/SEhelp/deltatpoly2004.html',
    deltaT: 'ΔT 採 Espenak & Meeus 多項式表達式',
    timezone: 'UTC+8（台北）',
  },
  range: [FIRST_YEAR, LAST_YEAR],
  format: 'MM-DDTHH:mm',
  years,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload), 'utf8');

// --- self-check against published 立春 times (中央氣象署 / 香港天文台) ---------
const GOLDEN = {
  1985: '02-04T05:12',
  2000: '02-04T20:32',
  2020: '02-04T17:03',
  2024: '02-04T16:27',
  2025: '02-03T22:10',
  2026: '02-04T04:02',
};
const failures = [];
for (const [y, want] of Object.entries(GOLDEN)) {
  const got = years[y];
  const dm = Math.abs(minutesOf(got) - minutesOf(want));
  if (dm > 15) failures.push(`${y}: expected ${want}, got ${got} (Δ${dm}min)`);
  else if (got !== want) console.log(`  ~ ${y}: ${got} vs published ${want} (Δ${dm}min, within tolerance)`);
}
function minutesOf(s) {
  const [d, hm] = s.split('T');
  const [, dd] = d.split('-');
  const [hh, mm] = hm.split(':');
  return ((+dd * 24 + +hh) * 60) + +mm;
}

console.log(`years: ${FIRST_YEAR}-${LAST_YEAR} (${Object.keys(years).length})`);
console.log(`written: ${OUT} (${(JSON.stringify(payload).length / 1024).toFixed(0)} KB)`);
if (failures.length) {
  console.error('GOLDEN CHECK FAILED:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log(`golden check: ${Object.keys(GOLDEN).length} years within ±15min of published values`);
