// SPEC-v4 #28–#30：畫面文字不得含開發者用語。走完所有指定狀態後讀
// `document.body.innerText`，斷言不含下列字詞（大小寫敏感、原字比對）。
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const BANNED = ['SPEC', 'localStorage', 'curl', 'kTotalStrokes', 'kRSUnicode', '$comment', 'tools/', 'src/'];

// SPEC-v4 #36–#37：列舉字詞擋不住同類的新字，另加類別規則。
const BANNED_PATTERNS: { category: string; pattern: RegExp }[] = [
  { category: '檔案路徑', pattern: /[\w.-]+\/[\w./-]+\.(md|ts|mjs|json)\b/g },
  { category: '檔名', pattern: /\b[\w-]+\.(txt|csv|xml|zip|md|json|mjs|ts)\b/g },
  { category: 'Markdown 粗體', pattern: /\*\*[^*\n]+\*\*/g },
  { category: 'Unicode 欄位名', pattern: /\bk[A-Z][A-Za-z]+\b/g },
  { category: '內部欄位名', pattern: /\bconflicts\b/g },
  // SPEC-v4 #43：網址只能待在連結 href 裡；owner/repo 兩段都要英文字母開頭，不誤中「5/1」這類日期。
  { category: '裸網址', pattern: /https?:\/\/\S*/g },
  { category: 'owner/repo', pattern: /\b[A-Za-z][\w.-]*\/[A-Za-z][\w.-]*\b/g },
  { category: '0x 碼位', pattern: /\b0x[0-9A-Fa-f]{4,5}\b/g },
];

const KEY = 'mio-shuming:favorites:v1';
const FAVORITES = [
  { surname: '王', givenName: '小明', due: { year: 2026, month: 6, day: 15 } },
  { surname: '王', givenName: '美玲' },
];

function around(text: string, index: number, length: number): string {
  return text.slice(Math.max(0, index - 20), index + length + 20);
}

async function assertNoDevJargon(page: Page, label: string): Promise<void> {
  // SPEC-v4 #44：資料來源預設收合，收合的內容不在 innerText 裡。每個狀態都先全部展開，
  // 否則只有「頁尾與資料來源」一個狀態看得到來源文字，取名模式專屬的來源列就沒人檢查。
  await page.locator('details.sources-toggle').evaluateAll((els) => {
    for (const el of els) (el as HTMLDetailsElement).open = true;
  });
  const text = await page.locator('body').innerText();
  const hits: string[] = [];
  for (const word of BANNED) {
    const index = text.indexOf(word);
    if (index !== -1) {
      hits.push(`列舉字詞「${word}」：…${around(text, index, word.length)}…`);
    }
  }
  for (const { category, pattern } of BANNED_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      hits.push(`${category}「${m[0]}」：…${around(text, m.index, m[0].length)}…`);
    }
  }
  expect(hits, `${label} 命中開發者用語：\n${hits.join('\n')}`).toEqual([]);
}

async function analyseWithTime(page: Page): Promise<void> {
  await page.getByRole('button', { name: /分析名字/ }).click();
  await page.fill('#surname', '王');
  await page.fill('#givenName', '小明');
  await page.fill('#year', '1998');
  await page.fill('#month', '6');
  await page.fill('#day', '10');
  await page.fill('#hour', '10');
  await page.fill('#minute', '0');
  await page.selectOption('#county', '臺北市');
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.locator('#result section.summary')).toBeVisible();
}

/** 出生日正好是夏令時間起訖當日，觸發「邊界不確定」提示與切換按鈕。 */
async function analyseOnDstBoundary(page: Page): Promise<void> {
  await page.getByRole('button', { name: /分析名字/ }).click();
  await page.fill('#surname', '王');
  await page.fill('#givenName', '小明');
  await page.fill('#year', '1948');
  await page.fill('#month', '5');
  await page.fill('#day', '1');
  await page.fill('#hour', '10');
  await page.fill('#minute', '0');
  await page.selectOption('#county', '臺北市');
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.locator('#result section.summary')).toBeVisible();
  await expect(page.getByText('出生日正好是夏令時間的起訖當日')).toBeVisible();
}

async function expandAllTerms(page: Page): Promise<void> {
  const buttons = page.locator('[data-action="toggle-term"]');
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    if ((await button.getAttribute('aria-expanded')) === 'false') {
      await button.click();
    }
  }
}

test('首頁不含開發者用語', async ({ page }) => {
  await page.goto('./');
  await assertNoDevJargon(page, '首頁');
});

