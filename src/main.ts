import './style.css';
import { COUNTIES, DST_CAVEAT, STANDARD_MERIDIAN, countyOf } from './data/index.ts';
import { TONE_CLASS, esc, handleTermToggle, luckClass, sourcesSection, termParts, verdictClass } from './ui-shared.ts';
import { initNaming } from './naming-ui.ts';
import { analyse } from './engine/index.ts';
import { matchName } from './engine/match.ts';
import type { MatchResult, MatchVerdict } from './engine/match.ts';
import { summaryTags } from './engine/summary.ts';
import type { SummaryBazi, SummaryGroup, SummaryTag } from './engine/summary.ts';
import type { Analysis, CharVerdict, Element, Grid } from './engine/index.ts';
import { baziChart } from './bazi/chart.ts';
import type { BaziChart } from './bazi/chart.ts';
import { yongShen } from './bazi/yongshen.ts';
import type { YongShenResult } from './bazi/yongshen.ts';
import { correctBirthTime } from './bazi/time-correction.ts';
import type { BirthPlaceInput, TimeCorrection } from './bazi/time-correction.ts';
import type { LocalDateTime } from './bazi/pillars.ts';
import { cardLayout, cardZodiacOf } from './card/layout.ts';
import type { CardInput } from './card/layout.ts';
import { canvasToPng, drawCard } from './card/draw.ts';
import { shareOrDownload } from './card/share.ts';

const form = document.querySelector<HTMLFormElement>('#form');
const resultEl = document.querySelector<HTMLDivElement>('#result');
const countySelect = document.querySelector<HTMLSelectElement>('#county');
const longitudeField = document.querySelector<HTMLElement>('#longitude-field');
const overseasField = document.querySelector<HTMLElement>('#overseas-field');

/** 出生地下拉中代表「其他／海外」的值——與縣市名不會相撞。 */
const MANUAL_PLACE = '__manual__';

const ELEMENTS: Element[] = ['木', '火', '土', '金', '水'];

/** 分析模式的名詞解釋 id 前綴（取名模式用 'naming'，兩者同時在 DOM 裡）。 */
const TERM_SCOPE = 'analysis';

