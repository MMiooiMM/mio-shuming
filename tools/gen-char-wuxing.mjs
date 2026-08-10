// Generates src/data/char-wuxing.json — 逐字五行（SPEC-v2 #17 的匹配尺度）
// 與 常用字表（SPEC-v2 #19 的候選字過濾）。
//
// ⚠️ 逐字五行的判定依據，來源沒有交代
//   資料的 wuxing 欄爬自百度漢語，實測**不依部首**（明＝水／部首日、口＝木、
//   手＝金、心＝金）。跨兩份獨立資料集 99.8% 一致只證明它穩定，不證明它正確。
//   因此本站只能把它定位為「網路主流通行版」，與 v1 的 81 數理同級，
//   **不得宣稱為權威規則**——UI 與資料檔都要照 v1 慣例標明。
//   完整查證見 docs/v2-sources.md 第 7 節。
//
// 為什麼不用部首 → 五行
//   遍尋不著權威的 214 部首對照表；只採無爭議部首的話，對常用字覆蓋率只有
//   26–35%，功能形同半殘。SPEC-v2 #17 已於 2026-08-10 據此改判。
//
// 逐字五行來源
//   https://github.com/ben-hua/general_standard_chinese  gsc_pinyin.csv
//   8,105 筆（2013 年《通用規範漢字表》），Apache-2.0。
//   欄位：num, word, pinyin, radical, stroke_count, wuxing, traditional, wubi
//   traditional 欄可能是「歷、曆」這種一簡對多繁，逐個都建索引。
//
// 常用字表來源（候選字過濾用）
//   Big5 Level 1 常用字區 0xA440–0xC67E，由 Unihan 的 kBigFive 欄位離線導出。
//   **不等同**教育部《常用國字標準字體表》——後者遍尋不著機器可讀版本，
//   差異記在資料檔的 source 欄位。
//
// 取得上游原始檔（tools/raw/ 不入版控）：
//   curl -L -o tools/raw/gsc_pinyin.csv \
//     https://raw.githubusercontent.com/ben-hua/general_standard_chinese/master/gsc_pinyin.csv
//   curl -o tools/raw/Unihan_OtherMappings.txt \
//     https://www.unicode.org/Public/UCD/latest/ucd/Unihan_OtherMappings.txt
//
// Run: node tools/gen-char-wuxing.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV = join(ROOT, 'tools', 'raw', 'gsc_pinyin.csv');
const UNIHAN = join(ROOT, 'tools', 'raw', 'Unihan_OtherMappings.txt');
const VARIANTS = join(ROOT, 'tools', 'raw', 'Unihan_Variants.txt');
const OUT = join(ROOT, 'src', 'data', 'char-wuxing.json');

const ELEMENTS = ['木', '火', '土', '金', '水'];

/** 最小 CSV parser：欄位可用雙引號包住，引號內的逗號不分欄。 */
function parseCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(field);
      field = '';
    } else field += ch;
  }
  out.push(field);
  return out;
}

const rows = readFileSync(CSV, 'utf8')
  .split(/\r?\n/)
  .slice(1)
  .filter((l) => l.trim() !== '')
  .map(parseCsvLine);

const header = readFileSync(CSV, 'utf8').split(/\r?\n/)[0];
const EXPECTED_HEADER = 'num,word,pinyin,radical,stroke_count,wuxing,traditional,wubi';
if (header?.trim() !== EXPECTED_HEADER) {
  throw new Error(`gsc_pinyin.csv 表頭與預期不符：${header}`);
}
if (rows.length !== 8105) {
  throw new Error(`gsc_pinyin.csv 應為 8,105 列，實得 ${rows.length}——上游改版時請重新查證。`);
}
for (const [i, cols] of rows.entries()) {
  if (cols.length !== 8) throw new Error(`第 ${i + 2} 列欄數為 ${cols.length}，應為 8。`);
}

/** 字 → 五行。一簡對多繁時每個繁體都建索引。 */
const byChar = new Map();
/**
 * 同一個字被上游指到兩種五行（多半是一簡對多繁合併所致）。
 *
 * **不採「先到者為準」** —— 上游的列順序不是判定規則，拿它當裁判就是猜。
 * 這些字整個退出索引，由呼叫端回報「五行不明（來源有兩說）」（SPEC-v2 #24）。
 */
const collisions = [];
let skipped = 0;

