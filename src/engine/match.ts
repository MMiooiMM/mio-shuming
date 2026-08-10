// 姓名匹配 —— 把用神接到名字上（SPEC-v2 #17–#19）。
//
// 用的是**逐字五行**（字本身的五行），與 v1 五格區的**數理五行**（筆畫尾數）
// 是兩把不同的尺，刻意不混用，畫面也要說明各自量什麼（SPEC-v2 #17）。
//
// ⚠️ 這把尺的判定依據，來源沒有交代
//   逐字五行資料爬自百度漢語，實測不依部首（明＝水、口＝木、手＝金）。
//   跨兩份獨立資料集 99.8% 一致只證明它穩定、不證明它正確。本模組的結論
//   因此只能是「依這份通行版資料看起來如何」，不是命理事實。
//
// 純函式：不讀當下時間、不讀隨機數（SPEC-v2 #23）。

import {
  CHAR_WUXING_UNDECIDED,
  COMMON_CHARS,
  charElementOf,
  kangxiStrokeCount,
} from '../data/index.ts';
import type { Element } from '../data/index.ts';

export type MatchVerdict = '補用神' | '傷用神' | '中性' | '五行不明';

export interface CharMatch {
  char: string;
  /** 逐字五行；資料未收錄時 undefined（verdict 為「五行不明」）。 */
  element?: Element;
  verdict: MatchVerdict;
  explanation: string;
}

export interface Candidate {
  char: string;
  /** 康熙筆畫；查不到時 undefined。 */
  strokes?: number;
}

export interface CandidateGroup {
  element: Element;
  chars: Candidate[];
  /**
   * 套用筆畫範圍並排除名字已用字之後，該五行還有幾個候選字。
   * **不是**常用字表中該五行的總字數 —— `chars` 只是其中前 `limit` 個。
   */
  total: number;
}

export interface MatchResult {
  favor: Element[];
  avoid: Element[];
  chars: CharMatch[];
  /** 五行查無資料的字，照實列出（SPEC-v2 #24）。 */
  unknown: string[];
  candidates: CandidateGroup[];
  /** 候選字無法產生時的原因（例如筆畫範圍無效）；正常時 undefined。 */
  candidateError?: string;
  summary: string;
}

export interface MatchOptions {
  /** 每個五行最多列幾個候選字，預設 24。 */
  limit?: number;
  /** 候選字的康熙筆畫範圍（含），例如取名想控制筆畫時用。 */
  strokes?: { min?: number; max?: number };
}

const DEFAULT_LIMIT = 24;

function judgeChar(char: string, favor: Element[], avoid: Element[]): CharMatch {
  const element = charElementOf(char);
  if (!element) {
    const undecided = CHAR_WUXING_UNDECIDED.get(char);
    return {
      char,
      verdict: '五行不明',
      explanation: undecided
        ? `${char}：來源同時把它指到${undecided.join('與')}兩種五行，本站不替它選邊，故不評述。`
        : `${char}：逐字五行資料未收錄此字，不臆測（本站約 6% 的常用字屬此類）。`,
    };
  }
  if (favor.includes(element)) {
    return {
      char,
      element,
      verdict: '補用神',
      explanation: `${char}屬${element}，正是喜用的五行，補到用神。`,
    };
  }
  if (avoid.includes(element)) {
    return {
      char,
      element,
      verdict: '傷用神',
      explanation: `${char}屬${element}，落在忌神，於用神有損。`,
    };
  }
  return {
    char,
    element,
    verdict: '中性',
    explanation: `${char}屬${element}，既不在喜用也不在忌神，於用神中性。`,
  };
}

/**
 * 依用神挑候選字。
 *
 * 只從查證過的常用字表（Big5 Level 1）挑，避免推薦冷僻字（SPEC-v2 #19）；
 * 已用在名字裡的字會排除。排序以筆畫、其次字碼，確保同輸入同輸出。
 */
export type RecommendResult =
  | { ok: true; groups: CandidateGroup[] }
  | { ok: false; reason: string };

