// SPEC-v4 #1、#5、#7：分析卡片——Canvas PNG，Web Share 或退回下載，網址不帶使用者輸入。
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function analyse(page: Page): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: /分析名字/ }).click();
  await page.fill('#surname', '王');
  await page.fill('#givenName', '小明');
  await page.fill('#year', '2024');
  await page.fill('#month', '3');
  await page.fill('#day', '15');
  await page.fill('#hour', '10');
  await page.fill('#minute', '30');
  await page.selectOption('#county', '臺北市');
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.locator('#result section.summary')).toBeVisible();
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

test('不支援 Web Share：退回下載 1080×1350 PNG，網址不變', async ({ page }) => {
  // 強制走「不支援」路徑——無論這台 Chromium 本身有沒有 Web Share。
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
  });
  await analyse(page);
  const before = page.url();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '分享卡片' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const bytes = new Uint8Array(readFileSync(await download.path()));
  expect(bytes.byteLength).toBeGreaterThan(0);
  const info = pngInfo(bytes);
  expect(info.signature).toBe(true);
  expect({ width: info.width, height: info.height }).toEqual({ width: 1080, height: 1350 });

  expect(page.url()).toBe(before);
});

test('支援 Web Share：叫出分享並帶 image/png 檔，不觸發下載，網址不變', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared?: ShareData };
    Object.defineProperty(Navigator.prototype, 'canShare', {
      value: () => true,
      configurable: true,
    });
    Object.defineProperty(Navigator.prototype, 'share', {
      value: (d: ShareData) => {
        w.__shared = d;
        return Promise.resolve();
      },
      configurable: true,
    });
  });
  await analyse(page);
  const before = page.url();

  let downloaded = false;
  page.on('download', () => {
    downloaded = true;
  });
  await page.getByRole('button', { name: '分享卡片' }).click();

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shared?: ShareData }).__shared?.files?.[0]?.type))
    .toBe('image/png');
  const size = await page.evaluate(
    () => (window as unknown as { __shared?: ShareData }).__shared?.files?.[0]?.size ?? 0,
  );
  expect(size).toBeGreaterThan(0);
  expect(downloaded).toBe(false);
  expect(page.url()).toBe(before);
});

test('使用者取消分享（AbortError）：靜默，不退回下載', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shareCalls?: number };
    Object.defineProperty(Navigator.prototype, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(Navigator.prototype, 'share', {
      value: () => {
        w.__shareCalls = (w.__shareCalls ?? 0) + 1;
        return Promise.reject(new DOMException('cancelled', 'AbortError'));
      },
      configurable: true,
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await analyse(page);

  let downloaded = false;
  page.on('download', () => {
    downloaded = true;
  });
  await page.getByRole('button', { name: '分享卡片' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shareCalls?: number }).__shareCalls ?? 0))
    .toBe(1);
  // 給退回下載的機會發生（若有 bug）。
  await page.waitForTimeout(500);
  expect(downloaded).toBe(false);
  expect(errors).toEqual([]);
});
