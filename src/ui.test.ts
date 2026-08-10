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
