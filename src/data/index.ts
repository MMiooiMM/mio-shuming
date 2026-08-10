// Typed accessors over the generated JSON data files. Everything here is a
// pure lookup; no analysis logic lives in this module.

import kangxiStrokes from './kangxi-strokes.json';
import lichunTable from './lichun.json';
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

// --- 立春 -------------------------------------------------------------------

const lichunYears = lichunTable.years as Record<string, string>;
export const LICHUN_RANGE = lichunTable.range as [number, number];

export interface Lichun {
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** 立春 instant (UTC+8) for a Gregorian year, or `undefined` outside the table. */
export function lichunOf(year: number): Lichun | undefined {
  const raw = lichunYears[String(year)];
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
export const LICHUN_SOURCE = lichunTable.source;
export const COMPONENT_SOURCE = componentIndex.source;
