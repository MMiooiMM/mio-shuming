// 取名模式（SPEC-v3）：姓氏＋預產期 → 吉筆畫組合 → 生肖喜忌候選字 → 收藏候選名。
//
// 與分析模式（main.ts）互不干擾：各自的表單、結果容器與事件監聽（SPEC-v3 #1）。
import { NUMEROLOGY_SOURCE } from './data/index.ts';
import type { Animal, Grid } from './engine/index.ts';
import {
  LICHUN_WINDOW_DAYS,
  candidatesFor,
  dueZodiac,
  enumerateCombos,
  judgedGrids,
  zodiacReasons,
} from './engine/naming.ts';
import type { DueZodiac, NamingCandidate, NamingCombos, StrokeCombo } from './engine/naming.ts';
import { esc, handleTermToggle, luckClass, sourcesSection, termParts, verdictClass } from './ui-shared.ts';

// --- 收藏（SPEC-v3 #10）：localStorage、純前端、不上傳 -------------------------

export interface Favorite {
  surname: string;
  givenName: string;
}

const FAV_KEY = 'mio-shuming:favorites:v1';

export function loadFavorites(storage: Storage = localStorage): Favorite[] {
  try {
    const raw = storage.getItem(FAV_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is Favorite =>
        typeof f === 'object' &&
        f !== null &&
        typeof (f as Favorite).surname === 'string' &&
        typeof (f as Favorite).givenName === 'string',
    );
  } catch {
    // 壞掉的儲存內容不擋功能——當成沒有收藏，下次儲存時覆寫。
    return [];
  }
}

/** 寫入失敗（無痕模式、配額滿、儲存被停用）回傳 false，由畫面誠實告知。 */
export function saveFavorites(favs: Favorite[], storage: Storage = localStorage): boolean {
  try {
    storage.setItem(FAV_KEY, JSON.stringify(favs));
    return true;
  } catch {
    return false;
  }
}

// --- 渲染 ---------------------------------------------------------------------

const positionName = (pos: number, double: boolean) => (double ? (pos === 0 ? '名一' : '名二') : '名');

/** `skipLabel` 非空時，該格不計吉凶，改顯示原因標籤（天格／單名外格）。 */
function gridItem(g: Grid, skipLabel: string | undefined): string {
  return `
    <li class="grid-item">
      <span class="grid-item__name">${esc(g.name)}</span>
      <span class="grid-item__value"><b>${g.value}</b>${esc(g.element)}</span>
      ${
        skipLabel
          ? `<span class="tag tag--flat">${esc(skipLabel)}</span>`
          : `<span class="tag ${luckClass(g.fate.luck)}">${esc(g.fate.luck)}・${esc(g.fate.title)}</span>`
      }
      <span class="grid-item__detail">${esc(g.formula)}　—　${esc(g.fate.text)}</span>
    </li>`;
}

/** 該格不計吉凶時的原因標籤；計分格回傳 undefined。 */
function skipLabelOf(g: Grid, double: boolean): string | undefined {
  if (g.name === '天格') return '先天定・不計';
  if (!double && g.name === '外格') return '單名固定・不計';
  return undefined;
}

function comboKey(c: StrokeCombo): string {
  return c.given.join('-');
}

function comboSummary(c: StrokeCombo, double: boolean): string {
  const judged = judgedGrids(c.grids, double);
  return `
    <span class="combo__strokes">${c.given
      .map((n, i) => `${positionName(i, double)} <b>${n}</b> 畫`)
      .join(' ＋ ')}</span>
    <span class="tag ${luckClass(c.sancai.luck)}">三才 ${esc(c.sancai.elements.join(''))}・${esc(c.sancai.luck)}</span>
    ${judged
      .map(
        (g) =>
          `<span class="tag ${luckClass(g.fate.luck)}">${esc(g.name[0]!)}${g.value}・${esc(g.fate.luck)}</span>`,
      )
      .join('')}`;
}

/**
 * 取名結果的名詞解釋（SPEC-v4 #9）。組合很多，逐格放按鈕會重複幾十次，
 * 所以在說明區集中一列；文字仍只來自 glossary.json。
 */
function namingTermsRow(): string {
  const parts = ['三才', '天格', '人格', '地格', '外格', '總格'].map((t) => ({ t, ...termParts(t, 'naming') }));
  return `
    <p class="section__note term-legend">名詞說明：${parts
      .map((p) => `<span class="term-inline">${esc(p.t)}${p.button}</span>`)
      .join('')}</p>
    ${parts.map((p) => p.panel).join('')}`;
}

