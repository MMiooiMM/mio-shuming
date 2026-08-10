// Typed accessors over the generated JSON data files. Everything here is a
// pure lookup; no analysis logic lives in this module.

import kangxiStrokes from './kangxi-strokes.json';
import solarTerms from './solar-terms.json';
import componentIndex from './components.json';
import zodiacTable from './zodiac-radicals.json';
import numerology from './numerology-81.json';

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
export const BRANCHES = zodiacTable.branches as { branch: string; animal: Animal }[];
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

export const ZODIAC_SOURCE = zodiacTable.source;
export const NUMEROLOGY_SOURCE = numerology.source;
export const WUGE_RULES = numerology.wugeRules;
export const KANGXI_SOURCE = kangxiStrokes.source;
export const LICHUN_SOURCE = solarTerms.source;
export const COMPONENT_SOURCE = componentIndex.source;
