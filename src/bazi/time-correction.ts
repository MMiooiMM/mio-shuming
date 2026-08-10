// 時間校正層 —— 把使用者輸入的「時鐘時間」換成排盤要用的「真太陽時」
// （SPEC-v2 #6–#9）。`baziChart()` 收的是本模組的輸出。
//
// 三層依序套用，每一層都單獨回報動了幾分鐘，UI 才能呈現對照（SPEC-v2 #9）：
//
//   1. 夏令時間  命中查證過的台灣實施年份時減 60 分鐘（docs/v2-sources.md 第 1 節）
//   2. 經度差    (出生地經度 − 時區中央經線) × 4 分鐘／度
//   3. 均時差    真太陽時與平太陽時之差（±16 分內），依日期查表
//
// 為什麼是這個順序
//   夏令時間是「法定時鐘被撥快」，先還原成標準時；經度差把標準時換成當地
//   平太陽時；均時差再把平太陽時換成真太陽時。順序反了會用錯誤的日期查
//   均時差表（跨日時差一天），雖然影響只有數秒，但沒有理由算錯。
//
// 純函式：不讀當下時間、不讀隨機數（SPEC-v2 #23）。

import {
  DST_OFFSET_MINUTES,
  DST_PERIODS,
  STANDARD_MERIDIAN,
  equationOfTimeMinutes,
} from '../data/index.ts';
import type { DstPeriod } from '../data/index.ts';
import type { LocalDateTime } from './pillars.ts';

export interface BirthPlaceInput {
  /** 出生地經度，東經為正（−180–180）。 */
  longitude: number;
  /** 時區中央經線，預設台灣的東經 120°。海外出生者依其時區填入（UTC+9 → 135）。 */
  standardMeridian?: number;
  /**
   * 是否套用台灣的夏令時間年份表。台灣 22 縣市為 `true`；
   * 手填經度的海外出生者退回手動勾選 `manualDst`（SPEC-v2 #6）。
   */
  applyTaiwanDst?: boolean;
  /** 海外出生者自行勾選「出生時當地正在實施夏令時間」。 */
  manualDst?: boolean;
  /**
   * 起訖當日的人工裁決：`true` 代表使用者選擇「當時尚未／已不再撥快」。
   *
   * 來源只記日期不記換時時刻，起訖當日本來就無法由資料判定（SPEC-v2 #24）。
   * 程式不替使用者選邊：兩種結果都算得出來，由 UI 提供一鍵切換。
   */
  skipDst?: boolean;
}

export interface CorrectionStep {
  /** 例如「夏令時間」。 */
  label: string;
  /** 本層調整的分鐘數（可為負；夏令時間為 −60）。 */
  minutes: number;
  /** 給使用者看的一句說明，含依據。 */
  detail: string;
}

export interface DstHit {
  period: DstPeriod;
  /**
   * 出生日正好是該期間的起日或訖日。來源只記日期不記換時時刻，
   * 這種情況程式**不自行認定**，僅照表套用並要求 UI 明示（SPEC-v2 #24）。
   */
  boundaryUncertain: boolean;
}

export interface TimeCorrection {
  /** 使用者輸入的時鐘時間。 */
  clock: LocalDateTime;
  /** 校正後的真太陽時，即 `baziChart()` 的輸入。 */
  trueSolar: LocalDateTime;
  steps: CorrectionStep[];
  /** 三層合計的分鐘數。 */
  totalMinutes: number;
  /** 命中的夏令時間期間；未命中為 undefined。 */
  dst?: DstHit;
  /** 命中夏令時間，但依使用者裁決不套用（只可能發生在起訖當日）。 */
  dstSkipped: boolean;
  /** 校正後跨到別的日期（−1 或 +1；同日為 0）。 */
  dayShift: -1 | 0 | 1;
}

export type TimeCorrectionResult =
  | ({ ok: true } & TimeCorrection)
  | { ok: false; reason: string };

/** 每度經度差 4 分鐘（360° / 24h）。 */
const MINUTES_PER_DEGREE = 4;

const pad = (n: number) => String(n).padStart(2, '0');
const monthDay = (dt: LocalDateTime) => `${pad(dt.month)}-${pad(dt.day)}`;

/**
 * 出生時間是否落在台灣夏令時間期間內。
 *
 * 起訖日**都算在內**（起日 00:00 起、訖日 23:59 止）——來源未記載換時時刻，
 * 起訖當日另以 `boundaryUncertain` 標示，由 UI 明講不確定。
 */
export function taiwanDstOf(dt: LocalDateTime): DstHit | undefined {
  const period = DST_PERIODS.find((p) => p.year === dt.year);
  if (!period) return undefined;
  const md = monthDay(dt);
  if (md < period.start || md > period.end) return undefined;
  return { period, boundaryUncertain: md === period.start || md === period.end };
}

/** 在某個當地時間上加減分鐘，跨日時一併進位（純日期運算，不讀時鐘）。 */
export function addMinutes(dt: LocalDateTime, minutes: number): LocalDateTime {
  const base = Date.UTC(dt.year, dt.month - 1, dt.day, dt.hour, dt.minute);
  const moved = new Date(base + minutes * 60_000);
  return {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
    hour: moved.getUTCHours(),
    minute: moved.getUTCMinutes(),
  };
}

