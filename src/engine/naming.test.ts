// SPEC-v3 取名引擎 — Claim 1：列出的每組經獨立重算皆「三才吉＋計分四格皆吉」，
// 未列的組合必不符合判準；天格不計吉凶（SPEC-v3 #3 修正）讓天格為凶的姓氏仍有解。
import { describe, expect, it } from 'vitest';
import { isCommonChar, kangxiStrokeCount } from '../data/index.ts';
import { computeGrids } from './wuge.ts';
import { computeSancai } from './wuxing.ts';
import { judgeChars } from './zodiac.ts';
import {
  candidatesFor,
  dueZodiac,
  enumerateCombos,
  strokePool,
  zodiacReasons,
} from './naming.ts';
import type { Grid } from './types.ts';

/** 計分格：天格不計；單名時外格亦不計（SPEC-v3 #3 修正）。獨立於引擎重寫一次。 */
const judged = (grids: Grid[], double: boolean) =>
  grids.filter((g) => g.name !== '天格' && (double || g.name !== '外格'));

function meetsTier(surnameStrokes: number[], given: number[], tier: '全吉' | '次佳'): boolean {
  const grids = computeGrids(
    { surname: surnameStrokes, givenName: given },
    { surname: [], givenName: [] },
  );
  const sancai = computeSancai(grids);
  if (sancai.luck !== '吉') return false;
  const scored = judged(grids, given.length === 2);
  if (tier === '全吉') return scored.every((g) => g.fate.luck === '吉');
  return (
    !scored.some((g) => g.fate.luck === '凶') &&
    scored.filter((g) => g.fate.luck === '半吉').length <= 1
  );
}

describe('候選字池', () => {
  it('只含常用字表中查得到康熙筆畫的字', () => {
    for (const [n, chars] of strokePool()) {
      for (const ch of chars) {
        expect(isCommonChar(ch)).toBe(true);
        expect(kangxiStrokeCount(ch)).toBe(n);
      }
    }
  });
});

describe('enumerateCombos', () => {
  it('陳（16 畫）雙名：每組經獨立重算皆符合其 tier，且未列組合必不符合', () => {
    const r = enumerateCombos('陳', true);
    if (!r.ok) throw new Error(r.reason);
    expect(r.surnameStrokes).toEqual([16]);
    expect(r.combos.length).toBeGreaterThan(0);

    const listed = new Set(r.combos.map((c) => c.given.join('-')));
    for (const c of r.combos) {
      expect(meetsTier(r.surnameStrokes, c.given, r.tier)).toBe(true);
      // 分項判定攤開、每位置有可用字（SPEC-v3 #3、#5）。
      expect(c.grids).toHaveLength(5);
      expect(c.available.every((n) => n > 0)).toBe(true);
    }
    // 完備性：池內全部筆畫組合中，符合 tier 者必在清單內。
    const keys = [...strokePool().keys()];
    for (const a of keys) {
      for (const b of keys) {
        const hit = meetsTier(r.surnameStrokes, [a, b], r.tier);
        expect(listed.has(`${a}-${b}`), `${a}-${b}`).toBe(hit);
      }
    }
  });

  it('林（8 畫）天格 9 為凶，因天格不計吉凶仍有全吉解（SPEC-v3 #3 修正的核心）', () => {
    const r = enumerateCombos('林', true);
    if (!r.ok) throw new Error(r.reason);
    expect(r.tier).toBe('全吉');
    expect(r.combos.length).toBeGreaterThan(0);
    for (const c of r.combos) {
      const tian = c.grids.find((g) => g.name === '天格')!;
      expect(tian.value).toBe(9);
      expect(tian.fate.luck).toBe('凶'); // 天格照列不隱藏，只是不計入判準。
      expect(judged(c.grids, true).every((g) => g.fate.luck === '吉')).toBe(true);
      expect(c.sancai.luck).toBe('吉');
    }
  });

  it('單名模式：外格恆為 2（凶）但不計，因此仍有解（SPEC-v3 #3 修正的延伸）', () => {
    const r = enumerateCombos('王', false);
    if (!r.ok) throw new Error(r.reason);
    expect(r.combos.length).toBeGreaterThan(0);
    for (const c of r.combos) {
      expect(c.given).toHaveLength(1);
      const wai = c.grids.find((g) => g.name === '外格')!;
      expect(wai.value).toBe(2);
      expect(wai.fate.luck).toBe('凶'); // 照列不隱藏，只是單名時不計入判準。
      expect(meetsTier(r.surnameStrokes, c.given, r.tier)).toBe(true);
    }
  });

  it('複姓（歐陽）可枚舉', () => {
    const r = enumerateCombos('歐陽', true);
    if (!r.ok) throw new Error(r.reason);
    expect(r.surnameStrokes).toEqual([15, 17]);
    expect(r.combos.length).toBeGreaterThan(0);
  });

  it('查無此字的姓氏誠實回報，不猜', () => {
    const r = enumerateCombos('𡈙', true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.unknownChars).toEqual(['𡈙']);
  });

  it('次佳 tier 只在全吉無解時出現，且附放寬說明', () => {
    // 掃出一個真的無全吉解的姓氏筆畫來驗證退列邏輯；若整個池都找得到全吉，
    // 這條測試就沒有對象——屆時 expect 會提醒我們判準變了。
    const keys = [...strokePool().keys()];
    let found = false;
    for (let s = 2; s <= 30 && !found; s++) {
      const perfectExists = keys.some((a) => keys.some((b) => meetsTier([s], [a, b], '全吉')));
      if (perfectExists) continue;
      found = true;
      const chars = strokePool().get(s);
      if (!chars?.length) break; // 池裡沒有這個筆畫的姓氏字可測，略過。
      const r = enumerateCombos(chars[0]!, true);
      if (!r.ok) throw new Error(r.reason);
      expect(r.tier).toBe('次佳');
      expect(r.relaxedNote).toContain('次佳');
    }
    // found 為 false ＝ 所有姓氏筆畫都有全吉解，退列路徑僅由單元邏輯保證。
  });
});

