// @vitest-environment jsdom
//
// 畫面層的 runtime 驗證 —— 真的把 index.html 載進 DOM、真的填表、真的按送出，
// 檢查使用者看到的字。純函式的測試證明不了「UI 有沒有把校正接上排盤」，
// 這一支才會。
//
// 讀的是 repo 裡的 index.html 本尊，不是複製一份 —— 表單欄位改名時這裡要跟著紅。

import { beforeEach, describe, expect, it, vi } from 'vitest';
// `?raw` 由 vite 處理，不必動用 node:fs（專案的 tsconfig 沒有 @types/node）。
import HTML from '../index.html?raw';

function bodyOf(html: string): string {
  const m = /<body>([\s\S]*)<\/body>/.exec(html);
  if (!m) throw new Error('index.html 找不到 <body>');
  // <script type="module"> 由測試自己 import，不讓 jsdom 去抓 /src/main.ts。
  return m[1]!.replace(/<script[\s\S]*?<\/script>/g, '');
}

async function mount(): Promise<void> {
  // jsdom 沒有實作捲動，補一個空的，否則送出時會炸在 scrollIntoView。
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {};
  }
  document.body.innerHTML = bodyOf(HTML);
  // main.ts 在 import 時就綁事件、也保存了上一次送出的狀態，
  // 所以每個案例都要重新載入模組，避免互相污染。
  vi.resetModules();
  await import('./main.ts');
}

