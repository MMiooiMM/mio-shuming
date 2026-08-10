// 三才五格 — 五格計算。
//
// 規則來源（src/data/numerology-81.json 的 wugeRules，原文已 curl 比對）：
//   https://www.sanmin.com.tw/product/index/002790721
//   「姓名學五格乃是在姓氏上面加一個數字『1』的筆劃數（又稱為假1），
//     若為單名的話，則又在名字下面增加一個『1』的筆劃數。」
//
// 假1 只進天格／地格／外格，不進總格：
//   「唯總格之數則是不包括『假1』之數在內。」

import { elementOfNumber, fateOf } from '../data/index.ts';
import type { Grid } from './types.ts';

/** 假1（假成數）。 */
const FAKE_ONE = 1;

export interface StrokeParts {
  /** 姓各字筆畫，長度 1（單姓）或 2（複姓）。 */
  surname: number[];
  /** 名各字筆畫，長度 1（單名）或 2（雙名）。 */
  givenName: number[];
}

/** Renders `王(4)` style terms so the UI can show how each grid was derived. */
function term(chars: string[], strokes: number[], i: number): string {
  return `${chars[i] ?? ''}(${strokes[i]})`;
}

export function computeGrids(
  parts: StrokeParts,
  chars: { surname: string[]; givenName: string[] },
): Grid[] {
  const s = parts.surname;
  const g = parts.givenName;
  const compoundSurname = s.length === 2;
  const doubleGiven = g.length === 2;

  const sTerm = (i: number) => term(chars.surname, s, i);
  const gTerm = (i: number) => term(chars.givenName, g, i);

  // 天格：單姓＝姓＋假1；複姓＝姓兩字相加。
  const tian = compoundSurname ? s[0]! + s[1]! : s[0]! + FAKE_ONE;
  const tianFormula = compoundSurname ? `${sTerm(0)} ＋ ${sTerm(1)}` : `${sTerm(0)} ＋ 假1`;

  // 人格：姓的最後一字＋名的第一字。
  const lastSurname = s[s.length - 1]!;
  const ren = lastSurname + g[0]!;
  const renFormula = `${sTerm(s.length - 1)} ＋ ${gTerm(0)}`;

  // 地格：雙名＝名兩字相加；單名＝名＋假1。
  const di = doubleGiven ? g[0]! + g[1]! : g[0]! + FAKE_ONE;
  const diFormula = doubleGiven ? `${gTerm(0)} ＋ ${gTerm(1)}` : `${gTerm(0)} ＋ 假1`;

  // 外格 ＝ (複姓 ? 姓首字 : 假1) ＋ (雙名 ? 名末字 : 假1)。
  const waiHead = compoundSurname ? s[0]! : FAKE_ONE;
  const waiTail = doubleGiven ? g[1]! : FAKE_ONE;
  const wai = waiHead + waiTail;
  const waiFormula = `${compoundSurname ? sTerm(0) : '假1'} ＋ ${doubleGiven ? gTerm(1) : '假1'}`;

  // 總格：全部姓名筆畫相加，不含假1。
  const all = [...s, ...g];
  const zong = all.reduce((a, b) => a + b, 0);
  const zongFormula = [
    ...chars.surname.map((_, i) => sTerm(i)),
    ...chars.givenName.map((_, i) => gTerm(i)),
  ].join(' ＋ ');

  return (
    [
      ['天格', tian, tianFormula],
      ['人格', ren, renFormula],
      ['地格', di, diFormula],
      ['外格', wai, waiFormula],
      ['總格', zong, zongFormula],
    ] as const
  ).map(([name, value, formula]) => ({
    name,
    value,
    element: elementOfNumber(value),
    // 五格數在合理姓名下不會超過 81；fateOf 會對超出者取模，故必有值。
    fate: fateOf(value)!,
    formula,
  }));
}
