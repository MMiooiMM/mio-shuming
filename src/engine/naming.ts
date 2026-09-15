// 取名 — 依姓氏枚舉三才五格全吉的筆畫組合，並列出各筆畫的候選字（SPEC-v3）。
//
// 判準（SPEC-v3 #3、#5）：
//   全吉＝三才吉 ＋ 計分格數理皆吉。
//   「計分格」＝取名可以改變的格。天格由姓氏先天決定，不計吉凶、只參與三才
//   （出處見 src/data/numerology-81.json 的 source.tianGrid）；單名時外格亦
//   不含任何名字筆畫（單姓單名恆為 2＝凶數），同一原則不計
//   （source.waiGridSingleGiven）。故雙名計人、地、外、總，單名計人、地、總。
//   無全吉解時退列次佳：三才吉 ＋ 計分格無凶且至多一格半吉。
//
// 組合依（名一、名二）筆畫升冪列出——那是枚舉順序，不是優劣排序；
// 本站不合成單一總分（SPEC-v3 #3）。

import {
  COMMON_CHARS,
  ZODIAC_RULES,
  charElementOf,
  kangxiStrokeCount,
  lichunOf,
} from '../data/index.ts';
import { computeGrids } from './wuge.ts';
import { computeSancai } from './wuxing.ts';
import { judgeChars, zodiacOf } from './zodiac.ts';
import type { Animal, CharVerdict, Element, Grid, InvalidInput, SancaiResult } from './types.ts';

/** 候選字池：常用字表中查得到康熙筆畫的字，依筆畫分組。惰性建立一次。 */
let pool: Map<number, string[]> | undefined;

function poolInternal(): Map<number, string[]> {
  if (!pool) {
    pool = new Map();
    for (const ch of COMMON_CHARS) {
      const n = kangxiStrokeCount(ch);
      if (n === undefined) continue;
      const bucket = pool.get(n);
      if (bucket) bucket.push(ch);
      else pool.set(n, [ch]);
    }
  }
  return pool;
}

/** 候選字池的快照。每次回傳新拷貝——呼叫端改動不會影響引擎內部狀態。 */
export function strokePool(): Map<number, string[]> {
  return new Map([...poolInternal()].map(([n, chars]) => [n, [...chars]]));
}

export type ComboTier = '全吉' | '次佳';

export interface StrokeCombo {
  /** 名各字筆畫，單名長度 1、雙名長度 2。 */
  given: number[];
  grids: Grid[];
  sancai: SancaiResult;
  /** 各位置在候選字池中的可用字數（保證 > 0，見 SPEC-v3 #5）。 */
  available: number[];
}

export interface NamingCombos {
  ok: true;
  surname: string;
  surnameStrokes: number[];
  doubleGiven: boolean;
  /** 全吉；或全吉無解時退列的次佳（SPEC-v3 #5）。 */
  tier: ComboTier;
  /** tier 為次佳時的放寬說明，照 SPEC 措辭，畫面原樣呈現。 */
  relaxedNote?: string;
  combos: StrokeCombo[];
}

export type NamingResult = NamingCombos | InvalidInput;

/** 取名改變得了、因此計入吉凶的格（見檔頭判準說明）。 */
export function judgedGrids(grids: Grid[], doubleGiven: boolean): Grid[] {
  return grids.filter((g) => g.name !== '天格' && (doubleGiven || g.name !== '外格'));
}

/** 全吉：三才吉＋計分格皆吉。 */
function isPerfect(grids: Grid[], sancai: SancaiResult, doubleGiven: boolean): boolean {
  return sancai.luck === '吉' && judgedGrids(grids, doubleGiven).every((g) => g.fate.luck === '吉');
}

/** 次佳：三才吉＋計分格無凶且至多一格半吉。 */
function isNextBest(grids: Grid[], sancai: SancaiResult, doubleGiven: boolean): boolean {
  if (sancai.luck !== '吉') return false;
  const judged = judgedGrids(grids, doubleGiven);
  if (judged.some((g) => g.fate.luck === '凶')) return false;
  return judged.filter((g) => g.fate.luck === '半吉').length <= 1;
}

export function enumerateCombos(surname: string, doubleGiven: boolean): NamingResult {
  const chars = [...surname.trim()];
  if (chars.length < 1 || chars.length > 2) {
    return { ok: false, reason: '姓氏需為 1 字（單姓）或 2 字（複姓）。' };
  }
  const strokes = chars.map((ch) => kangxiStrokeCount(ch));
  const unknown = chars.filter((_, i) => strokes[i] === undefined);
  if (unknown.length) {
    return {
      ok: false,
      reason: `查無此字：${unknown.join('、')}。字典僅涵蓋 BMP，範圍外不猜測。`,
      unknownChars: unknown,
    };
  }
  const surnameStrokes = strokes as number[];

  // 只枚舉候選字池裡真的有字的筆畫數（SPEC-v3 #5）。
  const keys = [...poolInternal().keys()].sort((a, b) => a - b);
  const tuples: number[][] = doubleGiven
    ? keys.flatMap((a) => keys.map((b) => [a, b]))
    : keys.map((a) => [a]);

  const evaluate = (given: number[]): StrokeCombo => {
    const grids = computeGrids(
      { surname: surnameStrokes, givenName: given },
      { surname: chars, givenName: [] },
    );
    return {
      given,
      grids,
      sancai: computeSancai(grids),
      available: given.map((n) => poolInternal().get(n)!.length),
    };
  };

  const all = tuples.map(evaluate);
  const perfect = all.filter((c) => isPerfect(c.grids, c.sancai, doubleGiven));
  if (perfect.length) {
    return { ok: true, surname: chars.join(''), surnameStrokes, doubleGiven, tier: '全吉', combos: perfect };
  }
  const nextBest = all.filter((c) => isNextBest(c.grids, c.sancai, doubleGiven));
  return {
    ok: true,
    surname: chars.join(''),
    surnameStrokes,
    doubleGiven,
    tier: '次佳',
    relaxedNote:
      '此姓氏在此字數下沒有「三才吉＋計分格皆吉」的組合，' +
      '以下退而列出「三才吉＋計分格無凶且至多一格半吉」的次佳組合。' +
      (doubleGiven ? '' : '單名的計分格為人格、地格、總格三格。'),
    combos: nextBest,
  };
}

