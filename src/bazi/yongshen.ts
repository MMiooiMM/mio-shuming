// 用神判定 —— 扶抑為主 ＋ 調候修正 ＋ 從格例外偵測（SPEC-v2 #13–#16）。
//
// 這一段和排盤不同：**排盤有唯一正確答案，用神沒有。** 同一組四柱，
// docs/v2-sources.md 第 10 節那一頁就有三位答主給出三種用神。因此本模組的
// 目標不是「算對」，而是：
//
//   1. 明講自己採哪一套規則：能指得出原文的指原文，指不出的（門檻、二分法）
//      一律標為「本站的操作化規則」（見 src/data/yongshen.json 的 operationalRules）
//   2. 逐項攤開判斷依據，讓使用者能自己否決（SPEC-v2 #14）
//   3. 允許手動覆寫（SPEC-v2 #15）
//   4. 只給喜用／忌神的分項判定，不給分數（SPEC-v2 #16）
//
// 判準摘要
//   身強弱  得令、得地、得勢三者中至少滿足兩項為身強——三份互斥來源的唯一交集。
//           量化權重（預設 50/30/20）只顯示，不用來下結論。
//   扶抑    身強者用剋洩耗（官殺／財／食傷），身弱者用生扶（印／比）。
//   調候    冬月補火、夏月補水（五行總論裡五個五行一致的部分）。與扶抑衝突時
//           **兩者並陳，不擅自合併**——那是流派差異，不是本站能仲裁的。
//   從格    只偵測標示，不自動改判用神（跨流派沒有一致門檻）。
//
// 純函式：不讀當下時間、不讀隨機數（SPEC-v2 #23）。

import { KE, SHENG, STRENGTH_RULE, hiddenStemsOf, tiaohouOf, wangXiangOf } from '../data/index.ts';
import type { Element, TiaohouEntry } from '../data/index.ts';
import type { BaziChart } from './chart.ts';

/** 五行對日主的關係。 */
export type Relation = '同我' | '生我' | '我生' | '我剋' | '剋我';

export type FactorName = '得令' | '得地' | '得勢';

export interface StrengthFactor {
  name: FactorName;
  /**
   * `'unknown'` 是「查不到資料所以無法判定」，與 `false`（判定為不滿足）不同 ——
   * 把未知折算成 false 就是猜（SPEC-v2 #24）。有任一項 unknown 時本模組拒絕
   * 給結論，回 `ok: false`。
   */
  satisfied: boolean | 'unknown';
  /** 給使用者看的判斷依據，含引用（SPEC-v2 #14）。 */
  detail: string;
  /** 量化權重（顯示用，不參與結論）。 */
  weight: number;
}

export interface StrengthResult {
  factors: StrengthFactor[];
  /** 滿足的項數；≥2 為身強。 */
  satisfiedCount: number;
  strong: boolean;
  /** 加權分數，滿分 100。純顯示用 —— 結論由質性交集決定。 */
  score: number;
  conclusion: string;
}

export interface CongGeSuspicion {
  suspected: boolean;
  kind?: '疑似從強格' | '疑似從弱格';
  detail: string;
}

export interface TiaohouResult {
  /** 出生月令所需的調候五行；春秋兩季無機械結論時為 undefined。 */
  need?: Element;
  entry?: TiaohouEntry;
  /** 調候所需的五行落在扶抑的忌神裡 —— 兩派結論相反，並陳不合併。 */
  conflictsWithFuyi: boolean;
  detail: string;
}

export interface YongShenResult {
  dayMaster: { stem: string; element: Element };
  strength: StrengthResult;
  /** 扶抑得出的喜用五行。 */
  fuyi: { favor: Element[]; avoid: Element[]; detail: string };
  tiaohou: TiaohouResult;
  congGe: CongGeSuspicion;
  /** 最終喜用／忌神的分項判定（不給分數，SPEC-v2 #16）。 */
  favor: Element[];
  avoid: Element[];
  /** 使用者手動覆寫時為 true，此時 favor/avoid 直接採用覆寫值。 */
  overridden: boolean;
  /** 逐項依據，依序對應畫面上的說明列。 */
  reasons: string[];
}

export type YongShenOutcome = ({ ok: true } & YongShenResult) | { ok: false; reason: string };

