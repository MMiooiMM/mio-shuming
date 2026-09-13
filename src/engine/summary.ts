// 分項標籤 —— 結果摘要區與分享卡片共用的唯一產生函式（SPEC-v4 #2、#6、#8）。
//
// 每個標籤是**一項各自獨立的判定**，原樣取自引擎既有結果，不另外下結論：
//   三才   sancai.luck
//   五格   五格各一個（分析模式五格全列；取名模式「天格不計」只屬取名，SPEC-v3 #3）
//   生肖   名字每個字的字根喜忌；立春當日未定時另出「生肖未定：X 或 Y」，
//          且字根喜忌依兩個生肖各列一次、標明生肖（SPEC-v4 #6）
//   八字   只有排出命盤時才有：用神（喜用五行）＋ 名字每個字的用神匹配
//
// 刻意**不做**的事：計數（「N 吉 M 凶」）、加總、排序、挑重點——那都是變相總分，
// 牴觸「不合成單一總分」（SPEC #6、SPEC-v4 #2）。輸出順序固定依上列分組與原始順序。
//
// 純函式：不讀當下時間、不讀隨機數。

import type { MatchResult, MatchVerdict } from './match.ts';
import { judgeChars } from './zodiac.ts';
import type { Analysis, CharVerdict, Luck } from './types.ts';
import type { YongShenResult } from '../bazi/yongshen.ts';

export type SummaryGroup = '三才' | '五格' | '生肖' | '八字';

/**
 * 標籤語氣，只供上色：`mid` ＝ 半吉、喜忌並見（黃）；`neutral` ＝ 中性字、用神五行（灰，SPEC-v4 #25）；
 * `unknown` ＝ 資料不足、據實不判。
 */
export type SummaryTone = 'good' | 'mid' | 'neutral' | 'bad' | 'unknown';

export interface SummaryTag {
  group: SummaryGroup;
  label: string;
  verdict: string;
  tone: SummaryTone;
}

/** 有排出八字時才傳；未填時辰／缺出生地時不傳，八字標籤就不出現（SPEC-v4 #3）。 */
export interface SummaryBazi {
  yongShen: Pick<YongShenResult, 'favor'>;
  match: Pick<MatchResult, 'chars'>;
}

const luckTone = (luck: Luck): SummaryTone =>
  luck === '吉' ? 'good' : luck === '凶' ? 'bad' : 'mid';

const charTone = (v: CharVerdict['verdict']): SummaryTone =>
  v === '喜' ? 'good' : v === '忌' ? 'bad' : v === '喜忌並見' ? 'mid' : 'neutral';

const matchTone = (v: MatchVerdict): SummaryTone =>
  v === '補用神' ? 'good' : v === '傷用神' ? 'bad' : v === '中性' ? 'neutral' : 'unknown';

export function summaryTags(a: Analysis, bazi?: SummaryBazi): SummaryTag[] {
  const tags: SummaryTag[] = [
    { group: '三才', label: '三才', verdict: a.sancai.luck, tone: luckTone(a.sancai.luck) },
  ];

  for (const g of a.grids) {
    tags.push({
      group: '五格',
      label: g.name,
      verdict: `${g.value} ${g.fate.luck}`,
      tone: luckTone(g.fate.luck),
    });
  }

  const z = a.zodiac;
  if (z.boundaryAmbiguous && z.alternativeAnimal) {
    // 不擅自選一個（SPEC-v4 #6）：兩個可能的生肖都列，字根喜忌也兩種都列並標明依哪個生肖——
    // 同一個字對兩個生肖的喜忌可能相反（例如「王」對牛為忌、對鼠為喜）。
    tags.push({
      group: '生肖',
      label: '生肖未定',
      verdict: `${z.animal} 或 ${z.alternativeAnimal}`,
      tone: 'unknown',
    });
    const alternative = judgeChars(z.alternativeAnimal, z.chars.map((c) => c.char));
    for (const [animal, verdicts] of [[z.animal, z.chars], [z.alternativeAnimal, alternative]] as const) {
      for (const c of verdicts) {
        tags.push({
          group: '生肖',
          label: `${c.char}（${animal}）`,
          verdict: c.verdict,
          tone: charTone(c.verdict),
        });
      }
    }
  } else {
    for (const c of z.chars) {
      tags.push({ group: '生肖', label: c.char, verdict: c.verdict, tone: charTone(c.verdict) });
    }
  }

  if (bazi) {
    const favor = bazi.yongShen.favor;
    tags.push({
      group: '八字',
      label: '用神',
      verdict: favor.length ? favor.join('、') : '喜用為空',
      tone: favor.length ? 'neutral' : 'unknown',
    });
    for (const c of bazi.match.chars) {
      tags.push({ group: '八字', label: c.char, verdict: c.verdict, tone: matchTone(c.verdict) });
    }
  }

  return tags;
}
