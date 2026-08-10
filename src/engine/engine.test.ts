import { describe, expect, it } from 'vitest';
import { fateOf, kangxiStrokeCount, lichunOf } from '../data/index.ts';
import { analyse, computeGrids, computeSancai, computeWuxing, judgeChars, zodiacOf } from './index.ts';

describe('康熙筆畫', () => {
  // 康熙字典筆畫，非現代筆畫。江/花/陳/郭/胡 的現代筆畫分別是 6/7/10/10/9，
  // 若這些 case 退回現代值，代表資料層誤用了 Unihan kTotalStrokes。
  it.each([
    ['江', 7], ['花', 10], ['陳', 16], ['郭', 15], ['胡', 11],
    ['王', 4], ['小', 3], ['明', 8], ['李', 7], ['張', 11],
    ['歐', 15], ['陽', 17], ['蘇', 22], ['鄭', 19], ['謝', 17],
  ])('%s = %i 畫', (ch, want) => {
    expect(kangxiStrokeCount(ch)).toBe(want);
  });

  it('數目字以其數值為筆畫數', () => {
    expect(kangxiStrokeCount('四')).toBe(4); // 實際寫作 5 畫
    expect(kangxiStrokeCount('五')).toBe(5); // 實際寫作 4 畫
    expect(kangxiStrokeCount('七')).toBe(7); // 實際寫作 2 畫
    expect(kangxiStrokeCount('十')).toBe(10);
  });

  it('字典未收錄的字回傳 undefined，不猜', () => {
    expect(kangxiStrokeCount('A')).toBeUndefined();
    expect(kangxiStrokeCount('あ')).toBeUndefined();
  });
});

describe('五格（假1 規則）', () => {
  const grid = (gs: ReturnType<typeof computeGrids>, name: string) =>
    gs.find((g) => g.name === name)!.value;

  it('單姓＋雙名：王(4) 小(3) 明(8)', () => {
    const gs = computeGrids(
      { surname: [4], givenName: [3, 8] },
      { surname: ['王'], givenName: ['小', '明'] },
    );
    expect(grid(gs, '天格')).toBe(5);  // 4 + 假1
    expect(grid(gs, '人格')).toBe(7);  // 4 + 3
    expect(grid(gs, '地格')).toBe(11); // 3 + 8
    expect(grid(gs, '外格')).toBe(9);  // 假1 + 8
    expect(grid(gs, '總格')).toBe(15); // 4 + 3 + 8，不含假1
  });

  it('單姓＋單名：外格為假1＋假1＝2', () => {
    const gs = computeGrids(
      { surname: [4], givenName: [8] },
      { surname: ['王'], givenName: ['明'] },
    );
    expect(grid(gs, '天格')).toBe(5);
    expect(grid(gs, '人格')).toBe(12);
    expect(grid(gs, '地格')).toBe(9); // 8 + 假1
    expect(grid(gs, '外格')).toBe(2);
    expect(grid(gs, '總格')).toBe(12);
  });

  // 來源交叉案例（tianjige.club）：司馬懿 司5 馬10 懿22
  it('複姓＋單名：司(5) 馬(10) 懿(22)', () => {
    const gs = computeGrids(
      { surname: [5, 10], givenName: [22] },
      { surname: ['司', '馬'], givenName: ['懿'] },
    );
    expect(grid(gs, '天格')).toBe(15); // 5 + 10，複姓不加假1
    expect(grid(gs, '人格')).toBe(32); // 10 + 22
    expect(grid(gs, '地格')).toBe(23); // 22 + 假1
    expect(grid(gs, '外格')).toBe(6);  // 5 + 假1
    expect(grid(gs, '總格')).toBe(37);
  });

  it('複姓＋雙名：外格為姓首字＋名末字，不含假1', () => {
    const gs = computeGrids(
      { surname: [15, 17], givenName: [3, 8] },
      { surname: ['歐', '陽'], givenName: ['小', '明'] },
    );
    expect(grid(gs, '天格')).toBe(32);
    expect(grid(gs, '人格')).toBe(20);
    expect(grid(gs, '地格')).toBe(11);
    expect(grid(gs, '外格')).toBe(23); // 15 + 8
    expect(grid(gs, '總格')).toBe(43);
  });

  it('每格都帶 81 數理與五行', () => {
    const gs = computeGrids({ surname: [4], givenName: [3, 8] }, { surname: ['王'], givenName: ['小', '明'] });
    const tian = gs.find((g) => g.name === '天格')!;
    expect(tian.value).toBe(5);
    expect(tian.element).toBe('土');       // 尾數 5 → 土
    expect(tian.fate.title).toBe('五行之數');
    expect(tian.fate.luck).toBe('吉');
    expect(tian.formula).toBe('王(4) ＋ 假1');

    const zong = gs.find((g) => g.name === '總格')!;
    expect(zong.value).toBe(15);
    expect(zong.element).toBe('土');
    expect(zong.fate.title).toBe('福壽');
  });
});

