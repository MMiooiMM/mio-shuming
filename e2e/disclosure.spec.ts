// SPEC-v4 #48–#52：摺疊元件的類別規則。頁面上每一個 details > summary 都要有看得見的
// chevron，收合時不轉、展開後轉到 180°；同一變體的 chevron 與 summary 計算樣式在
// 兩個模式、收合與展開狀態下完全相同。規則掃的是「所有可見的 details」，不列舉 class——
// 新長出來的摺疊元件沒套上元件會歸為 unknown 而紅。
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface SummaryStyle {
  variant: string;
  open: boolean;
  /** 收合：'closed'；展開完成：'rotated'；其他（動畫中或沒轉）：原始 transform。 */
  rotation: string;
  chevron: {
    content: string;
    display: string;
    visibility: string;
    opacity: string;
    width: string;
    height: string;
    backgroundColor: string;
  };
  summary: {
    opacity: string;
    visibility: string;
    paddingTop: string;
    paddingRight: string;
    paddingBottom: string;
    paddingLeft: string;
    minHeight: string;
  };
}

function readSummaries(page: Page): Promise<SummaryStyle[]> {
  return page.evaluate(() => {
    const rotation = (t: string): string => {
      if (t === 'none') return 'closed';
      const m = /matrix\(([^)]+)\)/.exec(t);
      if (!m) return t;
      const [a, , , d] = m[1]!.split(',').map(Number);
      if (Math.abs(a! - 1) < 0.01 && Math.abs(d! - 1) < 0.01) return 'closed';
      if (Math.abs(a! + 1) < 0.01 && Math.abs(d! + 1) < 0.01) return 'rotated';
      return t;
    };
    return [...document.querySelectorAll<HTMLDetailsElement>('details')]
      .filter((d) => d.checkVisibility())
      .map((d) => {
        const summary = d.querySelector(':scope > summary')!;
        const after = getComputedStyle(summary, '::after');
        const own = getComputedStyle(summary);
        return {
          variant: d.matches('.combo, .sources-toggle')
            ? 'row'
            : d.matches('.cand-avoid')
              ? 'secondary'
              : `unknown:${d.className}`,
          open: d.open,
          rotation: rotation(after.transform),
          chevron: {
            content: after.content,
            display: after.display,
            visibility: after.visibility,
            opacity: after.opacity,
            width: after.width,
            height: after.height,
            backgroundColor: after.backgroundColor,
          },
          summary: {
            opacity: own.opacity,
            visibility: own.visibility,
            paddingTop: own.paddingTop,
            paddingRight: own.paddingRight,
            paddingBottom: own.paddingBottom,
            paddingLeft: own.paddingLeft,
            minHeight: own.minHeight,
          },
        };
      });
  });
}

const EXPECTED_SIZE: Record<string, string> = { row: '16px', secondary: '12px' };

/** 同變體基準：跨模式、跨收合／展開狀態沿用同一份，不是只在單次讀取內自己比自己。 */
type Baseline = Map<string, Omit<SummaryStyle, 'variant' | 'open' | 'rotation'>>;

function expectChevrons(styles: SummaryStyle[], baseline: Baseline, label: string): void {
  expect(styles.length, `${label}：沒有任何可見的 details`).toBeGreaterThan(0);
  for (const [i, s] of styles.entries()) {
    const where = `${label} 第 ${i + 1} 個 details（${s.variant}${s.open ? '，展開' : ''}）`;
    expect(s.variant, `${where} 沒有套用摺疊元件`).not.toMatch(/^unknown/);
    expect(s.chevron.content, `${where} 沒有 chevron`).not.toBe('none');
    expect(s.chevron.display, `${where} chevron 被隱藏`).not.toBe('none');
    expect(s.chevron.visibility, `${where} chevron 不可見`).toBe('visible');
    expect(parseFloat(s.chevron.opacity), `${where} chevron 透明`).toBeGreaterThan(0);
    expect(parseFloat(s.summary.opacity), `${where} summary 透明`).toBeGreaterThan(0);
    expect(s.chevron.backgroundColor, `${where} chevron 沒有顏色`).not.toMatch(/rgba\(.*,\s*0\)$|transparent/);
    expect(s.chevron.width, `${where} chevron 寬`).toBe(EXPECTED_SIZE[s.variant]);
    expect(s.chevron.height, `${where} chevron 高`).toBe(EXPECTED_SIZE[s.variant]);
    if (s.variant === 'row') {
      expect(parseFloat(s.summary.minHeight), `${where} 最低高度`).toBeGreaterThanOrEqual(48);
    }
    expect(s.rotation, `${where} chevron ${s.open ? '展開後沒轉到 180°' : '收合時不該旋轉'}`).toBe(
      s.open ? 'rotated' : 'closed',
    );
    const { variant, open: _o, rotation: _r, ...rest } = s;
    const base = baseline.get(variant);
    if (base) expect(rest, `${where} 與同變體基準樣式不一致`).toEqual(base);
    else baseline.set(variant, rest);
  }
}

