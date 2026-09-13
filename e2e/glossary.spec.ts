// SPEC-v4 #9：名詞可就地點開說明，滑鼠與鍵盤（Enter／Space）皆可展開收合，aria-expanded 正確。
// 顯示與否只能在真瀏覽器驗（jsdom 不套 stylesheet），所以用 checkVisibility()。
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

async function analyseWithTime(page: Page): Promise<Locator> {
  await page.goto('./');
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
  const result = page.locator('#result');
  await expect(result.locator('section.summary')).toBeVisible();
  return result;
}

const panelVisible = (page: Page, button: Locator) =>
  button.evaluate((b) => document.getElementById(b.getAttribute('aria-controls')!)!.checkVisibility());

const TERMS = ['人格', '天格', '地格', '外格', '總格', '三才', '用神', '十神', '藏干', '真太陽時'];

test('分析結果：十個指定名詞都有說明按鈕', async ({ page }) => {
  const result = await analyseWithTime(page);
  for (const term of TERMS) {
    await expect(result.getByRole('button', { name: `${term}是什麼？` })).toHaveCount(1);
  }
});

test('鍵盤：Tab 到人格按鈕 → Enter 展開 → Space 收合', async ({ page }) => {
  const result = await analyseWithTime(page);
  const button = result.getByRole('button', { name: '人格是什麼？' });
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  expect(await panelVisible(page, button)).toBe(false);

  // 從天格按鈕（五格第一格）出發按 Tab，下一個焦點必須是人格按鈕——證明按鈕在 Tab 順序裡。
  await result.getByRole('button', { name: '天格是什麼？' }).focus();
  await page.keyboard.press('Tab');
  await expect(button).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  expect(await panelVisible(page, button)).toBe(true);
  await expect(result.locator(`#${await button.getAttribute('aria-controls')}`)).toContainText('名字第一個字');

  await page.keyboard.press('Space');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  expect(await panelVisible(page, button)).toBe(false);
});

test('滑鼠：點用神展開、再點收合；展開不重繪結果', async ({ page }) => {
  const result = await analyseWithTime(page);
  const button = result.getByRole('button', { name: '用神是什麼？' });
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  expect(await panelVisible(page, button)).toBe(true);
  await expect(result.locator(`#${await button.getAttribute('aria-controls')}`)).toContainText('本站採自訂的操作化規則');
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  expect(await panelVisible(page, button)).toBe(false);
});

test('取名模式也有名詞說明；兩模式同在 DOM 時 id 不相撞，鍵盤可展開', async ({ page }) => {
  // 先跑分析，再切回取名跑一次——兩個結果區同時存在。
  await analyseWithTime(page);
  await page.getByRole('button', { name: /我要取名/ }).click();
  await page.fill('#naming-surname', '王');
  await page.fill('#naming-year', '2026');
  await page.fill('#naming-month', '6');
  await page.fill('#naming-day', '15');
  await page.getByRole('button', { name: '列出吉筆畫組合' }).click();
  const naming = page.locator('#naming-result');
  const button = naming.getByRole('button', { name: '三才是什麼？' });
  await expect(button).toHaveCount(1);

  const ids = await page
    .locator('[data-action="toggle-term"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-controls')));
  expect(ids.length).toBeGreaterThan(10);
  expect(new Set(ids).size).toBe(ids.length);

  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  expect(await panelVisible(page, button)).toBe(true);
  await page.keyboard.press('Space');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  expect(await panelVisible(page, button)).toBe(false);
});

test('展開全部名詞後 390px 仍不溢位', async ({ page }) => {
  const result = await analyseWithTime(page);
  for (const button of await result.locator('[data-action="toggle-term"]').all()) {
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(await panelVisible(page, button)).toBe(true);
  }
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  console.log(`[overflow] 名詞全展開: scrollWidth=${scrollWidth} clientWidth=${clientWidth}`);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test('資料來源列出名詞解釋的出處', async ({ page }) => {
  const result = await analyseWithTime(page);
  const sources = result.locator('#sources');
  await expect(sources).toContainText('名詞解釋・天格、人格、地格、外格、總格');
  await expect(sources).toContainText('名詞解釋・真太陽時');
});