function introSection(r: NamingCombos): string {
  const tian = r.combos[0]?.grids.find((g) => g.name === '天格');
  return `
    <section class="card">
      <h2 class="section__title">
        <span>${esc(r.surname)} 姓（${r.surnameStrokes.join('＋')} 畫）的吉筆畫組合</span>
        <span class="section__note">${r.doubleGiven ? '雙名' : '單名'}・共 ${r.combos.length} 組</span>
      </h2>
      ${r.relaxedNote && r.combos.length ? `<p class="notice">${esc(r.relaxedNote)}</p>` : ''}
      ${
        tian
          ? `<p class="section__note">天格 ${tian.value}（${esc(tian.fate.luck)}）由姓氏先天決定，
             取名無法改變——<strong>不計吉凶、只參與三才</strong>。
             出處：${esc(NUMEROLOGY_SOURCE.tianGrid.url)}。</p>`
          : ''
      }
      ${
        r.doubleGiven
          ? ''
          : `<p class="section__note">單名時<strong>外格</strong>不含任何名字筆畫
             （單姓恆為假1＋假1＝2；複姓＝姓首字＋假1），同樣取名無法改變——
             <strong>不計吉凶</strong>，通行版說法見資料來源。</p>`
      }
      ${namingTermsRow()}
      <p class="section__note">
        每組列出三才與五格的<strong>分項判定</strong>；組合依筆畫升冪排列——那是枚舉順序，
        不是優劣排序，本站<strong>不合成單一總分</strong>。點開組合可見該筆畫的候選字。
      </p>
    </section>`;
}

function zodiacSection(z: DueZodiac, dueText: string): string {
  const reasonRows = (a: Animal) => {
    const r = zodiacReasons(a);
    return `
      <li><strong>${esc(a)}喜</strong>：${esc(r.likeReason)}</li>
      <li><strong>${esc(a)}忌</strong>：${esc(r.avoidReason)}</li>`;
  };
  return `
    <section class="card">
      <h2 class="section__title">
        <span>生肖喜忌（依預產期）</span>
        <span class="section__note">${esc(z.lichun)}</span>
      </h2>
      ${
        z.nearBoundary
          ? `<p class="notice">預產期 ${esc(dueText)} 距立春 ${Math.abs(z.daysFromLichun)} 天
             （±${LICHUN_WINDOW_DAYS} 天內）。實際出生常提前或延後，生肖可能為
             <strong>${esc(z.animals[0]!)}</strong>（立春前）或
             <strong>${esc(z.animals[1]!)}</strong>（立春後）——本站不選邊，
             以下候選字並列兩肖判定，<strong>忌字取聯集</strong>。
             出生後請以實際出生日重新確認。</p>`
          : `<p>預產期 ${esc(dueText)} 依立春換算為<strong>${esc(z.branch)}${esc(z.animal)}</strong>年。
             預產期僅供推算，出生後請以實際出生日重新確認。</p>`
      }
      <ul class="notes">${z.animals.map(reasonRows).join('')}</ul>
      <p class="section__note">
        候選字另附<strong>逐字五行</strong>僅供參考；五行喜忌（用神）需出生時辰才能判定，
        <strong>留待出生後</strong>在「分析名字」做八字分析（SPEC-v3 #8）。
      </p>
    </section>`;
}

function candidateChip(c: NamingCandidate, key: string, pos: number): string {
  const title = `${c.strokes} 畫・${c.element ?? '五行不明'}・${c.verdict}\n${c.explanations.join('\n')}`;
  return `<button type="button" class="chip ${verdictClass(c.verdict)}" data-action="pick-char"
    data-key="${esc(key)}" data-pos="${pos}" data-char="${esc(c.char)}"
    title="${esc(title)}">${esc(c.char)}<small>${esc(c.element ?? '？')}</small></button>`;
}

function candidateBlock(
  key: string,
  pos: number,
  strokes: number,
  double: boolean,
  cands: NamingCandidate[],
): string {
  // 標註不刪：預設只顯示喜／中性／喜忌並見，忌字收在一鍵展開裡（SPEC-v3 #7）。
  const visible = cands.filter((c) => c.verdict !== '忌');
  const avoid = cands.filter((c) => c.verdict === '忌');
  return `
    <div class="cand-pos">
      <h3 class="section__title">
        <span>${esc(positionName(pos, double))}（${strokes} 畫）候選字</span>
        <span class="section__note">共 ${cands.length} 字；點字加入搭配</span>
      </h3>
      <div class="chips">${visible.map((c) => candidateChip(c, key, pos)).join('')}</div>
      ${
        avoid.length
          ? `<details class="cand-avoid">
              <summary>顯示生肖忌字（${avoid.length} 字）</summary>
              <div class="chips">${avoid.map((c) => candidateChip(c, key, pos)).join('')}</div>
              <ul class="notes">${avoid
                .map((c) => `<li>${esc(c.explanations.join('；'))}</li>`)
                .join('')}</ul>
            </details>`
          : ''
      }
    </div>`;
}

