// SPEC-v4 #22–#26：按鈕三級、語意色歸位、候選字 chip。
// 顏色只能在真瀏覽器用 getComputedStyle 驗——jsdom 不套 stylesheet。
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** style.css `:root` 淺色值換成 getComputedStyle 會回的字串。 */
const LIGHT = {
  surface: 'rgb(255, 255, 255)',
  ink: 'rgb(31, 28, 25)',
  inkSoft: 'rgb(92, 85, 77)',
  line: 'rgb(226, 221, 212)',
  accent: 'rgb(140, 47, 31)',
  accentSoft: 'rgb(243, 230, 226)',
  neutral: 'rgb(107, 100, 90)',
  neutralSoft: 'rgb(238, 235, 230)',
  /** 名詞說明框中性底（SPEC-v4 #34）。 */
  noteBg: 'rgb(243, 241, 236)',
  /** 模式分頁外框底（SPEC-v4 #32）。 */
  track: 'rgb(236, 232, 226)',
  white: 'rgb(255, 255, 255)',
  transparent: 'rgba(0, 0, 0, 0)',
} as const;

/** 任何選中態都不得借用的語意色淡底（SPEC-v4 #33），淺色值。 */
const SOFT_BGS = ['rgb(243, 230, 226)', 'rgb(230, 240, 232)', 'rgb(246, 239, 220)', 'rgb(247, 228, 228)'];

async function analysisResult(page: Page): Promise<Locator> {
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

async function compareView(page: Page): Promise<Locator> {
  await page.addInitScript(
    (value) => localStorage.setItem('mio-shuming:favorites:v1', value),
    JSON.stringify(FAVORITES),
  );
  await page.goto('./');
  const card = page.locator('#favorites-card');
  for (const f of FAVORITES) await card.getByRole('checkbox', { name: `比較 王${f.givenName}` }).check();
  await card.getByRole('button', { name: '比較勾選的名字' }).click();
  const view = page.locator('#compare-card');
  await expect(view).toBeVisible();
  return view;
}

/** 展開第一個名詞說明，回傳對應的 .term-text。 */
async function expandFirstTerm(page: Page, scope: Locator): Promise<Locator> {
  const toggle = scope.locator('[data-action="toggle-term"]').first();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const panel = page.locator(`#${await toggle.getAttribute('aria-controls')}`);
  await expect(panel).toBeVisible();
  return panel;
}

/** --good／--good-soft 的淺色與深色值：按鈕不得出現綠色系。 */
const GREENS = ['rgb(47, 107, 63)', 'rgb(230, 240, 232)', 'rgb(143, 206, 159)', 'rgb(34, 48, 31)'];

const FAVORITES = [
  { surname: '王', givenName: '小明', due: { year: 2026, month: 6, day: 15 } },
  { surname: '王', givenName: '美玲' },
  { surname: '王', givenName: '明', due: { year: 2027, month: 6, day: 1 } },
];

type Style = Record<'backgroundColor' | 'color' | 'borderTopColor' | 'borderTopWidth' | 'height' | 'paddingLeft' | 'paddingRight' | 'borderTopLeftRadius' | 'textDecorationLine' | 'accentColor', string>;

const styleOf = (loc: Locator): Promise<Style> =>
  loc.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      backgroundColor: s.backgroundColor,
      color: s.color,
      borderTopColor: s.borderTopColor,
      borderTopWidth: s.borderTopWidth,
      height: s.height,
      paddingLeft: s.paddingLeft,
      paddingRight: s.paddingRight,
      borderTopLeftRadius: s.borderTopLeftRadius,
      textDecorationLine: s.textDecorationLine,
      accentColor: s.accentColor,
    };
  });

