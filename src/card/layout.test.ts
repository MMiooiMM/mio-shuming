// SPEC-v4 #2、#3、#4、#6：分析卡片版面模型。
import { describe, expect, it } from 'vitest';
import { baziChart } from '../bazi/chart.ts';
import { yongShen } from '../bazi/yongshen.ts';
import { analyse } from '../engine/index.ts';
import type { Analysis, NameInput } from '../engine/index.ts';
import { matchName } from '../engine/match.ts';
import { summaryTags } from '../engine/summary.ts';
import { CARD_FOOTER, CARD_HEIGHT, CARD_WIDTH, cardLayout, cardText, cardZodiacOf } from './layout.ts';
import type { CardDate, CardInput } from './layout.ts';

function analysisOf(surname: string, givenName: string, birth: NameInput['birth']): Analysis {
  const r = analyse({ surname, givenName, birth });
  if (!r.ok) throw new Error(r.reason);
  return r;
}

/** 「王小明 2024-03-15 10:30 臺北市」——與 SPEC-v4 全域驗證腳本同一組輸入。 */
function wangXiaoMingWithTime(): CardInput {
  const dt = { year: 2024, month: 3, day: 15, hour: 10, minute: 30 };
  const a = analysisOf('王', '小明', dt);
  const chart = baziChart(dt);
  if (!chart.ok) throw new Error(chart.reason);
  const ys = yongShen(chart);
  if (!ys.ok) throw new Error(ys.reason);
  const match = matchName(['王', '小', '明'], ys.favor, ys.avoid);
  // 故意把時分與出生地塞進去（繞過型別），確認版面模型不會帶上卡片。
  const leaky = {
    name: '王小明',
    birth: { ...dt } as CardDate,
    place: '臺北市',
    county: '臺北市',
    zodiac: cardZodiacOf(a.zodiac),
    pillars: chart.pillars.map((p) => p.pillar.name),
    tags: summaryTags(a, { yongShen: ys, match }),
  };
  return leaky as CardInput;
}

describe('cardLayout', () => {
  it('有時辰：含姓名、年月日、生肖、四柱與全部分項標籤；不含時分、出生地', () => {
    const input = wangXiaoMingWithTime();
    const layout = cardLayout(input);
    const text = cardText(layout);

    expect(layout.width).toBe(CARD_WIDTH);
    expect(layout.height).toBe(CARD_HEIGHT);
    expect(CARD_WIDTH).toBe(1080);
    expect(CARD_HEIGHT).toBe(1350);

    expect(text).toContain('王小明');
    expect(text).toContain('2024 年 3 月 15 日');
    expect(text).toContain(`生肖 ${input.zodiac.animal}`);
    for (const p of input.pillars!) expect(text).toContain(p);

    // 時分與地名（SPEC-v4 #3）
    expect(text).not.toMatch(/10\s*[:：時點]\s*30/);
    expect(text).not.toMatch(/10\s*時|30\s*分/);
    expect(text).not.toMatch(/臺北|台北/);
    expect(JSON.stringify(layout)).not.toMatch(/臺北|"hour"|"minute"|"place"|"county"/);

    // 標籤原樣來自 summaryTags，順序不變、不增不減（SPEC-v4 #8）。
    expect(layout.groups.flatMap((g) => g.tags.map((t) => ({ group: g.group, ...t })))).toEqual(input.tags);
    expect(layout.groups.map((g) => g.group)).toEqual(['三才', '五格', '生肖', '八字']);

    // 底部署名（SPEC-v4 #4）
    expect(layout.footer).toBe(CARD_FOOTER);
    expect(CARD_FOOTER).toContain('數名其妙');
    expect(CARD_FOOTER).toContain('https://mmiooimm.github.io/mio-shuming/');
    expect(CARD_FOOTER).toContain('僅供參考');
  });

  it('無時辰：沒有四柱，也沒有八字標籤（SPEC-v4 #3）', () => {
    const a = analysisOf('王', '小明', { year: 2024, month: 3, day: 15 });
    const layout = cardLayout({
      name: '王小明',
      birth: { year: 2024, month: 3, day: 15 },
      zodiac: cardZodiacOf(a.zodiac),
      tags: summaryTags(a),
    });
    const text = cardText(layout);
    expect(layout.rows.map((r) => r.label)).toEqual(['生日', '生肖']);
    expect(text).not.toContain('四柱');
    expect(layout.groups.map((g) => g.group)).toEqual(['三才', '五格', '生肖']);
  });

  it('沒有四柱時，就算傳入八字標籤也不上卡片——四柱與八字同進同出', () => {
    const withTime = wangXiaoMingWithTime();
    const layout = cardLayout({ ...withTime, pillars: undefined });
    expect(layout.groups.some((g) => g.group === '八字')).toBe(false);
    expect(cardText(layout)).not.toContain('用神');
  });

  it('立春當日未定：生肖列出兩種可能，字根喜忌也兩種都列（SPEC-v4 #6）', () => {
    const a = analysisOf('王', '小明', { year: 1985, month: 2, day: 4 });
    expect(a.zodiac.boundaryAmbiguous).toBe(true);
    const zodiac = cardZodiacOf(a.zodiac);
    const layout = cardLayout({
      name: '王小明',
      birth: { year: 1985, month: 2, day: 4 },
      zodiac,
      tags: summaryTags(a),
    });
    const text = cardText(layout);
    expect(zodiac.alternative).toBeDefined();
    const zodiacRow = layout.rows.find((r) => r.label === '生肖')!;
    expect(zodiacRow.value).toContain(a.zodiac.animal);
    expect(zodiacRow.value).toContain(a.zodiac.alternativeAnimal!);
    expect(text).toContain(`王（${a.zodiac.animal}）`);
    expect(text).toContain(`王（${a.zodiac.alternativeAnimal}）`);
  });

  it('生肖已定時只有一個生肖', () => {
    const a = analysisOf('王', '小明', { year: 1985, month: 6, day: 4 });
    const zodiac = cardZodiacOf(a.zodiac);
    expect(zodiac.alternative).toBeUndefined();
    const row = cardLayout({ name: '王小明', birth: { year: 1985, month: 6, day: 4 }, zodiac, tags: summaryTags(a) })
      .rows.find((r) => r.label === '生肖')!;
    expect(row.value).toBe(a.zodiac.animal);
  });

  it('卡片文字不計數、不加總（SPEC-v4 #2）', () => {
    const text = cardText(cardLayout(wangXiaoMingWithTime()));
    expect(text).not.toMatch(/\d+\s*[項個]\s*[吉凶]/);
    expect(text).not.toMatch(/總分|合計|共\s*\d/);
  });
});