// --- 預產期生肖 ---------------------------------------------------------------

/** 預產期與立春的臨界窗（SPEC-v3 #9）：實際生產常提前或延後，±3 週內不擅自選邊。 */
export const LICHUN_WINDOW_DAYS = 21;

export interface DueZodiac {
  /** 依預產期換算的生肖（立春分界，沿用 v1 引擎）。 */
  animal: Animal;
  branch: string;
  lichun: string;
  /** 預產期距立春 ≤ ±3 週：並列兩生肖，不選邊。 */
  nearBoundary: boolean;
  /** nearBoundary 時依序為〔立春前的生肖, 立春後的生肖〕；否則只有 animal。 */
  animals: Animal[];
  /** 預產期與立春的日數差（預產期 − 立春，可為負）。 */
  daysFromLichun: number;
}

export function dueZodiac(year: number, month: number, day: number): DueZodiac | undefined {
  // 非整數或曆上不存在的日期（2027-02-30、13 月）一律不猜（SPEC-v3 #11）——
  // Date.UTC 會靜默進位到下個月，必須先擋掉。
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return undefined;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return undefined;
  }
  const base = zodiacOf(year, month, day);
  const lichun = lichunOf(year);
  if (!base || !lichun) return undefined;

  const days =
    (Date.UTC(year, month - 1, day) - Date.UTC(year, lichun.month - 1, lichun.day)) / 86_400_000;
  const nearBoundary = Math.abs(days) <= LICHUN_WINDOW_DAYS;

  // 1 月 1 日必在立春前、6 月 1 日必在立春後——用同一個引擎取兩側生肖，不重製規則。
  const before = zodiacOf(year, 1, 1)!;
  const after = zodiacOf(year, 6, 1)!;

  return {
    animal: base.animal,
    branch: base.branch,
    lichun: base.lichun,
    nearBoundary,
    animals: nearBoundary ? [before.animal, after.animal] : [base.animal],
    daysFromLichun: days,
  };
}

// --- 候選字 -------------------------------------------------------------------

export interface NamingCandidate {
  char: string;
  strokes: number;
  /** 逐字五行；不在字典中為 undefined（畫面顯示「五行不明」，不猜）。 */
  element: Element | undefined;
  /** 臨界期為兩生肖判定的合併：忌取聯集（SPEC-v3 #9）。 */
  verdict: CharVerdict['verdict'];
  /** 各生肖的判定原文，依 animals 順序。 */
  explanations: string[];
  /**
   * 各生肖命中的忌用字根，依 animals 順序（SPEC-v4 #57）。畫面據此把原因只列一次、
   * 逐字只列字根；原文仍在 explanations。
   */
  avoidRadicals: { animal: Animal; radicals: string[] }[];
}

/**
 * 某筆畫數的候選字，逐字附生肖喜忌與五行。
 *
 * 多生肖（臨界期）時逐肖判定後合併：喜、忌字根各取聯集，
 * 一肖喜一肖忌即為「喜忌並見」——忌不會被另一肖的喜蓋掉。
 */
export function candidatesFor(strokes: number, animals: Animal[]): NamingCandidate[] {
  const chars = poolInternal().get(strokes) ?? [];
  return chars.map((char) => {
    const perAnimal = animals.map((a) => judgeChars(a, [char])[0]!);
    const like = perAnimal.some((v) => v.likeRadicals.length);
    const avoid = perAnimal.some((v) => v.avoidRadicals.length);
    const verdict: CharVerdict['verdict'] =
      like && avoid ? '喜忌並見' : like ? '喜' : avoid ? '忌' : '中性';
    return {
      char,
      strokes,
      element: charElementOf(char),
      verdict,
      explanations: perAnimal.map((v) => v.explanation),
      avoidRadicals: perAnimal.map((v, i) => ({ animal: animals[i]!, radicals: v.avoidRadicals })),
    };
  });
}

/** 生肖喜忌的說理（畫面「兩生肖對照」用），照資料檔原文。 */
export function zodiacReasons(animal: Animal): { likeReason: string; avoidReason: string } {
  const rule = ZODIAC_RULES[animal];
  return { likeReason: rule.likeReason, avoidReason: rule.avoidReason };
}