test('取名結果（展開候選字與忌字）不含開發者用語', async ({ page }) => {
  await page.goto('./');
  await page.fill('#naming-surname', '王');
  await page.fill('#naming-year', '2026');
  await page.fill('#naming-month', '6');
  await page.fill('#naming-day', '15');
  await page.getByRole('button', { name: '列出吉筆畫組合' }).click();
  const result = page.locator('#naming-result');
  const combos = result.locator('details.combo');
  await expect(combos.first()).toBeVisible();
  const count = await combos.count();
  let avoidExpanded = false;
  for (let i = 0; i < count; i++) {
    const combo = combos.nth(i);
    await combo.locator('summary').first().click();
    await expect(combo).toHaveAttribute('open', '');
    await expect(combo.locator('.combo__body')).not.toBeEmpty();
    const avoidDetails = combo.locator('details.cand-avoid');
    const avoidCount = await avoidDetails.count();
    for (let j = 0; j < avoidCount; j++) {
      await avoidDetails.nth(j).locator('summary').click();
      avoidExpanded = true;
    }
  }
  // 候選字忌字是否存在取決於生肖與筆畫組合；本測試日期下若真的一個忌字都沒有，
  // 代表這批候選字全部通過生肖篩選，屬於資料現況，不視為守衛失敗。
  await assertNoDevJargon(page, `取名結果（候選字＋${avoidExpanded ? '忌字' : '無忌字可展開'}）`);
});

test('帶預產期收藏與比較視圖不含開發者用語', async ({ page }) => {
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: KEY, value: JSON.stringify(FAVORITES) },
  );
  await page.goto('./');
  const favorites = page.locator('#favorites-card');
  await expect(favorites).toBeVisible();
  await favorites.getByRole('checkbox', { name: /比較/ }).nth(0).check();
  await favorites.getByRole('checkbox', { name: /比較/ }).nth(1).check();
  await favorites.getByRole('button', { name: '比較勾選的名字' }).click();
  const view = page.locator('#compare-card');
  await expect(view).toBeVisible();
  await assertNoDevJargon(page, '收藏與比較視圖');
});

test('分析結果（有時辰）不含開發者用語', async ({ page }) => {
  await page.goto('./');
  await analyseWithTime(page);
  await assertNoDevJargon(page, '分析結果：有時辰');
});

test('分析結果（夏令時間邊界不確定）不含開發者用語', async ({ page }) => {
  await page.goto('./');
  await analyseOnDstBoundary(page);
  await assertNoDevJargon(page, '分析結果：夏令時間邊界不確定');
});

test('分析結果（手動覆寫用神）不含開發者用語', async ({ page }) => {
  await page.goto('./');
  await analyseWithTime(page);
  const result = page.locator('#result');
  const toggleButtons = result.locator('[data-action="toggle-favor"]');
  await expect(toggleButtons.first()).toBeVisible();
  await toggleButtons.first().click();
  await toggleButtons.nth(1).click();
  await expect(result.getByText('目前顯示的是')).toBeVisible();
  await assertNoDevJargon(page, '分析結果：手動覆寫用神');
});

test('取名結果（次佳組合）不含開發者用語', async ({ page }) => {
  await page.goto('./');
  await page.fill('#naming-surname', '灤');
  await page.fill('#naming-year', '2026');
  await page.fill('#naming-month', '6');
  await page.fill('#naming-day', '15');
  await page.getByRole('button', { name: '列出吉筆畫組合' }).click();
  const result = page.locator('#naming-result');
  await expect(result.getByText('次佳組合')).toBeVisible();
  await assertNoDevJargon(page, '取名結果：次佳組合');
});

test('取名結果（無組合）不含開發者用語', async ({ page }) => {
  await page.goto('./');
  await page.fill('#naming-surname', '七');
  await page.getByRole('radio', { name: '單名（1 字）' }).check();
  await page.fill('#naming-year', '2026');
  await page.fill('#naming-month', '6');
  await page.fill('#naming-day', '15');
  await page.getByRole('button', { name: '列出吉筆畫組合' }).click();
  const result = page.locator('#naming-result');
  await expect(result.getByText('也不存在')).toBeVisible();
  await assertNoDevJargon(page, '取名結果：無組合');
});

test('取名結果（立春臨界，生肖兩肖並列）不含開發者用語', async ({ page }) => {
  await page.goto('./');
  await page.fill('#naming-surname', '王');
  await page.fill('#naming-year', '2026');
  await page.fill('#naming-month', '2');
  await page.fill('#naming-day', '10');
  await page.getByRole('button', { name: '列出吉筆畫組合' }).click();
  const result = page.locator('#naming-result');
  await expect(result.getByText('距立春')).toBeVisible();
  await assertNoDevJargon(page, '取名結果：立春臨界');
});

test('分析結果（無時辰）不含開發者用語', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /分析名字/ }).click();
  await page.fill('#surname', '王');
  await page.fill('#givenName', '小明');
  await page.fill('#year', '1998');
  await page.fill('#month', '6');
  await page.fill('#day', '10');
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.locator('#result section.summary')).toBeVisible();
  await assertNoDevJargon(page, '分析結果：無時辰');
});

test('名詞說明全部展開不含開發者用語', async ({ page }) => {
  await page.goto('./');
  await analyseWithTime(page);
  await expandAllTerms(page);
  await assertNoDevJargon(page, '名詞說明全部展開');
});

test('頁尾與資料來源區塊不含開發者用語', async ({ page }) => {
  await page.goto('./');
  await analyseWithTime(page);
  // SPEC-v4 #44：資料來源預設收合，收合的內容不在 innerText 裡——不展開就等於沒檢查。
  await page.locator('#sources summary').click();
  await expect(page.locator('#sources details')).toHaveAttribute('open', '');
  await assertNoDevJargon(page, '頁尾與資料來源區塊');
});
