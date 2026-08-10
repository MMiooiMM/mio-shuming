// 用神的驗收方式與排盤不同。
//
// docs/v2-sources.md 第 10 節那一頁，同一組四柱有三位答主給出三種用神——
// 這裡**不可能**驗「算對」。可驗收的只有三件事：
//   1. 程式自洽（同輸入同輸出、結論與逐項依據不互相矛盾）
//   2. 規則忠於自己宣告的那份原文（旺相表、調候表）
//   3. 與基準命例的差異被明確記錄下來，而不是被掩蓋

import { describe, expect, it } from 'vitest';
import { TIAOHOU_ENTRIES, WANGXIANG_STATES, wangXiangOf, tiaohouOf } from '../data/index.ts';
import type { Element } from '../data/index.ts';
import { baziChart } from './chart.ts';
import { judgeStrength, relationTo, yongShen } from './yongshen.ts';
import type { StrengthResult, YongShenResult } from './yongshen.ts';

/** 這些案例都該判得出來；判不出來本身就是要紅的失敗。 */
const strengthOf = (...args: Parameters<typeof judgeStrength>): StrengthResult => {
  const r = judgeStrength(...args);
  expect(r.ok, r.ok ? '' : r.reason).toBe(true);
  if (!r.ok) throw new Error(r.reason);
  return r;
};
const yongShenOf = (...args: Parameters<typeof yongShen>): YongShenResult => {
  const r = yongShen(...args);
  expect(r.ok, r.ok ? '' : r.reason).toBe(true);
  if (!r.ok) throw new Error(r.reason);
  return r;
};

const chartOf = (dt: { year: number; month: number; day: number; hour: number; minute: number }) => {
  const c = baziChart(dt);
  expect(c.ok).toBe(true);
  if (!c.ok) throw new Error('unreachable');
  return c;
};

/** docs 第 10 節基準命例一：戊寅 戊午 戊子 丁巳（日主戊土）。 */
const CASE_A = chartOf({ year: 1998, month: 6, day: 10, hour: 10, minute: 0 });
/** 基準命例二：甲戌 辛未 丁巳 丁未（日主丁火）。 */
const CASE_B = chartOf({ year: 1994, month: 7, day: 30, hour: 13, minute: 37 });

