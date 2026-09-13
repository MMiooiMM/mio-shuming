// 取名模式（naming-ui.ts）與分析模式（main.ts）共用的渲染 helpers 與資料來源區塊。
import {
  CHAR_WUXING_SOURCE,
  CHAR_WUXING_STATS,
  COMPONENT_SOURCE,
  DST_EXCLUDED,
  DST_SOURCE,
  GLOSSARY,
  KANGXI_SOURCE,
  LICHUN_SOURCE,
  LOCATION_SOURCE,
  NUMEROLOGY_SOURCE,
  TIAOHOU_SOURCE,
  WANGXIANG_SOURCE,
  ZODIAC_SOURCE,
} from './data/index.ts';
import type { CharVerdict, Luck } from './engine/index.ts';
import type { SummaryTone } from './engine/summary.ts';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

// --- 名詞就地解釋（SPEC-v4 #9、#10）-------------------------------------------
//
// 解釋文字只從 glossary.json 來。按鈕是原生 <button>，Enter／Space 由瀏覽器轉成
// click，所以只需要一個 click 處理（WAI-ARIA APG Disclosure pattern：role button、
// aria-expanded 反映顯示狀態、aria-controls 指向說明區塊）。
// 說明區塊用 `hidden` 屬性切換——style.css 的 `[hidden]{display:none!important}`
// 保證不會被 class 的 display 蓋掉。

/** 一個名詞的「按鈕＋說明區塊」。`scope` 讓兩個模式同時在 DOM 裡時 id 不相撞。 */
export interface TermParts {
  button: string;
  panel: string;
}

export function termParts(term: string, scope: string): TermParts {
  const index = GLOSSARY.findIndex((g) => g.term === term);
  const entry = GLOSSARY[index];
  // 名詞沒收錄就不出按鈕，不臆造說明；glossary.test.ts 保證指定名詞都在。
  if (!entry) return { button: '', panel: '' };
  const id = `term-${scope}-${index}`;
  return {
    button: `<button type="button" class="term-toggle" data-action="toggle-term"
      aria-expanded="false" aria-controls="${id}" aria-label="${esc(entry.term)}是什麼？">?</button>`,
    panel: `<p class="term-text" id="${id}" hidden><strong>${esc(entry.term)}</strong>　${esc(entry.text)}</p>`,
  };
}

/**
 * 處理名詞按鈕的點擊（含鍵盤 Enter／Space 觸發的 click）。命中並處理回 true，
 * 呼叫端即可結束自己的 click 處理。
 */
export function handleTermToggle(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const button = target.closest<HTMLButtonElement>('[data-action="toggle-term"]');
  if (!button) return false;
  const panelId = button.getAttribute('aria-controls');
  const panel = panelId ? document.getElementById(panelId) : null;
  if (!panel) return true;
  const expand = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', String(expand));
  panel.hidden = !expand;
  return true;
}

/** 分項標籤（摘要、收藏比較）的語氣 → 樣式。 */
export const TONE_CLASS: Record<SummaryTone, string> = {
  good: 'tag--good',
  bad: 'tag--bad',
  // 黃色只留給半吉與喜忌並見；中性字、用神五行用灰色（SPEC-v4 #25）。
  // 資料不足（未定、五行不明、喜用為空）用細框無底色的 tag--unknown，不借用任何吉凶色。
  mid: 'tag--mid',
  neutral: 'tag--neutral',
  unknown: 'tag--unknown',
};

export function luckClass(luck: Luck): string {
  return luck === '吉' ? 'tag--good' : luck === '半吉' ? 'tag--mid' : 'tag--bad';
}

export function verdictClass(v: CharVerdict['verdict']): string {
  if (v === '喜') return 'tag--good';
  if (v === '忌') return 'tag--bad';
  if (v === '喜忌並見') return 'tag--mid';
  return 'tag--neutral';
}

/** 名詞解釋的出處，同一網址的名詞併成一列（五格五條都出自同一本書）。 */
function glossarySourceRows(): [string, string, string][] {
  const byUrl = new Map<string, { terms: string[]; notes: string[] }>();
  for (const g of GLOSSARY) {
    const row = byUrl.get(g.source.url) ?? { terms: [], notes: [] };
    row.terms.push(g.term);
    row.notes.push(`${g.term}：${g.source.note}`);
    byUrl.set(g.source.url, row);
  }
  return [...byUrl].map(([url, r]) => [`名詞解釋・${r.terms.join('、')}`, r.notes.join(' '), url]);
}

/**
 * 來源連結的顯示文字：網域加 ↗（SPEC-v4 #36）。整串 URL 會把上游檔名
 * （Unihan.zip 之類）搬上畫面；href 照舊指向完整網址。
 */
export function linkText(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host) return `${host} ↗`;
  } catch {
    // 網址無效時不猜網域。
  }
  return '來源連結 ↗';
}

/**
 * 資料來源區塊。天格／單名外格「不計吉凶」只適用取名模式，
 * 分析模式不列這兩條，維持既有分析頁內容不變（SPEC-v3 #1）。
 */
