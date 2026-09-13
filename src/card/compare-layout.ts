// 比較卡片的版面模型（SPEC-v4 #13）——純函式，只決定要畫哪些文字與區塊；繪製在 draw.ts。
//
// 隱私：卡片**只印生肖、不印預產期**。輸入是 `compareEntry()` 的輸出（本身就不含 due），
// 這裡再逐欄取值——就算呼叫端塞了多餘屬性（例如 due），也不會帶上卡片。
// 標籤原樣取自 `compareEntry()`（比較視圖同一函式），不計數、不排序、不選最佳。

import type { CompareEntry } from '../engine/compare.ts';
import type { SummaryGroup } from '../engine/summary.ts';
import { CARD_FOOTER, CARD_HEIGHT, CARD_SITE, CARD_WIDTH } from './layout.ts';
import type { CardRow, CardTagGroup } from './layout.ts';

export interface CompareCardBlock {
  name: string;
  rows: CardRow[];
  groups: CardTagGroup[];
  /** 無法比較（罕字等）時的原因；此時 rows／groups 為空。 */
  note?: string;
}

export interface CompareCardLayout {
  width: number;
  /** 最小高度；名字多、標籤多時繪製端會加高（寬度固定）。 */
  minHeight: number;
  heading: string;
  groupsNote: string;
  blocks: CompareCardBlock[];
  footer: string;
}

const GROUP_ORDER: SummaryGroup[] = ['三才', '五格', '生肖'];

export function compareCardLayout(entries: readonly CompareEntry[]): CompareCardLayout {
  const blocks = entries.map<CompareCardBlock>((e) => {
    if (!e.ok) return { name: e.name, rows: [], groups: [], note: e.reason };
    const groups: CardTagGroup[] = [];
    for (const group of GROUP_ORDER) {
      const tags = e.tags
        .filter((t) => t.group === group)
        .map(({ label, verdict, tone }) => ({ label, verdict, tone }));
      if (tags.length) groups.push({ group, tags });
    }
    return {
      name: e.name,
      rows: [{ label: '生肖', value: e.zodiacText }],
      groups,
    };
  });

  return {
    width: CARD_WIDTH,
    minHeight: CARD_HEIGHT,
    heading: `${CARD_SITE}　候選名比較`,
    groupsNote: '各名各項獨立判定，不計數、不加總、不排名',
    blocks,
    footer: CARD_FOOTER,
  };
}

/** 比較卡片上會出現的所有文字，依繪製順序——給測試與除錯用。 */
export function compareCardText(layout: CompareCardLayout): string {
  return [
    layout.heading,
    layout.groupsNote,
    ...layout.blocks.flatMap((b) => [
      b.name,
      ...b.rows.map((r) => `${r.label} ${r.value}`),
      ...(b.note ? [b.note] : []),
      ...b.groups.flatMap((g) => [g.group, ...g.tags.map((t) => `${t.label} ${t.verdict}`)]),
    ]),
    layout.footer,
  ].join('\n');
}
