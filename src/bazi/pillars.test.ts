import { describe, expect, it } from 'vitest';
import { BRANCHES, STEMS, WU_HU_DUN, WU_SHU_DUN } from '../data/index.ts';
import { dayPillar, fourPillars, hourBranchIndex, julianDayNumber } from './pillars.ts';

/** 只在 ok 時取值，失敗時直接讓測試爆出原因。 */
function chart(dt: Parameters<typeof fourPillars>[0], opts?: Parameters<typeof fourPillars>[1]) {
  const r = fourPillars(dt, opts);
  if (!r.ok) throw new Error(`fourPillars 失敗：${r.reason}`);
  return r;
}
const names = (r: ReturnType<typeof chart>) =>
  [r.year.name, r.month.name, r.day.name, r.hour.name].join(' ');

describe('干支基礎表', () => {
  it('十天干的五行與陰陽（zh.wikipedia.org/wiki/天干）', () => {
    expect(STEMS.map((s) => s.name).join('')).toBe('甲乙丙丁戊己庚辛壬癸');
    // 甲乙木、丙丁火、戊己土、庚辛金、壬癸水
    expect(STEMS.map((s) => s.element).join('')).toBe('木木火火土土金金水水');
    // 甲丙戊庚壬屬陽，乙丁己辛癸屬陰
    expect(STEMS.filter((s) => !s.yin).map((s) => s.name).join('')).toBe('甲丙戊庚壬');
    expect(STEMS.filter((s) => s.yin).map((s) => s.name).join('')).toBe('乙丁己辛癸');
  });

  it('十二地支的五行與陰陽（zh.wikipedia.org/wiki/地支）', () => {
    expect(BRANCHES.map((b) => b.name).join('')).toBe('子丑寅卯辰巳午未申酉戌亥');
    expect(BRANCHES.map((b) => b.element).join('')).toBe('水土木木土火火土金金土水');
    expect(BRANCHES.filter((b) => !b.yin).map((b) => b.name).join('')).toBe('子寅辰午申戌');
  });
});

describe('日柱（中央氣象署 (JDN−10) mod 60）', () => {
  // 中央氣象署《天文年曆》公布的算例，逐年版各一筆。
  it.each([
    [2025, 10, 10, 2460959, '壬子'],
    [2023, 10, 10, 2460228, '辛丑'],
    [2016, 10, 10, 2457672, '乙丑'],
  ])('%i-%i-%i 儒略日序 %i -> %s', (y, m, d, jdn, want) => {
    expect(julianDayNumber(y, m, d)).toBe(jdn);
    expect(dayPillar(y, m, d).name).toBe(want);
  });

  it('連續日期的日柱以六十甲子循環遞進', () => {
    const seq = Array.from({ length: 61 }, (_, i) => dayPillar(2025, 10, 10 + i).name);
    expect(seq[60]).toBe(seq[0]); // 六十日一循環
    expect(new Set(seq.slice(0, 60)).size).toBe(60); // 一輪內不重複
  });
});

describe('時支', () => {
  it('子時涵蓋 23:00–00:59，其後每兩小時一支', () => {
    expect(hourBranchIndex(23)).toBe(0); // 子
    expect(hourBranchIndex(0)).toBe(0);
    expect(hourBranchIndex(1)).toBe(1); // 丑
    expect(hourBranchIndex(12)).toBe(6); // 午
    expect(hourBranchIndex(13)).toBe(7); // 未
    expect(hourBranchIndex(22)).toBe(11); // 亥
  });
});

describe('四柱：對照有出處的命例（docs/v2-sources.md 第 9、10 節）', () => {
  it('1998-06-10 10:00 -> 戊寅 戊午 戊子 丁巳', () => {
    const r = chart({ year: 1998, month: 6, day: 10, hour: 10, minute: 0 });
    expect(names(r)).toBe('戊寅 戊午 戊子 丁巳');
    expect(r.dayMaster.name).toBe('戊');
    expect(r.jie.name).toBe('芒種'); // 6/10 在芒種之後、小暑之前 -> 午月
  });

  it('1994-07-30 13:37 -> 甲戌 辛未 丁巳 丁未', () => {
    const r = chart({ year: 1994, month: 7, day: 30, hour: 13, minute: 37 });
    expect(names(r)).toBe('甲戌 辛未 丁巳 丁未');
    expect(r.dayMaster.name).toBe('丁');
    expect(r.jie.name).toBe('小暑'); // 7/30 在小暑之後、立秋之前 -> 未月
  });
});