for (const cols of rows) {
  const [, word, , , , wuxing, traditional] = cols;
  if (!ELEMENTS.includes(wuxing)) {
    skipped += 1;
    continue;
  }
  const forms = new Set([word, ...(traditional ?? '').split(/[、,，]/)]);
  for (const form of forms) {
    const ch = form.trim();
    // 只收單一 BMP 漢字；空字串與多字詞（少數 traditional 欄位）略過。
    if ([...ch].length !== 1 || !/^\p{Script=Han}$/u.test(ch)) continue;
    const prev = byChar.get(ch);
    if (prev !== undefined && prev !== wuxing) {
      collisions.push({ char: ch, readings: [prev, wuxing].sort() });
      continue;
    }
    byChar.set(ch, wuxing);
  }
}

// 衝突字整個退出索引 —— 留著等於替上游選邊。繁簡橋接也不准把它們接回來。
const undecided = new Set(collisions.map((c) => c.char));
for (const char of undecided) byChar.delete(char);

// --- 繁簡橋接 -----------------------------------------------------------------
//
// 上游是簡體字表，繁體專屬字形（亙、佈、佔…）不一定收得到。用 Unihan 的
// kSimplifiedVariant 把繁體字接到它的簡體形，再查五行。橋接來的條目另外計數，
// 因為它多繞了一層對應，可靠度不等同直接命中。

const simplifiedOf = new Map();
for (const line of readFileSync(VARIANTS, 'utf8').split(/\r?\n/)) {
  if (!line.startsWith('U+')) continue;
  const [code, field, value] = line.split('\t');
  if (field !== 'kSimplifiedVariant') continue;
  const from = String.fromCodePoint(parseInt(code.slice(2), 16));
  const to = value
    .split(/\s+/)
    .filter((v) => v.startsWith('U+'))
    .map((v) => String.fromCodePoint(parseInt(v.slice(2), 16)));
  if (to.length) simplifiedOf.set(from, to);
}

// --- Big5 Level 1 常用字（候選字過濾用） -------------------------------------

const BIG5_L1_START = 0xa440;
const BIG5_L1_END = 0xc67e;
const common = [];
for (const line of readFileSync(UNIHAN, 'utf8').split(/\r?\n/)) {
  if (!line.startsWith('U+')) continue;
  const [code, field, value] = line.split('\t');
  if (field !== 'kBigFive') continue;
  // kBigFive 可能有多個值；只要任一值落在 Level 1 就算常用字。
  const inLevel1 = value
    .split(/\s+/)
    .filter(Boolean)
    .some((v) => {
      const big5 = parseInt(v, 16);
      return Number.isFinite(big5) && big5 >= BIG5_L1_START && big5 <= BIG5_L1_END;
    });
  if (!inLevel1) continue;
  common.push(String.fromCodePoint(parseInt(code.slice(2), 16)));
}
const uniqueCommon = [...new Set(common)];
if (uniqueCommon.length !== common.length) {
  throw new Error(`Big5 Level 1 有重複字：${common.length} vs ${uniqueCommon.length}`);
}
if (common.length !== 5402) {
  throw new Error(`Big5 Level 1 應為 5,402 字，實得 ${common.length}——Unihan 改版時請重新查證。`);
}
common.sort();

let bridged = 0;
/** 繁體字的多個簡體對應指到不同五行——同樣不靠上游排列順序決定。 */
const bridgeConflicts = [];
for (const ch of common) {
  if (byChar.has(ch) || undecided.has(ch)) continue;
  const candidates = new Set(
    (simplifiedOf.get(ch) ?? []).map((simplified) => byChar.get(simplified)).filter(Boolean),
  );
  if (candidates.size === 1) {
    byChar.set(ch, [...candidates][0]);
    bridged += 1;
  } else if (candidates.size > 1) {
    bridgeConflicts.push({ char: ch, readings: [...candidates].sort() });
  }
}

// --- 打包 -------------------------------------------------------------------
//
// 每個五行一條字串（每字 2 bytes），比逐字物件小一個數量級。

const packed = Object.fromEntries(
  ELEMENTS.map((e) => [e, [...byChar].filter(([, v]) => v === e).map(([k]) => k).sort().join('')]),
);

// 五組必須互斥且總數對得起來，否則打包時會有字被無聲覆蓋。
const seen = new Set();
for (const chars of Object.values(packed)) {
  for (const ch of chars) {
    if (seen.has(ch)) throw new Error(`字「${ch}」同時出現在兩個五行群組。`);
    seen.add(ch);
  }
}
if (seen.size !== byChar.size) {
  throw new Error(`打包後 ${seen.size} 字，索引有 ${byChar.size} 字，數量對不起來。`);
}

