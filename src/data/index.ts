// Typed accessors over the generated JSON data files. Everything here is a
// pure lookup; no analysis logic lives in this module.

import kangxiStrokes from './kangxi-strokes.json';
import solarTerms from './solar-terms.json';
import componentIndex from './components.json';
import zodiacTable from './zodiac-radicals.json';
import numerology from './numerology-81.json';
import ganzhi from './ganzhi.json';
import hiddenStems from './hidden-stems.json';
import locations from './locations.json';
import yongshen from './yongshen.json';
import charWuxing from './char-wuxing.json';
import dstTaiwan from './dst-taiwan.json';
import glossary from './glossary.json';

interface StrokeBlock {
  start: number;
  end: number;
  strokes: string;
}

const strokeBlocks = kangxiStrokes.blocks as StrokeBlock[];

/**
 * 姓名學 counts the ten numerals by their value rather than by how many
 * strokes they are written with (四 is written in 5 strokes but counts as 4).
 * 一/二/三 happen to agree; they are listed for completeness.
 *
 * 來源：熊崎氏姓名學通行版「數目字以其數為筆畫數」慣例。
 */
const NUMERAL_STROKES: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

/**
 * 康熙筆畫 of a single character, or `undefined` when the character is not in
 * the dictionary (罕字) — callers must surface that as 查無此字 rather than
 * guessing.
 */
export function kangxiStrokeCount(ch: string): number | undefined {
  const numeral = NUMERAL_STROKES[ch];
  if (numeral !== undefined) return numeral;
  const cp = ch.codePointAt(0);
  if (cp === undefined) return undefined;
  for (const block of strokeBlocks) {
    if (cp < block.start || cp > block.end) continue;
    const at = (cp - block.start) * 2;
    const code = block.strokes.slice(at, at + 2);
    if (code === '00') return undefined;
    return parseInt(code, 36);
  }
  return undefined;
}

// --- 節氣（十二節） ----------------------------------------------------------
//
// 年柱（生肖）與月柱共用這一份資料 —— 立春只是黃經 315° 的那個節，
// 兩者若各自一份表就可能在邊界上互相矛盾（SPEC-v2 #11）。

const jieYears = solarTerms.years as Record<string, string[]>;
export const LICHUN_RANGE = solarTerms.range as [number, number];
/** 節氣資料涵蓋的西元年範圍，與 LICHUN_RANGE 同義（立春屬十二節之一）。 */
export const SOLAR_TERM_RANGE = LICHUN_RANGE;

export interface JieDefinition {
  name: string;
  /** 太陽視黃經度數。 */
  deg: number;
  /** 此節所起始的月支。 */
  branch: string;
}

export const JIE: JieDefinition[] = solarTerms.jie as JieDefinition[];

