// SPEC-v4 #12、#13、#20：收藏比較（勾 2–5 個）與比較卡片。
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const KEY = 'mio-shuming:favorites:v1';

/** 6 筆收藏：含無 due 的舊資料、立春 ±3 週內、單名。 */
const FAVORITES = [
  { surname: '王', givenName: '小明', due: { year: 2026, month: 6, day: 15 } },
  { surname: '王', givenName: '大同', due: { year: 2026, month: 2, day: 10 } },
  { surname: '王', givenName: '美玲' },
  { surname: '王', givenName: '明', due: { year: 2027, month: 6, day: 1 } },
  { surname: '王', givenName: '志強', due: { year: 2026, month: 6, day: 15 } },
  { surname: '王', givenName: '家豪', due: { year: 2026, month: 7, day: 1 } },
];

async function seed(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: KEY, value: JSON.stringify(FAVORITES) },
  );
  await page.goto('./');
  await expect(page.locator('#favorites-card')).toBeVisible();
}

const box = (page: Page, name: string) =>
  page.locator('#favorites-card').getByRole('checkbox', { name: `比較 ${name}` });

async function expectNoHorizontalScroll(page: Page, label: string): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  console.log(`[overflow] ${label}: scrollWidth=${scrollWidth} clientWidth=${clientWidth}`);
  expect(scrollWidth, `${label} 整頁可橫向捲動`).toBeLessThanOrEqual(clientWidth);
}

/** PNG：8 bytes signature，接著 IHDR chunk，寬高在 offset 16／20（big-endian）。 */
function pngInfo(bytes: Uint8Array): { signature: boolean; width: number; height: number } {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    signature: sig.every((b, i) => bytes[i] === b),
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

test('勾 1 個比較鈕停用、勾 2 個啟用、勾滿 5 個第 6 個被擋', async ({ page }) => {
  await seed(page);
  const compare = page.getByRole('button', { name: '比較勾選的名字' });

  await expect(compare).toBeDisabled();
  await box(page, '王小明').check();
  await expect(compare).toBeDisabled();
  await box(page, '王大同').check();
  await expect(compare).toBeEnabled();

  await box(page, '王美玲').check();
  await box(page, '王明').check();
  await box(page, '王志強').check();
  await expect(compare).toBeEnabled();

  const sixth = box(page, '王家豪');
  await expect(sixth).toBeDisabled();
  await expect(sixth).not.toBeChecked();
  await expect(page.locator('#favorites-card [data-compare-hint]')).toContainText('最多比較 5 個');

  // 取消一個之後第 6 個恢復可勾。
  await box(page, '王小明').uncheck();
  await expect(sixth).toBeEnabled();
});

test('比較視圖：每名一欄、只列計分格、生肖未知與立春兩肖，390px 不溢位', async ({ page }) => {
  await seed(page);
  for (const name of ['王小明', '王大同', '王美玲', '王明', '王志強']) await box(page, name).check();
  const before = page.url();
  await page.getByRole('button', { name: '比較勾選的名字' }).click();

  const view = page.locator('#compare-card');
  await expect(view).toBeVisible();
  const heads = view.locator('thead th[scope="col"]');
  await expect(heads).toHaveText(['王小明', '王大同', '王美玲', '王明', '王志強']);

  // 只列取名可改變、計吉凶的格：沒有天格列。
  const rowHeads = view.locator('tbody th[scope="row"]');
  await expect(rowHeads).toContainText(['三才', '人格', '地格', '外格', '總格', '生肖', '生肖喜忌']);
  await expect(view.locator('tbody th', { hasText: '天格' })).toHaveCount(0);

  const zodiacRow = view.locator('tbody tr', { has: page.locator('th', { hasText: /^生肖$/ }) });
  const cells = zodiacRow.locator('td');
  await expect(cells.nth(0)).toHaveText('馬');
  await expect(cells.nth(1)).toContainText('蛇 或 馬');
  await expect(cells.nth(2)).toHaveText('生肖未知');
  await expect(cells.nth(3)).toHaveText('羊');

  // 單名外格不計吉凶。
  const waiRow = view.locator('tbody tr', { has: page.locator('th', { hasText: '外格' }) });
  await expect(waiRow.locator('td').nth(3)).toContainText('不計');

  // 不計數、不排序、不選最佳。
  await expect(view).not.toContainText(/最佳|推薦|\d+\s*[項個]\s*[吉凶]/);

  await expectNoHorizontalScroll(page, `${test.info().project.name} 比較視圖`);
  expect(page.url()).toBe(before);
});

test('比較卡片：不支援 Web Share 時下載 PNG，網址不變', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
  });
  await seed(page);
  for (const name of ['王小明', '王大同', '王美玲', '王明', '王志強']) await box(page, name).check();
  await page.getByRole('button', { name: '比較勾選的名字' }).click();
  const before = page.url();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '輸出比較卡片' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const bytes = new Uint8Array(readFileSync(await download.path()));
  expect(bytes.byteLength).toBeGreaterThan(0);
  const info = pngInfo(bytes);
  expect(info.signature).toBe(true);
  expect(info.width).toBe(1080);
  expect(info.height).toBeGreaterThanOrEqual(1350);
  await download.saveAs(test.info().outputPath('compare-card.png'));
  expect(page.url()).toBe(before);
});

test('比較卡片：支援 Web Share 時帶 image/png 檔分享，不下載', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared?: ShareData };
    Object.defineProperty(Navigator.prototype, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(Navigator.prototype, 'share', {
      value: (d: ShareData) => {
        w.__shared = d;
        return Promise.resolve();
      },
      configurable: true,
    });
  });
  await seed(page);
  await box(page, '王小明').check();
  await box(page, '王美玲').check();
  await page.getByRole('button', { name: '比較勾選的名字' }).click();

  let downloaded = false;
  page.on('download', () => {
    downloaded = true;
  });
  await page.getByRole('button', { name: '輸出比較卡片' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shared?: ShareData }).__shared?.files?.[0]?.type))
    .toBe('image/png');
  expect(downloaded).toBe(false);
});