export interface YongShenOptions {
  /** 量化權重，預設 50/30/20（SPEC-v2 #13）。只影響顯示的分數。 */
  weights?: Partial<Record<FactorName, number>>;
  /**
   * 手動覆寫用神（SPEC-v2 #15）。給了就直接採用，但判斷依據照樣攤開。
   *
   * **只收 favor**，忌神一律取補集 —— 讓呼叫端同時指定兩者，就可能傳進
   * 互相重疊或漏掉五行的組合，破壞「喜忌不重疊且涵蓋五行」這條不變條件。
   */
  override?: { favor: Element[] };
}

const ELEMENTS: Element[] = ['木', '火', '土', '金', '水'];

/** `other` 相對於日主 `self` 的關係。 */
export function relationTo(self: Element, other: Element): Relation {
  if (other === self) return '同我';
  if (SHENG[other] === self) return '生我';
  if (SHENG[self] === other) return '我生';
  if (KE[self] === other) return '我剋';
  return '剋我';
}

/** 印比＝生我＋同我，是扶助日主的兩神。 */
const isSupport = (r: Relation) => r === '同我' || r === '生我';

interface Tally {
  support: number;
  drain: number;
}

/** 天干與地支藏干中，扶助日主與剋洩耗日主的數量。日主自己不計。 */
function tally(chart: BaziChart): Tally {
  const self = chart.dayMaster.element;
  const t: Tally = { support: 0, drain: 0 };

  for (const p of chart.pillars) {
    if (p.position !== '日柱') {
      const r = relationTo(self, p.pillar.stem.element);
      if (isSupport(r)) t.support += 1;
      else t.drain += 1;
    }
    for (const h of p.hidden) {
      const r = relationTo(self, h.element);
      if (isSupport(r)) t.support += 1;
      else t.drain += 1;
    }
  }
  return t;
}

/** 得令：日主五行在月令為「旺」或「相」（《三命通會》五季旺相休囚死）。 */
function judgeDeLing(chart: BaziChart, weight: number): StrengthFactor {
  const self = chart.dayMaster.element;
  const branch = chart.pillars[1]!.pillar.branch.name;
  const state = wangXiangOf(branch, self);
  if (!state) {
    return {
      name: '得令',
      satisfied: 'unknown',
      detail: `月支「${branch}」不在旺相表中，無法判定得令。`,
      weight,
    };
  }
  const satisfied = state === '旺' || state === '相';
  return {
    name: '得令',
    satisfied,
    detail:
      `日主${self}於${branch}月為「${state}」${satisfied ? '，得令' : '，不得令'}` +
      `（《三命通會·論五行旺相休囚死》）。`,
    weight,
  };
}

/** 得地（通根）：地支藏干中有與日主同類的五行。 */
function judgeDeDi(chart: BaziChart, weight: number): StrengthFactor {
  const self = chart.dayMaster.element;
  const roots: string[] = [];
  for (const p of chart.pillars) {
    for (const h of hiddenStemsOf(p.pillar.branch.name)) {
      const hidden = p.hidden.find((x) => x.stem === h.stem);
      if (hidden?.element === self) {
        roots.push(`${p.position}${p.pillar.branch.name}藏${h.stem}（${h.role}）`);
      }
    }
  }
  return {
    name: '得地',
    satisfied: roots.length > 0,
    detail: roots.length
      ? `日主${self}在地支有根：${roots.join('、')}。原文說根有強弱（本氣強於中氣、餘氣）` +
        '與遠近之別，但只要有一個根就算得地——強弱遠近目前只供參考，不參與這個判定（本站的操作化規則）。'
      : `四個地支的藏干都沒有${self}，日主無根，不得地。`,
    weight,
  };
}

/** 得勢：印比（生我＋同我）多於剋洩耗。 */
function judgeDeShi(weight: number, t: Tally): StrengthFactor {
  return {
    name: '得勢',
    satisfied: t.support > t.drain,
    detail:
      `扣除日主本身，天干與地支藏干共有印比 ${t.support} 個、剋洩耗 ${t.drain} 個，` +
      `${t.support > t.drain ? '印比較眾，得勢' : '印比不多於剋洩耗，不得勢'}。` +
      '（原文只說「印比兩神眾多」，沒給門檻；等權計數並取嚴格多數是本站的操作化規則，非原文。）',
    weight,
  };
}

const DEFAULT_WEIGHTS = STRENGTH_RULE.defaultWeights as Record<FactorName, number>;

export type StrengthOutcome = ({ ok: true } & StrengthResult) | { ok: false; reason: string };