function dayShiftOf(from: LocalDateTime, to: LocalDateTime): -1 | 0 | 1 {
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  if (b === a) return 0;
  return b > a ? 1 : -1;
}

/**
 * 時鐘時間 → 真太陽時。
 *
 * 無法判定時回傳 `ok: false` 並說明原因，不猜（SPEC-v2 #24）。
 * 校正後的時間可能落在前一天或後一天，`dayShift` 會標示；四柱推算本來
 * 就該用校正後的日期，所以直接把 `trueSolar` 交給 `baziChart()` 即可。
 */
export function correctBirthTime(
  clock: LocalDateTime,
  place: BirthPlaceInput,
): TimeCorrectionResult {
  const { longitude, standardMeridian = STANDARD_MERIDIAN } = place;

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { ok: false, reason: '經度需介於 −180 至 180 度之間。' };
  }
  if (!Number.isFinite(standardMeridian) || standardMeridian < -180 || standardMeridian > 180) {
    return { ok: false, reason: '時區中央經線需介於 −180 至 180 度之間。' };
  }
  if (!Number.isInteger(clock.month) || clock.month < 1 || clock.month > 12) {
    return { ok: false, reason: '月份不正確。' };
  }
  if (!Number.isInteger(clock.day) || clock.day < 1 || clock.day > 31) {
    return { ok: false, reason: '日期不正確。' };
  }
  if (!Number.isInteger(clock.hour) || clock.hour < 0 || clock.hour > 23) {
    return { ok: false, reason: '時不正確（0–23）。' };
  }
  if (!Number.isInteger(clock.minute) || clock.minute < 0 || clock.minute > 59) {
    return { ok: false, reason: '分不正確（0–59）。' };
  }
  const probe = new Date(Date.UTC(clock.year, clock.month - 1, clock.day));
  if (
    !Number.isInteger(clock.year) ||
    probe.getUTCFullYear() !== clock.year ||
    probe.getUTCMonth() !== clock.month - 1 ||
    probe.getUTCDate() !== clock.day
  ) {
    return { ok: false, reason: '出生日期不存在，請重新確認。' };
  }

  const steps: CorrectionStep[] = [];

  // --- 1. 夏令時間 ---
  const dst = place.applyTaiwanDst ? taiwanDstOf(clock) : undefined;
  const manualDst = !place.applyTaiwanDst && place.manualDst === true;
  // 起訖當日才允許人工裁決不套用——期間中央的日子沒有不確定性可言。
  const dstSkipped = dst !== undefined && dst.boundaryUncertain && place.skipDst === true;
  const dstApplied = (dst !== undefined && !dstSkipped) || manualDst;
  if (dstApplied) {
    steps.push({
      label: '夏令時間',
      minutes: -DST_OFFSET_MINUTES,
      detail: dst
        ? `${dst.period.year} 年台灣實施${dst.period.name}（${dst.period.start} 至 ${dst.period.end}），` +
          `當時時鐘撥快一小時，已自動減 1 小時${
            dst.boundaryUncertain ? '；出生日正好是起訖當日，來源未記載換時時刻，此筆需自行確認' : ''
          }。`
        : '依您勾選的「出生時當地實施夏令時間」減 1 小時。',
    });
  } else if (dstSkipped) {
    steps.push({
      label: '夏令時間',
      minutes: 0,
      detail:
        `${dst!.period.year} 年台灣實施${dst!.period.name}（${dst!.period.start} 至 ${dst!.period.end}），` +
        '但出生日正好是起訖當日、來源未記載換時時刻；依您的選擇以「當時尚未／已不再撥快」計算，不減這 1 小時。',
    });
  }
  const standard = dstApplied ? addMinutes(clock, -DST_OFFSET_MINUTES) : clock;

  // --- 2. 經度差 ---
  const lonMinutes = (longitude - standardMeridian) * MINUTES_PER_DEGREE;
  steps.push({
    label: '經度差',
    minutes: lonMinutes,
    detail:
      `出生地經度 ${longitude.toFixed(4)}° 與時區中央經線 ${standardMeridian}° 相差 ` +
      `${(longitude - standardMeridian).toFixed(4)}°，每度 4 分鐘。`,
  });

  // --- 3. 均時差 ---
  const meanSolar = addMinutes(standard, lonMinutes);
  const eot = equationOfTimeMinutes(meanSolar.month, meanSolar.day);
  if (eot === undefined) {
    return { ok: false, reason: '無法取得該日期的均時差。' };
  }
  steps.push({
    label: '均時差',
    minutes: eot,
    detail: `${meanSolar.month} 月 ${meanSolar.day} 日的真太陽時比平太陽時${
      eot >= 0 ? '快' : '慢'
    } ${Math.abs(eot).toFixed(1)} 分鐘。`,
  });

  const totalMinutes = steps.reduce((sum, s) => sum + s.minutes, 0);
  // 由時鐘時間一次算到真太陽時，避免逐層四捨五入累積誤差。
  // 分是排盤的最小單位，秒級小數在這裡取整。
  const trueSolar = addMinutes(clock, Math.round(totalMinutes));

  return {
    ok: true,
    clock,
    trueSolar,
    steps,
    totalMinutes,
    dst,
    dstSkipped,
    dayShift: dayShiftOf(clock, trueSolar),
  };
}
