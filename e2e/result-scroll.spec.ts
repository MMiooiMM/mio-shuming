// SPEC-v4 #45–#46：送出後結果頂端要在視窗內——成功與出錯、兩個模式都一樣。
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * 等 smooth scroll 收斂後，結果區頂端落在視窗內，而且確實捲過去了：
 * 頂端貼齊視窗（誤差 2px），或頁面已捲到底（結果太短、捲不到頂）。
 * 只斷言「在視窗內」不夠——結果區短時，沒捲動也會落在視窗下半部。
 */
async function expectTopInViewport(page: Page, result: Locator, label: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const m = await result.evaluate((el) => ({
          top: Math.round(el.getBoundingClientRect().top),
          innerHeight,
          atBottom: scrollY >= document.documentElement.scrollHeight - innerHeight - 2,
        }));
        console.log(`[scroll] ${label}: ${JSON.stringify(m)}`);
        return m.top >= 0 && m.top < m.innerHeight && (m.top <= 2 || m.atBottom);
      },
      { message: `${label}：送出後結果頂端不在視窗內`, timeout: 5000 },
    )
    .toBe(true);
}

async function fillNaming(page: Page, surname: string, year: string): Promise<void> {
  await page.fill('#naming-surname', surname);
  await page.fill('#naming-year', year);
  await page.fill('#naming-month', '3');
  await page.fill('#naming-day', '15');
}

test('取名模式：成功送出後結果在視窗內', async ({ page }) => {
  await page.goto('./');
  await fillNaming(page, '王', '2026');
  await page.getByRole('button', { name: '列出吉筆畫組合' }).click();
  const result = page.locator('#naming-result');
  await expect(result.locator('details.combo').first()).toBeVisible();
  await expectTopInViewport(page, result, '取名成功');
});

test('取名模式：預產期無效時捲到錯誤訊息', async ({ page }) => {
  await page.goto('./');
  await fillNaming(page, '王', '1800');
  await page.getByRole('button', { name: '列出吉筆畫組合' }).click();
  const result = page.locator('#naming-result');
  await expect(result).toContainText('預產期需為');
  await expectTopInViewport(page, result, '取名出錯：預產期');
});

test('取名模式：姓氏查無時捲到錯誤訊息', async ({ page }) => {
  await page.goto('./');
  await fillNaming(page, '𡈙', '2026');
  await page.getByRole('button', { name: '列出吉筆畫組合' }).click();
  const result = page.locator('#naming-result');
  await expect(result).toContainText('查無');
  await expectTopInViewport(page, result, '取名出錯：姓氏');
});

async function fillAnalysis(page: Page, hour: string, minute: string): Promise<void> {
  await page.getByRole('button', { name: /分析名字/ }).click();
  await page.fill('#surname', '王');
  await page.fill('#givenName', '小明');
  await page.fill('#year', '1998');
  await page.fill('#month', '6');
  await page.fill('#day', '10');
  await page.fill('#hour', hour);
  await page.fill('#minute', minute);
  await page.selectOption('#county', '臺北市');
}

test('分析模式：成功送出後結果在視窗內', async ({ page }) => {
  await page.goto('./');
  await fillAnalysis(page, '10', '0');
  await page.getByRole('button', { name: '開始分析' }).click();
  const result = page.locator('#result');
  await expect(result.locator('section.summary')).toBeVisible();
  await expectTopInViewport(page, result, '分析成功');
});

test('分析模式：時分只填一項時捲到錯誤訊息', async ({ page }) => {
  await page.goto('./');
  await fillAnalysis(page, '10', '');
  await page.getByRole('button', { name: '開始分析' }).click();
  const result = page.locator('#result');
  await expect(result).toContainText('同時填寫');
  await expectTopInViewport(page, result, '分析出錯：時分');
});
