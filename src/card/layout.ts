// 分析卡片的版面模型（SPEC-v4 #2、#3、#4、#6）——純函式，只決定「要畫哪些文字、分成哪些區塊」，
// 不碰 Canvas（jsdom／node 沒有 Canvas，繪製另在 draw.ts，由 Playwright 驗）。
//
// 隱私（SPEC-v4 #3）：輸入型別**只有**年月日，沒有時分、出生地欄位；
// 就算呼叫端塞了多餘屬性，這裡也只逐欄取 year／month／day，不會把其他東西帶上卡片。
//
// 標籤一律原樣取自 `summaryTags()`（SPEC-v4 #8：摘要與卡片同一個產生函式），
// 這裡只做分組，不計數、不加總、不排序、不挑重點。

import type { Animal } from '../data/index.ts';
import type { ZodiacResult } from '../engine/types.ts';
import type { SummaryGroup, SummaryTag, SummaryTone } from '../engine/summary.ts';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export const CARD_SITE = '數名其妙';
export const CARD_URL = 'https://mmiooimm.github.io/mio-shuming/';
/** 底部固定署名（SPEC-v4 #4）：站名＋網址＋僅供參考。 */
export const CARD_FOOTER = `${CARD_SITE}・${CARD_URL}・僅供參考`;

/** 只收年月日——時分不在型別裡（SPEC-v4 #3）。 */
export interface CardDate {
  year: number;
  month: number;
  day: number;
}

/** 生肖；立春當日未定時兩個都給，不擅自選一個（SPEC-v4 #6）。 */
export type CardZodiac = { animal: Animal; alternative?: undefined } | { animal: Animal; alternative: Animal };

export interface CardInput {
  name: string;
  birth: CardDate;
  zodiac: CardZodiac;
  /** 四柱干支（年、月、日、時）；未排盤（未填時辰／缺出生地）時不給。 */
  pillars?: readonly string[];
  tags: readonly SummaryTag[];
}

export interface CardRow {
  label: string;
  value: string;
}

export interface CardTag {
  label: string;
  verdict: string;
  tone: SummaryTone;
}

export interface CardTagGroup {
  group: SummaryGroup;
  tags: CardTag[];
}

export interface CardLayout {
  width: number;
  height: number;
  heading: string;
  name: string;
  rows: CardRow[];
  groupsNote: string;
  groups: CardTagGroup[];
  footer: string;
}

const GROUP_ORDER: SummaryGroup[] = ['三才', '五格', '生肖', '八字'];

export function cardZodiacOf(z: Pick<ZodiacResult, 'animal' | 'boundaryAmbiguous' | 'alternativeAnimal'>): CardZodiac {
  return z.boundaryAmbiguous && z.alternativeAnimal
    ? { animal: z.animal, alternative: z.alternativeAnimal }
    : { animal: z.animal };
}

export function cardLayout(input: CardInput): CardLayout {
  const { year, month, day } = input.birth;
  const hasPillars = !!input.pillars && input.pillars.length > 0;

  const rows: CardRow[] = [
    { label: '生日', value: `${year} 年 ${month} 月 ${day} 日` },
    {
      label: '生肖',
      value: input.zodiac.alternative
        ? `${input.zodiac.animal} 或 ${input.zodiac.alternative}（立春當日，未定）`
        : input.zodiac.animal,
    },
  ];
  if (hasPillars) rows.push({ label: '四柱', value: input.pillars!.join('　') });

  const groups: CardTagGroup[] = [];
  for (const group of GROUP_ORDER) {
    // 沒有四柱就沒有八字標籤（SPEC-v4 #3）——兩者同進同出。
    if (group === '八字' && !hasPillars) continue;
    const tags = input.tags
      .filter((t) => t.group === group)
      .map(({ label, verdict, tone }) => ({ label, verdict, tone }));
    if (tags.length) groups.push({ group, tags });
  }

  return {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    heading: `${CARD_SITE}　姓名分析`,
    name: input.name,
    rows,
    groupsNote: '各項獨立判定，不計數、不加總',
    groups,
    footer: CARD_FOOTER,
  };
}

/** 卡片上會出現的所有文字，依繪製順序——給測試與除錯用。 */
export function cardText(layout: CardLayout): string {
  return [
    layout.heading,
    layout.name,
    ...layout.rows.map((r) => `${r.label} ${r.value}`),
    layout.groupsNote,
    ...layout.groups.flatMap((g) => [g.group, ...g.tags.map((t) => `${t.label} ${t.verdict}`)]),
    layout.footer,
  ].join('\n');
}
