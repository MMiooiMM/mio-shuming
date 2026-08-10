import { describe, expect, it } from 'vitest';
import { zodiacOf } from '../engine/zodiac.ts';
import { animalOfBranch, baziChart } from './chart.ts';

function ok(dt: Parameters<typeof baziChart>[0], opts?: Parameters<typeof baziChart>[1]) {
  const r = baziChart(dt, opts);
  if (!r.ok) throw new Error(`baziChart 失敗：${r.reason}`);
  return r;
}

describe('完整命盤（SPEC-v2 #10）', () => {
  const r = ok({ year: 1994, month: 7, day: 30, hour: 13, minute: 37 });

  it('四柱齊備且與來源命例一致', () => {
    expect(r.pillars.map((p) => p.pillar.name)).toEqual(['甲戌', '辛未', '丁巳', '丁未']);
    expect(r.pillars.map((p) => p.position)).toEqual(['年柱', '月柱', '日柱', '時柱']);
    expect(r.dayMaster.name).toBe('丁');
  });

  it('每柱都帶藏干與十神', () => {
    for (const p of r.pillars) {
      expect(p.hidden.length, `${p.position} 藏干`).toBeGreaterThan(0);
      for (const h of p.hidden) expect(h.shishen).toBeTruthy();
    }
    // 日柱天干即日主，不論十神
    const day = r.pillars.find((p) => p.position === '日柱')!;
    expect(day.stemShiShen).toBeUndefined();
    // 年柱甲木對丁火日主：木生火、甲陽異於丁陰 -> 正印
    const year = r.pillars.find((p) => p.position === '年柱')!;
    expect(year.stemShiShen).toBe('正印');
  });

  it('五行分佈同時給「只計天干」與「含藏干」兩種', () => {
    // 天干 甲(木) 辛(金) 丁(火) 丁(火)
    expect(r.distribution.stems).toEqual({ 木: 1, 火: 2, 土: 0, 金: 1, 水: 0 });
    // 含藏干必定 >= 只計天干，且總數為 4 + 各支藏干數
    const hiddenCount = r.pillars.reduce((n, p) => n + p.hidden.length, 0);
    const total = Object.values(r.distribution.withHidden).reduce((a, b) => a + b, 0);
    expect(total).toBe(4 + hiddenCount);
    for (const e of ['木', '火', '土', '金', '水'] as const) {
      expect(r.distribution.withHidden[e]).toBeGreaterThanOrEqual(r.distribution.stems[e]);
    }
  });

  it('missing 依「含藏干」計算', () => {
    for (const e of r.missing) expect(r.distribution.withHidden[e]).toBe(0);
  });
});

describe('生肖由年柱地支導出（SPEC-v2 #11）', () => {
  it('animalOfBranch 對十二支都有對應', () => {
    const branches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    const animals = branches.map((b) => animalOfBranch(b));
    expect(animals).toEqual(['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬']);
    expect(animalOfBranch('X')).toBeUndefined();
  });

  it('命盤的生肖與年柱地支必然相符', () => {
    for (const y of [1984, 1985, 2000, 2024, 2025]) {
      const c = ok({ year: y, month: 6, day: 1, hour: 12, minute: 0 });
      expect(animalOfBranch(c.pillars[0]!.pillar.branch.name)).toBe(c.animal);
    }
  });

  // 這是 reviewer 抓到的 BLOCKER 的回歸測試：
  // 1985 立春 2/4 05:13。生於當天 04:00 的人在立春「之前」，應為 1984 甲子鼠年。
  // 修正前 v1 的 zodiacOf 只看日期，整個立春當日都算新年，會回報「牛」，
  // 與 v2 年柱的「鼠」矛盾。
  it('立春當日、交節前出生：v1 生肖與 v2 年柱一致', () => {
    const c = ok({ year: 1985, month: 2, day: 4, hour: 4, minute: 0 });
    expect(c.solarYear).toBe(1984);
    expect(c.animal).toBe('鼠');

    const v1WithTime = zodiacOf(1985, 2, 4, { hour: 4, minute: 0 })!;
    expect(v1WithTime.animal).toBe('鼠');
    expect(v1WithTime.animal).toBe(c.animal);
    expect(v1WithTime.boundaryAmbiguous).toBe(false); // 有時刻就已定案
  });

  it('立春當日、交節後出生：同樣一致', () => {
    const c = ok({ year: 1985, month: 2, day: 4, hour: 6, minute: 0 });
    expect(c.animal).toBe('牛');
    expect(zodiacOf(1985, 2, 4, { hour: 6, minute: 0 })!.animal).toBe('牛');
  });

  it('沒有時刻時 v1 仍據實回報無法定案（v1 單獨使用的行為不變）', () => {
    const v1 = zodiacOf(1985, 2, 4)!;
    expect(v1.boundaryAmbiguous).toBe(true);
    expect(v1.alternativeAnimal).toBe('鼠');
  });

  it('非立春當日時，有無時刻結果都一樣', () => {
    for (const [m, d] of [[1, 20], [2, 5], [12, 31]] as const) {
      const withTime = zodiacOf(1985, m, d, { hour: 3, minute: 0 })!;
      const withoutTime = zodiacOf(1985, m, d)!;
      expect(withTime.animal, `${m}/${d}`).toBe(withoutTime.animal);
      expect(withTime.boundaryAmbiguous).toBe(false);
    }
  });
});

describe('命盤沿用四柱的失敗回報', () => {
  it('超出節氣資料範圍時回報原因，不猜', () => {
    const r = baziChart({ year: 1899, month: 6, day: 1, hour: 12, minute: 0 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('節氣資料範圍');
  });
});