describe('資料表忠於原文', () => {
  it('旺相休囚死：五季各自五態不重複，且與《三命通會》原文一致', () => {
    for (const [season, states] of Object.entries(WANGXIANG_STATES)) {
      const elements = Object.values(states);
      expect(new Set(elements).size, `${season} 的五態指到重複五行`).toBe(5);
    }
    // 逐季對照原文，五季全比——只驗其中兩季的話，另外三季整組錯置也會綠燈。
    //   春：「如春木旺，旺則生火……故火相……故水休……故金囚……春木剋土則死」
    //   夏：「夏火旺火，生土則土相，木生火則木休，水剋火則水囚，火剋金則金死」
    //   六月：「六月土旺，土生金則金相，火生土則火休，木剋土則木囚，土剋水則水死」
    //   秋：「秋金旺，金生水則水相，土生金則土休，火剋金則火囚，金剋木則木死」
    //   冬：「冬水旺，水生木則木相，金生水則金休，土剋水則土囚，水剋火則火死」
    expect(WANGXIANG_STATES).toEqual({
      春: { 旺: '木', 相: '火', 休: '水', 囚: '金', 死: '土' },
      夏: { 旺: '火', 相: '土', 休: '木', 囚: '水', 死: '金' },
      六月: { 旺: '土', 相: '金', 休: '火', 囚: '木', 死: '水' },
      秋: { 旺: '金', 相: '水', 休: '土', 囚: '火', 死: '木' },
      冬: { 旺: '水', 相: '木', 休: '金', 囚: '土', 死: '火' },
    });
    // 未月獨立為「六月」，所以辰歸春、戌歸秋、丑歸冬。
    expect(wangXiangOf('辰', '木')).toBe('旺');
    expect(wangXiangOf('未', '土')).toBe('旺');
    expect(wangXiangOf('戌', '金')).toBe('旺');
    expect(wangXiangOf('丑', '水')).toBe('旺');
  });

  it('旺相表查無此支時回 undefined，不猜', () => {
    expect(wangXiangOf('X', '木')).toBeUndefined();
  });

  it('調候：冬月一律補火（火日主取生火之木）、夏月一律補水（水日主取生水之金）', () => {
    // 獨立寫死的期望矩陣：直接對照原文，不是拿資料檔自己驗自己。
    const expected: Record<Element, { 冬: Element; 夏: Element }> = {
      木: { 冬: '火', 夏: '水' }, // 「火重見溫暖有功」／「欲得水盛而成滋潤之力」
      火: { 冬: '木', 夏: '水' }, // 「喜木生而有救」／「逢水制則免自焚之咎」
      土: { 冬: '火', 夏: '水' }, // 「火盛有榮」／「得盛水滋潤成功」
      金: { 冬: '火', 夏: '水' }, // 「火來助土，子母成功」／「水盛而滋潤呈祥」
      水: { 冬: '火', 夏: '金' }, // 「遇火則增暖除寒」／「喜金生而助體」
    };
    const elements: Element[] = ['木', '火', '土', '金', '水'];
    for (const e of elements) {
      expect(TIAOHOU_ENTRIES[e]['冬'].need, `${e}日主冬月`).toBe(expected[e]['冬']);
      expect(TIAOHOU_ENTRIES[e]['夏'].need, `${e}日主夏月`).toBe(expected[e]['夏']);
      // 春秋兩季原文是條件式敘述，刻意不給機械結論。
      expect(TIAOHOU_ENTRIES[e]['春'].need).toBeUndefined();
      expect(TIAOHOU_ENTRIES[e]['秋'].need).toBeUndefined();
      // 每一條都指得出它依據的原文。
      for (const season of ['春', '夏', '秋', '冬'] as const) {
        expect(TIAOHOU_ENTRIES[e][season].text.length).toBeGreaterThan(10);
      }
    }
  });

  it('調候的四季制與旺相的五季制刻意不同：未月調候屬夏，旺相屬六月', () => {
    expect(tiaohouOf('土', '未')?.need).toBe('水'); // 夏
    expect(wangXiangOf('未', '土')).toBe('旺'); // 六月
  });
});

describe('relationTo', () => {
  it('五行關係正確', () => {
    expect(relationTo('木', '木')).toBe('同我');
    expect(relationTo('木', '水')).toBe('生我');
    expect(relationTo('木', '火')).toBe('我生');
    expect(relationTo('木', '土')).toBe('我剋');
    expect(relationTo('木', '金')).toBe('剋我');
  });
});

describe('身強弱', () => {
  it('基準命例一（戊寅 戊午 戊子 丁巳）：三項全滿足 → 身強', () => {
    const s = strengthOf(CASE_A);
    expect(s.factors.map((f) => f.satisfied)).toEqual([true, true, true]);
    expect(s.strong).toBe(true);
    expect(s.score).toBe(100);
    // 三位答主分別說「日元極旺」「八字偏強」「日元偏旺」——身強的方向三家一致。
    expect(s.conclusion).toContain('身強');
  });

  it('基準命例二（甲戌 辛未 丁巳 丁未）：不得令但得地得勢 → 身強', () => {
    const s = strengthOf(CASE_B);
    expect(s.factors[0]!.satisfied).toBe(false); // 丁火於未月為「休」
    expect(s.factors[0]!.detail).toContain('休');
    expect(s.factors[1]!.satisfied).toBe(true); // 巳藏丙火為本氣根
    expect(s.strong).toBe(true);
  });

  it('權重可調，且只影響分數不影響結論（SPEC-v2 #13）', () => {
    const base = strengthOf(CASE_B);
    const tweaked = strengthOf(CASE_B, { weights: { 得令: 90, 得地: 5, 得勢: 5 } });
    expect(tweaked.strong).toBe(base.strong); // 質性交集不變
    expect(tweaked.score).toBeLessThan(base.score); // 分數變了
    expect(tweaked.score).toBe(10);
  });

  it('每一項都攤開判斷依據（SPEC-v2 #14）', () => {
    const s = strengthOf(CASE_A);
    expect(s.factors.map((f) => f.name)).toEqual(['得令', '得地', '得勢']);
    for (const f of s.factors) expect(f.detail.length).toBeGreaterThan(10);
    expect(s.factors[0]!.detail).toContain('三命通會');
  });
});

