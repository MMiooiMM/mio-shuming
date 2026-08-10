// 生肖 — 依立春分界換算生肖，並逐字判定喜用／忌用字根。
//
// 分界來源（src/data/zodiac-radicals.json 與 src/data/solar-terms.json）：
//   https://www.cma.gov.cn/kppd/kppdsytj/201602/t20160205_303710.html
//     「干支曆嚴格地以立春作為一年的開始，且不是按照一天，而是按照由太陽位置
//       決定的立春具體時刻來劃分。」「因此，如果從干支曆的角度出發，生肖的
//       分界線就是立春無疑。」
//   https://zh.wikipedia.org/wiki/立春
//     「八字算命師以立春日為該年生肖開始。」
//
// 字根喜忌來源：https://k.sina.cn/article_2234040443_8528c07b00100q0xg.html

import { ZODIAC_BRANCHES, LICHUN_RANGE, ZODIAC_RULES, lichunOf, radicalsOf } from '../data/index.ts';
import type { Animal, CharVerdict, ZodiacResult } from './types.ts';

/**
 * 地支週期的錨點：西元 4 年為甲子年，子＝鼠。故 (year - 4) mod 12 即地支序。
 * 這是干支紀年的標準對應（例如 2020 年 (2020-4)%12 = 0 → 子鼠、
 * 2024 年 %12 = 4 → 辰龍）。
 */
function branchIndexOfSolarYear(year: number): number {
  return (((year - 4) % 12) + 12) % 12;
}

export interface ZodiacYear {
  animal: Animal;
  branch: string;
  /** 出生日正好落在立春當天 —— 只有日期無時辰時無法定案。 */
  boundaryAmbiguous: boolean;
  alternativeAnimal?: Animal;
  lichun: string;
}

/**
 * 依立春換算生肖。立春之前算前一年的生肖。
 *
 * `time` 可省略（v1 只收年月日）。省略時，出生在立春「當天」無法判定屬於哪一年
 * —— 誠實回報 `boundaryAmbiguous`，不猜。
 *
 * **有時刻就一定要傳進來**：v2 的四柱以立春的精確時刻分界，若這裡仍只看日期，
 * 同一個人會出現「生肖說牛、年柱說鼠」的矛盾（SPEC-v2 #11 要求兩者一致）。
 * 傳入 `time` 後兩者依同一份 solar-terms 資料、用同一個判準，結果必然一致。
 */
export function zodiacOf(
  year: number,
  month: number,
  day: number,
  time?: { hour: number; minute: number },
): ZodiacYear | undefined {
  const [first, last] = LICHUN_RANGE;
  if (year < first || year > last) return undefined;
  const lichun = lichunOf(year);
  if (!lichun) return undefined;

  const onLichunDay = month === lichun.month && day === lichun.day;
  const beforeLichun = time
    ? month < lichun.month ||
      (month === lichun.month &&
        (day < lichun.day ||
          (day === lichun.day &&
            (time.hour < lichun.hour ||
              (time.hour === lichun.hour && time.minute < lichun.minute)))))
    : month < lichun.month || (month === lichun.month && day < lichun.day);
  // 有時刻就已定案；只有在缺時刻且生於立春當天時才是真的無法判定。
  const onLichun = onLichunDay && !time;

  const solarYear = beforeLichun ? year - 1 : year;
  const pick = (y: number) => ZODIAC_BRANCHES[branchIndexOfSolarYear(y)]!;
  const chosen = pick(solarYear);
  const lichunText = `${year} 年立春：${lichun.month} 月 ${lichun.day} 日 ${String(lichun.hour).padStart(2, '0')}:${String(lichun.minute).padStart(2, '0')}（台北時間）`;

  return {
    animal: chosen.animal,
    branch: chosen.branch,
    boundaryAmbiguous: onLichun,
    alternativeAnimal: onLichun ? pick(year - 1).animal : undefined,
    lichun: lichunText,
  };
}

/** 逐字比對生肖喜忌字根。 */
export function judgeChars(animal: Animal, chars: string[]): CharVerdict[] {
  const rule = ZODIAC_RULES[animal];
  const like = new Set(rule.like);
  const avoid = new Set(rule.avoid);

  return chars.map((char) => {
    const radicals = radicalsOf(char);
    const likeRadicals = radicals.filter((r) => like.has(r));
    const avoidRadicals = radicals.filter((r) => avoid.has(r));

    let verdict: CharVerdict['verdict'];
    if (likeRadicals.length && avoidRadicals.length) verdict = '喜忌並見';
    else if (likeRadicals.length) verdict = '喜';
    else if (avoidRadicals.length) verdict = '忌';
    else verdict = '中性';

    const bits: string[] = [];
    if (likeRadicals.length) {
      bits.push(`含「${likeRadicals.join('、')}」字根，屬${animal}之喜用（${rule.likeReason}）`);
    }
    if (avoidRadicals.length) {
      bits.push(`含「${avoidRadicals.join('、')}」字根，屬${animal}之忌用（${rule.avoidReason}）`);
    }
    if (!bits.length) bits.push(`未見${animal}的喜用或忌用字根，於生肖上為中性`);

    return {
      char,
      verdict,
      likeRadicals,
      avoidRadicals,
      explanation: `${char}：${bits.join('；')}。`,
    };
  });
}

export function analyseZodiac(
  year: number,
  month: number,
  day: number,
  chars: string[],
  time?: { hour: number; minute: number },
): ZodiacResult | undefined {
  const zy = zodiacOf(year, month, day, time);
  if (!zy) return undefined;
  const rule = ZODIAC_RULES[zy.animal];
  const verdicts = judgeChars(zy.animal, chars);

  const likes = verdicts.filter((v) => v.likeRadicals.length).length;
  const avoids = verdicts.filter((v) => v.avoidRadicals.length).length;
  let summary: string;
  if (avoids === 0 && likes > 0) summary = `全名字根皆合${zy.animal}之喜用，生肖配合佳。`;
  else if (likes === 0 && avoids > 0) summary = `全名僅見${zy.animal}之忌用字根，生肖配合不佳。`;
  else if (likes && avoids) summary = `${zy.animal}的喜用與忌用字根並見，生肖配合參半。`;
  else summary = `全名未見${zy.animal}的喜忌字根，生肖上無明顯助力或阻力。`;

  if (zy.boundaryAmbiguous) {
    summary = `出生當日即為立春，未提供出生時辰時無法確定生肖（可能為${zy.animal}或${zy.alternativeAnimal}）；以下依${zy.animal}判讀。${summary}`;
  }

  return {
    animal: zy.animal,
    branch: zy.branch,
    boundaryAmbiguous: zy.boundaryAmbiguous,
    alternativeAnimal: zy.alternativeAnimal,
    lichun: zy.lichun,
    chars: verdicts,
    likeReason: rule.likeReason,
    avoidReason: rule.avoidReason,
    summary,
  };
}