function comboBody(c: StrokeCombo, double: boolean, animals: Animal[]): string {
  const key = comboKey(c);
  return `
    <ul class="grids">${c.grids.map((g) => gridItem(g, skipLabelOf(g, double))).join('')}</ul>
    <ul class="notes">${c.sancai.relations.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    ${c.given.map((n, i) => candidateBlock(key, i, n, double, candidatesForCached(n, animals))).join('')}
    <p class="compose" data-key="${esc(key)}">
      目前搭配：<b class="compose__surname"></b>${c.given
        .map((_, i) => `<b class="compose__slot" data-slot="${i}">？</b>`)
        .join('')}
      <button type="button" class="button button--inline" data-action="save-fav" data-key="${esc(key)}" disabled>
        收藏這個名字
      </button>
    </p>`;
}

function favoritesSection(favs: Favorite[]): string {
  if (!favs.length) return '';
  return `
    <section class="card" id="favorites-card">
      <h2 class="section__title">
        <span>收藏的候選名</span>
        <span class="section__note">只存在此瀏覽器（localStorage），不上傳</span>
      </h2>
      <ul class="favorites">
        ${favs
          .map(
            (f, i) => `<li class="favorite">
              <span class="favorite__name">${esc(f.surname)}${esc(f.givenName)}</span>
              <button type="button" class="button button--inline" data-action="fav-analyse" data-i="${i}">
                帶入完整分析
              </button>
              <button type="button" class="button button--inline" data-action="fav-remove" data-i="${i}">
                移除
              </button>
            </li>`,
          )
          .join('')}
      </ul>
      <p class="section__note">
        出生後補上實際出生日期、時辰與出生地，即可對候選名跑五格＋生肖＋八字的完整分析。
      </p>
    </section>`;
}

function renderError(reason: string): string {
  return `
    <section class="card error" role="alert">
      <strong>無法列出組合</strong>
      ${esc(reason)}
    </section>`;
}

// --- 狀態與接線 ---------------------------------------------------------------

interface CurrentRun {
  result: NamingCombos;
  zodiac: DueZodiac;
  dueText: string;
}

let current: CurrentRun | undefined;
/** 各組合已點選的字，key ＝ comboKey；跨重繪保留在記憶體即可（收藏才落地）。 */
const selections = new Map<string, (string | undefined)[]>();
const candMemo = new Map<string, NamingCandidate[]>();
let memoAnimals = '';

function candidatesForCached(strokes: number, animals: Animal[]): NamingCandidate[] {
  const stamp = animals.join('');
  if (stamp !== memoAnimals) {
    candMemo.clear();
    memoAnimals = stamp;
  }
  let hit = candMemo.get(String(strokes));
  if (!hit) {
    hit = candidatesFor(strokes, animals);
    candMemo.set(String(strokes), hit);
  }
  return hit;
}

export interface NamingUiOptions {
  /** 「帶入完整分析」：切到分析模式並填入姓名，由 main.ts 提供。 */
  onAnalyse: (favorite: Favorite) => void;
}

