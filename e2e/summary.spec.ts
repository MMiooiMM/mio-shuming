// SPEC-v4 #8：分析結果頂端的摘要區，標籤與下方各分項判定一致。
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

async function analyse(page: Page, opts: { withTime: boolean }): Promise<Locator> {
  await page.goto('./');
  await page.getByRole('button', { name: /分析名字/ }).click();
  await page.fill('#surname', '王');
  await page.fill('#givenName', '小明');
  await page.fill('#year', '1998');
  await page.fill('#month', '6');
  await page.fill('#day', '10');
  if (opts.withTime) {
    await page.fill('#hour', '10');
    await page.fill('#minute', '0');
    await page.selectOption('#county', '臺北市');
  }
  await page.getByRole('button', { name: '開始分析' }).click();
  return page.locator('#result');
}

/** `title` 為字串時精確比對；生肖字根的標題後面接地支生肖（「生肖字根　午馬」），用 RegExp 比前綴。 */
const sectionOf = (page: Page, result: Locator, title: string | RegExp) =>
  result.locator('section.card').filter({
    has:
      typeof title === 'string'
        ? page.locator('.section__title > span:first-child').getByText(title, { exact: true })
        : page.locator('.section__title > span:first-child').filter({ hasText: title }),
  });

const tagOf = (summary: Locator, group: string, label: string) =>
  summary.locator(`.summary-tag[data-group="${group}"][data-label="${label}"] .summary-tag__verdict`);

test('摘要在結果最頂端，三個標籤與下方分項判定一致', async ({ page }) => {
  const result = await analyse(page, { withTime: true });
  const summary = result.locator('section.summary');
  await expect(summary).toBeVisible();
  // 在排盤區（時間校正）之前：結果區第一個 section 就是摘要。
  await expect(result.locator('section.card').first()).toHaveClass(/\bsummary\b/);

  // 1) 三才：摘要 == 三才配置標題的吉凶標籤。
  const sancai = (await sectionOf(page, result, '三才配置').locator('.section__title .tag').innerText()).trim();
  await expect(tagOf(summary, '三才', '三才')).toHaveText(sancai);

  // 2) 人格：摘要「數值 吉凶」 == 五格列的數值與吉凶。
  const renge = result.locator('.grid-item').filter({ has: page.getByText('人格', { exact: true }) });
  const value = (await renge.locator('.grid-item__value b').innerText()).trim();
  const luck = (await renge.locator('.tag').innerText()).split('・')[0]!.trim();
  await expect(tagOf(summary, '五格', '人格')).toHaveText(`${value} ${luck}`);

  // 3) 生肖字根「明」 == 生肖字根區該字的喜忌標籤。
  const zodiacChar = sectionOf(page, result, /^生肖字根/).locator('.char-item').filter({
    has: page.locator('.char-item__char').getByText('明', { exact: true }),
  });
  await expect(tagOf(summary, '生肖', '明')).toHaveText((await zodiacChar.locator('.tag').innerText()).trim());

  // 4) 八字匹配「小」 == 姓名匹配區該字的判定（區內標籤另附五行，取「・」前）。
  const matchChar = sectionOf(page, result, '姓名匹配').locator('.char-item').filter({
    has: page.locator('.char-item__char').getByText('小', { exact: true }),
  });
  const matchVerdict = (await matchChar.locator('.tag').innerText()).split('・')[0]!.trim();
  await expect(tagOf(summary, '八字', '小')).toHaveText(matchVerdict);

  // 不計數、不加總（SPEC-v4 #2）。
  await expect(summary).not.toContainText(/\d+\s*[項個]\s*[吉凶]/);
});

test('未填時辰：摘要沒有八字標籤', async ({ page }) => {
  const result = await analyse(page, { withTime: false });
  const summary = result.locator('section.summary');
  await expect(summary).toBeVisible();
  await expect(summary.locator('.summary-tag[data-group="五格"]')).toHaveCount(5);
  await expect(summary.locator('.summary-tag[data-group="八字"]')).toHaveCount(0);
});