export function recommendChars(
  favor: Element[],
  used: string[] = [],
  options: MatchOptions = {},
): RecommendResult {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const { min, max } = options.strokes ?? {};

  // 無效範圍要明講，不能靜默回空陣列 —— 空結果會被讀成「沒有符合的常用字」。
  for (const [name, value] of [['最少', min], ['最多', max]] as [string, number | undefined][]) {
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 1) {
      return { ok: false, reason: `筆畫${name}需為 1 以上的整數，收到 ${String(value)}。` };
    }
  }
  if (min !== undefined && max !== undefined && min > max) {
    return { ok: false, reason: `筆畫範圍無效：最少 ${min} 畫大於最多 ${max} 畫。` };
  }
  if (!Number.isInteger(limit) || limit < 1) {
    return { ok: false, reason: `候選字上限需為 1 以上的整數，收到 ${String(limit)}。` };
  }
  const usedSet = new Set(used);

  const groups = favor.map((element) => {
    const all: Candidate[] = [];
    for (const char of COMMON_CHARS) {
      if (usedSet.has(char)) continue;
      if (charElementOf(char) !== element) continue;
      const strokes = kangxiStrokeCount(char);
      if (strokes === undefined) continue; // 筆畫不明的字不推薦
      if (min !== undefined && strokes < min) continue;
      if (max !== undefined && strokes > max) continue;
      all.push({ char, strokes });
    }
    // 次序用碼點比較而非 localeCompare —— 後者的結果隨環境的 ICU 定序資料而異，
    // 同一份資料在建置環境與瀏覽器可能排出不同順序。
    all.sort(
      (a, b) =>
        (a.strokes ?? 0) - (b.strokes ?? 0) ||
        (a.char.codePointAt(0) ?? 0) - (b.char.codePointAt(0) ?? 0),
    );
    return { element, chars: all.slice(0, limit), total: all.length };
  });
  return { ok: true, groups };
}

/**
 * 逐字評述 ＋ 依用神推薦候選字。
 *
 * `favor`／`avoid` 直接吃 `yongShen()` 的結果（或使用者覆寫後的值），
 * 所以覆寫用神會讓這裡跟著重算（SPEC-v2 #15）。
 */
export function matchName(
  chars: string[],
  favor: Element[],
  avoid: Element[],
  options: MatchOptions = {},
): MatchResult {
  const verdicts = chars.map((ch) => judgeChar(ch, favor, avoid));
  const good = verdicts.filter((v) => v.verdict === '補用神');
  const bad = verdicts.filter((v) => v.verdict === '傷用神');
  const unknown = verdicts.filter((v) => v.verdict === '五行不明').map((v) => v.char);

  const neutral = verdicts.filter((v) => v.verdict === '中性');
  const list = (items: CharMatch[]) => items.map((v) => v.char).join('、');

  // 只陳述數得出來的事實：有幾個字補到、有幾個字傷到。**不說「全名如何」**——
  // 有中性字或五行不明的字時，「全名皆喜用」這種話就是錯的。
  let summary: string;
  if (favor.length === 0) {
    summary = '喜用為空（你把五行全部取消了），無從評述哪個字補到用神。';
  } else if (!good.length && !bad.length) {
    summary = '沒有字落在喜用或忌神，就用神而言無明顯助力或阻力。';
  } else {
    const parts: string[] = [];
    if (good.length) parts.push(`${list(good)} 補到用神`);
    if (bad.length) parts.push(`${list(bad)} 落在忌神`);
    if (neutral.length) parts.push(`${list(neutral)} 為中性`);
    summary = `${parts.join('，')}。`;
  }
  if (unknown.length) {
    summary += `（${unknown.join('、')} 的五行未列入評述。）`;
  }

  const recommended = recommendChars(favor, chars, options);

  return {
    favor,
    avoid,
    chars: verdicts,
    unknown,
    candidates: recommended.ok ? recommended.groups : [],
    candidateError: recommended.ok ? undefined : recommended.reason,
    summary,
  };
}