describe('81 數理', () => {
  it('1 至 81 每個數字都有吉凶與標題', () => {
    for (let n = 1; n <= 81; n++) {
      const f = fateOf(n)!;
      expect(f, `第 ${n} 數`).toBeDefined();
      expect(['吉', '半吉', '凶']).toContain(f.luck);
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.text.length).toBeGreaterThan(0);
    }
  });

  it('超過 81 者減 80 論之', () => {
    expect(fateOf(82)).toEqual(fateOf(2));
    expect(fateOf(100)).toEqual(fateOf(20));
    expect(fateOf(161)).toEqual(fateOf(81)); // 161 - 80 = 81，不必再減
    expect(fateOf(162)).toEqual(fateOf(2));  // 162 - 80 - 80 = 2
  });

  it('複姓＋雙名使總格超過 81 時仍有數理', () => {
    // 歐(15) 陽(17) ＋ 兩個 30 畫字 = 92 -> 12
    const gs = computeGrids(
      { surname: [15, 17], givenName: [30, 30] },
      { surname: ['歐', '陽'], givenName: ['a', 'b'] },
    );
    const zong = gs.find((g) => g.name === '總格')!;
    expect(zong.value).toBe(92);
    expect(zong.fate).toEqual(fateOf(12));
    expect(zong.fate.title).toBe('掘井無泉');
  });
});

describe('三才', () => {
  it('上下相生為吉', () => {
    // 天格 3(火) 人格 5(土) 地格 7(金)：火生土、土生金
    const gs = computeGrids({ surname: [2], givenName: [3, 4] }, { surname: ['a'], givenName: ['b', 'c'] });
    const sancai = computeSancai(gs);
    expect(sancai.elements).toEqual(['火', '土', '金']);
    expect(sancai.luck).toBe('吉');
  });

  it('上下俱剋為凶', () => {
    // 天格 1(木) 人格 5(土) 地格 9(水)：木剋土、土剋水
    const gs = computeGrids({ surname: [0], givenName: [5, 4] }, { surname: ['a'], givenName: ['b', 'c'] });
    expect(computeSancai(gs).elements).toEqual(['木', '土', '水']);
    expect(computeSancai(gs).luck).toBe('凶');
  });
});

describe('立春分界換算生肖', () => {
  it('立春時刻表落在 2 月且在 2/3–2/5 之間', () => {
    for (const y of [1900, 1985, 2000, 2024, 2025, 2026, 2100]) {
      const l = lichunOf(y)!;
      expect(l.month).toBe(2);
      expect(l.day).toBeGreaterThanOrEqual(3);
      expect(l.day).toBeLessThanOrEqual(5);
    }
  });

  it('1985 年立春為 2/4，之前算 1984 甲子鼠年', () => {
    expect(lichunOf(1985)).toMatchObject({ month: 2, day: 4 });
    expect(zodiacOf(1985, 1, 20)!.animal).toBe('鼠');
    expect(zodiacOf(1985, 2, 3)!.animal).toBe('鼠');
    expect(zodiacOf(1985, 2, 5)!.animal).toBe('牛');
    expect(zodiacOf(1985, 12, 31)!.animal).toBe('牛');
  });

  it('生於立春當日：只有日期無時辰時據實回報無法定案', () => {
    const r = zodiacOf(1985, 2, 4)!;
    expect(r.boundaryAmbiguous).toBe(true);
    expect(r.animal).toBe('牛');
    expect(r.alternativeAnimal).toBe('鼠');
  });

  it('地支錨點正確（西元 4 年甲子）', () => {
    expect(zodiacOf(2020, 6, 1)!.branch).toBe('子');
    expect(zodiacOf(2024, 6, 1)!.branch).toBe('辰');
    expect(zodiacOf(2024, 6, 1)!.animal).toBe('龍');
  });

  it('超出立春資料範圍回傳 undefined', () => {
    expect(zodiacOf(1899, 6, 1)).toBeUndefined();
    expect(zodiacOf(2101, 6, 1)).toBeUndefined();
  });
});