export interface SolarTermInstant {
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** 別名，保留 v1 的命名。 */
export type Lichun = SolarTermInstant;

function parseInstant(raw: string | undefined): SolarTermInstant | undefined {
  if (!raw) return undefined;
  const m = /^(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(raw);
  if (!m) return undefined;
  return {
    month: Number(m[1]),
    day: Number(m[2]),
    hour: Number(m[3]),
    minute: Number(m[4]),
  };
}

/** 某年第 `index` 個節的時刻（UTC+8）；index 對應 JIE 陣列。 */
export function jieOf(year: number, index: number): SolarTermInstant | undefined {
  return parseInstant(jieYears[String(year)]?.[index]);
}

/** 某年全部十二節的時刻（UTC+8），順序同 JIE。 */
export function jieOfYear(year: number): SolarTermInstant[] | undefined {
  const raw = jieYears[String(year)];
  if (!raw) return undefined;
  const out = raw.map(parseInstant);
  return out.every((t): t is SolarTermInstant => t !== undefined) ? out : undefined;
}

const LICHUN_INDEX = JIE.findIndex((j) => j.name === '立春');

/** 立春 instant (UTC+8) for a Gregorian year, or `undefined` outside the table. */
export function lichunOf(year: number): Lichun | undefined {
  return jieOf(year, LICHUN_INDEX);
}

// --- 均時差 -----------------------------------------------------------------

const eotMinutes = solarTerms.equationOfTime.minutes as number[];

/** 各月 1 日在閏年中的前置天數，用來把（月, 日）換成閏年日序。 */
const CUMULATIVE_DAYS = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
/** 閏年各月天數 —— 2/29 合法，因為對照表以閏年（2000）為基準。 */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * 均時差（真太陽時 − 平太陽時），單位分鐘；日期非法時回傳 `undefined`。
 *
 * 表以 2000 年（閏年）逐日計算，所以查表要用「閏年日序」——平年的 3 月 1 日
 * 一樣取表中的 2000-03-01，而不是平年的第 59 天。
 *
 * 跨 1900–2100 的最大漂移經量測為
 * `solarTerms.equationOfTime.maxDriftSecondsOverRange` 秒，對時辰邊界判定可忽略。
 *
 * 非法輸入不猜（SPEC-v2 #24）：月份越界、當月不存在的日、或非整數，一律回
 * `undefined`，而不是靜默換算成別的日期。
 */
export function equationOfTimeMinutes(month: number, day: number): number | undefined {
  if (!Number.isInteger(month) || month < 1 || month > 12) return undefined;
  if (!Number.isInteger(day) || day < 1 || day > DAYS_IN_MONTH[month - 1]!) return undefined;
  return eotMinutes[CUMULATIVE_DAYS[month - 1]! + day - 1];
}

export const SOLAR_TERM_SOURCE = solarTerms.source;

// --- 出生地經度 / 夏令時間 ----------------------------------------------------

export interface County {
  name: string;
  /** 代表經度（東經為正）——該縣市各行政區中心點經度的中位數。 */
  longitude: number;
  /** 同縣市各行政區中心點的經度範圍，用來呈現「縣市代表點」本身的誤差。 */
  min: number;
  max: number;
  districts: number;
}

export const COUNTIES = locations.counties as County[];
/** 台灣標準時間的中央經線（東經 120°）。 */
export const STANDARD_MERIDIAN = locations.standardMeridian;
export const TAIWAN_OFFSET_MINUTES = locations.timezoneOffsetMinutes;
export const LOCATION_SOURCE = locations.source;

export function countyOf(name: string): County | undefined {
  return COUNTIES.find((c) => c.name === name);
}

export interface DstPeriod {
  year: number;
  /** `MM-DD`。 */
  start: string;
  end: string;
  name: string;
  note?: string;
}

export const DST_PERIODS = dstTaiwan.periods as DstPeriod[];
/** 夏令時間期間時鐘撥快的分鐘數（60）。 */
export const DST_OFFSET_MINUTES = dstTaiwan.offsetMinutes;
export const DST_SOURCE = dstTaiwan.source;
/** 1945 年僅於中國大陸實施，未在台灣實施——刻意不列入 `DST_PERIODS`。 */
export const DST_EXCLUDED = dstTaiwan.excluded;
export const DST_CAVEAT = dstTaiwan.caveat;

// --- 天干地支 ---------------------------------------------------------------

export interface Stem {
  name: string;
  element: Element;
  /** true 為陰干，false 為陽干。 */
  yin: boolean;
}

export interface Branch {
  name: string;
  element: Element;
  yin: boolean;
}

export const STEMS = ganzhi.stems as Stem[];
export const BRANCHES = ganzhi.branches as Branch[];

/** 五虎遁：年干 → 寅月天干。《神峰通考·起八字訣》。 */
export const WU_HU_DUN = ganzhi.dunRules['五虎遁'] as Record<string, string | undefined>;
/** 五鼠遁：日干 → 子時天干。《神峰通考·起八字訣》。 */
export const WU_SHU_DUN = ganzhi.dunRules['五鼠遁'] as Record<string, string | undefined>;

export const GANZHI_SOURCE = ganzhi.source;

// --- 地支藏干 / 十神 ---------------------------------------------------------

export type HiddenStemRole = '本氣' | '中氣' | '餘氣';

export interface HiddenStem {
  stem: string;
  role: HiddenStemRole;
}

const hiddenTable = hiddenStems.hiddenStems as Record<
  string,
  Partial<Record<HiddenStemRole, string>>
>;

const HIDDEN_ORDER: HiddenStemRole[] = ['本氣', '中氣', '餘氣'];

/** 某地支所藏天干，依本氣 → 中氣 → 餘氣排序（無者略）。 */
export function hiddenStemsOf(branch: string): HiddenStem[] {
  const entry = hiddenTable[branch];
  if (!entry) return [];
  return HIDDEN_ORDER.flatMap((role) => {
    const stem = entry[role];
    return stem ? [{ stem, role }] : [];
  });
}

export type ShiShen =
  | '比肩' | '劫財' | '食神' | '傷官' | '偏財'
  | '正財' | '七殺' | '正官' | '偏印' | '正印';

export type ElementRelation = '同我' | '我生' | '我剋' | '剋我' | '生我';

export const SHISHEN_TABLE = hiddenStems.shishen as Record<
  ElementRelation,
  { same: ShiShen; different: ShiShen }
>;

/**
 * 《淵海子平》原文逐支列出的藏干，供測試比對。
 *
 * 資料檔用 `$` 前綴的鍵放註解（全專案慣例），這裡濾掉——否則
 * `Object.keys()` 會把 `$comment` 當成一個地支。
 */
export const CLASSICAL_HIDDEN_STEMS: Record<string, string[]> = Object.fromEntries(
  Object.entries(hiddenStems.classicalStemSets).filter(
    (entry): entry is [string, string[]] => !entry[0].startsWith('$'),
  ),
);
export const HIDDEN_STEMS_SOURCE = hiddenStems.source;
export const HIDDEN_STEMS_CONFLICTS = hiddenStems.conflicts as string[];

// --- 用神 -------------------------------------------------------------------

/** 月令五行狀態。`旺`／`相` 視為得令。 */
export type WangXiangState = '旺' | '相' | '休' | '囚' | '死';
export type WangXiangSeason = '春' | '夏' | '六月' | '秋' | '冬';
/** 調候用的四季，與 `WangXiangSeason` 的五季制刻意不同——各自忠於各自的原文。 */
export type TiaohouSeason = '春' | '夏' | '秋' | '冬';

const wangXiang = yongshen.wangXiang;

export const WANGXIANG_SEASON_OF_BRANCH = wangXiang.seasonOfBranch as Record<
  string,
  WangXiangSeason | undefined
>;
export const WANGXIANG_STATES = wangXiang.states as Record<
  WangXiangSeason,
  Record<WangXiangState, Element>
>;
export const WANGXIANG_SOURCE = wangXiang.source;

/** 某月支下、某五行的旺相休囚死；月支不在表中回 undefined（不猜）。 */
export function wangXiangOf(monthBranch: string, element: Element): WangXiangState | undefined {
  const season = WANGXIANG_SEASON_OF_BRANCH[monthBranch];
  if (!season) return undefined;
  const states = WANGXIANG_STATES[season];
  return (Object.keys(states) as WangXiangState[]).find((state) => states[state] === element);
}

export interface TiaohouEntry {
  /** 該季所缺、調候要補的五行；春秋兩季原文為條件式敘述，故無此欄。 */
  need?: Element;
  /** 依據的原文（簡體，照抄自維基文庫本）。 */
  text: string;
  note?: string;
}

const tiaohou = yongshen.tiaohou;

export const TIAOHOU_SEASON_OF_BRANCH = tiaohou.seasonOfBranch as Record<
  string,
  TiaohouSeason | undefined
>;
export const TIAOHOU_ENTRIES = tiaohou.entries as Record<
  Element,
  Record<TiaohouSeason, TiaohouEntry>
>;
export const TIAOHOU_SOURCE = tiaohou.source;

/** 日主五行 × 出生月支 → 調候條目；月支不在表中回 undefined。 */
export function tiaohouOf(dayMasterElement: Element, monthBranch: string): TiaohouEntry | undefined {
  const season = TIAOHOU_SEASON_OF_BRANCH[monthBranch];
  if (!season) return undefined;
  return TIAOHOU_ENTRIES[dayMasterElement][season];
}

export const STRENGTH_RULE = yongshen.strength;
export const YONGSHEN_CONFLICTS = yongshen.conflicts as string[];

// --- 逐字五行 / 常用字 -------------------------------------------------------
//
// 這把尺與 v1 的「數理五行」（筆畫尾數）是**兩把不同的尺**，不混用：
// 數理五行量的是筆畫數，逐字五行量的是字本身。SPEC-v2 #17。

const packedWuxing = charWuxing.chars as Record<Element, string>;

/** 字 → 五行的索引。資料檔為了體積把每個五行打包成一條字串，這裡展開成 Map。 */
const charElementIndex = new Map<string, Element>();
for (const [element, chars] of Object.entries(packedWuxing) as [Element, string][]) {
  for (const ch of chars) charElementIndex.set(ch, element);
}

/**
 * 單字的逐字五行；資料未收錄時回 `undefined`——呼叫端必須照實回報「五行不明」，
 * 不猜（SPEC-v2 #24）。
 */
export function charElementOf(ch: string): Element | undefined {
  return charElementIndex.get(ch);
}

/** Big5 Level 1 常用字，候選字推薦只從這裡挑，避免列出冷僻字（SPEC-v2 #19）。 */
export const COMMON_CHARS: string[] = [...(charWuxing.common as string)];
const commonSet = new Set(COMMON_CHARS);
export const isCommonChar = (ch: string): boolean => commonSet.has(ch);

export const CHAR_WUXING_SOURCE = charWuxing.source;
export const CHAR_WUXING_CONFLICTS = charWuxing.crossSourceConflicts as {
  char: string;
  'ben-hua': string;
  zhenyangze: string;
}[];

/**
 * 上游把同一個字指到兩種五行的字。這些字**不在索引裡**（`charElementOf` 回
 * undefined），查詢端要照實說「來源有兩說」，不能挑一個當答案。
 */
export const CHAR_WUXING_UNDECIDED = new Map<string, string[]>([
  ...(charWuxing.mergeCollisions as { char: string; readings: string[] }[]).map(
    (c) => [c.char, c.readings] as [string, string[]],
  ),
  ...(charWuxing.bridgeConflicts as { char: string; readings: string[] }[]).map(
    (c) => [c.char, c.readings] as [string, string[]],
  ),
]);
export const CHAR_WUXING_STATS = charWuxing.stats;

// --- 字根 -------------------------------------------------------------------

interface ComponentBlock {
  start: number;
  end: number;
  entries: string;
}

const componentRadicals = componentIndex.radicals as string[];
const componentBlocks = (componentIndex.blocks as ComponentBlock[]).map((b) => ({
  start: b.start,
  end: b.end,
  entries: b.entries.split(','),
}));

/** The 生肖 字根 contained in a character (empty when none / unknown character). */
export function radicalsOf(ch: string): string[] {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return [];
  for (const block of componentBlocks) {
    if (cp < block.start || cp > block.end) continue;
    const entry = block.entries[cp - block.start] ?? '';
    const out: string[] = [];
    for (let i = 0; i < entry.length; i += 2) {
      const radical = componentRadicals[parseInt(entry.slice(i, i + 2), 36)];
      if (radical !== undefined) out.push(radical);
    }
    return out;
  }
  return [];
}

// --- 生肖 -------------------------------------------------------------------

export type Animal = '鼠' | '牛' | '虎' | '兔' | '龍' | '蛇' | '馬' | '羊' | '猴' | '雞' | '狗' | '豬';

export interface ZodiacRule {
  like: string[];
  avoid: string[];
  likeReason: string;
  avoidReason: string;
}

export const ZODIAC_RULES = zodiacTable.zodiac as Record<Animal, ZodiacRule>;
/** 地支 → 生肖 對照。與 v2 的 `BRANCHES`（干支的五行陰陽）是不同的東西。 */
export const ZODIAC_BRANCHES = zodiacTable.branches as { branch: string; animal: Animal }[];
// --- 81 數理 / 五行 ----------------------------------------------------------

export type Element = '木' | '火' | '土' | '金' | '水';
export type Luck = '吉' | '半吉' | '凶';

export interface NumberFate {
  luck: Luck;
  title: string;
  text: string;
}

const numbers = numerology.numbers as Record<string, NumberFate>;

/**
 * 81 數理 entry for a 五格 number.
 *
 * 總格超過 81 是可能的（複姓＋雙名，四個筆畫多的字即可，例如 32+30+30 = 92），
 * 但引用的來源只列到 81。姓名學通行的處理是「超過 81 者減 80，以其餘數論之」
 * （82 → 2、100 → 20）。**權威來源未定義此規則**，此處採該通行做法；若要改
 * 採別種處理，改這裡即可。
 */
export function fateOf(n: number): NumberFate | undefined {
  let reduced = n;
  while (reduced > 81) reduced -= 80;
  return numbers[String(reduced)];
}

const byLastDigit = numerology.wuxingByLastDigit as Record<string, Element>;

/** 五行 of a 五格 number, taken from its last digit (1、2 木；3、4 火 …). */
export function elementOfNumber(n: number): Element {
  return byLastDigit[String(n % 10)]!;
}

export const SHENG = numerology.sheng as Record<Element, Element>;
export const KE = numerology.ke as Record<Element, Element>;

// --- 名詞解釋（SPEC-v4 #9、#10）----------------------------------------------
//
// 解釋文字只存在 glossary.json；UI 只負責把它就地展開，不寫死任何說明。

export interface GlossarySource {
  /** 原文摘錄與本站取捨說明。 */
  note: string;
  url: string;
}

export interface GlossaryEntry {
  term: string;
  /** 1–2 句白話解釋。 */
  text: string;
  source: GlossarySource;
}

export const GLOSSARY = glossary.terms as GlossaryEntry[];

/** 名詞 → 解釋；未收錄回 undefined（呼叫端不應臆造說明）。 */
export function glossaryOf(term: string): GlossaryEntry | undefined {
  return GLOSSARY.find((g) => g.term === term);
}

export const ZODIAC_SOURCE = zodiacTable.source;
export const NUMEROLOGY_SOURCE = numerology.source;
export const WUGE_RULES = numerology.wugeRules;
export const KANGXI_SOURCE = kangxiStrokes.source;
export const LICHUN_SOURCE = solarTerms.source;
export const COMPONENT_SOURCE = componentIndex.source;