const covered = common.filter((ch) => byChar.has(ch)).length;

const out = {
  $comment:
    '逐字五行與常用字表。由 tools/gen-char-wuxing.mjs 產生，不要手改。' +
    'chars 每個五行一條字串（字元即索引）；common 是 Big5 Level 1 常用字，供候選字過濾。',
  source: {
    wuxing: {
      dataset: 'ben-hua/general_standard_chinese gsc_pinyin.csv（2013 年《通用規範漢字表》8,105 筆）',
      url: 'https://github.com/ben-hua/general_standard_chinese',
      license: 'Apache-2.0',
      caveat:
        '該資料的五行欄爬自百度漢語，**來源未交代判定依據**，實測不依部首（明＝水、口＝木、手＝金）。' +
        '與另一份獨立資料集（zhenyangze/chinese-wuxing）對帳 6,205 字共同收錄、一致 6,194（99.8%），' +
        '但那只證明它穩定，不證明它正確。本站將其定位為「網路主流通行版」，與 81 數理同級，非權威規則。',
      crossCheck: 'https://github.com/zhenyangze/chinese-wuxing',
      verifiedAt: '2026-08-10',
      selfTest: '五行疊字 5/5 通過：淼＝水、森＝木、焱＝火、垚＝土、鑫＝金。',
    },
    common: {
      dataset: 'Big5 Level 1 常用字區 0xA440–0xC67E，由 Unihan 的 kBigFive 欄位離線導出',
      url: 'https://www.unicode.org/Public/UCD/latest/ucd/Unihan_OtherMappings.txt',
      caveat:
        '**不等同**教育部《常用國字標準字體表》（4,808 字）—— 後者遍尋不著機器可讀版本。' +
        'Big5 為國家標準衍生的編碼分層，出處明確且可完全離線重現，但兩者字集不同。',
    },
  },
  /**
   * 跨來源不一致的 11 個字，記錄自 docs/v2-sources.md 第 7 節（本站採 ben-hua）。
   * 依 v1 慣例：流派／來源衝突不擅自調和，照實列出另一說。
   */
  crossSourceConflicts: [
    { char: '乙', 'ben-hua': '木', zhenyangze: '土' },
    { char: '丑', 'ben-hua': '土', zhenyangze: '火' },
    { char: '陽', 'ben-hua': '土', zhenyangze: '火' },
    { char: '肺', 'ben-hua': '金', zhenyangze: '水' },
    { char: '癸', 'ben-hua': '水', zhenyangze: '木' },
    { char: '峰', 'ben-hua': '土', zhenyangze: '水' },
    { char: '寅', 'ben-hua': '木', zhenyangze: '土' },
    { char: '暑', 'ben-hua': '火', zhenyangze: '金' },
    { char: '撮', 'ben-hua': '金', zhenyangze: '火' },
    { char: '巽', 'ben-hua': '木', zhenyangze: '火' },
    { char: '閆', 'ben-hua': '金', zhenyangze: '土' },
  ],
  $conflictNote:
    '其中乙、丑、癸、寅、巽為干支與卦字。「兩家可能是對『依字本身或依干支屬性』處理不同」' +
    '是本站的推測，兩份上游都沒有說明判定依據——僅供理解，不是查證所得。',
  /**
   * 上游把同一個字指到兩種五行（多為一簡對多繁合併）。這些字**不進索引**，
   * 查詢時回「五行不明」並附兩說——用列順序當裁判就是猜（SPEC-v2 #24）。
   */
  mergeCollisions: collisions,
  /** 繁簡橋接時多個簡體對應指到不同五行者，同樣不進索引。 */
  bridgeConflicts,
  stats: {
    rows: rows.length,
    /** 上游 wuxing 欄為空的列——那是來源本身的缺口，不是解析失敗。 */
    rowsWithoutWuxing: skipped,
    bridgedFromSimplified: bridged,
    mergeConflicts: collisions.length,
    bridgeConflicts: bridgeConflicts.length,
    indexedChars: byChar.size,
    commonChars: common.length,
    commonCovered: covered,
    commonCoverage: `${((covered / common.length) * 100).toFixed(1)}%`,
  },
  chars: packed,
  common: common.join(''),
};

writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
console.log(
  `wrote ${OUT}: ${byChar.size} 字有五行、常用字 ${common.length}（覆蓋 ${out.stats.commonCoverage}）、` +
    `合併衝突 ${collisions.length}`,
);
