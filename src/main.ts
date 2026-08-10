import './style.css';
import {
  COMPONENT_SOURCE,
  COUNTIES,
  DST_CAVEAT,
  DST_EXCLUDED,
  DST_SOURCE,
  KANGXI_SOURCE,
  LICHUN_SOURCE,
  LOCATION_SOURCE,
  NUMEROLOGY_SOURCE,
  STANDARD_MERIDIAN,
  ZODIAC_SOURCE,
  countyOf,
} from './data/index.ts';
import { analyse } from './engine/index.ts';
import type { Analysis, CharVerdict, Element, Grid, Luck } from './engine/index.ts';
import { baziChart } from './bazi/chart.ts';
import type { BaziChart } from './bazi/chart.ts';
import { correctBirthTime } from './bazi/time-correction.ts';
import type { BirthPlaceInput, TimeCorrection } from './bazi/time-correction.ts';
import type { LocalDateTime } from './bazi/pillars.ts';

const form = document.querySelector<HTMLFormElement>('#form');
const resultEl = document.querySelector<HTMLDivElement>('#result');
const countySelect = document.querySelector<HTMLSelectElement>('#county');
const longitudeField = document.querySelector<HTMLElement>('#longitude-field');
const overseasField = document.querySelector<HTMLElement>('#overseas-field');

/** 出生地下拉中代表「其他／海外」的值——與縣市名不會相撞。 */
const MANUAL_PLACE = '__manual__';

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
    [
      '立春時刻',
      `${LICHUN_SOURCE.algorithm}。${LICHUN_SOURCE.deltaT}。已對照 ${LICHUN_SOURCE.verifiedAgainst}`,
      LICHUN_SOURCE.verifiedAgainstUrl,
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

// --- v2：時間校正與八字命盤 --------------------------------------------------

const hhmm = (dt: LocalDateTime) =>
  `${dt.year}-${String(dt.month).padStart(2, '0')}-${String(dt.day).padStart(2, '0')} ` +
  `${String(dt.hour).padStart(2, '0')}:${String(dt.minute).padStart(2, '0')}`;

/** 帶正負號的分鐘數，讓使用者一眼看出往前還是往後（SPEC-v2 #9）。 */
const signedMinutes = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)} 分`;

function correctionSection(c: TimeCorrection, place: RunPlace): string {
  const county = place.county ? countyOf(place.county) : undefined;
  const spanMinutes = county ? (county.max - county.min) * 4 : 0;

  return `
    <section class="card">
      <h2 class="section__title">
        <span>時間校正</span>
        <span class="section__note">時鐘時間 → 真太陽時</span>
      </h2>
      <p class="conversion">
        <span class="conversion__from">${esc(hhmm(c.clock))}</span>
        <span class="conversion__arrow">→</span>
        <span class="conversion__to">${esc(hhmm(c.trueSolar))}</span>
        <span class="tag tag--flat">合計 ${esc(signedMinutes(c.totalMinutes))}</span>
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
              <button type="button" class="button button--inline" data-action="toggle-dst">
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
              <button type="button" class="button button--inline" data-action="toggle-late-zi">
                改用${lateZiSwitchesDay ? '夜子時' : '子初換日'}重算
              </button>
            </p>`
          : ''
      }
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
if (!form || !resultEl || !countySelect || !longitudeField || !overseasField) {
  throw new Error('頁面缺少表單容器（#form / #result / #county / 經度欄位），無法啟動。');
}

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
}

let lastRun: Run | undefined;

function runAndRender(run: Run): void {
  let baziHtml = '';
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
    baziHtml = correctionSection(corrected, run.place) + chartSection(chart, run.lateZiSwitchesDay);
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

  resultEl!.innerHTML = result.ok ? baziHtml + render(result) : renderError(result.reason);
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
    noBaziReason = '未填出生時間，因此不產出八字（SPEC-v2 #4）。以下僅為姓名分析。';
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
  };
  runAndRender(lastRun);
  resultEl!.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// 兩個「一鍵切換重算」：早晚子時（SPEC-v2 #12）與夏令起訖當日的兩種假設。
// 按鈕是結果區重繪出來的，所以監聽容器而不是按鈕本身。
resultEl.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !lastRun) return;
  if (target.closest('[data-action="toggle-late-zi"]')) {
    lastRun = { ...lastRun, lateZiSwitchesDay: !lastRun.lateZiSwitchesDay };
    runAndRender(lastRun);
  } else if (target.closest('[data-action="toggle-dst"]')) {
    lastRun = { ...lastRun, skipDst: !lastRun.skipDst };
    runAndRender(lastRun);
  }
});
