import './style.css';
import {
  COMPONENT_SOURCE,
  KANGXI_SOURCE,
  LICHUN_SOURCE,
  NUMEROLOGY_SOURCE,
  ZODIAC_SOURCE,
} from './data/index.ts';
import { analyse } from './engine/index.ts';
import type { Analysis, CharVerdict, Element, Grid, Luck } from './engine/index.ts';

const form = document.querySelector<HTMLFormElement>('#form');
const resultEl = document.querySelector<HTMLDivElement>('#result');

const ELEMENTS: Element[] = ['木', '火', '土', '金', '水'];

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

function luckClass(luck: Luck): string {
  return luck === '吉' ? 'tag--good' : luck === '半吉' ? 'tag--mid' : 'tag--bad';
}

function verdictClass(v: CharVerdict['verdict']): string {
  if (v === '喜') return 'tag--good';
  if (v === '忌') return 'tag--bad';
  if (v === '喜忌並見') return 'tag--mid';
  return 'tag--flat';
}

function gridItem(g: Grid): string {
  return `
    <li class="grid-item">
      <span class="grid-item__name">${esc(g.name)}</span>
      <span class="grid-item__value"><b>${g.value}</b>${esc(g.element)}</span>
      <span class="tag ${luckClass(g.fate.luck)}">${esc(g.fate.luck)}・${esc(g.fate.title)}</span>
      <span class="grid-item__detail">${esc(g.formula)}　—　${esc(g.fate.text)}</span>
    </li>`;
}

function charItem(c: CharVerdict): string {
  return `
    <li class="char-item">
      <span class="char-item__char">${esc(c.char)}</span>
      <span class="tag ${verdictClass(c.verdict)}">${esc(c.verdict)}</span>
      <span class="char-item__why">${esc(c.explanation)}</span>
    </li>`;
}

function sourcesSection(): string {
  // [標題, 說明, 連結]。說明與連結必須分開存放 —— 把註解文字併進 URL 會產生
  // 壞掉的 href。
  const rows: [string, string, string][] = [
    ['康熙筆畫', `${KANGXI_SOURCE.derivation}。資料取自 ${KANGXI_SOURCE.unihan}`, KANGXI_SOURCE.url],
    ['81 數理・五格規則', NUMEROLOGY_SOURCE.table81.note, NUMEROLOGY_SOURCE.table81.url],
    ['五格假1 規則', NUMEROLOGY_SOURCE.wuge.note, NUMEROLOGY_SOURCE.wuge.url],
    ['五行配屬・生剋', NUMEROLOGY_SOURCE.wuxing.note, NUMEROLOGY_SOURCE.wuxing.url],
    ['生肖字根喜忌', ZODIAC_SOURCE.radicals.note, ZODIAC_SOURCE.radicals.url],
    ['地支六合三合沖害', ZODIAC_SOURCE.earthlyBranches.note, ZODIAC_SOURCE.earthlyBranches.url],
    ['立春時刻', `${LICHUN_SOURCE.algorithm}。${LICHUN_SOURCE.deltaT}`, LICHUN_SOURCE.url],
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

function render(a: Analysis): string {
  const fullName = esc(a.surname + a.givenName);
  const strokeTotal = a.strokes.reduce((n, s) => n + (s.strokes ?? 0), 0);

  return `
    <section class="card">
      <h2 class="section__title">
        <span>${fullName}　筆畫</span>
        <span class="section__note">康熙筆畫，共 ${strokeTotal} 畫</span>
      </h2>
      <ul class="strokes">
        ${a.strokes
          .map(
            (s) => `<li>
              <span class="strokes__char">${esc(s.char)}</span>
              <span class="strokes__n">${s.strokes} 畫</span>
            </li>`,
          )
          .join('')}
      </ul>
    </section>

    <section class="card">
      <h2 class="section__title">
        <span>三才五格</span>
        <span class="section__note">各格獨立判定</span>
      </h2>
      <ul class="grids">${a.grids.map(gridItem).join('')}</ul>
    </section>

    <section class="card">
      <h2 class="section__title">
        <span>三才配置</span>
        <span class="tag ${luckClass(a.sancai.luck)}">${esc(a.sancai.luck)}</span>
      </h2>
      <p><strong>${esc(a.sancai.elements.join(' → '))}</strong>（天格 → 人格 → 地格）</p>
      <ul class="notes">
        ${a.sancai.relations.map((r) => `<li>${esc(r)}</li>`).join('')}
      </ul>
      <p>${esc(a.sancai.summary)}</p>
    </section>

    <section class="card">
      <h2 class="section__title">
        <span>生肖字根　${esc(a.zodiac.branch)}${esc(a.zodiac.animal)}</span>
        <span class="section__note">${esc(a.zodiac.lichun)}</span>
      </h2>
      ${
        a.zodiac.boundaryAmbiguous
          ? `<p class="notice">出生當日即為立春。未提供出生時辰時無法確定生肖，可能為
             <strong>${esc(a.zodiac.animal)}</strong> 或
             <strong>${esc(a.zodiac.alternativeAnimal ?? '')}</strong>；
             以下依 ${esc(a.zodiac.animal)} 判讀。</p>`
          : ''
      }
      <ul class="chars">${a.zodiac.chars.map(charItem).join('')}</ul>
      <ul class="notes">
        <li>${esc(a.zodiac.animal)}喜：${esc(a.zodiac.likeReason)}</li>
        <li>${esc(a.zodiac.animal)}忌：${esc(a.zodiac.avoidReason)}</li>
      </ul>
      <p>${esc(a.zodiac.summary)}</p>
    </section>

    <section class="card">
      <h2 class="section__title">
        <span>五行分析</span>
        <span class="section__note">依各字筆畫尾數</span>
      </h2>
      <ul class="dist">
        ${ELEMENTS.map(
          (e) => `<li data-zero="${a.wuxing.distribution[e] === 0}">
            <span class="dist__n">${a.wuxing.distribution[e]}</span>${esc(e)}
          </li>`,
        ).join('')}
      </ul>
      <ul class="notes">
        ${a.wuxing.chars
          .map((c) => `<li>${esc(c.char)}（${c.strokes} 畫）屬${esc(c.element)}</li>`)
          .join('')}
        ${a.wuxing.relations.map((r) => `<li>${esc(r)}</li>`).join('')}
      </ul>
      <p>${esc(a.wuxing.summary)}</p>
    </section>

    <section class="card">
      <h2 class="section__title">關於評分</h2>
      <p class="section__note">
        三才五格、三才配置、生肖字根、五行分佈各自獨立判定，本站
        <strong>不合成單一總分</strong>——各流派權重不同，加總只會製造虛假的精確感。
      </p>
    </section>

    ${sourcesSection()}
  `;
}

function renderError(reason: string): string {
  return `
    <section class="card error" role="alert">
      <strong>無法分析</strong>
      ${esc(reason)}
    </section>`;
}

// `type="module"` scripts are deferred, so index.html is fully parsed by now.
// Failing loudly beats a bare `!` assertion that would throw an opaque
// TypeError if either element were ever renamed.
if (!form || !resultEl) {
  throw new Error('頁面缺少 #form 或 #result 容器，無法啟動。');
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const num = (key: string) => Number(String(data.get(key) ?? '').trim());

  const result = analyse({
    surname: String(data.get('surname') ?? ''),
    givenName: String(data.get('givenName') ?? ''),
    birth: { year: num('year'), month: num('month'), day: num('day') },
  });

  resultEl.innerHTML = result.ok ? render(result) : renderError(result.reason);
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