export function sourcesSection(mode: 'analysis' | 'naming' = 'analysis'): string {
  // [標題, 說明, 連結]。說明與連結必須分開存放 —— 把註解文字併進 URL 會產生
  // 壞掉的 href。
  const namingRows: [string, string, string][] =
    mode === 'naming'
      ? [
          ['天格不計吉凶（取名模式）', NUMEROLOGY_SOURCE.tianGrid.note, NUMEROLOGY_SOURCE.tianGrid.url],
          [
            '單名外格不計吉凶（取名模式）',
            NUMEROLOGY_SOURCE.waiGridSingleGiven.note,
            NUMEROLOGY_SOURCE.waiGridSingleGiven.url,
          ],
        ]
      : [];
  const rows: [string, string, string][] = [
    ['康熙筆畫', `${KANGXI_SOURCE.derivation}。資料取自 ${KANGXI_SOURCE.unihan}`, KANGXI_SOURCE.url],
    ['81 數理・五格規則', NUMEROLOGY_SOURCE.table81.note, NUMEROLOGY_SOURCE.table81.url],
    ['五格假1 規則', NUMEROLOGY_SOURCE.wuge.note, NUMEROLOGY_SOURCE.wuge.url],
    ...namingRows,
    ['五行配屬・生剋', NUMEROLOGY_SOURCE.wuxing.note, NUMEROLOGY_SOURCE.wuxing.url],
    ['生肖字根喜忌', ZODIAC_SOURCE.radicals.note, ZODIAC_SOURCE.radicals.url],
    ['地支六合三合沖害', ZODIAC_SOURCE.earthlyBranches.note, ZODIAC_SOURCE.earthlyBranches.url],
    [
      '立春時刻',
      `${LICHUN_SOURCE.algorithm}。${LICHUN_SOURCE.deltaT}。已對照 ${LICHUN_SOURCE.verifiedAgainst}`,
      LICHUN_SOURCE.verifiedAgainstUrl,
    ],
    [
      '用神・月令旺相休囚死',
      `${WANGXIANG_SOURCE.book}。本站以日主五行在月令為「旺」或「相」即得令；` +
        `得令另有臨官帝旺說、月支藏干說、分日司令說，各家分歧另有記錄，本站不擅自調和。`,
      WANGXIANG_SOURCE.url,
    ],
    [
      '用神・四季調候',
      `${TIAOHOU_SOURCE.book}。只有冬（補火）、夏（補水）兩季驅動判定——那是五行總論裡` +
        `五個五行一致的部分；春秋原文為條件式敘述，只列原文供參，不做調候修正。${TIAOHOU_SOURCE.note}`,
      TIAOHOU_SOURCE.url,
    ],
    [
      '縣市經度（真太陽時校正）',
      `${LOCATION_SOURCE.dataset}（${LOCATION_SOURCE.provider}，${LOCATION_SOURCE.license}）。` +
        `${LOCATION_SOURCE.derivation}${LOCATION_SOURCE.excluded}`,
      LOCATION_SOURCE.url,
    ],
    [
      '台灣夏令時間年份',
      `${DST_SOURCE.note} 本站不列入 ${DST_EXCLUDED.year} 年（${DST_EXCLUDED.range}）：${DST_EXCLUDED.reason}`,
      DST_SOURCE.url,
    ],
    [
      '逐字五行（姓名匹配的尺）',
      `${CHAR_WUXING_SOURCE.wuxing.dataset}，授權 ${CHAR_WUXING_SOURCE.wuxing.license}。` +
        `${CHAR_WUXING_SOURCE.wuxing.caveat} 對常用字的覆蓋率 ${CHAR_WUXING_STATS.commonCoverage}，` +
        '其餘回報「五行不明」不猜；上游有兩說的字一律不選邊。',
      CHAR_WUXING_SOURCE.wuxing.url,
    ],
    [
      '常用字表（候選字過濾）',
      `${CHAR_WUXING_SOURCE.common.dataset}，共 ${CHAR_WUXING_STATS.commonChars} 字。` +
        CHAR_WUXING_SOURCE.common.caveat,
      CHAR_WUXING_SOURCE.common.url,
    ],
    [
      '字根拆解（IDS）',
      `${COMPONENT_SOURCE.ids}（授權 ${COMPONENT_SOURCE.license}）。${COMPONENT_SOURCE.variantTable}`,
      COMPONENT_SOURCE.url,
    ],
    ...glossarySourceRows(),
  ];
  return `
    <section class="card" id="sources">
      <details class="sources-toggle">
      <summary><h2 class="section__title">資料來源（${rows.length} 項）</h2></summary>
      <dl class="sources">
        ${rows
          .map(
            ([title, note, url]) => `
          <dt>${esc(title)}</dt>
          <dd>${esc(note)}</dd>
          <dd><a href="${esc(url)}" target="_blank" rel="noreferrer noopener"
            aria-label="${esc(`${title}來源：${linkText(url).replace(' ↗', '')}（另開新視窗）`)}">${esc(linkText(url))}</a></dd>`,
          )
          .join('')}
      </dl>
      </details>
    </section>`;
}