export function initNaming(opts: NamingUiOptions): void {
  const form = document.querySelector<HTMLFormElement>('#naming-form');
  const resultEl = document.querySelector<HTMLDivElement>('#naming-result');
  const favEl = document.querySelector<HTMLDivElement>('#naming-favorites');
  if (!form || !resultEl || !favEl) {
    throw new Error('頁面缺少取名表單容器（#naming-form / #naming-result / #naming-favorites），無法啟動。');
  }

  const renderFavorites = () => {
    favEl.innerHTML = favoritesSection(loadFavorites());
  };
  renderFavorites();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const raw = (key: string) => String(data.get(key) ?? '').trim();
    const surname = raw('surname');
    const year = Number(raw('year'));
    const month = Number(raw('month'));
    const day = Number(raw('day'));
    const double = raw('givenLength') !== '1';

    const zodiac = dueZodiac(year, month, day);
    if (!zodiac) {
      resultEl.innerHTML = renderError('預產期需為 1900–2100 之間的有效西元日期。');
      return;
    }
    const result = enumerateCombos(surname, double);
    if (!result.ok) {
      resultEl.innerHTML = renderError(result.reason);
      return;
    }

    selections.clear();
    current = { result, zodiac, dueText: `${year}-${month}-${day}` };
    const combosHtml = result.combos.length
      ? `<section class="card">
          <h2 class="section__title">
            <span>筆畫組合</span>
            <span class="section__note">點開看分項判定與候選字</span>
          </h2>
          ${result.combos
            .map(
              (c) => `<details class="combo" data-key="${esc(comboKey(c))}">
                <summary>${comboSummary(c, result.doubleGiven)}</summary>
                <div class="combo__body"></div>
              </details>`,
            )
            .join('')}
        </section>`
      : `<section class="card">
          <h2 class="section__title"><span>筆畫組合</span></h2>
          <p class="notice">此姓氏在${result.doubleGiven ? '雙名' : '單名'}下，
            連「三才吉＋計分格無凶且至多一格半吉」的次佳組合也不存在——照實回報，不放寬到有凶的組合。
            ${result.doubleGiven ? '' : '單名的迴旋空間小，建議改用雙名再試。'}</p>
        </section>`;
    resultEl.innerHTML =
      introSection(result) +
      zodiacSection(zodiac, current.dueText) +
      combosHtml +
      sourcesSection('naming');
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // 組合展開才渲染候選字——一次全渲染會對每個筆畫×每隻生肖跑逐字判定，白做工。
  // `toggle` 不冒泡，掛 capture 聽整個結果區。
  resultEl.addEventListener(
    'toggle',
    (event) => {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.open || !current) return;
      const body = details.querySelector<HTMLDivElement>('.combo__body');
      if (!body || body.childElementCount > 0) return;
      const key = details.dataset['key'];
      const combo = current.result.combos.find((c) => comboKey(c) === key);
      if (!combo) return;
      body.innerHTML = comboBody(combo, current.result.doubleGiven, current.zodiac.animals);
      syncCompose(details, combo);
    },
    true,
  );

  const syncCompose = (details: HTMLElement, combo: StrokeCombo) => {
    if (!current) return;
    const key = comboKey(combo);
    const picked = selections.get(key) ?? combo.given.map(() => undefined);
    const compose = details.querySelector<HTMLElement>('.compose');
    if (!compose) return;
    compose.querySelector('.compose__surname')!.textContent = current.result.surname;
    combo.given.forEach((_, i) => {
      const slot = compose.querySelector(`[data-slot="${i}"]`);
      if (slot) slot.textContent = picked[i] ?? '？';
    });
    const complete = picked.every((c) => c !== undefined);
    compose.querySelector<HTMLButtonElement>('[data-action="save-fav"]')!.disabled = !complete;
    // 高亮目前選到的字。
    details.querySelectorAll<HTMLButtonElement>('[data-action="pick-char"]').forEach((chip) => {
      const pos = Number(chip.dataset['pos']);
      chip.classList.toggle('chip--on', picked[pos] === chip.dataset['char']);
    });
  };

  resultEl.addEventListener('click', (event) => {
    if (handleTermToggle(event.target)) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !current) return;

    const chip = target.closest<HTMLButtonElement>('[data-action="pick-char"]');
    if (chip) {
      const key = chip.dataset['key']!;
      const combo = current.result.combos.find((c) => comboKey(c) === key);
      if (!combo) return;
      const picked = selections.get(key) ?? combo.given.map<string | undefined>(() => undefined);
      const pos = Number(chip.dataset['pos']);
      // 點同一個字＝取消選取。
      picked[pos] = picked[pos] === chip.dataset['char'] ? undefined : chip.dataset['char'];
      selections.set(key, picked);
      syncCompose(chip.closest('details')!, combo);
      return;
    }

    const save = target.closest<HTMLButtonElement>('[data-action="save-fav"]');
    if (save) {
      const key = save.dataset['key']!;
      const picked = selections.get(key);
      if (!picked || picked.some((c) => c === undefined)) return;
      const favorite: Favorite = { surname: current.result.surname, givenName: picked.join('') };
      const favs = loadFavorites();
      let saved = true;
      if (!favs.some((f) => f.surname === favorite.surname && f.givenName === favorite.givenName)) {
        favs.push(favorite);
        saved = saveFavorites(favs);
      }
      renderFavorites();
      if (!saved) {
        favEl.insertAdjacentHTML(
          'beforeend',
          `<p class="notice">無法寫入瀏覽器儲存空間（可能是無痕模式或空間已滿），
           「${esc(favorite.surname)}${esc(favorite.givenName)}」沒有被保存。</p>`,
        );
      }
      favEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  favEl.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest<HTMLButtonElement>('[data-action]');
    if (!button) return;
    const favs = loadFavorites();
    const i = Number(button.dataset['i']);
    const favorite = favs[i];
    if (!favorite) return;
    if (button.dataset['action'] === 'fav-remove') {
      favs.splice(i, 1);
      const saved = saveFavorites(favs);
      renderFavorites();
      if (!saved) {
        favEl.insertAdjacentHTML(
          'beforeend',
          '<p class="notice">無法寫入瀏覽器儲存空間，移除沒有生效。</p>',
        );
      }
    } else if (button.dataset['action'] === 'fav-analyse') {
      opts.onAnalyse(favorite);
    }
  });
}