describe('年柱以立春為界', () => {
  it('立春前算前一個干支年', () => {
    // 1985 立春 2/4 05:13
    const before = chart({ year: 1985, month: 1, day: 20, hour: 12, minute: 0 });
    const after = chart({ year: 1985, month: 2, day: 5, hour: 12, minute: 0 });
    expect(before.solarYear).toBe(1984);
    expect(before.year.branch.name).toBe('子'); // 1984 甲子年
    expect(after.solarYear).toBe(1985);
    expect(after.year.branch.name).toBe('丑'); // 1985 乙丑年
  });

  it('立春當天的時刻也分界，不是整天算同一年', () => {
    // 1985 立春 2/4 05:13 -> 04:00 仍屬前一年，06:00 已換年
    expect(chart({ year: 1985, month: 2, day: 4, hour: 4, minute: 0 }).solarYear).toBe(1984);
    expect(chart({ year: 1985, month: 2, day: 4, hour: 6, minute: 0 }).solarYear).toBe(1985);
  });
});

describe('月柱依節換柱（非農曆月）', () => {
  it('交節前後換月支：1985 驚蟄 3/5 22:16 前為寅月、後為卯月', () => {
    const before = chart({ year: 1985, month: 3, day: 5, hour: 6, minute: 0 });
    const after = chart({ year: 1985, month: 3, day: 6, hour: 6, minute: 0 });
    expect(before.month.branch.name).toBe('寅');
    expect(after.month.branch.name).toBe('卯');
    expect(before.month.name).not.toBe(after.month.name);
  });

  it('小寒之前仍屬前一年大雪起的子月', () => {
    const r = chart({ year: 2025, month: 1, day: 2, hour: 12, minute: 0 });
    expect(r.jie.name).toBe('大雪');
    expect(r.month.branch.name).toBe('子');
  });

  it('十二個節各自對應的月支正確', () => {
    // 每個月取該月最後一天正午，必落在當月的節之後
    const expected = ['丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子'];
    const lastDay = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (let m = 1; m <= 12; m++) {
      const r = chart({ year: 2025, month: m, day: lastDay[m - 1]!, hour: 12, minute: 0 });
      expect(r.month.branch.name, `2025-${m}`).toBe(expected[m - 1]);
    }
  });

  it('月干由年干以五虎遁推得：甲年寅月為丙寅', () => {
    // 1994 甲戌年，立春後的寅月
    const r = chart({ year: 1994, month: 2, day: 20, hour: 12, minute: 0 });
    expect(r.year.stem.name).toBe('甲');
    expect(r.month.name).toBe('丙寅');
  });
});

describe('早晚子時（SPEC-v2 #12）', () => {
  const dt = { year: 2025, month: 10, day: 10, hour: 23, minute: 30 };

  it('預設 23:00 換日柱', () => {
    const r = chart(dt);
    expect(r.lateZi).toBe(true);
    expect(r.day.name).toBe(dayPillar(2025, 10, 11).name); // 進位到 10/11
    expect(r.hour.branch.name).toBe('子');
  });

  it('切換成夜子時則日柱不進位', () => {
    const r = chart(dt, { lateZiSwitchesDay: false });
    expect(r.day.name).toBe(dayPillar(2025, 10, 10).name);
    expect(r.hour.branch.name).toBe('子');
  });

  it('兩派得到不同日柱與時柱 —— 這正是需要標示衝突的原因', () => {
    const a = chart(dt);
    const b = chart(dt, { lateZiSwitchesDay: false });
    expect(a.day.name).not.toBe(b.day.name);
    expect(a.hour.name).not.toBe(b.hour.name); // 時干隨日干變
  });

  it('22:59 與 23:00 才是分界，22 時不受影響', () => {
    const r = chart({ ...dt, hour: 22 });
    expect(r.lateZi).toBe(false);
    expect(r.day.name).toBe(dayPillar(2025, 10, 10).name);
  });
});

describe('月干由年干推得（五虎遁），跨年的子月丑月也要對', () => {
  it('甲年的十二個月干依序為丙丁戊己庚辛壬癸甲乙丙丁', () => {
    // 1994 甲戌年。取立春後每個節之後幾天，走完寅→丑十二個月。
    const expected = [
      ['寅', '丙寅'], ['卯', '丁卯'], ['辰', '戊辰'], ['巳', '己巳'],
      ['午', '庚午'], ['未', '辛未'], ['申', '壬申'], ['酉', '癸酉'],
      ['戌', '甲戌'], ['亥', '乙亥'], ['子', '丙子'],
    ] as const;
    const monthOf = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    expected.forEach(([branch, pillar], i) => {
      const r = chart({ year: 1994, month: monthOf[i]!, day: 20, hour: 12, minute: 0 });
      expect(r.month.branch.name, `${monthOf[i]} 月`).toBe(branch);
      expect(r.month.name, `${monthOf[i]} 月`).toBe(pillar);
    });
    // 丑月落在隔年 1 月，但年柱仍是甲戌（立春未到）
    const chou = chart({ year: 1995, month: 1, day: 20, hour: 12, minute: 0 });
    expect(chou.year.name).toBe('甲戌');
    expect(chou.month.name).toBe('丁丑');
  });

  it('小寒之前的子月，年干取的是立春分界後的干支年', () => {
    // 2025-01-02 在 2025 立春之前 -> 干支年為 2024 甲辰；甲年子月為丙子
    const r = chart({ year: 2025, month: 1, day: 2, hour: 12, minute: 0 });
    expect(r.solarYear).toBe(2024);
    expect(r.year.name).toBe('甲辰');
    expect(r.month.name).toBe('丙子');
  });
});

