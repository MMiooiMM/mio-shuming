import { describe, expect, it } from 'vitest';
import {
  COUNTIES,
  DST_EXCLUDED,
  DST_PERIODS,
  STANDARD_MERIDIAN,
  countyOf,
  equationOfTimeMinutes,
} from '../data/index.ts';
import { addMinutes, correctBirthTime, taiwanDstOf } from './time-correction.ts';
import { baziChart } from './chart.ts';
import { analyse } from '../engine/index.ts';

const taipei = countyOf('臺北市')!;
const ok = <T extends { ok: boolean }>(r: T) => {
  expect(r.ok).toBe(true);
  return r as Extract<T, { ok: true }>;
};

describe('縣市經度表', () => {
  it('涵蓋 22 個縣市，每個都有經度與範圍', () => {
    expect(COUNTIES).toHaveLength(22);
    for (const c of COUNTIES) {
      expect(c.longitude).toBeGreaterThanOrEqual(c.min);
      expect(c.longitude).toBeLessThanOrEqual(c.max);
      expect(c.districts).toBeGreaterThan(0);
    }
  });

  it('代表經度落在台灣的合理範圍（金馬澎在西、宜花東在東）', () => {
    // 全部縣市都在東經 118–122 之間；離島（釣魚臺、東沙、南沙）已排除。
    for (const c of COUNTIES) {
      expect(c.longitude).toBeGreaterThan(118);
      expect(c.longitude).toBeLessThan(122.1);
    }
    expect(countyOf('金門縣')!.longitude).toBeLessThan(countyOf('澎湖縣')!.longitude);
    expect(countyOf('澎湖縣')!.longitude).toBeLessThan(countyOf('臺南市')!.longitude);
    expect(countyOf('臺北市')!.longitude).toBeLessThan(countyOf('宜蘭縣')!.longitude);
  });

  it('查無此縣市回 undefined，不猜', () => {
    expect(countyOf('台北市')).toBeUndefined(); // 上游用「臺」
    expect(countyOf('海南省')).toBeUndefined();
  });
});

describe('夏令時間表', () => {
  it('1945 年不在表內 —— 該年僅於中國大陸實施', () => {
    expect(DST_PERIODS.some((p) => p.year === 1945)).toBe(false);
    expect(DST_EXCLUDED.year).toBe(1945);
    // 1945 年台灣出生者不得被減 1 小時。
    const r = ok(correctBirthTime({ year: 1945, month: 7, day: 1, hour: 12, minute: 0 }, {
      longitude: taipei.longitude,
      applyTaiwanDst: true,
    }));
    expect(r.dst).toBeUndefined();
    expect(r.steps.some((s) => s.label === '夏令時間')).toBe(false);
  });

  it('19 個實施年份，起訖日皆為合法 MM-DD', () => {
    expect(DST_PERIODS).toHaveLength(19);
    for (const p of DST_PERIODS) {
      expect(p.start).toMatch(/^\d{2}-\d{2}$/);
      expect(p.end).toMatch(/^\d{2}-\d{2}$/);
      expect(p.start < p.end).toBe(true);
    }
  });

  it('區間內命中、區間外不命中', () => {
    expect(taiwanDstOf({ year: 1979, month: 6, day: 30, hour: 12, minute: 0 })).toBeUndefined();
    expect(taiwanDstOf({ year: 1979, month: 7, day: 1, hour: 12, minute: 0 })).toBeDefined();
    expect(taiwanDstOf({ year: 1979, month: 9, day: 30, hour: 12, minute: 0 })).toBeDefined();
    expect(taiwanDstOf({ year: 1979, month: 10, day: 1, hour: 12, minute: 0 })).toBeUndefined();
    // 停止實施的年份
    expect(taiwanDstOf({ year: 1962, month: 7, day: 1, hour: 12, minute: 0 })).toBeUndefined();
    expect(taiwanDstOf({ year: 1980, month: 7, day: 1, hour: 12, minute: 0 })).toBeUndefined();
    expect(taiwanDstOf({ year: 2000, month: 7, day: 1, hour: 12, minute: 0 })).toBeUndefined();
  });

  it('起訖當日標為邊界不確定（來源未記載換時時刻）', () => {
    expect(taiwanDstOf({ year: 1975, month: 4, day: 1, hour: 0, minute: 30 })!.boundaryUncertain)
      .toBe(true);
    expect(taiwanDstOf({ year: 1975, month: 9, day: 30, hour: 23, minute: 30 })!.boundaryUncertain)
      .toBe(true);
    expect(taiwanDstOf({ year: 1975, month: 7, day: 1, hour: 12, minute: 0 })!.boundaryUncertain)
      .toBe(false);
  });

  it('起訖當日可由人工裁決不套用，期間中央的日子不受裁決影響', () => {
    const place = { longitude: taipei.longitude, applyTaiwanDst: true, skipDst: true };

    // 起日：裁決生效，那一層記為 0 分且說明改口。
    const boundary = ok(correctBirthTime({ year: 1975, month: 4, day: 1, hour: 12, minute: 0 }, place));
    expect(boundary.dstSkipped).toBe(true);
    expect(boundary.steps[0]).toMatchObject({ label: '夏令時間', minutes: 0 });
    expect(boundary.steps[0]!.detail).toContain('不減這 1 小時');
    expect(boundary.trueSolar.hour).toBe(12);

    // 期間中央：來源沒有不確定性，裁決不得生效。
    const middle = ok(correctBirthTime({ year: 1975, month: 6, day: 1, hour: 12, minute: 0 }, place));
    expect(middle.dstSkipped).toBe(false);
    expect(middle.steps[0]).toMatchObject({ label: '夏令時間', minutes: -60 });
    expect(middle.trueSolar.hour).toBe(11);
  });

  it('1947 年延長至 10/31（原訂 9/30）', () => {
    expect(taiwanDstOf({ year: 1947, month: 10, day: 15, hour: 12, minute: 0 })).toBeDefined();
    expect(taiwanDstOf({ year: 1948, month: 10, day: 15, hour: 12, minute: 0 })).toBeUndefined();
  });
});

