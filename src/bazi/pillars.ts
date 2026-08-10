// 四柱推算 —— 由已校正的當地時間求年、月、日、時四柱。
//
// 這裡只做干支推算；真太陽時／夏令時間的校正屬上游（SPEC-v2 #6-#9），
// 傳進來的時間視為「已校正的當地時間」。
//
// 規則出處（皆已於 docs/v2-sources.md 查證並附原文）：
//   年柱  干支紀年錨點西元 4 年甲子；以立春為年界
//   月柱  依十二節換柱（非農曆月），月干由年干以五虎遁推得
//         https://zh.wikipedia.org/wiki/地支：「紀月時，每个地支对应二十四節氣
//         自某節氣（非中氣）至下次節氣，以交節時間決定起始的一個月期間」
//   日柱  中央氣象署《天文年曆》：(儒略日序 − 10) mod 60
//   時柱  時支由時辰決定，時干由日干以五鼠遁推得
//
// 純函式：不讀當下時間、不讀隨機數（SPEC-v2 #23）。
//
// 與 v1 生肖的關係（尚待整合，見 handoff）：
//   v1 的 `zodiacOf()` 只收到年月日，出生在立春「當天」時無法定案，會回報
//   boundaryAmbiguous 並暫依新生肖判讀。本模組收得到時刻，所以能給確定答案。
//   兩者對同一個人可能不一致（例如立春 05:13、生於 04:00：v1 暫報牛、v2 正確
//   算出鼠）。SPEC-v2 #11 要求兩者一致，**整合時應以本模組的年柱地支為準來
//   決定生肖**，而不是讓兩套各自判斷。在整合完成前，UI 不應同時顯示兩者。

import { BRANCHES, JIE, SOLAR_TERM_RANGE, STEMS, WU_HU_DUN, WU_SHU_DUN, jieOfYear } from '../data/index.ts';
import type { Branch, Stem } from '../data/index.ts';

export interface Pillar {
  stem: Stem;
  branch: Branch;
  /** 干支合稱，例如「甲子」。 */
  name: string;
}

/** 已校正的當地時間（西元年月日時分）。 */
export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface FourPillarsOptions {
  /**
   * 23:00–23:59 是否換到隔日的日柱（SPEC-v2 #12）。
   * `true`（預設）＝子初換日，傳統子平派多採；`false`＝夜子時，日柱以午夜為界。
   */
  lateZiSwitchesDay?: boolean;
}

export interface FourPillars {
  year: Pillar;
  month: Pillar;
  day: Pillar;
  hour: Pillar;
  /** 日主（日柱天干）。 */
  dayMaster: Stem;
  /** 年柱所依據的干支年（立春前算前一年）。 */
  solarYear: number;
  /** 月柱所依據的節；`branch` 是該節所起的月支名（完整地支物件見 `month.branch`）。 */
  jie: { name: string; deg: number; branch: string };
  /** 出生於 23:00–23:59，另一派會得到不同日柱。 */
  lateZi: boolean;
}

export type PillarsResult =
  | ({ ok: true } & FourPillars)
  | { ok: false; reason: string };

/** Gregorian date -> Julian Day Number at 0h (Meeus 7.1, integer part). */
export function julianDayNumber(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524;
}

/** 六十甲子序（1–60）-> 干支。 */
function sexagenary(index1to60: number): Pillar {
  const i = index1to60 - 1;
  const stem = STEMS[i % 10]!;
  const branch = BRANCHES[i % 12]!;
  return { stem, branch, name: stem.name + branch.name };
}

function pillarOf(stemName: string, branchName: string): Pillar {
  const stem = STEMS.find((s) => s.name === stemName)!;
  const branch = BRANCHES.find((b) => b.name === branchName)!;
  return { stem, branch, name: stem.name + branch.name };
}

/** 日柱：中央氣象署《天文年曆》(JDN − 10) mod 60，餘 0 視為 60。 */
export function dayPillar(year: number, month: number, day: number): Pillar {
  let r = (julianDayNumber(year, month, day) - 10) % 60;
  if (r <= 0) r += 60;
  return sexagenary(r);
}

/** 年柱：干支紀年錨點為西元 4 年甲子。傳入的是**已依立春調整**的干支年。 */
export function yearPillarOfSolarYear(solarYear: number): Pillar {
  return sexagenary((((solarYear - 4) % 60) + 60) % 60 + 1);
}

/** 時支序：子時涵蓋 23:00–00:59，其後每兩小時一支。 */
export function hourBranchIndex(hour: number): number {
  return Math.floor(((hour + 1) % 24) / 2);
}

const toKey = (t: { month: number; day: number; hour: number; minute: number }) =>
  ((t.month * 100 + t.day) * 100 + t.hour) * 100 + t.minute;

/**
 * 判斷某個當地時間落在哪個節之後。
 *
 * 回傳的 `jieIndex` 是 JIE 陣列的索引；若時間早於當年第一個節（小寒），
 * 則屬於前一年最後一個節（大雪，子月），此時 `previousYear` 為 true。
 */
function findJie(dt: LocalDateTime): { jieIndex: number; previousYear: boolean } | undefined {
  const terms = jieOfYear(dt.year);
  if (!terms) return undefined;
  const now = toKey(dt);
  for (let i = terms.length - 1; i >= 0; i--) {
    if (now >= toKey(terms[i]!)) return { jieIndex: i, previousYear: false };
  }
  // 早於小寒 —— 仍在前一年大雪起的子月內。
  return { jieIndex: JIE.length - 1, previousYear: true };
}

