// SPEC-v4 #17（既有兩模式主流程）＋ #20（390px 整頁不可橫向捲動）。
// 在真瀏覽器跑：jsdom 不套 stylesheet，版面／溢位／顯示隱藏只有這裡驗得到。
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** 整頁是否可橫向捲動——SPEC-v4 #20 的判準原文：`scrollWidth <= clientWidth`。 */
async function expectNoHorizontalScroll(page: Page, label: string): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  console.log(`[overflow] ${label}: scrollWidth=${scrollWidth} clientWidth=${clientWidth}`);
  expect(scrollWidth, `${label} 整頁可橫向捲動`).toBeLessThanOrEqual(clientWidth);
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('取名模式：姓＋預產期 → 筆畫組合 → 候選字 → 收藏 → 帶入分析', async ({ page }) => {
  const naming = page.locator('#mode-naming');
  await expect(naming).toBeVisible();
  await expect(page.locator('#mode-analysis')).toBeHidden();

  await expect(
    naming.locator('.field__hint--privacy').getByText('資料只在你的裝置計算，不上傳'),
  ).toBeVisible();

  await page.fill('#naming-surname', '王');
  await page.fill('#naming-year', '2026');
  await page.fill('#naming-month', '6');
  await page.fill('#naming-day', '15');
  await page.getByRole('button', { name: '列出吉筆畫組合' }).click();

  const result = page.locator('#naming-result');
  await expect(result.getByRole('heading', { name: /王 姓.*的吉筆畫組合/ })).toBeVisible();
  await expect(result.getByText('生肖喜忌（依預產期）')).toBeVisible();

  const combos = result.locator('details.combo');
  expect(await combos.count()).toBeGreaterThan(0);
  const combo = combos.first();
  await combo.locator('summary').click();
  await expect(combo).toHaveAttribute('open', '');

  // 展開後才渲染候選字：兩個位置（雙名）各有可點的字。
  const positions = combo.locator('.cand-pos');
  await expect(positions).toHaveCount(2);
  for (let pos = 0; pos < 2; pos++) {
    const chip = positions.nth(pos).locator('> .chips [data-action="pick-char"]').first();
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(chip).toHaveClass(/chip--on/);
  }

  const slots = combo.locator('.compose__slot');
  const givenName = (await slots.allTextContents()).join('');
  expect(givenName).not.toContain('？');
  expect([...givenName]).toHaveLength(2);

  const save = combo.getByRole('button', { name: '收藏這個名字' });
  await expect(save).toBeEnabled();
  await save.click();

  const favorites = page.locator('#favorites-card');
  await expect(favorites).toBeVisible();
  await expect(favorites.locator('.favorite__name')).toHaveText([`王${givenName}`]);

  await expectNoHorizontalScroll(page, `${test.info().project.name} 取名結果（候選字展開）`);

  await favorites.getByRole('button', { name: '帶入完整分析' }).click();
  await expect(page.locator('#mode-analysis')).toBeVisible();
  await expect(naming).toBeHidden();
  await expect(page.locator('#surname')).toHaveValue('王');
  await expect(page.locator('#givenName')).toHaveValue(givenName);
  await expect(page.locator('#year')).toBeFocused();
});

test('分析模式：姓名＋生日＋時辰＋縣市 → 五格、四柱、用神、匹配', async ({ page }) => {
  await page.getByRole('button', { name: /分析名字/ }).click();
  await expect(page.locator('#mode-analysis')).toBeVisible();

  await expect(
    page
      .locator('#mode-analysis .field__hint--privacy')
      .getByText('資料只在你的裝置計算，不上傳'),
  ).toBeVisible();

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
  const section = (title: string) =>
    result.locator('section.card').filter({
      // 標題第一個 span 精確比對——副標（例如「逐字五行 × 用神」）不能讓別的 section 誤中。
      has: page.locator('.section__title > span:first-child').getByText(title, { exact: true }),
    });

  // 五格：五個格各一列。
  const grids = section('三才五格').locator('.grid-item');
  await expect(grids).toHaveCount(5);
  await expect(grids.locator('.grid-item__name')).toHaveText(['天格', '人格', '地格', '外格', '總格']);

  // 四柱：docs/v2-sources.md 的驗收命例 戊寅 戊午 戊子（時柱依校正後時間）。
  const pillars = section('八字命盤').locator('.pillar__ganzhi');
  await expect(pillars).toHaveCount(4);
  await expect(pillars.nth(0)).toHaveText('戊寅');
  await expect(pillars.nth(1)).toHaveText('戊午');
  await expect(pillars.nth(2)).toHaveText('戊子');

  // 用神：喜用／忌神兩列都有五行標籤。
  const yong = section('用神');
  await expect(yong).toBeVisible();
  await expect(yong.locator('.dist-row', { hasText: '喜用' }).locator('.tag').first()).toBeVisible();
  await expect(yong.locator('.dist-row', { hasText: '忌神' }).locator('.tag').first()).toBeVisible();

  // 姓名匹配：名字三個字逐字判定。
  const match = section('姓名匹配').locator('.char-item');
  await expect(match).toHaveCount(3);
  await expect(match.locator('.tag').first()).toHaveText(/補用神|傷用神|中性|五行不明/);

  await expectNoHorizontalScroll(page, `${test.info().project.name} 分析結果`);
});

test('首頁未送出前也不可橫向捲動', async ({ page }) => {
  await expectNoHorizontalScroll(page, `${test.info().project.name} 首頁`);
});

test('頁尾免責與隱私聲明可見（SPEC-v4 #14）', async ({ page }) => {
  const footer = page.locator('.page__footer');
  await expect(footer).toBeVisible();
  await expect(footer.getByText('不會把姓名、生日等輸入送到任何伺服器')).toBeVisible();
  await expect(footer.getByText('收藏名單只存在這台瀏覽器裡')).toBeVisible();
  await expect(footer.getByText('命理結果僅供參考')).toBeVisible();
});