/** 權重必須是有限的非負數；壞值不靜默吞掉（SPEC-v2 #24）。 */
function sanitizeWeights(input: Partial<Record<FactorName, number>> | undefined): {
  weights: Record<FactorName, number>;
  bad?: string;
} {
  const weights = { ...DEFAULT_WEIGHTS } as Record<FactorName, number>;
  for (const [name, value] of Object.entries(input ?? {}) as [FactorName, number][]) {
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 0) {
      return { weights, bad: `權重「${name}」需為有限的非負數，收到 ${String(value)}。` };
    }
    weights[name] = value;
  }
  return { weights };
}

export function judgeStrength(chart: BaziChart, options: YongShenOptions = {}): StrengthOutcome {
  const sanitized = sanitizeWeights(options.weights);
  if (sanitized.bad) return { ok: false, reason: sanitized.bad };
  const weights = sanitized.weights;
  const t = tally(chart);
  const factors = [
    judgeDeLing(chart, weights['得令']),
    judgeDeDi(chart, weights['得地']),
    judgeDeShi(weights['得勢'], t),
  ];

  const unknown = factors.filter((f) => f.satisfied === 'unknown');
  if (unknown.length) {
    return {
      ok: false,
      reason: `${unknown.map((f) => f.name).join('、')}無法判定（${unknown[0]!.detail}），故不推論身強弱。`,
    };
  }

  const satisfiedCount = factors.filter((f) => f.satisfied === true).length;
  // 結論一律由質性交集決定，分數只是顯示。
  const strong = satisfiedCount >= 2;
  const total = factors.reduce((n, f) => n + f.weight, 0);
  const got = factors.filter((f) => f.satisfied === true).reduce((n, f) => n + f.weight, 0);
  const score = total === 0 ? 0 : Math.round((got / total) * 100);

  return {
    ok: true,
    factors,
    satisfiedCount,
    strong,
    score,
    conclusion:
      `得令／得地／得勢滿足 ${satisfiedCount} 項 → **${strong ? '身強' : '身弱'}**。` +
      `（判準：${STRENGTH_RULE.rule}）`,
  };
}

/**
 * 來源只有質性說法（宜洩宜剋／宜生宜扶），沒說「哪幾個五行全部算喜用」。
 * 把相關的三神（或兩神）整組列為喜用是**本站的操作化規則**，不是原文；
 * 實務上還會再從中挑一神為主用神，挑哪一神各家不一，本站不做那一層。
 */
const FUYI_CAVEAT =
  '（把相關三神整組列為喜用是本站的操作化規則：來源只說宜洩宜剋／宜生宜扶，' +
  '沒說哪幾個五行全部算喜用，也沒說該挑哪一神為主用神。）';

/** 扶抑：身強者用剋洩耗，身弱者用生扶。 */
function judgeFuyi(self: Element, strong: boolean): { favor: Element[]; avoid: Element[]; detail: string } {
  const byRelation = (wanted: Relation[]) =>
    ELEMENTS.filter((e) => wanted.includes(relationTo(self, e)));

  const favor = strong ? byRelation(['剋我', '我剋', '我生']) : byRelation(['生我', '同我']);
  const avoid = strong ? byRelation(['生我', '同我']) : byRelation(['剋我', '我剋', '我生']);
  return {
    favor,
    avoid,
    detail: strong
      ? `身強者宜洩、宜剋，取官殺（${byRelation(['剋我']).join('')}）、財（${byRelation(['我剋']).join('')}）、食傷（${byRelation(['我生']).join('')}）為用。` +
        FUYI_CAVEAT
      : `身弱者宜生、宜扶，取印（${byRelation(['生我']).join('')}）、比劫（${byRelation(['同我']).join('')}）為用。` +
        FUYI_CAVEAT,
  };
}

function judgeTiaohou(
  chart: BaziChart,
  fuyiAvoid: Element[],
): TiaohouResult {
  const self = chart.dayMaster.element;
  const branch = chart.pillars[1]!.pillar.branch.name;
  const entry = tiaohouOf(self, branch);

  if (!entry) {
    return { conflictsWithFuyi: false, detail: `月支「${branch}」不在調候表中，不做調候修正。` };
  }
  if (!entry.need) {
    return {
      entry,
      conflictsWithFuyi: false,
      detail:
        '本季原文為條件式敘述（初秋喜水土、霜降後忌水盛、寒露後又喜火之類），' +
        '無法機械化而不加入本站自己的判斷，因此只列原文供參，不做調候修正。',
    };
  }
  const conflictsWithFuyi = fuyiAvoid.includes(entry.need);
  return {
    need: entry.need,
    entry,
    conflictsWithFuyi,
    detail: conflictsWithFuyi
      ? `調候需${entry.need}，但扶抑把${entry.need}判為忌神 —— 兩派結論相反，本站兩者並陳，不擅自合併。`
      : `調候需${entry.need}，已併入喜用。`,
  };
}

