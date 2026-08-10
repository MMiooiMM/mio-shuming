import type { Animal, Element, Luck, NumberFate } from '../data/index.ts';

export type { Animal, Element, Luck, NumberFate };

/** What the user supplies. 姓 and 名 are separate so 複姓 needs no guessing. */
export interface NameInput {
  /** 姓：1 字為單姓，2 字為複姓。 */
  surname: string;
  /** 名：1–2 字。 */
  givenName: string;
  /** 西元出生年月日。 */
  birth: { year: number; month: number; day: number };
}

export interface CharStrokes {
  char: string;
  /** `undefined` when the character is not in the 康熙 dictionary. */
  strokes: number | undefined;
}

/** Input the engine refuses to analyse, with a reason the UI can show verbatim. */
export interface InvalidInput {
  ok: false;
  reason: string;
  /** Characters that are not in the 康熙字典, if that is why. */
  unknownChars?: string[];
}

export type GridName = '天格' | '人格' | '地格' | '外格' | '總格';

export interface Grid {
  name: GridName;
  value: number;
  element: Element;
  fate: NumberFate;
  /** How the number was derived, e.g. 「王(4) ＋ 假1」. */
  formula: string;
}

export interface SancaiResult {
  /** 天格、人格、地格 的五行，依序。 */
  elements: [Element, Element, Element];
  luck: Luck;
  /** 天→人 與 人→地 兩段關係的評語。 */
  relations: string[];
  summary: string;
}

export interface CharVerdict {
  char: string;
  verdict: '喜' | '忌' | '喜忌並見' | '中性';
  likeRadicals: string[];
  avoidRadicals: string[];
  explanation: string;
}

export interface ZodiacResult {
  animal: Animal;
  branch: string;
  /** True when the birth date is the 立春 day itself, so the animal is uncertain. */
  boundaryAmbiguous: boolean;
  /** The other possible animal when `boundaryAmbiguous`. */
  alternativeAnimal?: Animal;
  lichun: string;
  chars: CharVerdict[];
  likeReason: string;
  avoidReason: string;
  summary: string;
}

export interface CharElement {
  char: string;
  strokes: number;
  element: Element;
}

export interface WuxingResult {
  /** 各字五行（依筆畫尾數）。 */
  chars: CharElement[];
  /** 五行 -> 出現次數，含 0。 */
  distribution: Record<Element, number>;
  missing: Element[];
  relations: string[];
  summary: string;
}

export interface Analysis {
  ok: true;
  surname: string;
  givenName: string;
  strokes: CharStrokes[];
  grids: Grid[];
  sancai: SancaiResult;
  zodiac: ZodiacResult;
  wuxing: WuxingResult;
}

export type AnalysisResult = Analysis | InvalidInput;
