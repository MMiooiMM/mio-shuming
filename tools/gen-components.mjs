// Generates src/data/components.json — for every BMP CJK ideograph, which of
// the 字根 used by src/data/zodiac-radicals.json it contains.
//
// Source: CJKVI IDS database (tools/raw/ids.txt)
//   https://github.com/cjkvi/cjkvi-ids  — ids.txt derives from the CHISE
//   project (http://www.chise.org/) and is GPLv2. Embedding the derived index
//   makes this project GPLv2 as well; see LICENSE.
//
// An IDS (Ideographic Description Sequence) describes a character's structure,
// e.g. 江 = ⿰氵工. Components are found by recursively expanding each IDS and
// discarding the IDC operators (⿰..⿻).
//
// Run: node tools/gen-components.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'tools', 'raw');
const OUT = join(ROOT, 'src', 'data', 'components.json');

const RANGES = [
  [0x4e00, 0x9fff],
  [0x3400, 0x4dbf],
];

const IDC = /[⿰-⿻]/gu;
/** Placeholder DCs used by cjkvi-ids for unencoded components. */
const NON_COMPONENT = /[①-⑳αℓ△〇キサ]/u;

/**
 * Traditional radical variant forms and the full form they stand for. 姓名學
 * treats a character written with 氵 as carrying the 水 字根, so a 字根 query
 * for 水 must also match 江. CJKRadicals.txt only records *simplified*
 * variants, so this table is maintained by hand; it is the standard
 * 康熙部首變體 list.
 */
const VARIANT_OF = {
  '氵': '水', '氺': '水',
  '艹': '艸',
  '忄': '心', '⺗': '心',
  '扌': '手',
  '犭': '犬',
  '礻': '示',
  '衤': '衣',
  '糹': '糸', '纟': '糸',
  '灬': '火',
  '亻': '人',
  '⺼': '肉',
  '⻏': '邑', '⻖': '阜',
  '飠': '食', '钅': '金',
  '訁': '言', '讠': '言',
  '罒': '网',
  '⺩': '玉',
  '⺈': '刀', '刂': '刀',
  '⺊': '卜',
  '⻍': '辵', '辶': '辵', '⻌': '辵',
  '⺛': '无',
  '龸': '光',
};

/** ids.txt lines: `U+XXXX\t<char>\t<IDS>[ <IDS>...]`, IDS may carry `[GTJKV]` tags. */
function loadIds() {
  const map = new Map();
  for (const line of readFileSync(join(RAW, 'ids.txt'), 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const ch = parts[1];
    if ([...ch].length !== 1) continue;
    // Prefer the T (Taiwan) variant when the entry lists several.
    const candidates = parts.slice(2).map((s) => s.trim()).filter(Boolean);
    const taiwan = candidates.find((s) => /\[[A-Z]*T[A-Z]*\]$/.test(s));
    const chosen = (taiwan ?? candidates[0]).replace(/\[[A-Z]*\]$/, '');
    map.set(ch, chosen);
  }
  return map;
}

const ids = loadIds();

/**
 * A character's 康熙部首, in its full form — Unihan kRSUnicode gives the radical
 * number, CJKRadicals.txt maps that to the radical's standalone ideograph.
 * IDS alone is not enough here: 琳 decomposes to ⿰𤣩林 / ⿰王林, but its 康熙
 * radical is 96 玉, and 姓名學 reads it as carrying the 玉 字根.
 */
function loadKangxiRadicalOf() {
  const radicalChar = new Map();
  for (const line of readFileSync(join(RAW, 'CJKRadicals.txt'), 'utf8').split('\n')) {
    const body = line.split('#')[0].trim();
    if (!body) continue;
    const [no, , ideograph] = body.split(';').map((s) => s.trim());
    if (!no || !ideograph || no.includes("'")) continue;
    radicalChar.set(parseInt(no, 10), String.fromCodePoint(parseInt(ideograph, 16)));
  }
  const out = new Map();
  for (const line of readFileSync(join(RAW, 'Unihan_IRGSources.txt'), 'utf8').split('\n')) {
    if (!line || line.charCodeAt(0) === 35) continue;
    const [cp, field, value] = line.split('\t');
    if (field !== 'kRSUnicode') continue;
    const n = parseInt(value.slice(0, value.indexOf('.')).replace(/'/g, ''), 10);
    const r = radicalChar.get(n);
    if (r) out.set(String.fromCodePoint(parseInt(cp.slice(2), 16)), r);
  }
  return out;
}

const kangxiRadicalOf = loadKangxiRadicalOf();

/** Recursively expand a character into its component set (includes itself). */
const cache = new Map();
function componentsOf(ch, depth = 0) {
  const hit = cache.get(ch);
  if (hit) return hit;
  const out = new Set([ch]);
  const alias = VARIANT_OF[ch];
  if (alias) out.add(alias);
  const radical = kangxiRadicalOf.get(ch);
  if (radical) out.add(radical);
  cache.set(ch, out); // set early so cyclic IDS data cannot recurse forever
  if (depth >= 12) return out;
  const seq = ids.get(ch);
  if (seq) {
    for (const c of seq.replace(IDC, '')) {
      if (c === ch || NON_COMPONENT.test(c)) continue;
      for (const sub of componentsOf(c, depth + 1)) out.add(sub);
    }
  }
  return out;
}

// The 字根 universe: every radical mentioned in the zodiac tables.
const zodiac = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'zodiac-radicals.json'), 'utf8'));
const universe = [
  ...new Set(
    Object.values(zodiac.zodiac).flatMap((z) => [...z.like, ...z.avoid]),
  ),
].sort();
const multiChar = universe.filter((r) => [...r].length !== 1);
if (multiChar.length) throw new Error(`字根 must be single characters: ${multiChar.join(',')}`);
const indexOf = new Map(universe.map((r, i) => [r, i]));

