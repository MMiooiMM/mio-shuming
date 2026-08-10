// 五行 — 三才配置與姓名各字的五行分佈。
//
// 規則來源（src/data/numerology-81.json 的 source.wuxing / source.shengke）：
//   https://tianjige.club/tw/naming/wuge
//     「五格數除了吉凶，還按尾數對應五行：1、2 屬木，3、4 屬火，5、6 屬土，
//       7、8 屬金，9、0 屬水。」
//     「天格、人格、地格三者之間形成『三才配置』：天人地三才相生為吉；相克為凶。」
//   https://www.sanmin.com.tw/product/index/002790721
//     「五行的相生： 木生火、火生土、土生金、金生水、水生木。」
//     「五行的相剋：木剋土、土剋水、水剋火、火剋金、金剋木。」

import { KE, SHENG, elementOfNumber } from '../data/index.ts';
import type { CharElement, Element, Grid, Luck, SancaiResult, WuxingResult } from './types.ts';

const ELEMENTS: Element[] = ['木', '火', '土', '金', '水'];

type Relation = '生' | '剋' | '被剋' | '比和';

function relate(from: Element, to: Element): Relation {
  if (from === to) return '比和';
  if (SHENG[from] === to) return '生';
  if (KE[from] === to) return '剋';
  if (KE[to] === from) return '被剋';
  // 剩下的情形是「被生」（to 生 from），對三才而言仍屬相生氣脈。
  return '生';
}

function describe(fromLabel: string, from: Element, toLabel: string, to: Element): string {
  switch (relate(from, to)) {
    case '生':
      return SHENG[from] === to
        ? `${fromLabel}${from} 生 ${toLabel}${to}，氣脈順暢。`
        : `${toLabel}${to} 生 ${fromLabel}${from}，得下位滋養。`;
    case '剋':
      return `${fromLabel}${from} 剋 ${toLabel}${to}，上壓下，易生阻力。`;
    case '被剋':
      return `${toLabel}${to} 剋 ${fromLabel}${from}，下犯上，主不安。`;
    case '比和':
      return `${fromLabel}${from} 與 ${toLabel}${to} 比和，同氣相求，平穩。`;
  }
}

/** 三才配置：天格、人格、地格的五行相生相剋。 */
export function computeSancai(grids: Grid[]): SancaiResult {
  const byName = new Map(grids.map((g) => [g.name, g]));
  const tian = byName.get('天格')!.element;
  const ren = byName.get('人格')!.element;
  const di = byName.get('地格')!.element;

  const upper = relate(tian, ren);
  const lower = relate(ren, di);
  const relations = [describe('天格', tian, '人格', ren), describe('人格', ren, '地格', di)];

  const bad = (r: Relation) => r === '剋' || r === '被剋';
  let luck: Luck;
  if (!bad(upper) && !bad(lower)) luck = '吉';
  else if (bad(upper) && bad(lower)) luck = '凶';
  else luck = '半吉';

  const summary =
    luck === '吉'
      ? `三才 ${tian}${ren}${di} 上下相生，配置和順。`
      : luck === '凶'
        ? `三才 ${tian}${ren}${di} 上下俱剋，配置相沖。`
        : `三才 ${tian}${ren}${di} 一生一剋，配置參半。`;

  return { elements: [tian, ren, di], luck, relations, summary };
}

/** 姓名各字的五行（依該字筆畫尾數）與整體分佈。 */
export function computeWuxing(chars: { char: string; strokes: number }[]): WuxingResult {
  const list: CharElement[] = chars.map((c) => ({
    char: c.char,
    strokes: c.strokes,
    element: elementOfNumber(c.strokes),
  }));

  const distribution = Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<Element, number>;
  for (const c of list) distribution[c.element] += 1;
  const missing = ELEMENTS.filter((e) => distribution[e] === 0);

  const relations: string[] = [];
  for (let i = 0; i + 1 < list.length; i++) {
    const a = list[i]!;
    const b = list[i + 1]!;
    relations.push(describe(`${a.char}`, a.element, `${b.char}`, b.element));
  }

  const present = ELEMENTS.filter((e) => distribution[e] > 0);
  const dominant = ELEMENTS.filter((e) => distribution[e] === Math.max(...ELEMENTS.map((x) => distribution[x])));
  const summary =
    present.length === 1
      ? `全名五行單一，皆屬${present[0]}，氣勢集中但欠缺流轉。`
      : `五行見${present.join('、')}，以${dominant.join('、')}為重；缺${missing.join('、')}。`;

  return { chars: list, distribution, missing, relations, summary };
}
