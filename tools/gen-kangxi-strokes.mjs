// Generates src/data/kangxi-strokes.json from the Unicode Han Database.
//
// Authoritative sources (downloaded into tools/raw/, not committed):
//   - Unihan.zip -> Unihan_IRGSources.txt
//       https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip
//       field kRSUnicode  = "<KangXi radical number>.<residual stroke count>"
//       field kTotalStrokes = modern total stroke count
//   - CJKRadicals.txt
//       https://www.unicode.org/Public/UCD/latest/ucd/CJKRadicals.txt
//       field 3 = the CJK unified ideograph formed from that radical alone
//
// Derivation used by 姓名學 (康熙筆畫), which counts a radical by its full
// original form (氵 counts as 水 4, 艹 as 艸 6, 阝 as 阜 8 / 邑 7 ...):
//
//     康熙筆畫(char) = strokes(radical of char, in its original form)
//                    + residual stroke count of char
//
// kTotalStrokes must NOT be used: it is the modern count of the glyph as
// written (江 6, 花 7, 陳 10), not the 康熙 count (江 7, 花 10, 陳 16).
//
// Run: npm run gen:data

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'tools', 'raw');
const OUT = join(ROOT, 'src', 'data', 'kangxi-strokes.json');

/** Codepoint ranges covered by the generated table (BMP CJK ideographs). */
const RANGES = [
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0x3400, 0x4dbf], // CJK Unified Ideographs Extension A
];

/** Unihan fields are `U+XXXX\tkField\tvalue`. */
function parseUnihan(file, wanted) {
  const out = new Map();
  for (const field of wanted) out.set(field, new Map());
  for (const line of readFileSync(join(RAW, file), 'utf8').split('\n')) {
    if (!line || line.charCodeAt(0) === 35 /* # */) continue;
    const [cp, field, ...rest] = line.split('\t');
    const bucket = out.get(field);
    if (!bucket) continue;
    bucket.set(parseInt(cp.slice(2), 16), rest.join('\t').trim());
  }
  return out;
}

/** CJKRadicals.txt lines are `<radical no>; <radical char>; <ideograph>`. */
function parseRadicals() {
  const out = new Map();
  for (const line of readFileSync(join(RAW, 'CJKRadicals.txt'), 'utf8').split('\n')) {
    const body = line.split('#')[0].trim();
    if (!body) continue;
    const [no, , ideograph] = body.split(';').map((s) => s.trim());
    if (!no || !ideograph) continue;
    out.set(no, parseInt(ideograph, 16));
  }
  return out;
}

const unihan = parseUnihan('Unihan_IRGSources.txt', ['kRSUnicode', 'kTotalStrokes']);
const kRSUnicode = unihan.get('kRSUnicode');
const kTotalStrokes = unihan.get('kTotalStrokes');
const radicalIdeograph = parseRadicals();

/** kTotalStrokes may list several values (`G-source J-source`); take the first. */
function totalStrokes(cp) {
  const raw = kTotalStrokes.get(cp);
  if (!raw) return undefined;
  const n = parseInt(raw.split(' ')[0], 10);
  return Number.isFinite(n) ? n : undefined;
}

// Stroke count of each of the 214 KangXi radicals in its original form.
// Taken from the radical's own standalone ideograph: a standalone radical is
// written in full, so its modern count equals its 康熙 count (水 4, 艸 6,
// 肉 6, 阜 8, 邑 7 ...). Simplified radical variants (numbers suffixed with
// apostrophes, e.g. 167' 钅) are folded onto their traditional base number,
// which is exactly the 姓名學 convention of counting the traditional form.
const radicalStrokes = new Map();
for (const [no, cp] of radicalIdeograph) {
  if (no.includes("'")) continue; // variant form; base number carries the count
  const n = totalStrokes(cp);
  if (n !== undefined) radicalStrokes.set(parseInt(no, 10), n);
}