/** 套在元素上、最後一條宣告 border-top-width 的樣式規則的值（依樣式表順序）。 */
const declaredBorderWidth = (loc: Locator): Promise<string> =>
  loc.evaluate((el) => {
    let width = '';
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules)) {
        if (!(rule instanceof CSSStyleRule) || !el.matches(rule.selectorText)) continue;
        // 簡寫裡含 var()（例如 `border: 1.5px solid var(--accent)`）時，CSSOM 的長寫屬性是空字串，
        // 只能從 cssText 的簡寫取寬度。
        const shorthand = /(?:^|;\s*)border(?:-top)?(?:-width)?:\s*([\d.]+px)/.exec(rule.style.cssText)?.[1];
        const w = rule.style.borderTopWidth || shorthand;
        if (w) width = w;
      }
    }
    return width;
  });

function expectSmallButton(s: Style, label: string): void {
  expect(s.height, `${label} 高`).toBe('36px');
  expect(s.paddingLeft, `${label} 左 padding`).toBe('14px');
  expect(s.paddingRight, `${label} 右 padding`).toBe('14px');
  expect(s.borderTopLeftRadius, `${label} 圓角`).toBe('8px');
}

async function namingResult(page: Page): Promise<Locator> {
  await page.fill('#naming-surname', '王');
  await page.fill('#naming-year', '2026');
  await page.fill('#naming-month', '6');
  await page.fill('#naming-day', '15');
  await page.getByRole('button', { name: '列出吉筆畫組合' }).click();
  const combo = page.locator('#naming-result details.combo').first();
  await combo.locator('summary').click();
  await expect(combo).toHaveAttribute('open', '');
  return combo;
}