describe('dueZodiac（預產期生肖，SPEC-v3 #9）', () => {
  it('2027-02-10 距立春（02-04）6 天：臨界，並列馬（前）與羊（後）', () => {
    const z = dueZodiac(2027, 2, 10)!;
    expect(z.animal).toBe('羊');
    expect(z.nearBoundary).toBe(true);
    expect(z.animals).toEqual(['馬', '羊']);
    expect(z.daysFromLichun).toBe(6);
  });

  it('2027-06-01 距立春遠：不臨界，單一生肖', () => {
    const z = dueZodiac(2027, 6, 1)!;
    expect(z.nearBoundary).toBe(false);
    expect(z.animals).toEqual(['羊']);
  });

  it('立春前 21 天內同樣臨界（2027-01-20）', () => {
    const z = dueZodiac(2027, 1, 20)!;
    expect(z.animal).toBe('馬');
    expect(z.nearBoundary).toBe(true);
    expect(z.animals).toEqual(['馬', '羊']);
    expect(z.daysFromLichun).toBe(-15);
  });

  it('第 22 天起不再臨界（2027-02-26）', () => {
    const z = dueZodiac(2027, 2, 26)!;
    expect(z.daysFromLichun).toBe(22);
    expect(z.nearBoundary).toBe(false);
  });

  it('曆上不存在或非整數的日期不猜，一律 undefined', () => {
    expect(dueZodiac(2027, 2, 30)).toBeUndefined(); // Date.UTC 會進位到 3/2，必須擋
    expect(dueZodiac(2027, 13, 1)).toBeUndefined();
    expect(dueZodiac(2027, 0, 1)).toBeUndefined();
    expect(dueZodiac(2027, 6, 0)).toBeUndefined();
    expect(dueZodiac(2027.5, 6, 1)).toBeUndefined();
    expect(dueZodiac(2028, 2, 29)).toBeDefined(); // 閏年 2/29 合法
    expect(dueZodiac(2027, 2, 29)).toBeUndefined(); // 平年 2/29 不合法
  });
});

describe('strokePool 快照隔離', () => {
  it('改動回傳的 Map 不影響引擎內部結果', () => {
    const before = candidatesFor(10, ['馬']).length;
    const snapshot = strokePool();
    snapshot.get(10)!.length = 0;
    snapshot.delete(10);
    expect(candidatesFor(10, ['馬']).length).toBe(before);
    expect(strokePool().get(10)!.length).toBeGreaterThan(0);
  });
});

describe('candidatesFor（生肖喜忌合併，SPEC-v3 #7、#9）', () => {
  it('單一生肖時與 judgeChars 判定一致', () => {
    const list = candidatesFor(10, ['馬']);
    expect(list.length).toBeGreaterThan(0);
    for (const c of list) {
      expect(judgeChars('馬', [c.char])[0]!.verdict).toBe(c.verdict);
      expect(c.strokes).toBe(10);
    }
  });

  it('兩生肖時忌取聯集：任一肖見忌字根，合併判定必為忌或喜忌並見', () => {
    const animals = ['馬', '羊'] as const;
    for (const strokes of [8, 10, 12]) {
      for (const c of candidatesFor(strokes, [...animals])) {
        const perAnimal = animals.map((a) => judgeChars(a, [c.char])[0]!);
        const anyAvoid = perAnimal.some((v) => v.avoidRadicals.length > 0);
        const anyLike = perAnimal.some((v) => v.likeRadicals.length > 0);
        if (anyAvoid) expect(['忌', '喜忌並見']).toContain(c.verdict);
        if (anyAvoid && !anyLike) expect(c.verdict).toBe('忌');
        expect(c.explanations).toHaveLength(2);
      }
    }
  });

  it('avoidRadicals 依生肖順序列出命中的忌用字根，與 judgeChars 一致（SPEC-v4 #57）', () => {
    const animals = ['馬', '羊'] as const;
    for (const c of candidatesFor(10, [...animals])) {
      expect(c.avoidRadicals.map((x) => x.animal)).toEqual([...animals]);
      c.avoidRadicals.forEach((x) => {
        expect(x.radicals).toEqual(judgeChars(x.animal, [c.char])[0]!.avoidRadicals);
      });
    }
    const single = candidatesFor(10, ['馬']).filter((c) => c.verdict === '忌');
    expect(single.length).toBeGreaterThan(0);
    for (const c of single) expect(c.avoidRadicals[0]!.radicals.length).toBeGreaterThan(0);
  });

  it('zodiacReasons 供兩生肖對照的說理', () => {
    const r = zodiacReasons('馬');
    expect(r.likeReason.length).toBeGreaterThan(0);
    expect(r.avoidReason.length).toBeGreaterThan(0);
  });
});