describe('生肖字根喜忌', () => {
  it('鼠喜宀（洞穴）', () => {
    const [v] = judgeChars('鼠', ['安']);
    expect(v!.verdict).toBe('喜');
    expect(v!.likeRadicals).toContain('宀');
    expect(v!.explanation).toContain('宀');
  });

  it('鼠忌午馬', () => {
    const [v] = judgeChars('鼠', ['駿']);
    expect(v!.avoidRadicals).toContain('馬');
    expect(v!.verdict).toBe('忌');
  });

  it('氵 視為 水 字根（虎喜水）', () => {
    const [v] = judgeChars('虎', ['淋']);
    expect(v!.likeRadicals).toContain('水');
  });

  it('同字兼具喜忌時據實回報「喜忌並見」', () => {
    // 鼠喜「宀」；「日」為鼠之忌用。「宴」＝宀＋日＋女。
    const [v] = judgeChars('鼠', ['宴']);
    expect(v!.likeRadicals).toContain('宀');
    expect(v!.avoidRadicals).toContain('日');
    expect(v!.verdict).toBe('喜忌並見');
  });

  it('無命中字根者為中性，不亂編理由', () => {
    const [v] = judgeChars('鼠', ['乙']);
    expect(v!.verdict).toBe('中性');
    expect(v!.explanation).toContain('中性');
  });
});

describe('五行分佈', () => {
  it('依各字筆畫尾數配五行', () => {
    const r = computeWuxing([
      { char: '王', strokes: 4 },  // 尾數 4 → 火
      { char: '小', strokes: 3 },  // 尾數 3 → 火
      { char: '明', strokes: 8 },  // 尾數 8 → 金
    ]);
    expect(r.chars.map((c) => c.element)).toEqual(['火', '火', '金']);
    expect(r.distribution).toEqual({ 木: 0, 火: 2, 土: 0, 金: 1, 水: 0 });
    expect(r.missing).toEqual(['木', '土', '水']);
    expect(r.relations).toHaveLength(2);
  });
});

describe('analyse（端到端）', () => {
  it('王小明 1985-01-20：五格、三才、生肖、五行齊備', () => {
    const r = analyse({ surname: '王', givenName: '小明', birth: { year: 1985, month: 1, day: 20 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.strokes.map((s) => s.strokes)).toEqual([4, 3, 8]);
    expect(r.grids.map((g) => g.value)).toEqual([5, 7, 11, 9, 15]);
    expect(r.sancai.elements).toEqual(['土', '金', '木']);
    expect(r.zodiac.animal).toBe('鼠'); // 立春前，算前一年
    expect(r.zodiac.chars).toHaveLength(3);
    expect(r.wuxing.chars).toHaveLength(3);
  });

  it('不合成單一總分（SPEC 第 6 條）', () => {
    const r = analyse({ surname: '王', givenName: '小明', birth: { year: 1985, month: 1, day: 20 } });
    expect(r.ok).toBe(true);
    expect(Object.keys(r)).not.toContain('score');
    expect(Object.keys(r)).not.toContain('totalScore');
  });

  it('罕字明確回報查無此字，不產出結果（SPEC 第 7 條）', () => {
    const r = analyse({ surname: '王', givenName: '小\u{2A6D6}', birth: { year: 2000, month: 6, day: 1 } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('查無此字');
    expect(r.unknownChars).toEqual(['\u{2A6D6}']);
  });

  it('非中文字擋下', () => {
    const r = analyse({ surname: 'Wang', givenName: '小明', birth: { year: 2000, month: 6, day: 1 } });
    expect(r.ok).toBe(false);
  });

  it('姓名長度超出範圍擋下', () => {
    expect(analyse({ surname: '諸葛孔', givenName: '明', birth: { year: 2000, month: 6, day: 1 } }).ok).toBe(false);
    expect(analyse({ surname: '王', givenName: '小明明', birth: { year: 2000, month: 6, day: 1 } }).ok).toBe(false);
  });

  it('不存在的日期擋下', () => {
    const r = analyse({ surname: '王', givenName: '小明', birth: { year: 2001, month: 2, day: 30 } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('不存在');
  });
});
