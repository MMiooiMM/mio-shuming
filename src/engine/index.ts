// 姓名學分析入口。純函式：同樣的輸入永遠得到同樣的結果，不碰 DOM、不碰時鐘。
//
// v1 只做姓名（三才五格／生肖／五行）。SPEC 第 10 條的八字排盤屬第二階段，
// 但生日已在 NameInput 收齊，屆時不必改介面。
//
// SPEC 第 6 條：各分項獨立給吉凶，**不合成單一總分**。

import { LICHUN_RANGE, kangxiStrokeCount } from '../data/index.ts';
import type { AnalysisResult, CharStrokes, NameInput } from './types.ts';
import { computeGrids } from './wuge.ts';
import { computeSancai, computeWuxing } from './wuxing.ts';
import { analyseZodiac } from './zodiac.ts';

/** Splits a string into user-visible characters (surrogate pairs stay whole). */
function chars(s: string): string[] {
  return [...s.trim()];
}

const HAN = /^\p{Script=Han}$/u;

export function analyse(input: NameInput): AnalysisResult {
  const surname = chars(input.surname);
  const givenName = chars(input.givenName);

  if (surname.length < 1 || surname.length > 2) {
    return { ok: false, reason: '姓請輸入 1 個字（單姓）或 2 個字（複姓）。' };
  }
  if (givenName.length < 1 || givenName.length > 2) {
    return { ok: false, reason: '名請輸入 1 至 2 個字。' };
  }

  const all = [...surname, ...givenName];
  const nonHan = all.filter((c) => !HAN.test(c));
  if (nonHan.length) {
    return { ok: false, reason: `姓名只接受中文字，請移除：${nonHan.join('、')}` };
  }

  const { year, month, day } = input.birth;
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return { ok: false, reason: '請填寫完整的西元出生年月日。' };
  }
  if (year < LICHUN_RANGE[0] || year > LICHUN_RANGE[1]) {
    return {
      ok: false,
      reason: `出生年份需介於西元 ${LICHUN_RANGE[0]} 至 ${LICHUN_RANGE[1]} 年（立春資料範圍）。`,
    };
  }
  // Reject dates the calendar does not have, e.g. 2 月 30 日.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return { ok: false, reason: '出生日期不存在，請重新確認。' };
  }

  // 罕字：查不到筆畫就直接停手，不產出結果（SPEC 第 7 條）。
  const strokes: CharStrokes[] = all.map((char) => ({ char, strokes: kangxiStrokeCount(char) }));
  const unknownChars = strokes.filter((s) => s.strokes === undefined).map((s) => s.char);
  if (unknownChars.length) {
    return {
      ok: false,
      reason: `查無此字：${unknownChars.join('、')}。本站康熙筆畫字典未收錄這些字，無法計算。`,
      unknownChars,
    };
  }

  const surnameStrokes = surname.map((c) => kangxiStrokeCount(c)!);
  const givenStrokes = givenName.map((c) => kangxiStrokeCount(c)!);

  const grids = computeGrids(
    { surname: surnameStrokes, givenName: givenStrokes },
    { surname, givenName },
  );
  const sancai = computeSancai(grids);
  const zodiac = analyseZodiac(year, month, day, all);
  if (!zodiac) {
    return { ok: false, reason: '無法換算生肖（立春資料缺漏），請回報此問題。' };
  }
  const wuxing = computeWuxing(
    strokes.map((s) => ({ char: s.char, strokes: s.strokes! })),
  );

  return {
    ok: true,
    surname: surname.join(''),
    givenName: givenName.join(''),
    strokes,
    grids,
    sancai,
    zodiac,
    wuxing,
  };
}

export * from './types.ts';
export { computeGrids } from './wuge.ts';
export { computeSancai, computeWuxing } from './wuxing.ts';
export { analyseZodiac, judgeChars, zodiacOf } from './zodiac.ts';