describe('用神', () => {
  it('基準命例一：身強土 → 用金水木，忌火土；與三家中的兩家同向', () => {
    const y = yongShenOf(CASE_A);
    expect(y.dayMaster).toEqual({ stem: '戊', element: '土' });
    expect(new Set(y.favor)).toEqual(new Set(['木', '水', '金']));
    expect(new Set(y.avoid)).toEqual(new Set(['火', '土']));
    // 答主二「庚金、壬水（金水木）」、答主三「水為用、木為喜、忌火土」與此同向；
    // 答主一走從旺（用火土）與此相反 —— 流派差異，不是 bug。
    expect(y.overridden).toBe(false);
  });

  it('基準命例一：夏月生土，調候需水，且與扶抑不衝突', () => {
    const y = yongShenOf(CASE_A);
    expect(y.tiaohou.need).toBe('水');
    expect(y.tiaohou.conflictsWithFuyi).toBe(false);
    expect(y.favor).toContain('水');
    expect(y.tiaohou.entry?.text).toContain('夏月之土');
  });

  it('調候與扶抑相反時兩者並陳，不擅自合併（SPEC-v2 #22）', () => {
    // 庚午 戊子 己未 丁卯：身強的冬月土日主。
    // 扶抑判「火土為忌」，調候卻說冬月非火不可——兩派對火的結論正好相反。
    const chart = chartOf({ year: 1990, month: 12, day: 20, hour: 6, minute: 0 });
    const y = yongShenOf(chart);
    expect(y.strength.strong).toBe(true);
    expect(y.tiaohou.need).toBe('火');
    expect(y.tiaohou.conflictsWithFuyi).toBe(true);
    // 衝突時不把調候用神塞進喜用，也不從忌神裡拿掉——兩邊都照實呈現。
    expect(y.favor).not.toContain('火');
    expect(y.avoid).toContain('火');
    expect(y.tiaohou.detail).toContain('並陳');
  });

  it('喜用與忌神不重疊，且合起來涵蓋五行', () => {
    for (const chart of [CASE_A, CASE_B]) {
      const y = yongShenOf(chart);
      expect(y.favor.filter((e) => y.avoid.includes(e))).toEqual([]);
      expect(new Set([...y.favor, ...y.avoid]).size).toBe(5);
    }
  });

  it('覆寫的喜用會驗證：非五行值拒絕，重複值去重，忌神一律取補集', () => {
    const bad = yongShen(CASE_A, { override: { favor: ['火', '風' as Element] } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toContain('非五行');

    const dup = yongShenOf(CASE_A, { override: { favor: ['火', '火', '土'] } });
    expect(dup.favor).toEqual(['火', '土']); // 去重並固定成木火土金水的順序
    expect(dup.avoid).toEqual(['木', '金', '水']);
    expect(dup.favor.filter((e) => dup.avoid.includes(e))).toEqual([]);
    expect(new Set([...dup.favor, ...dup.avoid]).size).toBe(5);
  });

  it('可手動覆寫用神，但判斷依據照樣攤開（SPEC-v2 #15）', () => {
    const y = yongShenOf(CASE_A, { override: { favor: ['火', '土'] } });
    expect(y.overridden).toBe(true);
    expect(y.favor).toEqual(['火', '土']);
    expect(y.avoid).toEqual(['木', '金', '水']);
    // 覆寫的是結論，不是把過程藏起來。
    expect(y.strength.factors).toHaveLength(3);
    expect(y.fuyi.favor).toEqual(expect.arrayContaining(['木', '水', '金']));
    expect(y.reasons.some((r) => r.includes('手動覆寫'))).toBe(true);
  });

  it('從格只標示不改判（SPEC-v2 #13）', () => {
    // 己卯 庚午 戊午 己未：得令得地、印比壓倒性，是最像從強的一類命盤。
    const chart = chartOf({ year: 1999, month: 7, day: 5, hour: 14, minute: 0 });
    const y = yongShenOf(chart);
    // 不論有沒有標示從格，用神一律仍由扶抑（＋不衝突的調候）決定，
    // 絕不出現「因為疑似從格所以反向取用」。
    const extra = y.favor.filter((e) => !y.fuyi.favor.includes(e));
    expect(extra.every((e) => e === y.tiaohou.need && !y.tiaohou.conflictsWithFuyi)).toBe(true);
    expect(y.fuyi.favor.every((e) => y.favor.includes(e))).toBe(true);
    expect(y.avoid).toEqual(y.fuyi.avoid);
  });

  it('扶抑的二分法在依據裡標明是本站的操作化規則，不冒充原文', () => {
    const y = yongShenOf(CASE_A);
    expect(y.fuyi.detail).toContain('本站的操作化規則');
    expect(y.strength.factors[2]!.detail).toContain('本站的操作化規則');
  });

  it('逐項依據涵蓋得令／得地／得勢／扶抑／調候／從格六段（SPEC-v2 #14）', () => {
    const y = yongShenOf(CASE_B);
    const joined = y.reasons.join('\n');
    for (const key of ['得令', '得地', '得勢', '扶抑', '調候', '從格']) {
      expect(joined, `缺少 ${key} 的依據`).toContain(key);
    }
  });

  it('純函式：同輸入同輸出，且不改動傳入的命盤', () => {
    const snapshot = JSON.parse(JSON.stringify(CASE_A));
    expect(yongShenOf(CASE_A)).toEqual(yongShenOf(CASE_A));
    expect(JSON.parse(JSON.stringify(CASE_A))).toEqual(snapshot);
  });

  it('從格真的會被偵測到（不是永遠回 false 的假綠燈）', () => {
    // 己卯 庚午 戊午 己未：得令得地，且全局沒有剋洩耗。
    const chart = chartOf({ year: 1999, month: 7, day: 5, hour: 14, minute: 0 });
    const strength = strengthOf(chart);
    expect(strength.factors[0]!.satisfied).toBe(true);
    expect(strength.factors[1]!.satisfied).toBe(true);

    // 壬子 癸卯 甲子 甲子：得令得地、全局無剋洩耗 —— 從強那一支真的會觸發。
    const strongCase = yongShenOf(chartOf({ year: 1972, month: 4, day: 3, hour: 0, minute: 0 }));
    expect(strongCase.congGe.suspected).toBe(true);
    expect(strongCase.congGe.kind).toBe('疑似從強格');
    expect(strongCase.congGe.detail).toContain('本站自訂');
    expect(strongCase.favor).toEqual(expect.arrayContaining(strongCase.fuyi.favor));

    // 壬辰 癸丑 丙子 己丑：日主丙火無根、不得令、印比僅 1 個 —— 從弱那一支也會觸發。
    const weak = chartOf({ year: 1953, month: 1, day: 25, hour: 2, minute: 0 });
    const y = yongShenOf(weak);
    expect(y.congGe.suspected).toBe(true);
    expect(y.congGe.kind).toBe('疑似從弱格');
    expect(y.congGe.detail).toContain('本站自訂');
    // 標示歸標示，用神仍由扶抑決定：身弱取印比（木火），沒有反向去取財官。
    expect(y.strength.strong).toBe(false);
    expect(y.fuyi.favor).toEqual(expect.arrayContaining(['木', '火']));
    expect(y.favor).toEqual(expect.arrayContaining(y.fuyi.favor));
  });

  it('得令無法判定時拒絕給結論，不把「未知」當成「不得令」（SPEC-v2 #24）', () => {
    // 竄改月支成表外的值，模擬資料缺漏。
    const broken = JSON.parse(JSON.stringify(CASE_A));
    broken.pillars[1].pillar.branch.name = '？';
    const r = judgeStrength(broken);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('得令');
    expect(yongShen(broken).ok).toBe(false);
  });

  it('壞權重明確回報，不算出無意義的分數', () => {
    for (const bad of [Number.NaN, -10, Number.POSITIVE_INFINITY]) {
      const r = judgeStrength(CASE_A, { weights: { 得令: bad } });
      expect(r.ok, `權重 ${String(bad)} 應被拒絕`).toBe(false);
    }
  });
});