/**
 * 四柱推算。`dt` 必須是**已完成真太陽時與夏令時間校正**的當地時間。
 *
 * 無法判定時回傳 `ok: false` 並說明原因，不猜（SPEC-v2 #24）。
 */
export function fourPillars(dt: LocalDateTime, options: FourPillarsOptions = {}): PillarsResult {
  const { lateZiSwitchesDay = true } = options;

  const [first, last] = SOLAR_TERM_RANGE;
  if (!Number.isInteger(dt.year) || dt.year < first || dt.year > last) {
    return { ok: false, reason: `出生年份需介於西元 ${first} 至 ${last} 年（節氣資料範圍）。` };
  }
  if (!Number.isInteger(dt.month) || dt.month < 1 || dt.month > 12) {
    return { ok: false, reason: '月份不正確。' };
  }
  if (!Number.isInteger(dt.day) || dt.day < 1 || dt.day > 31) {
    return { ok: false, reason: '日期不正確。' };
  }
  if (!Number.isInteger(dt.hour) || dt.hour < 0 || dt.hour > 23) {
    return { ok: false, reason: '時不正確（0–23）。' };
  }
  if (!Number.isInteger(dt.minute) || dt.minute < 0 || dt.minute > 59) {
    return { ok: false, reason: '分不正確（0–59）。' };
  }
  const probe = new Date(Date.UTC(dt.year, dt.month - 1, dt.day));
  if (
    probe.getUTCFullYear() !== dt.year ||
    probe.getUTCMonth() !== dt.month - 1 ||
    probe.getUTCDate() !== dt.day
  ) {
    return { ok: false, reason: '出生日期不存在，請重新確認。' };
  }

  // --- 年柱：以立春為界 ---
  const lichun = jieOfYear(dt.year)?.[JIE.findIndex((j) => j.name === '立春')];
  if (!lichun) return { ok: false, reason: '無法取得該年立春時刻。' };
  const beforeLichun = toKey(dt) < toKey(lichun);
  const solarYear = beforeLichun ? dt.year - 1 : dt.year;
  const yearP = yearPillarOfSolarYear(solarYear);

  // --- 月柱：依節換柱，月干由年干以五虎遁推得 ---
  const found = findJie(dt);
  if (!found) return { ok: false, reason: '無法取得該年節氣資料。' };
  const jieDef = JIE[found.jieIndex]!;
  // 寅月為第一個月，五虎遁給出寅月天干，其後依天干順序遞推。
  const monthBranchIndex = BRANCHES.findIndex((b) => b.name === jieDef.branch);
  if (monthBranchIndex < 0) {
    return { ok: false, reason: `節氣資料的月支「${jieDef.branch}」不在地支表中，請回報此問題。` };
  }
  const stepsFromYin = (((monthBranchIndex - 2) % 12) + 12) % 12;
  const yinStemName = WU_HU_DUN[yearP.stem.name];
  if (!yinStemName) return { ok: false, reason: '五虎遁查表失敗。' };
  const yinStemIndex = STEMS.findIndex((s) => s.name === yinStemName);
  if (yinStemIndex < 0) return { ok: false, reason: `五虎遁得到未知天干「${yinStemName}」。` };
  const monthStem = STEMS[(yinStemIndex + stepsFromYin) % 10]!;
  const monthP = pillarOf(monthStem.name, jieDef.branch);

  // --- 日柱：23:00 起是否換日（SPEC-v2 #12） ---
  //
  // 只有日柱受這個約定影響，年柱與月柱**刻意**沿用原始時刻：年月柱由太陽位置
  // （節氣）決定，與「干支日從幾點起算」是兩回事。看起來不一致，但把年月柱
  // 一起進位才是錯的 —— 那會讓 23:00 出生的人在交節當晚被算進下一個月柱。
  const lateZi = dt.hour === 23;
  let dayY = dt.year;
  let dayM = dt.month;
  let dayD = dt.day;
  if (lateZi && lateZiSwitchesDay) {
    const next = new Date(Date.UTC(dt.year, dt.month - 1, dt.day + 1));
    dayY = next.getUTCFullYear();
    dayM = next.getUTCMonth() + 1;
    dayD = next.getUTCDate();
  }
  const dayP = dayPillar(dayY, dayM, dayD);

  // --- 時柱：時支由時辰決定，時干由日干以五鼠遁推得 ---
  const hourIdx = hourBranchIndex(dt.hour);
  const ziStemName = WU_SHU_DUN[dayP.stem.name];
  if (!ziStemName) return { ok: false, reason: '五鼠遁查表失敗。' };
  const ziStemIndex = STEMS.findIndex((s) => s.name === ziStemName);
  if (ziStemIndex < 0) return { ok: false, reason: `五鼠遁得到未知天干「${ziStemName}」。` };
  const hourStem = STEMS[(ziStemIndex + hourIdx) % 10]!;
  const hourP = pillarOf(hourStem.name, BRANCHES[hourIdx]!.name);

  return {
    ok: true,
    year: yearP,
    month: monthP,
    day: dayP,
    hour: hourP,
    dayMaster: dayP.stem,
    solarYear,
    jie: { name: jieDef.name, deg: jieDef.deg, branch: jieDef.branch },
    lateZi,
  };
}
