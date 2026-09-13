// SPEC-v4 #12、#13：收藏比較的標籤與比較卡片版面模型。
import { describe, expect, it } from 'vitest';
import { ZODIAC_UNKNOWN, compareEntry } from '../engine/compare.ts';
import type { CompareEntry, CompareEntryOk, CompareSource } from '../engine/compare.ts';
import { LICHUN_WINDOW_DAYS, dueZodiac } from '../engine/naming.ts';
import { compareCardLayout, compareCardText } from './compare-layout.ts';
import { CARD_FOOTER } from './layout.ts';

const ok = (e: CompareEntry): CompareEntryOk => {
  if (!e.ok) throw new Error(e.reason);
  return e;
};

const FAVS: CompareSource[] = [
  { surname: '王', givenName: '小明', due: { year: 2026, month: 6, day: 15 } },
  // 2026 立春為 2 月 4 日：2 月 10 日在 ±3 週內。
  { surname: '王', givenName: '大同', due: { year: 2026, month: 2, day: 10 } },
  { surname: '王', givenName: '美玲' },
  { surname: '王', givenName: '明', due: { year: 2027, month: 6, day: 1 } },
];

describe('compareEntry', () => {
  it('雙名列三才＋人地外總四格，不列天格；單名不列外格（SPEC-v3 #3）', () => {
    const double = ok(compareEntry(FAVS[0]!));
    expect(double.tags.filter((t) => t.group === '五格').map((t) => t.label)).toEqual(['人格', '地格', '外格', '總格']);
    expect(double.tags[0]).toMatchObject({ group: '三才', label: '三才' });
    const single = ok(compareEntry(FAVS[3]!));
    expect(single.tags.filter((t) => t.group === '五格').map((t) => t.label)).toEqual(['人格', '地格', '總格']);
  });

  it('有預產期：依 dueZodiac 換算生肖，字根逐字列', () => {
    const e = ok(compareEntry(FAVS[0]!));
    expect(e.animals).toEqual(['馬']);
    expect(e.zodiacText).toBe('馬');
    expect(e.tags.filter((t) => t.group === '生肖').map((t) => t.label)).toEqual(['王', '小', '明']);
  });

  it('立春 ±3 週內：兩生肖並列，字根依兩肖各列並標明', () => {
    const z = dueZodiac(2026, 2, 10)!;
    expect(Math.abs(z.daysFromLichun)).toBeLessThanOrEqual(LICHUN_WINDOW_DAYS);
    const e = ok(compareEntry(FAVS[1]!));
    expect(e.animals).toEqual(['蛇', '馬']);
    expect(e.zodiacText).toBe('蛇 或 馬');
    const labels = e.tags.filter((t) => t.group === '生肖').map((t) => t.label);
    expect(labels).toEqual(['王（蛇）', '大（蛇）', '同（蛇）', '王（馬）', '大（馬）', '同（馬）']);
  });

  it('無預產期（舊收藏）：生肖未知，不判字根，不猜', () => {
    const e = ok(compareEntry(FAVS[2]!));
    expect(e.animals).toEqual([]);
    expect(e.zodiacText).toBe(ZODIAC_UNKNOWN);
    expect(e.tags.some((t) => t.group === '生肖')).toBe(false);
  });

  it('曆上不存在的預產期當作未知，不進位猜測', () => {
    const e = ok(compareEntry({ surname: '王', givenName: '小明', due: { year: 2027, month: 2, day: 30 } }));
    expect(e.zodiacText).toBe(ZODIAC_UNKNOWN);
  });

  it('查無筆畫的字據實回報', () => {
    const e = compareEntry({ surname: '𡈙', givenName: '明' });
    expect(e.ok).toBe(false);
  });
});

describe('compareCardLayout', () => {
  const entries = FAVS.map(compareEntry);

  it('卡片不含任何日期字串（只印生肖、不印預產期）', () => {
    // 故意把 due 一起塞進去（繞過型別），確認不會帶上卡片。
    const leaky = FAVS.map((f) => ({ ...compareEntry(f), due: f.due })) as CompareEntry[];
    const layout = compareCardLayout(leaky);
    const text = compareCardText(layout);
    expect(text).not.toMatch(/\d{4}[-/年]/);
    expect(JSON.stringify(layout)).not.toMatch(/"due"|"year"|"month"|"day"|2026|2027/);
  });

  it('立春窗內含兩生肖；無 due 顯示未知', () => {
    const layout = compareCardLayout(entries);
    const zodiac = layout.blocks.map((b) => b.rows.find((r) => r.label === '生肖')?.value);
    expect(zodiac).toEqual(['馬', '蛇 或 馬', ZODIAC_UNKNOWN, '羊']);
    const text = compareCardText(layout);
    expect(text).toContain('王（蛇）');
    expect(text).toContain('王（馬）');
  });

  it('標籤原樣來自 compareEntry，名字順序照勾選順序，不計數、不選最佳；底部署名同分析卡', () => {
    const layout = compareCardLayout(entries);
    expect(layout.blocks.map((b) => b.name)).toEqual(['王小明', '王大同', '王美玲', '王明']);
    layout.blocks.forEach((b, i) => {
      const e = ok(entries[i]!);
      expect(b.groups.flatMap((g) => g.tags.map((t) => ({ group: g.group, ...t })))).toEqual(e.tags);
    });
    const text = compareCardText(layout);
    expect(text).not.toMatch(/\d+\s*[項個]\s*[吉凶]/);
    expect(text).not.toMatch(/最佳|推薦|總分|合計/);
    expect(layout.footer).toBe(CARD_FOOTER);
    expect(layout.width).toBe(1080);
  });

  it('無法比較的名字列出原因，不畫標籤', () => {
    const layout = compareCardLayout([compareEntry({ surname: '𡈙', givenName: '明' })]);
    expect(layout.blocks[0]!.groups).toEqual([]);
    expect(layout.blocks[0]!.note).toContain('查無此字');
  });
});
