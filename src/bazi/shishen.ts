// 十神 —— 日主與其他天干的關係。
//
// 來源（docs/v2-sources.md 第 5 節）：
//   https://www.daokeyi.com/ming/bazi/shishen/
//   「十神不是十位神明，而是日主與其餘天干之間的關係名稱。命名由兩個維度交叉
//     而成：一是五行生克的五種關係，二是陰陽的同性或異性。」
//
// 因為是兩維度交叉推導而非流派意見，這裡直接以規則實作，不逐項列表。

import { KE, SHENG, SHISHEN_TABLE, STEMS, hiddenStemsOf } from '../data/index.ts';
import type { Element, ElementRelation, HiddenStemRole, ShiShen, Stem } from '../data/index.ts';

/** 以日主為中心，判斷另一個五行與它的關係。 */
export function relationTo(dayMaster: Element, other: Element): ElementRelation {
  if (other === dayMaster) return '同我';
  if (SHENG[dayMaster] === other) return '我生';
  if (KE[dayMaster] === other) return '我剋';
  if (KE[other] === dayMaster) return '剋我';
  return '生我'; // 剩下的唯一情形：other 生 dayMaster
}

/** 日主與另一天干的十神。 */
export function shishenOf(dayMaster: Stem, other: Stem): ShiShen {
  const relation = relationTo(dayMaster.element, other.element);
  const entry = SHISHEN_TABLE[relation];
  return dayMaster.yin === other.yin ? entry.same : entry.different;
}

function stemByName(name: string): Stem | undefined {
  return STEMS.find((s) => s.name === name);
}

export interface HiddenStemShiShen {
  stem: string;
  role: HiddenStemRole;
  element: Element;
  shishen: ShiShen;
}

/** 某地支所藏天干各自對日主的十神（依本氣 → 中氣 → 餘氣）。 */
export function hiddenShiShenOf(dayMaster: Stem, branch: string): HiddenStemShiShen[] {
  return hiddenStemsOf(branch).flatMap(({ stem, role }) => {
    const s = stemByName(stem);
    if (!s) return [];
    return [{ stem, role, element: s.element, shishen: shishenOf(dayMaster, s) }];
  });
}
