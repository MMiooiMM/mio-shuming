// 完整八字命盤 —— SPEC-v2 #10 要求的整組輸出：
// 四柱（年月日時的天干地支）、藏干、十神、五行分佈。
//
// pillars.ts 只做干支推算，shishen.ts 只做關係判定；這裡把兩者組合成一次呼叫
// 就能拿到的完整結果，避免呼叫端各自拼裝而漏掉其中一項。

import { ZODIAC_BRANCHES } from '../data/index.ts';
import type { Animal, Element, ShiShen, Stem } from '../data/index.ts';
import { fourPillars } from './pillars.ts';
import type { FourPillarsOptions, LocalDateTime, Pillar } from './pillars.ts';
import { hiddenShiShenOf, shishenOf } from './shishen.ts';
import type { HiddenStemShiShen } from './shishen.ts';

export type PillarPosition = '年柱' | '月柱' | '日柱' | '時柱';

export interface ChartPillar {
  position: PillarPosition;
  pillar: Pillar;
  /** 天干對日主的十神；日柱天干即日主本身，故為 undefined。 */
  stemShiShen: ShiShen | undefined;
  /** 地支所藏天干各自對日主的十神（本氣 → 中氣 → 餘氣）。 */
  hidden: HiddenStemShiShen[];
}

export interface BaziChart {
  pillars: ChartPillar[];
  dayMaster: Stem;
  solarYear: number;
  /** 由年柱地支導出的生肖 —— 生肖與年柱必定一致（SPEC-v2 #11）。 */
  animal: Animal;
  jie: { name: string; deg: number; branch: string };
  lateZi: boolean;
  /**
   * 五行分佈。`stems` 只計四個天干；`withHidden` 另計入地支藏干，
   * 兩者都給，因為各流派算「五行個數」時取捨不同。
   */
  distribution: {
    stems: Record<Element, number>;
    withHidden: Record<Element, number>;
  };
  missing: Element[];
}

export type ChartResult = ({ ok: true } & BaziChart) | { ok: false; reason: string };

const ELEMENTS: Element[] = ['木', '火', '土', '金', '水'];
const emptyCount = (): Record<Element, number> =>
  Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<Element, number>;

/** 地支 → 生肖。年柱地支決定生肖，不另外判斷。 */
export function animalOfBranch(branch: string): Animal | undefined {
  return ZODIAC_BRANCHES.find((b) => b.branch === branch)?.animal;
}

/**
 * 由已校正的當地時間排出完整命盤。
 *
 * `dt` 必須是**已完成真太陽時與夏令時間校正**的當地時間；校正屬上游
 * （SPEC-v2 #6–#9）。無法判定時回傳 `ok: false`，不猜（SPEC-v2 #24）。
 */
export function baziChart(dt: LocalDateTime, options: FourPillarsOptions = {}): ChartResult {
  const p = fourPillars(dt, options);
  if (!p.ok) return p;

  const dayMaster = p.dayMaster;
  const positions: [PillarPosition, Pillar][] = [
    ['年柱', p.year],
    ['月柱', p.month],
    ['日柱', p.day],
    ['時柱', p.hour],
  ];

  const pillars: ChartPillar[] = positions.map(([position, pillar]) => ({
    position,
    pillar,
    // 日柱天干是日主自己，不論十神。
    stemShiShen: position === '日柱' ? undefined : shishenOf(dayMaster, pillar.stem),
    hidden: hiddenShiShenOf(dayMaster, pillar.branch.name),
  }));

  const stems = emptyCount();
  const withHidden = emptyCount();
  for (const { pillar, hidden } of pillars) {
    stems[pillar.stem.element] += 1;
    withHidden[pillar.stem.element] += 1;
    for (const h of hidden) withHidden[h.element] += 1;
  }

  const animal = animalOfBranch(p.year.branch.name);
  if (!animal) return { ok: false, reason: '年柱地支無法對應生肖，請回報此問題。' };

  return {
    ok: true,
    pillars,
    dayMaster,
    solarYear: p.solarYear,
    animal,
    jie: p.jie,
    lateZi: p.lateZi,
    distribution: { stems, withHidden },
    missing: ELEMENTS.filter((e) => withHidden[e] === 0),
  };
}