function contrast(fg: string, bg: string): number {
  const lum = (rgb: string) => {
    const [r, g, b] = rgb.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return (hi! + 0.05) / (lo! + 0.05);
}

test.describe('淺色模式', () => {
  test.use({ colorScheme: 'light' });

  test('取名：中性 chip 白底、選中實心、天格「不計」灰、radio accent-color', async ({ page }) => {
    await page.goto('./');

    for (const radio of await page.locator('input[name="givenLength"]').all()) {
      expect((await styleOf(radio)).accentColor).toBe(LIGHT.accent);
    }

    const combo = await namingResult(page);

    // 中性字 chip（title 形如「6 畫・火・中性」）：白底、1px --line 框、--ink 字。
    const neutralChip = combo.locator('[data-action="pick-char"][title*="・中性"]').first();
    await expect(neutralChip).toBeVisible();
    const chip = await styleOf(neutralChip);
    expect(chip.backgroundColor).toBe(LIGHT.surface);
    expect(chip.borderTopColor).toBe(LIGHT.line);
    expect(chip.borderTopWidth).toBe('1px');
    expect(chip.color).toBe(LIGHT.ink);

    await neutralChip.click();
    await expect(neutralChip).toHaveClass(/chip--on/);
    expect((await styleOf(neutralChip)).backgroundColor).toBe(LIGHT.accent);

    const tianTag = combo.locator('.grid-item', { has: page.locator('.grid-item__name', { hasText: '天格' }) }).locator('.tag');
    await expect(tianTag).toContainText('不計');
    const tian = await styleOf(tianTag);
    expect(tian.backgroundColor).toBe(LIGHT.neutralSoft);
    expect(tian.color).toBe(LIGHT.neutral);

    // 次要：收藏這個名字
    const save = combo.getByRole('button', { name: '收藏這個名字' });
    const saveStyle = await styleOf(save);
    expect(saveStyle.backgroundColor).toBe(LIGHT.surface);
    expect(saveStyle.borderTopColor).toBe(LIGHT.accent);
    expectSmallButton(saveStyle, '收藏這個名字');
  });

  test('收藏與比較：移除為文字鈕、帶入為次要、比較為主要、不計與生肖未知為灰', async ({ page }) => {
    await page.addInitScript(
      (value) => localStorage.setItem('mio-shuming:favorites:v1', value),
      JSON.stringify(FAVORITES),
    );
    await page.goto('./');
    const card = page.locator('#favorites-card');
    await expect(card).toBeVisible();

    const remove = await styleOf(card.getByRole('button', { name: '移除' }).first());
    expect(remove.backgroundColor).toBe(LIGHT.transparent);
    expect(remove.color).toBe(LIGHT.inkSoft);
    expectSmallButton(remove, '移除');
    await card.getByRole('button', { name: '移除' }).first().hover();
    expect((await styleOf(card.getByRole('button', { name: '移除' }).first())).textDecorationLine).toBe('underline');

    const analyse = await styleOf(card.getByRole('button', { name: '帶入完整分析' }).first());
    expect(analyse.backgroundColor).toBe(LIGHT.surface);
    expect(analyse.borderTopColor).toBe(LIGHT.accent);
    // Chromium 的 getComputedStyle 把框線寬度取整（DPR 1／2／3 實測 1.5px 都回 1px），
    // 所以寬度改讀樣式表上宣告的值；顏色與可見框線仍以 computed 驗。
    expect(await declaredBorderWidth(card.getByRole('button', { name: '帶入完整分析' }).first())).toBe('1.5px');
    expect(Number.parseFloat(analyse.borderTopWidth)).toBeGreaterThanOrEqual(1);
    expect(analyse.color).toBe(LIGHT.accent);
    expectSmallButton(analyse, '帶入完整分析');

    const checkbox = card.getByRole('checkbox').first();
    expect((await styleOf(checkbox)).accentColor).toBe(LIGHT.accent);

    for (const f of FAVORITES) await card.getByRole('checkbox', { name: `比較 王${f.givenName}` }).check();
    const compareBtn = card.getByRole('button', { name: '比較勾選的名字' });
    const compareStyle = await styleOf(compareBtn);
    expect(compareStyle.backgroundColor).toBe(LIGHT.accent);
    expectSmallButton(compareStyle, '比較勾選的名字');
    await compareBtn.click();

    const view = page.locator('#compare-card');
    await expect(view).toBeVisible();
    const row = (name: RegExp) => view.locator('tbody tr', { has: page.locator('th', { hasText: name }) });

    // 黃色只留給半吉：王小明三才「半吉」仍是 --mid-soft，不被灰色吃掉。
    const halfLuck = row(/^三才$/).locator('td').nth(0).locator('.tag');
    await expect(halfLuck).toHaveText('半吉');
    expect((await styleOf(halfLuck)).backgroundColor).toBe('rgb(246, 239, 220)');

    const skip = row(/^外格$/).locator('td').nth(2).locator('.tag');
    await expect(skip).toContainText('不計');
    expect((await styleOf(skip)).backgroundColor).toBe(LIGHT.neutralSoft);

    const unknown = row(/^生肖$/).locator('td').nth(1).locator('.tag');
    await expect(unknown).toHaveText('生肖未知');
    const unknownStyle = await styleOf(unknown);
    expect(unknownStyle.backgroundColor).toBe(LIGHT.neutralSoft);
    expect(unknownStyle.color).toBe(LIGHT.neutral);

    const out = await styleOf(view.getByRole('button', { name: '輸出比較卡片' }));
    expect(out.backgroundColor).toBe(LIGHT.surface);
    expect(out.borderTopColor).toBe(LIGHT.accent);
  });

  test('分析結果：沒有綠色按鈕、用神覆寫選中為實心 accent、分享卡片為次要、用神摘要標籤為灰', async ({ page }) => {
    await page.goto('./');
    const result = await analysisResult(page);

    const buttons = await result.locator('button').all();
    expect(buttons.length).toBeGreaterThan(5);
    for (const b of buttons) {
      const s = await styleOf(b);
      const name = (await b.textContent())?.trim();
      expect(GREENS, `按鈕「${name}」背景`).not.toContain(s.backgroundColor);
      expect(GREENS, `按鈕「${name}」邊框`).not.toContain(s.borderTopColor);
    }

    const on = result.locator('[data-action="toggle-favor"].button--on').first();
    await expect(on).toBeVisible();
    // SPEC-v4 #33：選中態一律實心 --accent 配白字，不借任何語意色淡底。
    const onStyle = await styleOf(on);
    expect(onStyle.backgroundColor, '用神覆寫選中底').toBe(LIGHT.accent);
    expect(onStyle.color, '用神覆寫選中字').toBe(LIGHT.white);
    expect(onStyle.borderTopColor, '用神覆寫選中框').toBe(LIGHT.accent);

    // SPEC-v4 #35：分享卡片為次要。
    const share = await styleOf(result.getByRole('button', { name: '分享卡片' }));
    expect(share.backgroundColor).toBe(LIGHT.surface);
    expect(share.borderTopColor).toBe(LIGHT.accent);
    expect(share.color).toBe(LIGHT.accent);
    expectSmallButton(share, '分享卡片');

    const yong = result.locator('.summary-tag[data-group="八字"][data-label="用神"] .tag');
    expect((await styleOf(yong)).backgroundColor).toBe(LIGHT.neutralSoft);
  });

  test('#38 同類一致：分享卡片與輸出比較卡片三色完全相等', async ({ page, context }) => {
    await page.goto('./');
    // 框線四邊都比，避免只有單側不同時漏抓。
    const pick = (loc: Locator) =>
      loc.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          backgroundColor: s.backgroundColor,
          color: s.color,
          borderColor: [s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor],
        };
      });

    const result = await analysisResult(page);
    const share = await pick(result.getByRole('button', { name: '分享卡片' }));

    const page2 = await context.newPage();
    const view = await compareView(page2);
    const out = await pick(view.getByRole('button', { name: '輸出比較卡片' }));

    console.log(`[#38] 分享卡片 ${JSON.stringify(share)} / 輸出比較卡片 ${JSON.stringify(out)}`);
    expect(share).toEqual(out);
  });

  test('#32 模式分頁 segmented control：外框底、選中 surface＋accent、未選透明', async ({ page }) => {
    await page.goto('./');
    const modes = page.locator('nav.modes');
    const track = await styleOf(modes);
    console.log(`[#32] track ${track.backgroundColor}`);
    expect(track.backgroundColor, '分頁外框底').toBe(LIGHT.track);

    for (const mode of ['naming', 'analysis'] as const) {
      await page.locator(`.mode-tab[data-mode="${mode}"]`).click();
      const on = page.locator('.mode-tab[aria-pressed="true"]');
      const off = page.locator('.mode-tab[aria-pressed="false"]');
      await expect(on).toHaveAttribute('data-mode', mode);
      const onStyle = await styleOf(on);
      const offStyle = await styleOf(off);
      console.log(`[#32] ${mode} on ${onStyle.backgroundColor}/${onStyle.color} off ${offStyle.backgroundColor}/${offStyle.color}`);
      expect(onStyle.backgroundColor, '選中分頁底').toBe(LIGHT.surface);
      expect(onStyle.color, '選中分頁字').toBe(LIGHT.accent);
      expect(offStyle.backgroundColor, '未選分頁底').toBe(LIGHT.transparent);
      expect(offStyle.color, '未選分頁字').toBe(LIGHT.inkSoft);
    }
  });

  test('#34 名詞說明框中性底、左側 accent 線；#33 展開中的說明鈕不借淡底', async ({ page }) => {
    await page.goto('./');
    const result = await analysisResult(page);
    const panel = await expandFirstTerm(page, result);
    const box = await styleOf(panel);
    const left = await panel.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: s.borderLeftWidth, color: s.borderLeftColor };
    });
    console.log(`[#34] term-text bg ${box.backgroundColor} left ${left.width} ${left.color}`);
    expect(box.backgroundColor, '說明框底').toBe(LIGHT.noteBg);
    expect(left).toEqual({ width: '3px', color: LIGHT.accent });

    const expanded = await styleOf(result.locator('[data-action="toggle-term"][aria-expanded="true"]').first());
    expect(SOFT_BGS, '展開中的說明鈕底').not.toContain(expanded.backgroundColor);
    expect(expanded.backgroundColor).toBe(LIGHT.accent);
  });
});