describe('addMinutes', () => {
  it('跨日、跨月、跨年都進位正確', () => {
    expect(addMinutes({ year: 2000, month: 1, day: 1, hour: 0, minute: 10 }, -20))
      .toEqual({ year: 1999, month: 12, day: 31, hour: 23, minute: 50 });
    expect(addMinutes({ year: 2000, month: 2, day: 28, hour: 23, minute: 50 }, 20))
      .toEqual({ year: 2000, month: 2, day: 29, hour: 0, minute: 10 }); // 閏年
    expect(addMinutes({ year: 1999, month: 2, day: 28, hour: 23, minute: 50 }, 20))
      .toEqual({ year: 1999, month: 3, day: 1, hour: 0, minute: 10 });
  });
});

describe('correctBirthTime', () => {
  it('三層都出現在 steps，且總分鐘等於各層相加', () => {
    const r = ok(correctBirthTime({ year: 1975, month: 7, day: 1, hour: 12, minute: 0 }, {
      longitude: taipei.longitude,
      applyTaiwanDst: true,
    }));
    expect(r.steps.map((s) => s.label)).toEqual(['夏令時間', '經度差', '均時差']);
    expect(r.totalMinutes).toBeCloseTo(
      r.steps.reduce((n, s) => n + s.minutes, 0),
      10,
    );
  });

  it('經度差為每度 4 分鐘，東經大於 120 為正、小於為負', () => {
    const east = ok(correctBirthTime({ year: 2000, month: 6, day: 1, hour: 12, minute: 0 }, {
      longitude: 121,
    }));
    expect(east.steps.find((s) => s.label === '經度差')!.minutes).toBeCloseTo(4, 10);

    const west = ok(correctBirthTime({ year: 2000, month: 6, day: 1, hour: 12, minute: 0 }, {
      longitude: 118.5,
    }));
    expect(west.steps.find((s) => s.label === '經度差')!.minutes).toBeCloseTo(-6, 10);
    expect(STANDARD_MERIDIAN).toBe(120);
  });

  it('逐項對帳：臺北 1975-07-01 12:00 的三層校正', () => {
    const r = ok(correctBirthTime({ year: 1975, month: 7, day: 1, hour: 12, minute: 0 }, {
      longitude: taipei.longitude,
      applyTaiwanDst: true,
    }));
    const [dstStep, lonStep, eotStep] = r.steps;
    expect(dstStep!.minutes).toBe(-60);
    expect(lonStep!.minutes).toBeCloseTo((taipei.longitude - 120) * 4, 10);
    // 夏令時間先還原成 11:00，經度差後仍是 7/1，故查 7/1 的均時差。
    expect(eotStep!.minutes).toBe(equationOfTimeMinutes(7, 1));
    expect(r.trueSolar).toEqual(
      addMinutes(
        { year: 1975, month: 7, day: 1, hour: 12, minute: 0 },
        Math.round(-60 + (taipei.longitude - 120) * 4 + equationOfTimeMinutes(7, 1)!),
      ),
    );
    expect(r.dayShift).toBe(0);
  });

  it('校正可以把時間推到前一天，dayShift 據實回報', () => {
    // 金門 118.36°，經度差約 −6.6 分；再加 2 月的均時差約 −14 分。
    const r = ok(correctBirthTime({ year: 1990, month: 2, day: 11, hour: 0, minute: 5 }, {
      longitude: countyOf('金門縣')!.longitude,
    }));
    expect(r.totalMinutes).toBeLessThan(-5);
    expect(r.dayShift).toBe(-1);
    expect(r.trueSolar.day).toBe(10);
    expect(r.trueSolar.hour).toBe(23);
  });

  it('海外出生者：手填經度＋自行勾選夏令時間，不套用台灣年份表', () => {
    const clock = { year: 1975, month: 7, day: 1, hour: 12, minute: 0 };
    const auto = ok(correctBirthTime(clock, { longitude: 139.7, standardMeridian: 135 }));
    expect(auto.dst).toBeUndefined();
    expect(auto.steps.some((s) => s.label === '夏令時間')).toBe(false);
    expect(auto.steps[0]!.minutes).toBeCloseTo((139.7 - 135) * 4, 10);

    const manual = ok(correctBirthTime(clock, {
      longitude: 139.7,
      standardMeridian: 135,
      manualDst: true,
    }));
    expect(manual.dst).toBeUndefined();
    expect(manual.steps[0]).toMatchObject({ label: '夏令時間', minutes: -60 });
  });

  it('海外出生者即使身在台灣夏令年份也不會被自動減一小時', () => {
    const r = ok(correctBirthTime({ year: 1975, month: 7, day: 1, hour: 12, minute: 0 }, {
      longitude: 139.7,
      standardMeridian: 135,
      applyTaiwanDst: false,
    }));
    expect(r.steps.some((s) => s.label === '夏令時間')).toBe(false);
  });

  it('非法輸入明確回報，不猜（SPEC-v2 #24）', () => {
    const base = { year: 2000, month: 6, day: 1, hour: 12, minute: 0 };
    expect(correctBirthTime(base, { longitude: 200 }).ok).toBe(false);
    expect(correctBirthTime(base, { longitude: Number.NaN }).ok).toBe(false);
    expect(correctBirthTime(base, { longitude: 121, standardMeridian: 999 }).ok).toBe(false);
    expect(correctBirthTime({ ...base, month: 13 }, { longitude: 121 }).ok).toBe(false);
    expect(correctBirthTime({ ...base, month: 2, day: 30 }, { longitude: 121 }).ok).toBe(false);
    expect(correctBirthTime({ ...base, hour: 24 }, { longitude: 121 }).ok).toBe(false);
    expect(correctBirthTime({ ...base, minute: 60 }, { longitude: 121 }).ok).toBe(false);
    expect(correctBirthTime({ ...base, minute: 1.5 }, { longitude: 121 }).ok).toBe(false);
  });

  it('純函式：同輸入同輸出', () => {
    const clock = { year: 1979, month: 8, day: 15, hour: 7, minute: 30 };
    const place = { longitude: taipei.longitude, applyTaiwanDst: true };
    expect(correctBirthTime(clock, place)).toEqual(correctBirthTime(clock, place));
  });
});

