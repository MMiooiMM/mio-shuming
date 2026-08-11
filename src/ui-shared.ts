// 取名模式（naming-ui.ts）與分析模式（main.ts）共用的渲染 helpers 與資料來源區塊。
import {
  CHAR_WUXING_SOURCE,
  CHAR_WUXING_STATS,
  COMPONENT_SOURCE,
  DST_EXCLUDED,
  DST_SOURCE,
  KANGXI_SOURCE,
  LICHUN_SOURCE,
  LOCATION_SOURCE,
  NUMEROLOGY_SOURCE,
  TIAOHOU_SOURCE,
  WANGXIANG_SOURCE,
  ZODIAC_SOURCE,
} from './data/index.ts';
import type { CharVerdict, Luck } from './engine/index.ts';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export function luckClass(luck: Luck): string {
  return luck === '吉' ? 'tag--good' : luck === '半吉' ? 'tag--mid' : 'tag--bad';
}

export function verdictClass(v: CharVerdict['verdict']): string {
  if (v === '喜') return 'tag--good';
  if (v === '忌') return 'tag--bad';
  if (v === '喜忌並見') return 'tag--mid';
  return 'tag--flat';
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
        `得令另有臨官帝旺說、月支藏干說、分日司令說，分歧記於資料檔的 conflicts。`,
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
  ];
  return `
    <section class="card" id="sources">
      <h2 class="section__title">資料來源</h2>
      <dl class="sources">
        ${rows
          .map(
            ([title, note, url]) => `
          <dt>${esc(title)}</dt>
          <dd>${esc(note)}</dd>
          <dd><a href="${esc(url)}" target="_blank" rel="noreferrer noopener">${esc(url)}</a></dd>`,
          )
          .join('')}
      </dl>
    </section>`;
}