describe('早晚子時只影響日柱，年月柱刻意不進位', () => {
  it('交節當晚 23 時出生，月柱不因日柱進位而跨月', () => {
    // 1985 驚蟄 3/5 22:16。3/5 23:30 已過驚蟄 -> 卯月；
    // 日柱進位到 3/6，但月柱必須仍由 3/5 23:30 這個實際時刻決定。
    const r = chart({ year: 1985, month: 3, day: 5, hour: 23, minute: 30 });
    expect(r.month.branch.name).toBe('卯');
    expect(r.day.name).toBe(dayPillar(1985, 3, 6).name);
  });

  it('月底 23 時出生，日柱正確進位到次月一日', () => {
    const r = chart({ year: 2025, month: 1, day: 31, hour: 23, minute: 10 });
    expect(r.day.name).toBe(dayPillar(2025, 2, 1).name);
  });

  it('年底 23 時出生，日柱正確進位到隔年元旦', () => {
    const r = chart({ year: 2024, month: 12, day: 31, hour: 23, minute: 10 });
    expect(r.day.name).toBe(dayPillar(2025, 1, 1).name);
  });

  it('閏年 2/28 23 時出生，日柱進位到 2/29 而非 3/1', () => {
    const r = chart({ year: 2024, month: 2, day: 28, hour: 23, minute: 10 });
    expect(r.day.name).toBe(dayPillar(2024, 2, 29).name);
  });
});

describe('五虎遁／五鼠遁：十個天干逐筆釘住（《神峰通考·起八字訣》）', () => {
  // 之前只有甲、戊年干被命例覆蓋，改錯其餘八個仍可能全綠 —— 這裡逐筆對照原文。
  it.each([
    ['甲', '丙'], ['己', '丙'], ['乙', '戊'], ['庚', '戊'], ['丙', '庚'],
    ['辛', '庚'], ['丁', '壬'], ['壬', '壬'], ['戊', '甲'], ['癸', '甲'],
  ])('五虎遁：%s 年的寅月天干為 %s', (yearStem, want) => {
    expect(WU_HU_DUN[yearStem]).toBe(want);
  });

  it.each([
    ['甲', '甲'], ['己', '甲'], ['乙', '丙'], ['庚', '丙'], ['丙', '戊'],
    ['辛', '戊'], ['丁', '庚'], ['壬', '庚'], ['戊', '壬'], ['癸', '壬'],
  ])('五鼠遁：%s 日的子時天干為 %s', (dayStem, want) => {
    expect(WU_SHU_DUN[dayStem]).toBe(want);
  });

  it('十個年干各自推出的寅月月柱都正確', () => {
    // 逐年取立春後的寅月，涵蓋十個年干（1984 甲子 起連續十年）
    const want = ['丙寅', '戊寅', '庚寅', '壬寅', '甲寅', '丙寅', '戊寅', '庚寅', '壬寅', '甲寅'];
    for (let i = 0; i < 10; i++) {
      const y = 1984 + i;
      const r = chart({ year: y, month: 2, day: 20, hour: 12, minute: 0 });
      expect(r.month.name, `${y} 年（年干 ${r.year.stem.name}）`).toBe(want[i]);
    }
  });

  it('十個日干各自推出的子時時柱都正確', () => {
    // 連續十天，日干依序走完十天干
    const start = { year: 2025, month: 10, day: 10 };
    for (let i = 0; i < 10; i++) {
      const r = chart({ ...start, day: start.day + i, hour: 0, minute: 30 });
      const expectedStem = WU_SHU_DUN[r.day.stem.name];
      expect(r.hour.name, `日干 ${r.day.stem.name}`).toBe(`${expectedStem}子`);
    }
  });
});

describe('無法判定時明確回報，不猜（SPEC-v2 #24）', () => {
  it.each([
    [{ year: 1899, month: 6, day: 1, hour: 12, minute: 0 }, '節氣資料範圍'],
    [{ year: 2101, month: 6, day: 1, hour: 12, minute: 0 }, '節氣資料範圍'],
    [{ year: 2000, month: 13, day: 1, hour: 12, minute: 0 }, '月份'],
    [{ year: 2000, month: 2, day: 30, hour: 12, minute: 0 }, '不存在'],
    [{ year: 2000, month: 6, day: 1, hour: 24, minute: 0 }, '時不正確'],
    [{ year: 2000, month: 6, day: 1, hour: 12, minute: 60 }, '分不正確'],
  ])('%o -> 回報「%s」', (dt, fragment) => {
    const r = fourPillars(dt);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain(fragment);
  });
});
