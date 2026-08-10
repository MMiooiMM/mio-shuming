import { describe, expect, it } from 'vitest';
import {
  CLASSICAL_HIDDEN_STEMS,
  HIDDEN_STEMS_CONFLICTS,
  STEMS,
  hiddenStemsOf,
} from '../data/index.ts';
import { hiddenShiShenOf, relationTo, shishenOf } from './shishen.ts';

const stem = (name: string) => STEMS.find((s) => s.name === name)!;

describe('地支藏干', () => {
  // 決定性檢驗：本檔的藏干「集合」必須與《淵海子平·又地支藏遁歌》原文一致。
  // 古籍只列藏干、不標本／中／餘，故只比集合不比順序。
  it.each(Object.keys(CLASSICAL_HIDDEN_STEMS))('%s 的藏干集合與《淵海子平》一致', (branch) => {
    const ours = hiddenStemsOf(branch).map((h) => h.stem).sort();
    const classical = [...CLASSICAL_HIDDEN_STEMS[branch]!].sort();
    expect(ours).toEqual(classical);
  });

  it('四正（子午卯酉）藏干最少，四庫（辰戌丑未）皆藏三干', () => {
    expect(hiddenStemsOf('子').map((h) => h.stem)).toEqual(['癸']);
    expect(hiddenStemsOf('卯').map((h) => h.stem)).toEqual(['乙']);
    expect(hiddenStemsOf('酉').map((h) => h.stem)).toEqual(['辛']);
    for (const b of ['辰', '戌', '丑', '未']) {
      expect(hiddenStemsOf(b), b).toHaveLength(3);
    }
  });

  it('第一個一定是本氣，且順序為本氣→中氣→餘氣', () => {
    for (const b of ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']) {
      const roles = hiddenStemsOf(b).map((h) => h.role);
      expect(roles[0], b).toBe('本氣');
      expect(roles, b).toEqual(['本氣', '中氣', '餘氣'].slice(0, roles.length));
    }
  });

  it('子午卯酉的本氣與地支自身的陰陽相反（體用不同，不可混用）', () => {
    // 子是陽支但藏癸（陰干）、午是陽支但本氣丁（陰干）——
    // 若誤用維基〈地支〉表的「天干」配對欄，十神會全盤錯。
    expect(hiddenStemsOf('子')[0]!.stem).toBe('癸');
    expect(stem('癸').yin).toBe(true);
    expect(hiddenStemsOf('午')[0]!.stem).toBe('丁');
    expect(stem('丁').yin).toBe(true);
    expect(hiddenStemsOf('亥')[0]!.stem).toBe('壬');
    expect(stem('壬').yin).toBe(false);
  });

  it('未採用的古籍異說有被記錄下來（酉是否兼藏庚）', () => {
    expect(HIDDEN_STEMS_CONFLICTS.join('')).toContain('酉');
    expect(HIDDEN_STEMS_CONFLICTS.join('')).toContain('庚');
  });

  it('不存在的地支回傳空陣列，不猜', () => {
    expect(hiddenStemsOf('X')).toEqual([]);
  });
});

describe('十神（五行生剋 × 陰陽同異）', () => {
  it('以甲（陽木）為日主時，十神全數正確', () => {
    // 同我木：甲陽=比肩、乙陰=劫財
    expect(shishenOf(stem('甲'), stem('甲'))).toBe('比肩');
    expect(shishenOf(stem('甲'), stem('乙'))).toBe('劫財');
    // 我生火：丙陽=食神、丁陰=傷官
    expect(shishenOf(stem('甲'), stem('丙'))).toBe('食神');
    expect(shishenOf(stem('甲'), stem('丁'))).toBe('傷官');
    // 我剋土：戊陽=偏財、己陰=正財
    expect(shishenOf(stem('甲'), stem('戊'))).toBe('偏財');
    expect(shishenOf(stem('甲'), stem('己'))).toBe('正財');
    // 剋我金：庚陽=七殺、辛陰=正官
    expect(shishenOf(stem('甲'), stem('庚'))).toBe('七殺');
    expect(shishenOf(stem('甲'), stem('辛'))).toBe('正官');
    // 生我水：壬陽=偏印、癸陰=正印
    expect(shishenOf(stem('甲'), stem('壬'))).toBe('偏印');
    expect(shishenOf(stem('甲'), stem('癸'))).toBe('正印');
  });

  it('以癸（陰水）為日主時，陰陽同異對調', () => {
    expect(shishenOf(stem('癸'), stem('癸'))).toBe('比肩');
    expect(shishenOf(stem('癸'), stem('壬'))).toBe('劫財'); // 同水異陰陽
    expect(shishenOf(stem('癸'), stem('乙'))).toBe('食神'); // 水生木，乙陰同性
    expect(shishenOf(stem('癸'), stem('甲'))).toBe('傷官');
    expect(shishenOf(stem('癸'), stem('丁'))).toBe('偏財'); // 水剋火，丁陰同性
    expect(shishenOf(stem('癸'), stem('丙'))).toBe('正財');
    expect(shishenOf(stem('癸'), stem('己'))).toBe('七殺'); // 土剋水，己陰同性
    expect(shishenOf(stem('癸'), stem('戊'))).toBe('正官');
    expect(shishenOf(stem('癸'), stem('辛'))).toBe('偏印'); // 金生水，辛陰同性
    expect(shishenOf(stem('癸'), stem('庚'))).toBe('正印');
  });

  it('十個日主 × 十個天干，全部 100 組都得到十神之一，且分佈平均', () => {
    const counts = new Map<string, number>();
    for (const dm of STEMS) {
      for (const other of STEMS) {
        const s = shishenOf(dm, other);
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(10);
    // 每個日主對十天干恰好產生十種十神各一次 -> 每種各 10 次
    for (const [name, n] of counts) expect(n, name).toBe(10);
  });

  it('五行關係判定涵蓋全部五種，無漏接', () => {
    expect(relationTo('木', '木')).toBe('同我');
    expect(relationTo('木', '火')).toBe('我生');
    expect(relationTo('木', '土')).toBe('我剋');
    expect(relationTo('木', '金')).toBe('剋我');
    expect(relationTo('木', '水')).toBe('生我');
  });
});

describe('藏干十神', () => {
  it('丁日主看未（己丁乙）：食神、比肩、偏印', () => {
    const got = hiddenShiShenOf(stem('丁'), '未');
    expect(got.map((h) => `${h.stem}${h.role}=${h.shishen}`)).toEqual([
      '己本氣=食神', // 火生土，己陰同丁陰
      '丁中氣=比肩',
      '乙餘氣=偏印', // 木生火，乙陰同丁陰
    ]);
  });

  it('戊日主看子（癸）：正財', () => {
    // 土剋水，癸陰異於戊陽 -> 正財
    expect(hiddenShiShenOf(stem('戊'), '子')).toEqual([
      { stem: '癸', role: '本氣', element: '水', shishen: '正財' },
    ]);
  });
});