const set = (id: string, value: string) => {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (!el) throw new Error(`找不到欄位 #${id}`);
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

function submit(fields: Record<string, string>): string {
  for (const [id, value] of Object.entries(fields)) set(id, value);
  const form = document.getElementById('form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return (document.getElementById('result') as HTMLElement).textContent ?? '';
}

const BASE = {
  surname: '王',
  givenName: '小明',
  year: '1975',
  month: '7',
  day: '1',
  hour: '12',
  minute: '0',
  county: '臺北市',
};

describe('UI', () => {
  beforeEach(async () => {
    await mount();
  });

  it('縣市下拉由資料檔填出 22 縣市＋海外選項', () => {
    const options = [...document.querySelectorAll('#county option')].map((o) => o.textContent);
    expect(options).toHaveLength(24); // 提示列 + 22 縣市 + 其他／海外
    expect(options).toContain('臺北市');
    expect(options).toContain('連江縣');
    expect(options[options.length - 1]).toContain('其他');
  });

  it('選台灣縣市時不顯示手填經度欄，選「其他」才顯示', () => {
    const field = document.getElementById('longitude-field') as HTMLElement;
    expect(field.hidden).toBe(true);
    set('county', '__manual__');
    expect(field.hidden).toBe(false);
    expect((document.getElementById('overseas-field') as HTMLElement).hidden).toBe(false);
    set('county', '臺北市');
    expect(field.hidden).toBe(true);
  });

  it('夏令時間年份：畫面明示已自動校正，並印出時鐘 → 真太陽時', () => {
    const text = submit(BASE);
    expect(text).toContain('時間校正');
    expect(text).toContain('1975-07-01 12:00'); // 輸入的時鐘時間
    expect(text).toContain('1975-07-01 11:02'); // 真太陽時：−60 +6.2 −3.9 ＝ −57.7 分
    expect(text).toContain('已自動減 1 小時');
    expect(text).toContain('夏令時間');
    expect(text).toContain('經度差');
    expect(text).toContain('均時差');
  });

  it('非夏令年份不會出現夏令時間那一層', () => {
    const text = submit({ ...BASE, year: '1990' });
    expect(text).toContain('經度差');
    expect(text).not.toContain('已自動減 1 小時');
  });

  it('印出四柱、藏干十神與兩種五行分佈', () => {
    // 1998-06-10 10:00（docs/v2-sources.md 的驗收命例，該處以已校正時間排盤）。
    const text = submit({ ...BASE, year: '1998', month: '6', day: '10', hour: '10', minute: '0' });
    expect(text).toContain('八字命盤');
    expect(text).toContain('戊寅'); // 年柱
    expect(text).toContain('戊午'); // 月柱
    expect(text).toContain('戊子'); // 日柱
    expect(text).toContain('四柱天干');
    expect(text).toContain('含地支藏干');
  });

  it('用神：印出身強弱、喜用忌神與六段依據（SPEC-v2 #14、#16）', () => {
    // 戊寅 戊午 戊子 丁巳 —— docs 第 10 節的基準命例。
    const text = submit({ ...BASE, year: '1998', month: '6', day: '10', hour: '10', minute: '0' });
    expect(text).toContain('用神');
    expect(text).toContain('身強');
    expect(text).toContain('喜用');
    expect(text).toContain('忌神');
    for (const key of ['得令', '得地', '得勢', '扶抑', '調候', '從格']) {
      expect(text, `缺少 ${key}`).toContain(key);
    }
    // 不給分數的是喜忌判定；身強弱的加權分數有明講「僅供顯示」。
    expect(text).toContain('僅供顯示');
  });

  it('用神可手動覆寫並恢復（SPEC-v2 #15）', () => {
    submit({ ...BASE, year: '1998', month: '6', day: '10', hour: '10', minute: '0' });
    const favorOf = () =>
      [...document.querySelectorAll('[data-action="toggle-favor"].button--on')].map(
        (b) => (b as HTMLElement).dataset['element'],
      );
    expect(favorOf().sort()).toEqual(['木', '水', '金'].sort());

    // 按「火」把它加進喜用 —— 從目前的喜用加減，不是從空集合開始。
    document
      .querySelector<HTMLButtonElement>('[data-action="toggle-favor"][data-element="火"]')!
      .click();
    expect(favorOf()).toContain('火');
    expect((document.getElementById('result') as HTMLElement).textContent).toContain('手動指定');

    document.querySelector<HTMLButtonElement>('[data-action="reset-favor"]')!.click();
    expect(favorOf().sort()).toEqual(['木', '水', '金'].sort());
    expect((document.getElementById('result') as HTMLElement).textContent).not.toContain('手動指定');
  });

  it('覆寫成空集合時明講後果，不靜默接受', () => {
    submit({ ...BASE, year: '1998', month: '6', day: '10', hour: '10', minute: '0' });
    for (const e of ['木', '金', '水']) {
      document
        .querySelector<HTMLButtonElement>(`[data-action="toggle-favor"][data-element="${e}"]`)!
        .click();
    }
    const text = (document.getElementById('result') as HTMLElement).textContent ?? '';
    expect(text).toContain('五行全忌');
  });

  it('姓名匹配：逐字評述＋候選字，並說明兩把尺的差別（SPEC-v2 #17–#19）', () => {
    const text = submit({ ...BASE, year: '1998', month: '6', day: '10', hour: '10', minute: '0' });
    expect(text).toContain('姓名匹配');
    expect(text).toContain('逐字五行');
    expect(text).toContain('數理五行'); // 兩把尺的說明
    expect(text).toContain('來源沒有交代'); // 資料限制照 v1 慣例標明
    expect(text).toContain('依用神推薦的候選字');
  });

  it('覆寫用神會讓姓名匹配跟著重算（SPEC-v2 #15 的閉環）', () => {
    submit({ ...BASE, year: '1998', month: '6', day: '10', hour: '10', minute: '0' });
    const verdictOf = (ch: string) => {
      const items = [...document.querySelectorAll('.card')].filter((c) =>
        c.querySelector('.section__title')?.textContent?.includes('姓名匹配'),
      );
      const li = [...items[0]!.querySelectorAll('.char-item')].find(
        (el) => el.querySelector('.char-item__char')?.textContent === ch,
      );
      return li?.querySelector('.tag')?.textContent?.trim() ?? '';
    };
    // 王＝土，本站判定忌土 → 傷用神。
    expect(verdictOf('王')).toContain('傷用神');

    // 改判「土」為喜用後，同一個字的評述必須跟著翻轉。
    document
      .querySelector<HTMLButtonElement>('[data-action="toggle-favor"][data-element="土"]')!
      .click();
    expect(verdictOf('王')).toContain('補用神');

    document.querySelector<HTMLButtonElement>('[data-action="reset-favor"]')!.click();
    expect(verdictOf('王')).toContain('傷用神');
  });

  it('候選字的筆畫範圍由使用者設定，改了就重算', () => {
    submit({ ...BASE, year: '1998', month: '6', day: '10', hour: '10', minute: '0' });
    const firstChar = () =>
      document.querySelector('.candidates__chars span')!.textContent ?? '';
    const before = firstChar();

    const min = document.querySelector<HTMLInputElement>(
      '[data-action="candidate-strokes"][data-bound="min"]',
    )!;
    min.value = '12';
    min.dispatchEvent(new Event('change', { bubbles: true }));

    const after = firstChar();
    expect(after).not.toBe(before);
    // 12 畫以下的字不該再出現。
    for (const span of document.querySelectorAll('.candidates__chars span')) {
      const strokes = Number(/(\d+)/.exec(span.getAttribute('title') ?? '')?.[1]);
      expect(strokes).toBeGreaterThanOrEqual(12);
    }
  });

  it('筆畫範圍上下顛倒時畫面明講無效，不顯示成「沒有候選字」', () => {
    submit({ ...BASE, year: '1998', month: '6', day: '10', hour: '10', minute: '0' });
    const setBound = (bound: string, value: string) => {
      const el = document.querySelector<HTMLInputElement>(
        `[data-action="candidate-strokes"][data-bound="${bound}"]`,
      )!;
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setBound('max', '5');
    setBound('min', '20');
    const text = (document.getElementById('result') as HTMLElement).textContent ?? '';
    expect(text).toContain('筆畫範圍無效');
    expect(document.querySelectorAll('.candidates__chars span')).toHaveLength(0);
    // 同一個錯誤只講一次。
    expect(text.split('筆畫範圍無效')).toHaveLength(2);
  });

  it('資料來源區塊列出逐字五行與常用字表的出處與限制（SPEC-v2 #21）', () => {
    const text = submit({ ...BASE, year: '1998', month: '6', day: '10', hour: '10', minute: '0' });
    expect(text).toContain('逐字五行（姓名匹配的尺）');
    expect(text).toContain('Apache-2.0');
    expect(text).toContain('常用字表（候選字過濾）');
    expect(text).toContain('Big5 Level 1');
    expect(text).toContain('不等同'); // 與教育部常用國字標準字體表的差異
  });

  it('筆畫範圍填非數字時當成不設限，不猜', () => {
    submit({ ...BASE, year: '1998', month: '6', day: '10', hour: '10', minute: '0' });
    const before = document.querySelectorAll('.candidates__chars span').length;
    const min = document.querySelector<HTMLInputElement>(
      '[data-action="candidate-strokes"][data-bound="min"]',
    )!;
    min.value = 'abc';
    min.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.querySelectorAll('.candidates__chars span').length).toBe(before);
  });

  it('調候與扶抑衝突時畫面兩者並陳，不藏起來', () => {
    // 庚午 戊子 己未 丁卯：身強土生於冬月，扶抑忌火、調候要火。
    const text = submit({ ...BASE, year: '1990', month: '12', day: '20', hour: '6', minute: '0' });
    expect(text).toContain('並陳');
    expect(text).toContain('流派差異');
  });

  it('缺出生時間時明講不產出八字，姓名分析照跑（SPEC-v2 #4）', () => {
    const text = submit({ ...BASE, hour: '', minute: '' });
    expect(text).toContain('未填出生時間');
    expect(text).not.toContain('八字命盤');
    expect(text).toContain('三才五格');
  });

  it('填了時間但沒選出生地時，說明原因而不是靜默略過', () => {
    const text = submit({ ...BASE, county: '' });
    expect(text).toContain('未選出生地');
    expect(text).not.toContain('八字命盤');
  });

  it('早子時可一鍵切換重算日柱（SPEC-v2 #12）', () => {
    const text = submit({ ...BASE, year: '2000', month: '3', day: '5', hour: '23', minute: '30' });
    expect(text).toContain('子初換日');
    const button = document.querySelector<HTMLButtonElement>('[data-action="toggle-late-zi"]');
    expect(button).not.toBeNull();

    const dayBefore = document.querySelectorAll('.pillar__ganzhi')[2]!.textContent;
    button!.click();
    const after = (document.getElementById('result') as HTMLElement).textContent ?? '';
    expect(after).toContain('夜子時');
    const dayAfter = document.querySelectorAll('.pillar__ganzhi')[2]!.textContent;
    expect(dayAfter).not.toBe(dayBefore);
  });

  it('只填時或只填分：明講輸入殘缺，不當成沒填時間', () => {
    expect(submit({ ...BASE, minute: '' })).toContain('需同時填寫');
    expect(submit({ ...BASE, hour: '', minute: '30' })).toContain('需同時填寫');
  });

  it('夏令起訖當日：兩種假設都算得出來，可一鍵切換（SPEC-v2 #24）', () => {
    const text = submit({ ...BASE, year: '1975', month: '4', day: '1', hour: '12', minute: '0' });
    expect(text).toContain('起訖當日');
    expect(text).toContain('已撥快');
    const before = document.querySelector('.conversion__to')!.textContent!.trim();
    expect(before).toBe('1975-04-01 11:02');

    const button = document.querySelector<HTMLButtonElement>('[data-action="toggle-dst"]');
    expect(button).not.toBeNull();
    button!.click();
    const after = document.querySelector('.conversion__to')!.textContent!.trim();
    expect(after).toBe('1975-04-01 12:02'); // 不減那 1 小時
    expect((document.getElementById('result') as HTMLElement).textContent).toContain('不減這 1 小時');
  });

  it('海外出生者：手填經度＋自行勾選夏令時間', () => {
    set('county', '__manual__');
    const text = submit({
      ...BASE,
      county: '__manual__',
      longitude: '139.7',
      meridian: '135',
    });
    expect(text).toContain('手填經度');
    expect(text).toContain('時區中央經線 135°');
    expect(text).not.toContain('已自動減 1 小時'); // 台灣年份表不套用到海外
  });

  it('海外只填經度、沒填時區中央經線時不排盤，也不拿台灣的 120° 頂替', () => {
    set('county', '__manual__');
    const text = submit({ ...BASE, county: '__manual__', longitude: '139.7', meridian: '' });
    expect(text).toContain('時區中央經線都要填');
    expect(text).not.toContain('八字命盤');
    expect(text).toContain('三才五格'); // 姓名分析照跑
  });

  it('海外只填中央經線、漏填經度時同樣不排盤', () => {
    set('county', '__manual__');
    const text = submit({ ...BASE, county: '__manual__', longitude: '', meridian: '135' });
    expect(text).toContain('時區中央經線都要填');
    expect(text).not.toContain('八字命盤');
  });

  it('切過夏令裁決後重新送出非邊界日期，裁決不殘留', () => {
    submit({ ...BASE, year: '1975', month: '4', day: '1', hour: '12', minute: '0' });
    document.querySelector<HTMLButtonElement>('[data-action="toggle-dst"]')!.click();
    expect((document.getElementById('result') as HTMLElement).textContent).toContain('不減這 1 小時');

    // 期間中央的日子：沒有不確定性，必須恢復成照表減 1 小時。
    const text = submit({ ...BASE, year: '1975', month: '6', day: '1', hour: '12', minute: '0' });
    expect(text).toContain('已自動減 1 小時');
    expect(text).not.toContain('不減這 1 小時');
    expect(document.querySelector('[data-action="toggle-dst"]')).toBeNull();
  });

  it('點到按鈕內層節點也會觸發切換（事件委派）', () => {
    submit({ ...BASE, year: '2000', month: '3', day: '5', hour: '23', minute: '30' });
    const button = document.querySelector<HTMLButtonElement>('[data-action="toggle-late-zi"]')!;
    // 直接對按鈕內的文字節點所屬元素派事件，模擬點在字上而非按鈕邊框。
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect((document.getElementById('result') as HTMLElement).textContent).toContain('夜子時');
  });

  it('資料來源區塊列出縣市經度與夏令時間的出處', () => {
    const text = submit(BASE);
    expect(text).toContain('縣市經度');
    expect(text).toContain('中華郵政');
    expect(text).toContain('台灣夏令時間年份');
    expect(text).toContain('1945');
  });
});

// --- v3：取名模式 ------------------------------------------------------------

function submitNaming(fields: Record<string, string>): string {
  for (const [id, value] of Object.entries(fields)) set(id, value);
  const form = document.getElementById('naming-form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return (document.getElementById('naming-result') as HTMLElement).textContent ?? '';
}

const NAMING_BASE = {
  'naming-surname': '陳',
  'naming-year': '2027',
  'naming-month': '6',
  'naming-day': '1',
};

/** 展開第 index 個筆畫組合並回傳其 details 元素（候選字為展開時才渲染）。 */
function openCombo(index = 0): HTMLDetailsElement {
  const combo = document.querySelectorAll<HTMLDetailsElement>('details.combo')[index]!;
  combo.open = true;
  combo.dispatchEvent(new Event('toggle'));
  return combo;
}

describe('UI（取名模式，SPEC-v3）', () => {
  beforeEach(async () => {
    localStorage.clear();
    await mount();
  });

  it('預設顯示取名入口，分析入口藏起；點分頁可切換（SPEC-v3 #1）', () => {
    expect((document.getElementById('mode-naming') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('mode-analysis') as HTMLElement).hidden).toBe(true);
    const analysisTab = document.querySelector<HTMLButtonElement>('[data-mode="analysis"]')!;
    analysisTab.click();
    expect((document.getElementById('mode-naming') as HTMLElement).hidden).toBe(true);
    expect((document.getElementById('mode-analysis') as HTMLElement).hidden).toBe(false);
    expect(analysisTab.getAttribute('aria-pressed')).toBe('true');
  });

  it('列組合：分項判定、不排序不給分、天格標明先天定不計（SPEC-v3 #3）', () => {
    const text = submitNaming(NAMING_BASE);
    expect(text).toContain('陳 姓（16 畫）的吉筆畫組合');
    expect(text).toContain('不合成單一總分');
    expect(text).toContain('不計吉凶、只參與三才');
    expect(document.querySelectorAll('details.combo').length).toBeGreaterThan(0);
    // 每個 summary 都有三才與四個計分格的分項標籤。
    const summary = document.querySelector('details.combo summary')!;
    expect(summary.textContent).toContain('三才');
    expect(summary.querySelectorAll('.tag')).toHaveLength(5); // 三才 + 人地外總
  });

  it('展開組合：天格列出但標「先天定・不計」，候選字預設無忌字（SPEC-v3 #7）', () => {
    submitNaming(NAMING_BASE);
    const combo = openCombo();
    expect(combo.textContent).toContain('先天定・不計');
    // 預設可見的 chips 不含忌字；忌字收在 cand-avoid 的 details 裡。
    const visibleChips = combo.querySelectorAll('.cand-pos > .chips .chip.tag--bad');
    expect(visibleChips).toHaveLength(0);
    const avoid = combo.querySelector('details.cand-avoid');
    expect(avoid).not.toBeNull();
    expect(avoid!.querySelector('summary')!.textContent).toContain('忌字');
    expect(avoid!.querySelectorAll('.chip').length).toBeGreaterThan(0);
    // 忌字附理由（SPEC-v3 #7）。
    expect(avoid!.textContent).toContain('忌用');
  });

  it('預產期距立春 3 週內：並列兩生肖、忌字取聯集（SPEC-v3 #9）', () => {
    const text = submitNaming({
      ...NAMING_BASE,
      'naming-year': '2027',
      'naming-month': '2',
      'naming-day': '10',
    });
    expect(text).toContain('距立春 6 天');
    expect(text).toContain('馬');
    expect(text).toContain('羊');
    expect(text).toContain('忌字取聯集');
    expect(text).toContain('馬喜');
    expect(text).toContain('羊忌');
  });

  it('距立春遠：單一生肖，不出臨界警告', () => {
    const text = submitNaming(NAMING_BASE);
    expect(text).toContain('未羊');
    expect(text).not.toContain('忌字取聯集');
  });

  it('點滿各位置的字才能收藏；收藏進 localStorage 且重載後仍在（SPEC-v3 #10）', async () => {
    submitNaming(NAMING_BASE);
    const combo = openCombo();
    const save = combo.querySelector<HTMLButtonElement>('[data-action="save-fav"]')!;
    expect(save.disabled).toBe(true);

    const pick = (pos: number) =>
      combo.querySelector<HTMLButtonElement>(`.chip[data-pos="${pos}"]`)!;
    pick(0).click();
    expect(save.disabled).toBe(true); // 還差一個位置
    pick(1).click();
    expect(save.disabled).toBe(false);
    const expected = '陳' + pick(0).dataset['char']! + pick(1).dataset['char']!;
    save.click();

    const stored = JSON.parse(localStorage.getItem('mio-shuming:favorites:v1')!) as {
      surname: string;
      givenName: string;
    }[];
    expect(stored).toHaveLength(1);
    expect(stored[0]!.surname + stored[0]!.givenName).toBe(expected);
    expect(document.getElementById('naming-favorites')!.textContent).toContain(expected);

    // 重新載入頁面（模擬幾個月後回來）：收藏仍在。
    await mount();
    expect(document.getElementById('naming-favorites')!.textContent).toContain(expected);
  });

  it('「帶入完整分析」切到分析模式並填入姓名（SPEC-v3 #10）', () => {
    localStorage.setItem(
      'mio-shuming:favorites:v1',
      JSON.stringify([{ surname: '陳', givenName: '宇軒' }]),
    );
    // 收藏區在 init 時渲染，重新觸發：直接重掛。
    return mount().then(() => {
      const button = document.querySelector<HTMLButtonElement>('[data-action="fav-analyse"]')!;
      button.click();
      expect((document.getElementById('mode-analysis') as HTMLElement).hidden).toBe(false);
      expect((document.getElementById('surname') as HTMLInputElement).value).toBe('陳');
      expect((document.getElementById('givenName') as HTMLInputElement).value).toBe('宇軒');
    });
  });

  it('查無此字的姓氏誠實回報', () => {
    const text = submitNaming({ ...NAMING_BASE, 'naming-surname': '𡈙' });
    expect(text).toContain('查無此字');
  });

  it('單名模式：組合為單一位置，外格標「單名固定・不計」', () => {
    const radio = document.querySelector<HTMLInputElement>('input[name="givenLength"][value="1"]')!;
    radio.checked = true;
    submitNaming({ ...NAMING_BASE, 'naming-surname': '王' });
    const combo = openCombo();
    expect(combo.querySelectorAll('.compose__slot')).toHaveLength(1);
    expect(combo.textContent).not.toContain('名二');
    expect(combo.textContent).toContain('單名固定・不計');
  });

  it('連次佳都無解時照實回報並建議改雙名（陳＋單名）', () => {
    const radio = document.querySelector<HTMLInputElement>('input[name="givenLength"][value="1"]')!;
    radio.checked = true;
    const text = submitNaming(NAMING_BASE); // 陳（16 畫）單名無任何三才吉的無凶組合
    expect(document.querySelectorAll('details.combo')).toHaveLength(0);
    expect(text).toContain('次佳組合也不存在');
    expect(text).toContain('建議改用雙名');
  });

  it('取名結果也附資料來源，含天格不計的出處', () => {
    const text = submitNaming(NAMING_BASE);
    expect(text).toContain('資料來源');
    expect(text).toContain('天格不計吉凶');
  });
});

describe('UI（Codex review 回修的回歸）', () => {
  beforeEach(async () => {
    localStorage.clear();
    await mount();
  });

  it('分析模式的資料來源不列取名模式專屬的天格／單名外格條目', () => {
    const text = submit(BASE);
    expect(text).toContain('資料來源');
    expect(text).not.toContain('天格不計吉凶');
    expect(text).not.toContain('單名外格不計吉凶');
  });

  it('曆上不存在的預產期（2027-02-30）誠實回報，不進位不猜', () => {
    const text = submitNaming({
      ...NAMING_BASE,
      'naming-month': '2',
      'naming-day': '30',
    });
    expect(text).toContain('有效西元日期');
    expect(document.querySelectorAll('details.combo')).toHaveLength(0);
  });
});