const missingRadicals = [];
for (let n = 1; n <= 214; n++) if (!radicalStrokes.has(n)) missingRadicals.push(n);
if (missingRadicals.length) {
  throw new Error(`No stroke count for KangXi radicals: ${missingRadicals.join(', ')}`);
}

/** Base-36, two digits, so one codepoint costs exactly two characters. */
function encode(n) {
  if (n === undefined || n < 0 || n > 36 * 36 - 1) return '00';
  return n.toString(36).padStart(2, '0');
}

const blocks = [];
let covered = 0;
let uncovered = 0;

for (const [lo, hi] of RANGES) {
  const chunks = [];
  for (let cp = lo; cp <= hi; cp++) {
    const rs = kRSUnicode.get(cp);
    if (!rs) {
      chunks.push('00');
      uncovered++;
      continue;
    }
    // "85.3", "163.8", "167'.6" — apostrophes mark simplified radical variants.
    const dot = rs.indexOf('.');
    const radical = parseInt(rs.slice(0, dot).replace(/'/g, ''), 10);
    const residual = parseInt(rs.slice(dot + 1), 10);
    const base = radicalStrokes.get(radical);
    if (base === undefined || !Number.isFinite(residual)) {
      chunks.push('00');
      uncovered++;
      continue;
    }
    chunks.push(encode(base + residual));
    covered++;
  }
  blocks.push({ start: lo, end: hi, strokes: chunks.join('') });
}

const payload = {
  $comment:
    '康熙筆畫表，由 tools/gen-kangxi-strokes.mjs 從 Unicode Han Database 推導產生，請勿手改。',
  source: {
    url: 'https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip',
    unihan: 'Unihan_IRGSources.txt 的 kRSUnicode 欄位（Unicode 17.0.0）',
    cjkRadicals: 'https://www.unicode.org/Public/UCD/latest/ucd/CJKRadicals.txt',
    unicodeVersion: '17.0.0',
    derivation: '康熙筆畫 = 康熙部首本字筆畫 + 部首外筆畫；不使用 kTotalStrokes（現代筆畫）',
    license: 'https://www.unicode.org/terms_of_use.html',
  },
  encoding: 'base36-2ch-per-codepoint; "00" = 無資料',
  radicalStrokes: Object.fromEntries([...radicalStrokes].sort((a, b) => a[0] - b[0])),
  blocks,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload), 'utf8');

// --- self-check against hand-verified 康熙字典 counts -------------------------
const GOLDEN = {
  江: 7, 花: 10, 陳: 16, 郭: 15, 明: 8, 胡: 11,
  王: 4, 小: 3, 李: 7, 張: 11, 黃: 12, 劉: 15,
  沈: 8, 蔡: 17, 楊: 13, 許: 11, 鄭: 19, 謝: 17,
  洪: 10, 邱: 12, 廖: 14, 賴: 16, 徐: 10, 周: 8,
  葉: 15, 蘇: 22, 莊: 13, 呂: 7, 江: 7, 何: 7,
};
function lookup(ch) {
  const cp = ch.codePointAt(0);
  for (const b of blocks) {
    if (cp >= b.start && cp <= b.end) {
      const v = b.strokes.slice((cp - b.start) * 2, (cp - b.start) * 2 + 2);
      return v === '00' ? undefined : parseInt(v, 36);
    }
  }
  return undefined;
}
const failures = [];
for (const [ch, want] of Object.entries(GOLDEN)) {
  const got = lookup(ch);
  if (got !== want) failures.push(`${ch}: expected ${want}, got ${got ?? 'none'}`);
}

console.log(`radicals: ${radicalStrokes.size}/214`);
console.log(`codepoints with strokes: ${covered}, without: ${uncovered}`);
console.log(`written: ${OUT} (${(JSON.stringify(payload).length / 1024).toFixed(0)} KB)`);
if (failures.length) {
  console.error('GOLDEN CHECK FAILED:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log(`golden check: ${Object.keys(GOLDEN).length} chars OK`);
