// SPEC-v4 #2、#6、#8：分項標籤函式——摘要區與卡片共用。
import { describe, expect, it } from 'vitest';
import { kangxiStrokeCount } from '../data/index.ts';
import { baziChart } from '../bazi/chart.ts';
import { yongShen } from '../bazi/yongshen.ts';
import { analyse, judgeChars } from './index.ts';
import type { Analysis, NameInput } from './index.ts';
import { matchName } from './match.ts';
import { summaryTags } from './summary.ts';
import type { SummaryBazi, SummaryTag } from './summary.ts';

function analysisOf(surname: string, givenName: string, birth: NameInput['birth']): Analysis {
  const r = analyse({ surname, givenName, birth });
  if (!r.ok) throw new Error(r.reason);
  return r;
}

/** 以一個真實時間排盤 → 用神 → 姓名匹配，組出摘要函式要吃的八字結果。 */
function baziOf(chars: string[], dt: { year: number; month: number; day: number; hour: number; minute: number }): SummaryBazi {
  const chart = baziChart(dt);
  if (!chart.ok) throw new Error(chart.reason);
  const ys = yongShen(chart);
  if (!ys.ok) throw new Error(ys.reason);
  return { yongShen: ys, match: matchName(chars, ys.favor, ys.avoid) };
}

/** 變相總分的樣子：「3 項吉」「2個凶」之類。 */
const COUNTING = /\d+\s*[項個]\s*[吉凶]/;

function expectNoCounting(tags: SummaryTag[]): void {
  const text = tags.map((t) => `${t.group} ${t.label} ${t.verdict}`).join('\n');
  expect(text).not.toMatch(COUNTING);
  expect(text).not.toMatch(/總分|合計|共\s*\d/);
}

describe('summaryTags', () => {
  it('有時辰：三才、五格五個、逐字生肖、用神與逐字匹配，依序且原樣取自引擎', () => {
    const dt = { year: 1998, month: 6, day: 10, hour: 10, minute: 0 };
    const a = analysisOf('王', '小明', dt);
    const bazi = baziOf(['王', '小', '明'], dt);
    const tags = summaryTags(a, bazi);

    expect(tags.map((t) => t.group)).toEqual([
      '三才',
      '五格', '五格', '五格', '五格', '五格',
      '生肖', '生肖', '生肖',
      '八字', '八字', '八字', '八字',
    ]);

    expect(tags[0]).toEqual({
      group: '三才',
      label: '三才',
      verdict: a.sancai.luck,
      tone: a.sancai.luck === '吉' ? 'good' : a.sancai.luck === '凶' ? 'bad' : 'neutral',
    });

    const grids = tags.filter((t) => t.group === '五格');
    expect(grids.map((t) => t.label)).toEqual(['天格', '人格', '地格', '外格', '總格']);
    grids.forEach((t, i) => {
      const g = a.grids[i]!;
      expect(t.verdict).toBe(`${g.value} ${g.fate.luck}`);
    });

    const zodiac = tags.filter((t) => t.group === '生肖');
    expect(zodiac.map((t) => [t.label, t.verdict])).toEqual(
      a.zodiac.chars.map((c) => [c.char, c.verdict]),
    );

    const bz = tags.filter((t) => t.group === '八字');
    expect(bz[0]).toMatchObject({ label: '用神', verdict: bazi.yongShen.favor.join('、') });
    expect(bz.slice(1).map((t) => [t.label, t.verdict])).toEqual(
      bazi.match.chars.map((c) => [c.char, c.verdict]),
    );

    expectNoCounting(tags);
  });

  it('無時辰：沒有任何八字標籤（SPEC-v4 #3）', () => {
    const a = analysisOf('王', '小明', { year: 1998, month: 6, day: 10 });
    const tags = summaryTags(a);
    expect(tags.some((t) => t.group === '八字')).toBe(false);
    expect(tags.some((t) => t.label === '用神')).toBe(false);
    expect(tags).toHaveLength(1 + 5 + 3);
    expectNoCounting(tags);
  });

  it('立春當日未定：據實列出兩個生肖，不選一個（SPEC-v4 #6）', () => {
    const a = analysisOf('王', '小明', { year: 1985, month: 2, day: 4 });
    expect(a.zodiac.boundaryAmbiguous).toBe(true);
    const tags = summaryTags(a);
    const undecided = tags.filter((t) => t.label === '生肖未定');
    expect(undecided).toEqual([
      { group: '生肖', label: '生肖未定', verdict: '牛 或 鼠', tone: 'unknown' },
    ]);
    // 字根喜忌兩個生肖都列、各自標明，不偷偷只用其中一個（Codex review 指出的缺口）。
    const chars = ['王', '小', '明'];
    const ox = judgeChars('牛', chars);
    const rat = judgeChars('鼠', chars);
    const zodiac = tags.filter((t) => t.group === '生肖' && t.label !== '生肖未定');
    expect(zodiac.map((t) => [t.label, t.verdict])).toEqual([
      ...ox.map((c) => [`${c.char}（牛）`, c.verdict]),
      ...rat.map((c) => [`${c.char}（鼠）`, c.verdict]),
    ]);
    // 這個案例必須真的有分歧，否則上面的斷言驗不出「只列一個生肖」的缺陷。
    expect(ox[0]!.verdict).not.toBe(rat[0]!.verdict);
    expect(zodiac.some((t) => t.label === '王')).toBe(false);
    // 非未定的日子不出這個標籤。
    const plain = summaryTags(analysisOf('王', '小明', { year: 1985, month: 6, day: 4 }));
    expect(plain.some((t) => t.label === '生肖未定')).toBe(false);
    expectNoCounting(tags);
  });

  it('含查無五行字：該字標「五行不明」、語氣 unknown，不猜', () => {
    // 釘：上游兩說（火／金），逐字五行資料不選邊；康熙筆畫則查得到，所以能分析。
    expect(kangxiStrokeCount('釘')).toBeDefined();
    const dt = { year: 1998, month: 6, day: 10, hour: 10, minute: 0 };
    const a = analysisOf('王', '釘', dt);
    const tags = summaryTags(a, baziOf(['王', '釘'], dt));
    const ding = tags.filter((t) => t.group === '八字' && t.label === '釘');
    expect(ding).toEqual([{ group: '八字', label: '釘', verdict: '五行不明', tone: 'unknown' }]);
    expectNoCounting(tags);
  });

  it('喜用被全部取消時照實標「喜用為空」', () => {
    const a = analysisOf('王', '小明', { year: 1998, month: 6, day: 10 });
    const tags = summaryTags(a, { yongShen: { favor: [] }, match: { chars: [] } });
    expect(tags.filter((t) => t.group === '八字')).toEqual([
      { group: '八字', label: '用神', verdict: '喜用為空', tone: 'unknown' },
    ]);
  });

  it('純函式：同輸入同輸出', () => {
    const dt = { year: 2024, month: 3, day: 15, hour: 10, minute: 30 };
    const a = analysisOf('王', '小明', dt);
    const bazi = baziOf(['王', '小', '明'], dt);
    expect(summaryTags(a, bazi)).toEqual(summaryTags(a, bazi));
  });

  it('計數偵測本身會抓到變相總分的字串（守衛的變異對照）', () => {
    expect('3 項吉').toMatch(COUNTING);
    expect('2個凶').toMatch(COUNTING);
    expect('24 吉').not.toMatch(COUNTING);
  });
});