/** Two base36 digits per matched 字根 index; entries joined by ",". */
function encodeMatches(list) {
  return list.map((i) => i.toString(36).padStart(2, '0')).join('');
}

const blocks = [];
let matched = 0;
for (const [lo, hi] of RANGES) {
  const entries = [];
  for (let cp = lo; cp <= hi; cp++) {
    const ch = String.fromCodePoint(cp);
    const hits = [];
    for (const comp of componentsOf(ch)) {
      const i = indexOf.get(comp);
      if (i !== undefined) hits.push(i);
    }
    hits.sort((a, b) => a - b);
    if (hits.length) matched++;
    entries.push(encodeMatches(hits));
  }
  blocks.push({ start: lo, end: hi, entries: entries.join(',') });
}

const payload = {
  $comment:
    '生肖字根命中索引，由 tools/gen-components.mjs 從 CJKVI IDS 推導產生，請勿手改。',
  source: {
    url: 'https://github.com/cjkvi/cjkvi-ids',
    ids: 'cjkvi-ids 的 ids.txt，源自 CHISE 專案（http://www.chise.org/）',
    license: 'GPLv2',
    variantTable: '康熙部首變體對照（氵→水、艹→艸…）為人工維護。',
  },
  encoding: 'entries 以 "," 分隔每個 codepoint；每個 entry 是連續的 2 位 base36 字根索引',
  radicals: universe,
  blocks,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload), 'utf8');

// --- self-check ---------------------------------------------------------------
function lookup(ch) {
  const cp = ch.codePointAt(0);
  for (const b of blocks) {
    if (cp >= b.start && cp <= b.end) {
      const e = b.entries.split(',')[cp - b.start];
      const out = [];
      for (let i = 0; i < e.length; i += 2) out.push(universe[parseInt(e.slice(i, i + 2), 36)]);
      return out;
    }
  }
  return [];
}
const CHECKS = [
  ['安', '宀'],   // 宀 頭，鼠/兔/蛇喜
  ['宥', '宀'],
  ['淋', '水'],   // 氵 must normalise to 水
  ['江', '水'],
  ['菁', '艹'],
  ['慧', '心'],   // ⺗ must normalise to 心
  ['怡', '心'],   // 忄 must normalise to 心
  ['明', '月'],
  ['峰', '山'],
  ['鈺', '金'],
  ['琳', '玉'],   // ⺩ must normalise to 玉
];
const failures = [];
for (const [ch, want] of CHECKS) {
  if (!lookup(ch).includes(want)) failures.push(`${ch}: expected to contain 字根「${want}」, got [${lookup(ch).join('')}]`);
}

console.log(`字根 universe: ${universe.length}`);
console.log(`codepoints with >=1 字根: ${matched}`);
console.log(`written: ${OUT} (${(JSON.stringify(payload).length / 1024).toFixed(0)} KB)`);
if (failures.length) {
  console.error('SELF-CHECK FAILED:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log(`self-check: ${CHECKS.length} cases OK`);