/** 等所有可見 details 的 chevron 都轉到位（150ms 動畫收斂），再逐一檢查。 */
async function settle(page: Page): Promise<SummaryStyle[]> {
  await expect
    .poll(async () => (await readSummaries(page)).every((s) => s.rotation === (s.open ? 'rotated' : 'closed')), {
      timeout: 5000,
    })
    .toBe(true)
    .catch(() => undefined); // 沒收斂就交給 expectChevrons 報出是哪一個
  return readSummaries(page);
}

/** 逐一展開所有可見、尚未展開的 details（含展開後才出現的巢狀 details），直到沒有新的。 */
async function openAll(page: Page, scope: string): Promise<void> {
  for (let round = 0; round < 5; round++) {
    const closed = page.locator(`${scope} details:not([open])`).filter({ visible: true });
    const count = await closed.count();
    if (count === 0) return;
    for (let i = count - 1; i >= 0; i--) {
      const d = closed.nth(i);
      await d.locator(':scope > summary').click();
    }
  }
}

test('兩個模式所有摺疊元件：chevron 可見、收合不轉、展開轉 180°、同變體樣式一致', async ({ page }) => {
  test.setTimeout(120_000);
  const baseline: Baseline = new Map();

  await page.goto('./');
  await page.fill('#naming-surname', '王');
  await page.fill('#naming-year', '2026');
  await page.fill('#naming-month', '6');
  await page.fill('#naming-day', '15');
  await page.getByRole('button', { name: '列出吉筆畫組合' }).click();
  const naming = page.locator('#naming-result');
  await expect(naming.locator('details.combo').first()).toBeVisible();

  expectChevrons(await settle(page), baseline, '取名結果（全部收合）');
  // 展開所有筆畫組後，每組的生肖忌字才出現；先檢查它們收合狀態，再全部展開。
  for (const combo of await naming.locator('details.combo').all()) {
    await combo.locator(':scope > summary').click();
  }
  await expect(naming.locator('details.cand-avoid').first()).toBeVisible();
  expectChevrons(await settle(page), baseline, '取名結果（筆畫組展開、忌字收合）');
  await openAll(page, '#naming-result');
  expect(await naming.locator('details:not([open])').filter({ visible: true }).count()).toBe(0);
  expectChevrons(await settle(page), baseline, '取名結果（全部展開）');
  expect([...baseline.keys()].sort(), '取名結果應同時出現兩種變體').toEqual(['row', 'secondary']);

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

  expectChevrons(await settle(page), baseline, '分析結果（收合）');
  await openAll(page, '#result');
  expectChevrons(await settle(page), baseline, '分析結果（全部展開）');
});

test('資料來源卡整張可點：點卡片邊緣也會展開', async ({ page }) => {
  await page.goto('./');
  await page.fill('#naming-surname', '王');
  await page.fill('#naming-year', '2026');
  await page.fill('#naming-month', '6');
  await page.fill('#naming-day', '15');
  await page.getByRole('button', { name: '列出吉筆畫組合' }).click();
  const card = page.locator('#naming-result #sources');
  const details = card.locator('details');
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  // 卡片左上角內側 3px、右緣內側 3px：兩處都必須落在 summary 上。
  for (const [x, y] of [
    [3, 3],
    [box.width - 3, box.height / 2],
  ] as const) {
    await card.click({ position: { x, y } });
    await expect(details, `點資料來源卡 (${x}, ${y}) 沒有展開`).toHaveAttribute('open', '');
    await details.locator(':scope > summary').click();
    await expect(details).not.toHaveAttribute('open', '');
  }
});