/**
 * 從格偵測。**只標示，不改判**（SPEC-v2 #13）——跨流派沒有一致的成立門檻。
 */
function detectCongGe(strength: StrengthResult, t: Tally): CongGeSuspicion {
  const deLing = strength.factors[0]!.satisfied === true;
  const deDi = strength.factors[1]!.satisfied === true;
  // 下面的 1 與 0 是**本站自訂的提醒門檻**，不是古籍或任何一家的數字
  // （各家都沒有一致門檻，見 src/data/yongshen.json 的 operationalRules）。
  // 它們只決定「要不要提醒使用者去看從格」，永遠不改判用神。
  if (!deDi && !deLing && t.support <= 1) {
    return {
      suspected: true,
      kind: '疑似從弱格',
      detail:
        `日主無根、不得令，全局印比僅 ${t.support} 個 —— 部分流派會論從弱（從財／從殺／從兒），` +
        '用神取向與扶抑相反。觸發條件（印比 ≤ 1）是本站自訂的提醒門檻，不是古籍數字；' +
        '本站只標示不改判：從格門檻各家不一，逕自改判等於替使用者選流派。',
    };
  }
  if (deLing && deDi && t.drain === 0) {
    return {
      suspected: true,
      kind: '疑似從強格',
      detail:
        '得令又得地，且全局沒有剋洩耗 —— 部分流派會論從強／專旺。' +
        '觸發條件（剋洩耗 ＝ 0）同樣是本站自訂的提醒門檻，不是古籍數字。本站只標示不改判，理由同上。',
    };
  }
  return { suspected: false, detail: '未達從格的偵測條件，依一般扶抑論用神。' };
}

/**
 * 完整用神判定。
 *
 * `options.override` 給了就直接採用該喜用（SPEC-v2 #15），但所有判斷依據照樣
 * 攤開——使用者覆寫的是結論，不是把過程藏起來。
 */
export function yongShen(chart: BaziChart, options: YongShenOptions = {}): YongShenOutcome {
  const self = chart.dayMaster.element;
  const t = tally(chart);
  const outcome = judgeStrength(chart, options);
  if (!outcome.ok) return outcome;
  const { ok: _ok, ...strength } = outcome;
  const fuyi = judgeFuyi(self, strength.strong);
  const tiaohou = judgeTiaohou(chart, fuyi.avoid);
  const congGe = detectCongGe(strength, t);

  let favor = [...fuyi.favor];
  let avoid = [...fuyi.avoid];
  // 調候與扶抑不衝突時併入喜用；衝突時兩者並陳，不動扶抑的結論。
  if (tiaohou.need && !tiaohou.conflictsWithFuyi && !favor.includes(tiaohou.need)) {
    favor.push(tiaohou.need);
  }

  const overridden = options.override !== undefined;
  if (options.override) {
    // 型別擋不住 any／反序列化來的資料，這裡實際驗一次（SPEC-v2 #24）。
    const bad = options.override.favor.filter((e) => !ELEMENTS.includes(e));
    if (bad.length) {
      return { ok: false, reason: `覆寫的喜用含非五行的值：${bad.map(String).join('、')}。` };
    }
    // 去重並固定成木火土金水的順序，忌神取補集 —— 不重疊、且必涵蓋五行。
    favor = ELEMENTS.filter((e) => options.override!.favor.includes(e));
    avoid = ELEMENTS.filter((e) => !favor.includes(e));
  }

  const reasons = [
    ...strength.factors.map((f) => `${f.name}：${f.satisfied === true ? '✓' : '✗'} ${f.detail}`),
    strength.conclusion,
    `扶抑：${fuyi.detail}`,
    `調候：${tiaohou.detail}`,
    `從格：${congGe.suspected ? `${congGe.kind} —— ${congGe.detail}` : congGe.detail}`,
  ];
  if (overridden) {
    reasons.push('※ 用神已由使用者手動覆寫，以上為本站原本的判斷依據，供對照。');
  }

  return {
    ok: true,
    dayMaster: { stem: chart.dayMaster.name, element: self },
    strength,
    fuyi,
    tiaohou,
    congGe,
    favor,
    avoid,
    overridden,
    reasons,
  };
}