/** style.css 深色 `:root` 的 --accent／--surface。 */
const DARK = {
  accent: 'rgb(226, 133, 111)',
  surface: 'rgb(33, 30, 27)',
} as const;

test.describe('深色模式', () => {
  test.use({ colorScheme: 'dark' });

  test('灰色標籤與中性 chip 對比 ≥ 4.5', async ({ page }) => {
    await page.goto('./');
    const combo = await namingResult(page);

    const tianTag = combo.locator('.grid-item', { has: page.locator('.grid-item__name', { hasText: '天格' }) }).locator('.tag');
    const tian = await styleOf(tianTag);
    // 深色模式的灰不能沿用淺色值。
    expect(tian.backgroundColor).not.toBe(LIGHT.neutralSoft);
    const tagRatio = contrast(tian.color, tian.backgroundColor);
    console.log(`[contrast] dark tag--neutral ${tian.color} on ${tian.backgroundColor} = ${tagRatio.toFixed(2)}`);
    expect(tagRatio).toBeGreaterThanOrEqual(4.5);

    const chip = await styleOf(combo.locator('[data-action="pick-char"][title*="・中性"]').first());
    const chipRatio = contrast(chip.color, chip.backgroundColor);
    console.log(`[contrast] dark neutral chip ${chip.color} on ${chip.backgroundColor} = ${chipRatio.toFixed(2)}`);
    expect(chipRatio).toBeGreaterThanOrEqual(4.5);
  });

  test('#32 #33 #34 深色：分頁、選中開關、說明框對比 ≥ 4.5', async ({ page }) => {
    await page.goto('./');
    const track = (await styleOf(page.locator('nav.modes'))).backgroundColor;
    expect(track, '深色分頁外框底不能是透明').not.toBe(LIGHT.transparent);
    expect(track, '深色分頁外框底不能沿用淺色值').not.toBe(LIGHT.track);
    const off = await styleOf(page.locator('.mode-tab[aria-pressed="false"]'));
    const on = await styleOf(page.locator('.mode-tab[aria-pressed="true"]'));
    expect(off.backgroundColor).toBe(LIGHT.transparent);
    // 值也要釘住：換成別的高對比配色不能靠對比數字過關。
    expect(on.backgroundColor, '深色選中分頁底').toBe(DARK.surface);
    expect(on.color, '深色選中分頁字').toBe(DARK.accent);
    const offRatio = contrast(off.color, track);
    const onRatio = contrast(on.color, on.backgroundColor);
    console.log(`[contrast] dark tab off ${off.color} on track ${track} = ${offRatio.toFixed(2)}; on ${on.color} on ${on.backgroundColor} = ${onRatio.toFixed(2)}`);
    expect(offRatio).toBeGreaterThanOrEqual(4.5);
    expect(onRatio).toBeGreaterThanOrEqual(4.5);

    const result = await analysisResult(page);
    const toggle = await styleOf(result.locator('[data-action="toggle-favor"].button--on').first());
    expect(toggle.backgroundColor, '深色選中開關底').toBe(DARK.accent);
    expect(toggle.color, '深色選中開關字').toBe(DARK.surface);
    const toggleRatio = contrast(toggle.color, toggle.backgroundColor);
    console.log(`[contrast] dark toggle on ${toggle.color} on ${toggle.backgroundColor} = ${toggleRatio.toFixed(2)}`);
    expect(toggleRatio).toBeGreaterThanOrEqual(4.5);

    const panel = await styleOf(await expandFirstTerm(page, result));
    expect(panel.backgroundColor, '深色說明框底不能沿用淺色值').not.toBe(LIGHT.noteBg);
    const panelRatio = contrast(panel.color, panel.backgroundColor);
    console.log(`[contrast] dark term-text ${panel.color} on ${panel.backgroundColor} = ${panelRatio.toFixed(2)}`);
    expect(panelRatio).toBeGreaterThanOrEqual(4.5);
  });
});