function gridItem(g: Grid): string {
  const term = termParts(g.name, TERM_SCOPE);
  return `
    <li class="grid-item">
      <span class="grid-item__head"><span class="grid-item__name">${esc(g.name)}</span>${term.button}</span>
      <span class="grid-item__value"><b>${g.value}</b>${esc(g.element)}</span>
      <span class="tag ${luckClass(g.fate.luck)}">${esc(g.fate.luck)}・${esc(g.fate.title)}</span>
      ${term.panel}
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

// --- v2：時間校正與八字命盤 --------------------------------------------------

const hhmm = (dt: LocalDateTime) =>
  `${dt.year}-${String(dt.month).padStart(2, '0')}-${String(dt.day).padStart(2, '0')} ` +
  `${String(dt.hour).padStart(2, '0')}:${String(dt.minute).padStart(2, '0')}`;

/** 帶正負號的分鐘數，讓使用者一眼看出往前還是往後（SPEC-v2 #9）。 */
const signedMinutes = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)} 分`;

function correctionSection(c: TimeCorrection, place: RunPlace): string {
  const county = place.county ? countyOf(place.county) : undefined;
  const spanMinutes = county ? (county.max - county.min) * 4 : 0;
  const trueSolar = termParts('真太陽時', TERM_SCOPE);

  return `
    <section class="card">
      <h2 class="section__title">
        <span>時間校正</span>
        <span class="section__note">時鐘時間 → 真太陽時${trueSolar.button}</span>
      </h2>
      ${trueSolar.panel}
      <p class="conversion">
        <span class="conversion__from">${esc(hhmm(c.clock))}</span>
        <span class="conversion__arrow">→</span>
        <span class="conversion__to">${esc(hhmm(c.trueSolar))}</span>
        <span class="tag tag--neutral">合計 ${esc(signedMinutes(c.totalMinutes))}</span>
      </p>
      ${
        c.dayShift !== 0
          ? `<p class="notice">校正後跨到${c.dayShift < 0 ? '前' : '隔'}一天，排盤以校正後的日期為準。</p>`
          : ''
      }
      ${
        c.dst?.boundaryUncertain
          ? `<p class="notice">出生日正好是夏令時間的起訖當日。${esc(DST_CAVEAT)}
              目前以<strong>${c.dstSkipped ? '未撥快（不減 1 小時）' : '已撥快（減 1 小時）'}</strong>計算，
              另一種假設會得到不同的命盤。
              <button type="button" class="button button--inline button--secondary" data-action="toggle-dst">
                改以${c.dstSkipped ? '已撥快' : '未撥快'}重算
              </button>
            </p>`
          : ''
      }
      <ul class="notes">
        ${c.steps
          .map(
            (s) => `<li>
              <strong>${esc(s.label)} ${esc(signedMinutes(s.minutes))}</strong>　${esc(s.detail)}
            </li>`,
          )
          .join('')}
      </ul>
      ${
        county
          ? `<p class="section__note">${esc(county.name)}以 ${county.longitude}° 為代表經度（該縣市各行政區中心點的中位數）；
             縣市內部東西相差 ${county.min}°–${county.max}°，約 ${spanMinutes.toFixed(1)} 分鐘。
             要更精確請改用「其他／海外」手填經度。</p>`
          : `<p class="section__note">依手填經度 ${place.input.longitude}° 計算，
             時區中央經線 ${place.input.standardMeridian ?? STANDARD_MERIDIAN}°。
             台灣的夏令時間年份表不自動套用，需自行勾選。</p>`
      }
    </section>`;
}

function chartSection(chart: BaziChart, lateZiSwitchesDay: boolean): string {
  const dist = (label: string, counts: Record<Element, number>) => `
    <li class="dist-row">
      <span class="dist-row__label">${esc(label)}</span>
      <ul class="dist">
        ${ELEMENTS.map(
          (e) => `<li data-zero="${counts[e] === 0}">
            <span class="dist__n">${counts[e]}</span>${esc(e)}
          </li>`,
        ).join('')}
      </ul>
    </li>`;
  const shishen = termParts('十神', TERM_SCOPE);
  const hidden = termParts('藏干', TERM_SCOPE);

  return `
    <section class="card">
      <h2 class="section__title">
        <span>八字命盤</span>
        <span class="section__note">日主 ${esc(chart.dayMaster.name)}（${esc(chart.dayMaster.element)}）・
          ${esc(chart.jie.name)}起${esc(chart.jie.branch)}月・生肖${esc(chart.animal)}</span>
      </h2>
      <ul class="pillars">
        ${chart.pillars
          .map(
            (p) => `<li class="pillar">
              <span class="pillar__pos">${esc(p.position)}</span>
              <span class="pillar__ganzhi">${esc(p.pillar.name)}</span>
              <span class="pillar__shishen">${esc(p.stemShiShen ?? '日主')}</span>
              <span class="pillar__hidden">${p.hidden
                .map((h) => `${esc(h.stem)}<small>${esc(h.role)}・${esc(h.shishen)}</small>`)
                .join('　')}</span>
            </li>`,
          )
          .join('')}
      </ul>
      <p class="section__note term-legend">
        每柱由上而下：柱位、干支、天干的十神${shishen.button}、地支的藏干${hidden.button}
      </p>
      ${shishen.panel}
      ${hidden.panel}
      <ul class="dist-rows">
        ${dist('四柱天干', chart.distribution.stems)}
        ${dist('含地支藏干', chart.distribution.withHidden)}
      </ul>
      <p class="section__note">
        ${
          chart.missing.length
            ? `含藏干後仍不見：${esc(chart.missing.join('、'))}。`
            : '五行俱全（含地支藏干）。'
        }
        各流派算「五行個數」時取捨不同，故兩種算法都列出，不合成單一數字。
      </p>
      ${
        chart.lateZi
          ? `<p class="notice">
              出生於 23:00–23:59（早子時）。目前採
              <strong>${lateZiSwitchesDay ? '子初換日：日柱算隔天' : '夜子時：日柱仍算當天'}</strong>；
              另一派會得到不同的日柱與時干。
              <button type="button" class="button button--inline button--secondary" data-action="toggle-late-zi">
                改用${lateZiSwitchesDay ? '夜子時' : '子初換日'}重算
              </button>
            </p>`
          : ''
      }
    </section>`;
}

function yongShenSection(y: YongShenResult): string {
  const chips = (elements: Element[], cls: string) =>
    elements.map((e) => `<span class="tag ${cls}">${esc(e)}</span>`).join(' ');
  const term = termParts('用神', TERM_SCOPE);

  return `
    <section class="card">
      <h2 class="section__title">
        <span><span class="term-label">用神</span>${term.button}</span>
        <span class="section__note">扶抑為主 ＋ 調候修正 ＋ 從格偵測</span>
      </h2>
      ${term.panel}

      <p class="conversion">
        <span>日主 <strong>${esc(y.dayMaster.stem)}（${esc(y.dayMaster.element)}）</strong></span>
        <span class="tag tag--neutral">
          ${y.strength.strong ? '身強' : '身弱'}
        </span>
        <span class="section__note">
          得令／得地／得勢滿足 ${y.strength.satisfiedCount} 項；加權分數 ${y.strength.score}（僅供顯示，不用來下結論）
        </span>
      </p>

      <ul class="dist-rows">
        <li class="dist-row"><span class="dist-row__label">喜用</span><span>${chips(y.favor, 'tag--good')}</span></li>
        <li class="dist-row"><span class="dist-row__label">忌神</span><span>${chips(y.avoid, 'tag--bad')}</span></li>
      </ul>

      ${
        y.tiaohou.conflictsWithFuyi
          ? `<p class="notice">${esc(y.tiaohou.detail)}
              調候要的 <strong>${esc(y.tiaohou.need ?? '')}</strong> 仍列在忌神裡——這是流派差異，
              本站不替你仲裁；若你認同調候派，可用下方按鈕改判。</p>`
          : ''
      }
      ${
        y.congGe.suspected
          ? `<p class="notice"><strong>${esc(y.congGe.kind ?? '')}</strong>　${esc(y.congGe.detail)}</p>`
          : ''
      }
      ${
        y.overridden
          ? `<p class="notice">目前顯示的是<strong>你手動指定</strong>的用神。${
              y.favor.length === 0
                ? '你把五行全部取消了，等於「沒有喜用、五行全忌」——這是合法的人工判斷，但幾乎可以確定不是你要的。'
                : ''
            }</p>`
          : ''
      }

      <ul class="notes">
        ${y.reasons.map((r) => `<li>${esc(r.replace(/\*\*/g, ''))}</li>`).join('')}
      </ul>

      <div class="override">
        <span class="field__label">手動覆寫用神</span>
        <span class="section__note">
          用神無標準答案（同一組四柱在同一頁就有三種說法），可以改成你認同的那一套，
          下方的姓名匹配與候選字會跟著重算。
        </span>
        <div class="override__buttons">
          ${ELEMENTS.map(
            (e) => `<button type="button"
              class="button button--inline button--toggle ${y.favor.includes(e) ? 'button--on' : ''}"
              data-action="toggle-favor" data-element="${esc(e)}">${esc(e)}</button>`,
          ).join('')}
          ${
            y.overridden
              ? '<button type="button" class="button button--inline button--secondary" data-action="reset-favor">恢復本站判定</button>'
              : ''
          }
        </div>
      </div>
    </section>`;
}

function matchSection(m: MatchResult, strokes: { min?: number; max?: number }): string {
  const verdictTag = (v: MatchVerdict) =>
    // 五行不明＝資料不足，與摘要的 unknown 同樣式；黃色只留給半吉與喜忌並見（SPEC-v4 #25）。
    v === '補用神' ? 'tag--good' : v === '傷用神' ? 'tag--bad' : v === '中性' ? 'tag--neutral' : 'tag--unknown';

  return `
    <section class="card">
      <h2 class="section__title">
        <span>姓名匹配</span>
        <span class="section__note">逐字五行 × 用神</span>
      </h2>
      <p class="section__note">
        這裡量的是<strong>字本身的五行</strong>，與上面五格區的<strong>數理五行</strong>
        （依筆畫尾數）是兩把不同的尺，本站不混用。逐字五行資料的判定依據
        <strong>來源沒有交代</strong>（實測不依部首：明＝水、口＝木），
        與 81 數理同級，屬通行版說法而非權威規則。
      </p>
      <ul class="chars">
        ${m.chars
          .map(
            (c) => `<li class="char-item">
              <span class="char-item__char">${esc(c.char)}</span>
              <span class="tag ${verdictTag(c.verdict)}">${esc(c.verdict)}${
                c.element ? `・${esc(c.element)}` : ''
              }</span>
              <span class="char-item__why">${esc(c.explanation)}</span>
            </li>`,
          )
          .join('')}
      </ul>
      <p>${esc(m.summary)}</p>

      ${
        m.candidates.length
          ? `<h3 class="section__title"><span>依用神推薦的候選字</span>
              <span class="section__note">已用查證過的常用字表過濾冷僻字</span></h3>
            <div class="override">
              <span class="field__label">康熙筆畫範圍</span>
              <span class="section__note">
                候選字依筆畫由少到多列出，所以不設限時前面都是一兩畫的字。
                「幾畫到幾畫適合取名」沒有出處，本站不預設一個自編的區間——範圍由你決定。
              </span>
              <div class="override__buttons">
                <input type="number" inputmode="numeric" min="1" max="30" placeholder="最少"
                  data-action="candidate-strokes" data-bound="min" value="${strokes.min ?? ''}" />
                <input type="number" inputmode="numeric" min="1" max="30" placeholder="最多"
                  data-action="candidate-strokes" data-bound="max" value="${strokes.max ?? ''}" />
              </div>
            </div>
            ${m.candidates
              .map(
                (g) => `<div class="candidates">
                  <span class="candidates__label">${esc(g.element)}</span>
                  <span class="candidates__chars">${g.chars
                    .map((c) => `<span title="${c.strokes} 畫">${esc(c.char)}</span>`)
                    .join('')}</span>
                  <span class="section__note">常用字表中屬${esc(g.element)}、且符合目前筆畫範圍
                    並排除名字已用字者，共 ${g.total} 字；此處依筆畫由少到多列出前 ${g.chars.length} 個。</span>
                </div>`,
              )
              .join('')}`
          : `<p class="notice">${
              m.candidateError
                ? esc(m.candidateError)
                : '喜用為空，沒有可推薦的候選字。'
            }</p>`
      }
    </section>`;
}

/**
 * 結果摘要（SPEC-v4 #8）。**只呈現** `summaryTags()` 的輸出——卡片重用同一函式，
 * 這裡不得另外判斷、計數或挑重點。
 */
function summarySection(tags: SummaryTag[]): string {
  const groups: SummaryGroup[] = ['三才', '五格', '生肖', '八字'];
  return `
    <section class="card summary">
      <h2 class="section__title">
        <span>摘要</span>
        <span class="section__note">各項獨立判定，不計數、不加總</span>
      </h2>
      <dl class="summary__groups">
        ${groups
          .map((group) => {
            const items = tags.filter((t) => t.group === group);
            if (!items.length) return '';
            return `<div class="summary__group">
              <dt class="summary__group-name">${esc(group)}</dt>
              <dd class="summary__tags">${items
                .map(
                  (t) => `<span class="summary-tag" data-group="${esc(t.group)}" data-label="${esc(t.label)}">
                    <span class="summary-tag__label">${esc(t.label)}</span>
                    <span class="tag ${TONE_CLASS[t.tone]} summary-tag__verdict">${esc(t.verdict)}</span>
                  </span>`,
                )
                .join('')}</dd>
            </div>`;
          })
          .join('')}
      </dl>
      <div class="summary__actions">
        <button type="button" class="button button--inline button--secondary" data-action="share-card">分享卡片</button>
        <span class="section__note" role="status" data-card-status></span>
      </div>
    </section>`;
}

function noBaziNotice(reason: string): string {
  return `
    <section class="card">
      <h2 class="section__title"><span>八字排盤</span></h2>
      <p class="notice">${esc(reason)}</p>
    </section>`;
}

function render(a: Analysis): string {
  const fullName = esc(a.surname + a.givenName);
  const strokeTotal = a.strokes.reduce((n, s) => n + (s.strokes ?? 0), 0);
  const sancai = termParts('三才', TERM_SCOPE);

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
        <span><span class="term-label">三才配置</span>${sancai.button}</span>
        <span class="tag ${luckClass(a.sancai.luck)}">${esc(a.sancai.luck)}</span>
      </h2>
      ${sancai.panel}
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
if (!form || !resultEl || !countySelect || !longitudeField || !overseasField) {
  throw new Error('頁面缺少表單容器（#form / #result / #county / 經度欄位），無法啟動。');
}

// --- v3：雙模式入口（SPEC-v3 #1）---------------------------------------------
// 「我要取名」為預設——本站主要使用者是替未出生小孩取名的人。

const modeSections: Record<string, HTMLElement | null> = {
  naming: document.querySelector<HTMLElement>('#mode-naming'),
  analysis: document.querySelector<HTMLElement>('#mode-analysis'),
};
const modeTabs = [...document.querySelectorAll<HTMLButtonElement>('.mode-tab')];
if (!modeSections['naming'] || !modeSections['analysis'] || modeTabs.length !== 2) {
  throw new Error('頁面缺少模式切換結構（#mode-naming / #mode-analysis / .mode-tab），無法啟動。');
}

function setMode(mode: 'naming' | 'analysis'): void {
  for (const [name, section] of Object.entries(modeSections)) section!.hidden = name !== mode;
  for (const tab of modeTabs) {
    tab.setAttribute('aria-pressed', String(tab.dataset['mode'] === mode));
  }
}
for (const tab of modeTabs) {
  tab.addEventListener('click', () => setMode(tab.dataset['mode'] === 'analysis' ? 'analysis' : 'naming'));
}

initNaming({
  // 「帶入完整分析」：切到分析模式、填入姓名，出生日期時辰由使用者補上（SPEC-v3 #10）。
  onAnalyse({ surname, givenName }) {
    setMode('analysis');
    const surnameInput = document.querySelector<HTMLInputElement>('#surname');
    const givenInput = document.querySelector<HTMLInputElement>('#givenName');
    if (surnameInput) surnameInput.value = surname;
    if (givenInput) givenInput.value = givenName;
    form!.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelector<HTMLInputElement>('#year')?.focus();
  },
});

// 縣市選項由資料檔填入 —— 清單只有一份，改資料就改到畫面。
countySelect.innerHTML = [
  '<option value="" selected>請選擇（八字排盤需要）</option>',
  ...COUNTIES.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`),
  `<option value="${MANUAL_PLACE}">其他／海外（手填經度）</option>`,
].join('');

function syncPlaceFields(): void {
  const manual = countySelect!.value === MANUAL_PLACE;
  longitudeField!.hidden = !manual;
  overseasField!.hidden = !manual;
}
countySelect.addEventListener('change', syncPlaceFields);
syncPlaceFields();

interface RunPlace {
  /** 選到的縣市名；手填經度時為 undefined。 */
  county?: string;
  input: BirthPlaceInput;
}

interface Run {
  surname: string;
  givenName: string;
  date: { year: number; month: number; day: number };
  /** 使用者輸入的時鐘時間；未填時辰為 undefined。 */
  clock?: LocalDateTime;
  place?: RunPlace;
  /** 缺時辰／缺出生地時，要向使用者說明為什麼沒有八字（SPEC-v2 #4）。 */
  noBaziReason?: string;
  lateZiSwitchesDay: boolean;
  /** 夏令起訖當日的人工裁決；預設 false ＝ 照表套用。 */
  skipDst: boolean;
  /** 手動覆寫的喜用五行；undefined ＝ 採本站判定（SPEC-v2 #15）。 */
  favorOverride?: Element[];
  /** 候選字的筆畫範圍，由使用者自行設定；空白＝不設限。 */
  candidateStrokes: { min?: number; max?: number };
}

let lastRun: Run | undefined;
/** 上一次渲染時畫面上的喜用五行（本站判定或覆寫後的結果）。 */
let currentFavor: Element[] = [];

function runAndRender(run: Run): void {
  let baziHtml = '';
  let bazi: SummaryBazi | undefined;
  let pillars: string[] | undefined;
  lastCard = undefined;
  let zodiacTime: { hour: number; minute: number } | undefined;
  let correctedDate = run.date;

  if (run.clock && run.place) {
    const corrected = correctBirthTime(run.clock, { ...run.place.input, skipDst: run.skipDst });
    if (!corrected.ok) {
      resultEl!.innerHTML = renderError(corrected.reason);
      return;
    }
    const chart = baziChart(corrected.trueSolar, {
      lateZiSwitchesDay: run.lateZiSwitchesDay,
    });
    if (!chart.ok) {
      resultEl!.innerHTML = renderError(chart.reason);
      return;
    }
    const ys = yongShen(chart, run.favorOverride ? { override: { favor: run.favorOverride } } : {});
    if (!ys.ok) {
      resultEl!.innerHTML = renderError(ys.reason);
      return;
    }
    // 記住目前畫面上的喜用，讓「按一個五行」是在它上面加減，而不是從空集合開始。
    currentFavor = ys.favor;
    // 姓名匹配吃的是用神的結果，所以手動覆寫會讓它跟著重算（SPEC-v2 #15）。
    const nameChars = [...run.surname.trim(), ...run.givenName.trim()];
    const match = matchName(nameChars, ys.favor, ys.avoid, { strokes: run.candidateStrokes });
    bazi = { yongShen: ys, match };
    pillars = chart.pillars.map((p) => p.pillar.name);
    baziHtml =
      correctionSection(corrected, run.place) +
      chartSection(chart, run.lateZiSwitchesDay) +
      yongShenSection(ys) +
      matchSection(match, run.candidateStrokes);
    // 生肖與年柱必須同一個判準：兩者都吃校正後的時間（SPEC-v2 #11）。
    correctedDate = {
      year: corrected.trueSolar.year,
      month: corrected.trueSolar.month,
      day: corrected.trueSolar.day,
    };
    zodiacTime = { hour: corrected.trueSolar.hour, minute: corrected.trueSolar.minute };
  } else if (run.noBaziReason) {
    baziHtml = noBaziNotice(run.noBaziReason);
  }

  const result = analyse({
    surname: run.surname,
    givenName: run.givenName,
    birth: { ...correctedDate, ...zodiacTime },
  });

  if (!result.ok) {
    resultEl!.innerHTML = renderError(result.reason);
    return;
  }
  const tags = summaryTags(result, bazi);
  // 卡片與摘要吃同一組標籤（SPEC-v4 #8）。生日印使用者輸入的年月日，時分與出生地不進卡片（#3）。
  lastCard = {
    name: result.surname + result.givenName,
    birth: { year: run.date.year, month: run.date.month, day: run.date.day },
    zodiac: cardZodiacOf(result.zodiac),
    pillars,
    tags,
  };
  resultEl!.innerHTML = summarySection(tags) + baziHtml + render(result);
}

/** 目前結果對應的卡片內容；結果重繪時一併更新。 */
let lastCard: CardInput | undefined;

/** 分享卡片（SPEC-v4 #1、#5）：必須在點擊處理中直接呼叫，Web Share 需要 user activation。 */
async function shareCard(button: HTMLButtonElement): Promise<void> {
  const card = lastCard;
  if (!card || button.disabled) return;
  const status = button.parentElement?.querySelector<HTMLElement>('[data-card-status]');
  button.disabled = true;
  try {
    const blob = await canvasToPng(await drawCard(cardLayout(card)));
    const file = new File([blob], 'mio-shuming-card.png', { type: 'image/png' });
    const outcome = await shareOrDownload(file, '數名其妙・姓名分析卡片');
    if (status) {
      status.textContent =
        outcome === 'downloaded' ? '此裝置不支援直接分享圖片，已改為下載 PNG。' : '';
    }
  } catch (err) {
    if (status) status.textContent = err instanceof Error ? err.message : '卡片產生失敗。';
  } finally {
    button.disabled = false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form!);
  const raw = (key: string) => String(data.get(key) ?? '').trim();
  const num = (key: string) => Number(raw(key));

  const date = { year: num('year'), month: num('month'), day: num('day') };
  const hourFilled = raw('hour') !== '';
  const minuteFilled = raw('minute') !== '';
  const countyValue = raw('county');

  let clock: LocalDateTime | undefined;
  let place: RunPlace | undefined;
  let noBaziReason: string | undefined;

  if (hourFilled !== minuteFilled) {
    // 半套的時間是輸入殘缺，不是「刻意不填」——照實說，不要靜默當成沒填。
    resultEl!.innerHTML = renderError('出生時間需同時填寫「時」與「分」，只填其中一項無法排盤。');
    resultEl!.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  if (!hourFilled) {
    noBaziReason = '未填出生時間，因此不產出八字。以下僅為姓名分析。';
  } else if (countyValue === '') {
    noBaziReason = '未選出生地，無法把時鐘時間換算成真太陽時，因此不產出八字。以下僅為姓名分析。';
  } else {
    clock = { ...date, hour: num('hour'), minute: num('minute') };
    if (countyValue === MANUAL_PLACE) {
      // 經度與時區中央經線兩者缺一都無法定案 —— 不拿台灣的 120° 頂替（SPEC-v2 #24）。
      if (raw('longitude') === '' || raw('meridian') === '') {
        noBaziReason =
          '選了「其他／海外」時，出生地經度與時區中央經線都要填（不預設為台灣的 120°），' +
          '因此不產出八字。以下僅為姓名分析。';
        clock = undefined;
      } else {
        place = {
          input: {
            longitude: num('longitude'),
            standardMeridian: num('meridian'),
            applyTaiwanDst: false,
            manualDst: data.get('manualDst') !== null,
          },
        };
      }
    } else {
      const county = countyOf(countyValue);
      if (!county) {
        noBaziReason = `出生地「${countyValue}」不在縣市表中，因此不產出八字。`;
        clock = undefined;
      } else {
        place = { county: county.name, input: { longitude: county.longitude, applyTaiwanDst: true } };
      }
    }
  }

  lastRun = {
    surname: raw('surname'),
    givenName: raw('givenName'),
    date,
    clock,
    place,
    noBaziReason,
    // 預設子初換日（SPEC-v2 #12）。切換由結果區的按鈕觸發。
    lateZiSwitchesDay: true,
    // 夏令起訖當日預設照表套用，使用者可切換到另一種假設。
    skipDst: false,
    candidateStrokes: {},
  };
  runAndRender(lastRun);
  resultEl!.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// 候選字的筆畫範圍。空白＝不設限；非數字一律當成不設限，不猜使用者的意思。
resultEl.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !lastRun) return;
  if (target.dataset['action'] !== 'candidate-strokes') return;
  const bound = target.dataset['bound'] === 'min' ? 'min' : 'max';
  const raw = target.value.trim();
  const value = raw === '' ? undefined : Number(raw);
  const next = { ...lastRun.candidateStrokes };
  if (value === undefined || !Number.isInteger(value) || value < 1) delete next[bound];
  else next[bound] = value;
  lastRun = { ...lastRun, candidateStrokes: next };
  runAndRender(lastRun);
});

// 兩個「一鍵切換重算」：早晚子時（SPEC-v2 #12）與夏令起訖當日的兩種假設。
// 按鈕是結果區重繪出來的，所以監聽容器而不是按鈕本身。
resultEl.addEventListener('click', (event) => {
  // 名詞解釋只切換顯示，不重算、不重繪（重繪會把展開狀態洗掉）。
  if (handleTermToggle(event.target)) return;
  const target = event.target;
  if (!(target instanceof HTMLElement) || !lastRun) return;
  const shareButton = target.closest<HTMLButtonElement>('[data-action="share-card"]');
  if (shareButton) {
    void shareCard(shareButton);
  } else if (target.closest('[data-action="toggle-late-zi"]')) {
    lastRun = { ...lastRun, lateZiSwitchesDay: !lastRun.lateZiSwitchesDay };
    runAndRender(lastRun);
  } else if (target.closest('[data-action="toggle-dst"]')) {
    lastRun = { ...lastRun, skipDst: !lastRun.skipDst };
    runAndRender(lastRun);
  } else if (target.closest('[data-action="reset-favor"]')) {
    lastRun = { ...lastRun, favorOverride: undefined };
    runAndRender(lastRun);
  } else {
    // 手動覆寫用神：從目前顯示的喜用開始加減，不是從空集合開始（SPEC-v2 #15）。
    const chip = target.closest<HTMLElement>('[data-action="toggle-favor"]');
    if (!chip) return;
    const element = chip.dataset['element'] as Element | undefined;
    if (!element) return;
    const current = lastRun.favorOverride ?? currentFavor;
    const next = current.includes(element)
      ? current.filter((e) => e !== element)
      : [...current, element];
    lastRun = { ...lastRun, favorOverride: ELEMENTS.filter((e) => next.includes(e)) };
    runAndRender(lastRun);
  }
});
