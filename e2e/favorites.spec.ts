// SPEC-v4 #11：收藏資料加存預產期，舊的 v1 資料（沒有 due）仍可讀取、顯示正常。
import { expect, test } from '@playwright/test';

const OLD_FORMAT_KEY = 'mio-shuming:favorites:v1';

test('舊格式（無 due）收藏載入頁面後照常顯示', async ({ page }) => {
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    {
      key: OLD_FORMAT_KEY,
      value: JSON.stringify([{ surname: '王', givenName: '小明' }]),
    },
  );
  await page.goto('./');

  const favorites = page.locator('#favorites-card');
  await expect(favorites).toBeVisible();
  await expect(favorites.locator('.favorite__name')).toHaveText(['王小明']);
  // 讀回的資料仍是舊格式，沒有被硬塞出壞掉的 due。
  const stored = await page.evaluate((key) => localStorage.getItem(key), OLD_FORMAT_KEY);
  expect(JSON.parse(stored!)).toEqual([{ surname: '王', givenName: '小明' }]);
});

test('新收藏會存入當下預產期；同名不同預產期更新而非疊加', async ({ page }) => {
  await page.goto('./');
  const naming = page.locator('#mode-naming');
  await page.fill('#naming-surname', '王');
  await page.fill('#naming-year', '2026');
  await page.fill('#naming-month', '6');
  await page.fill('#naming-day', '15');
  await page.getByRole('button', { name: '列出吉筆畫組合' }).click();

  const result = page.locator('#naming-result');
  const combo = result.locator('details.combo').first();
  await combo.locator('summary').click();
  const positions = combo.locator('.cand-pos');
  for (let pos = 0; pos < (await positions.count()); pos++) {
    const chip = positions.nth(pos).locator('> .chips [data-action="pick-char"]').first();
    await chip.click();
  }
  await combo.getByRole('button', { name: '收藏這個名字' }).click();

  let stored = JSON.parse(
    (await page.evaluate((key) => localStorage.getItem(key), OLD_FORMAT_KEY))!,
  );
  expect(stored).toHaveLength(1);
  expect(stored[0].due).toEqual({ year: 2026, month: 6, day: 15 });
  const givenName: string = stored[0].givenName;
  const chars = [...givenName];

  // 換一個預產期，重新列組合、選「同一個名字」的字、再收藏一次——同名不同預產期要更新，不疊加。
  await page.fill('#naming-surname', '王');
  await page.fill('#naming-year', '2026');
  await page.fill('#naming-month', '9');
  await page.fill('#naming-day', '1');
  await page.getByRole('button', { name: '列出吉筆畫組合' }).click();
  const combo2 = result.locator('details.combo').first();
  await combo2.locator('summary').click();
  const positions2 = combo2.locator('.cand-pos');
  for (let pos = 0; pos < chars.length; pos++) {
    const chip = positions2
      .nth(pos)
      .locator('> .chips [data-action="pick-char"]')
      .filter({ hasText: chars[pos]! });
    await chip.first().click();
  }
  await combo2.getByRole('button', { name: '收藏這個名字' }).click();

  stored = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), OLD_FORMAT_KEY))!);
  expect(stored).toHaveLength(1);
  expect(stored[0].due).toEqual({ year: 2026, month: 9, day: 1 });
  void naming;
});
