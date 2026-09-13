// 收藏比較（SPEC-v4 #12、#13）—— 比較視圖與比較卡片共用的唯一產生函式。
//
// 每個名字各自產出一組分項標籤，原樣取自引擎既有判定：
//   三才   sancai.luck
//   五格   只列取名可改變、計吉凶的格（`judgedGrids`，SPEC-v3 #3）
//   生肖   名字每個字的字根喜忌；生肖依收藏的預產期 `dueZodiac()` 換算。
//          沒有預產期（舊收藏）→ 生肖未知、不判字根，不猜（SPEC-v4 #11）。
//          立春 ±3 週內 → 兩個生肖並列，字根喜忌依兩肖各列一次並標明生肖（SPEC-v3 #9、v4 #13）。
//
// 刻意**不做**：計數、加總、排序、選「最佳」——比較只是並列（SPEC-v4 #12）。
// 輸出**不含預產期**本身，只含換算出的生肖（SPEC-v4 #13：比較卡不印預產期）。
//
// 純函式：不讀當下時間、不讀隨機數。

import { kangxiStrokeCount } from '../data/index.ts';
import { dueZodiac, judgedGrids } from './naming.ts';
import type { SummaryTag, SummaryTone } from './summary.ts';
import type { Animal, CharVerdict, Grid, Luck } from './types.ts';
import { computeGrids } from './wuge.ts';
import { computeSancai } from './wuxing.ts';
import { judgeChars } from './zodiac.ts';

export interface CompareSource {
  surname: string;
  givenName: string;
  due?: { year: number; month: number; day: number };
}

export interface CompareEntryOk {
  ok: true;
  name: string;
  doubleGiven: boolean;
  /** 依預產期換算的生肖：空陣列＝未知；兩個＝立春 ±3 週內（依序為立春前、立春後）。 */
  animals: Animal[];
  /** 生肖的呈現文字：「馬」「蛇 或 馬」「生肖未知」。 */
  zodiacText: string;
  /** 三才、計分五格、生肖字根，依此順序；不計數、不排序。 */
  tags: SummaryTag[];
}

export interface CompareEntryError {
  ok: false;
  name: string;
  reason: string;
}

export type CompareEntry = CompareEntryOk | CompareEntryError;

export const ZODIAC_UNKNOWN = '生肖未知';

const luckTone = (luck: Luck): SummaryTone =>
  luck === '吉' ? 'good' : luck === '凶' ? 'bad' : 'mid';

const charTone = (v: CharVerdict['verdict']): SummaryTone =>
  v === '喜' ? 'good' : v === '忌' ? 'bad' : v === '喜忌並見' ? 'mid' : 'neutral';

export function compareEntry(fav: CompareSource): CompareEntry {
  const surname = [...fav.surname.trim()];
  const given = [...fav.givenName.trim()];
  const name = surname.join('') + given.join('');
  if (surname.length < 1 || surname.length > 2 || given.length < 1 || given.length > 2) {
    return { ok: false, name, reason: '姓需 1–2 字、名需 1–2 字，無法比較。' };
  }
  const all = [...surname, ...given];
  const unknown = all.filter((c) => kangxiStrokeCount(c) === undefined);
  if (unknown.length) {
    return { ok: false, name, reason: `查無此字：${unknown.join('、')}，不猜測。` };
  }

  const doubleGiven = given.length === 2;
  const grids: Grid[] = computeGrids(
    { surname: surname.map((c) => kangxiStrokeCount(c)!), givenName: given.map((c) => kangxiStrokeCount(c)!) },
    { surname, givenName: given },
  );
  const sancai = computeSancai(grids);

  const tags: SummaryTag[] = [
    { group: '三才', label: '三才', verdict: sancai.luck, tone: luckTone(sancai.luck) },
    ...judgedGrids(grids, doubleGiven).map<SummaryTag>((g) => ({
      group: '五格',
      label: g.name,
      verdict: `${g.value} ${g.fate.luck}`,
      tone: luckTone(g.fate.luck),
    })),
  ];

  const z = fav.due ? dueZodiac(fav.due.year, fav.due.month, fav.due.day) : undefined;
  const animals = z ? z.animals : [];
  const ambiguous = animals.length > 1;
  for (const animal of animals) {
    for (const v of judgeChars(animal, all)) {
      tags.push({
        group: '生肖',
        label: ambiguous ? `${v.char}（${animal}）` : v.char,
        verdict: v.verdict,
        tone: charTone(v.verdict),
      });
    }
  }

  return {
    ok: true,
    name,
    doubleGiven,
    animals,
    zodiacText: animals.length ? animals.join(' 或 ') : ZODIAC_UNKNOWN,
    tags,
  };
}