describe('生肖與年柱一致（SPEC-v2 #11）', () => {
  // 1990 年立春 10:11。生於當天 09:00，年柱與生肖都該算前一年（巳蛇），
  // 而不是當年的午馬。
  const clock = { year: 1990, month: 2, day: 4, hour: 9, minute: 0 };

  it('立春當天有時辰時，baziChart 的生肖與 analyse 的生肖相同', () => {
    const c = ok(correctBirthTime(clock, { longitude: taipei.longitude, applyTaiwanDst: true }));
    const chart = ok(baziChart(c.trueSolar));
    const named = analyse({
      surname: '王',
      givenName: '小明',
      birth: {
        year: c.trueSolar.year,
        month: c.trueSolar.month,
        day: c.trueSolar.day,
        hour: c.trueSolar.hour,
        minute: c.trueSolar.minute,
      },
    });
    expect(named.ok).toBe(true);
    if (!named.ok) return;
    expect(chart.animal).toBe('蛇');
    expect(named.zodiac.animal).toBe(chart.animal);
    expect(named.zodiac.boundaryAmbiguous).toBe(false);
  });

  it('沒有時辰時，立春當天照實回報無法判定，不猜', () => {
    const named = analyse({ surname: '王', givenName: '小明', birth: { year: 1990, month: 2, day: 4 } });
    expect(named.ok).toBe(true);
    if (!named.ok) return;
    expect(named.zodiac.boundaryAmbiguous).toBe(true);
  });
});

describe('與排盤串接', () => {
  it('校正後的時間才是 baziChart 的輸入，跨時辰時四柱會改變', () => {
    // 1975 年夏令時間中，時鐘 13:20 還原後為 12:20，再經度差 −0.5 分、
    // 均時差 −5 分左右 —— 由午時（11–13）退回午時前段，時支不變；
    // 但時鐘 13:05 就會被推回午時。
    const clock = { year: 1975, month: 8, day: 1, hour: 13, minute: 5 };
    const r = ok(correctBirthTime(clock, { longitude: taipei.longitude, applyTaiwanDst: true }));
    const raw = ok(baziChart(clock));
    const corrected = ok(baziChart(r.trueSolar));
    expect(raw.pillars[3]!.pillar.branch.name).toBe('未');
    expect(corrected.pillars[3]!.pillar.branch.name).toBe('午');
  });
});
