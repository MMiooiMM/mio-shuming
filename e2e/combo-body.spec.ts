// SPEC-v4 #54–#58：筆畫組展開區降噪。
// 展開區要有歸屬（淡底＋中性左線）、五格去框改分隔線（分析頁不動）、間距達下限、
// 生肖忌字清單的原因每隻生肖只講一次。
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** 把 CSS token 解析成計算後的 rgb 字串，才能跟 getComputedStyle 比。 */
function tokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate((t) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${t})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

async function naming(page: Page, due: { year: string; month: string; day: string }): Promise<Locator> {
  await page.goto('./');
  await page.fill('#naming-surname', '王');
  await page.fill('#naming-year', due.year);
  await page.fill('#naming-month', due.month);
  await page.fill('#naming-day', due.day);
  await page.getByRole('button', { name: '列出吉筆畫組合' }).click();
  const result = page.locator('#naming-result');
  await expect(result.locator('details.combo').first()).toBeVisible();
  return result;
}

/** 依序展開筆畫組，回傳第一個含生肖忌字的組合（展開狀態）。 */
async function openComboWithAvoid(result: Locator): Promise<Locator> {
  const combos = result.locator('details.combo');
  const count = await combos.count();
  for (let i = 0; i < count; i++) {
    const combo = combos.nth(i);
    await combo.locator(':scope > summary').click();
    await expect(combo.locator('.combo__body')).not.toBeEmpty();
    if ((await combo.locator('details.cand-avoid').count()) > 0) return combo;
    await combo.locator(':scope > summary').click();
  }
  throw new Error('找不到含生肖忌字的筆畫組合');
}

test('展開區：淡底、中性左線、內距（#54）', async ({ page }) => {
  const result = await naming(page, { year: '2026', month: '6', day: '15' });
  const combo = await openComboWithAvoid(result);
  const body = combo.locator('.combo__body');
  const s = await body.evaluate((el) => {
    const c = getComputedStyle(el);
    return {
      backgroundColor: c.backgroundColor,
      borderLeftWidth: c.borderLeftWidth,
      borderLeftStyle: c.borderLeftStyle,
      borderLeftColor: c.borderLeftColor,
      padding: [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft],
    };
  });
  expect(s.backgroundColor, '展開區底色').toBe(await tokenColor(page, '--note-bg'));
  expect(s.borderLeftWidth, '左線寬').toBe('2px');
  expect(s.borderLeftStyle, '左線樣式').toBe('solid');
  expect(s.borderLeftColor, '左線顏色（中性灰，不用磚紅）').toBe(await tokenColor(page, '--neutral'));
  expect(s.padding, '內距 上右下左').toEqual(['12px', '12px', '16px', '14px']);
});

test('展開區五格去框改分隔線；分析頁五格卡片仍有框（#55）', async ({ page }) => {
  const result = await naming(page, { year: '2026', month: '6', day: '15' });
  const combo = await openComboWithAvoid(result);
  const line = await tokenColor(page, '--line');
  const items = await combo.locator('.combo__body .grid-item').evaluateAll((els) =>
    els.map((el) => {
      const c = getComputedStyle(el);
      return {
        top: c.borderTopWidth,
        topColor: c.borderTopColor,
        right: c.borderRightWidth,
        bottom: c.borderBottomWidth,
        left: c.borderLeftWidth,
      };
    }),
  );
  expect(items.length).toBe(5);
  for (const [i, it] of items.entries()) {
    const where = `展開區第 ${i + 1} 格`;
    expect([it.right, it.left], `${where} 左右不應有框`).toEqual(['0px', '0px']);
    expect(it.bottom, `${where} 下方不應有框`).toBe('0px');
    if (i === 0) expect(it.top, `${where} 第一列上方不應有線`).toBe('0px');
    else {
      expect(it.top, `${where} 與上一列之間要有 1px 分隔線`).toBe('1px');
      expect(it.topColor, `${where} 分隔線顏色`).toBe(line);
    }
  }

  // 分析頁的五格卡片共用 .grid-item，必須維持 1px 框。
  await page.getByRole('button', { name: /分析名字/ }).click();
  await page.fill('#surname', '王');
  await page.fill('#givenName', '小明');
  await page.fill('#year', '1998');
  await page.fill('#month', '6');
  await page.fill('#day', '10');
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.locator('#result section.summary')).toBeVisible();
  const analysis = await page.locator('#result .grid-item').evaluateAll((els) =>
    els.map((el) => {
      const c = getComputedStyle(el);
      return [c.borderTopWidth, c.borderRightWidth, c.borderBottomWidth, c.borderLeftWidth];
    }),
  );
  expect(analysis.length).toBe(5);
  for (const b of analysis) expect(b, '分析頁五格卡片的框被動到了').toEqual(['1px', '1px', '1px', '1px']);
});

test('展開區間距達下限（#56）', async ({ page }) => {
  const result = await naming(page, { year: '2026', month: '6', day: '15' });
  const combo = await openComboWithAvoid(result);
  const body = combo.locator('.combo__body');
  const m = await body.evaluate((el) => {
    const rect = (sel: string) => el.querySelector(sel)!.getBoundingClientRect();
    const grids = rect(':scope > .grids');
    const notes = rect(':scope > .notes');
    const firstTitle = rect(':scope > .cand-pos .section__title');
    return {
      gridsToNotes: Math.round(notes.top - grids.bottom),
      notesToTitle: Math.round(firstTitle.top - notes.bottom),
      paddingBottom: parseFloat(getComputedStyle(el).paddingBottom),
    };
  });
  console.log(`[spacing] ${JSON.stringify(m)}`);
  expect(m.gridsToNotes, '五格列 → 三才關係說明').toBeGreaterThanOrEqual(12);
  expect(m.notesToTitle, '三才關係說明 → 候選字標題').toBeGreaterThanOrEqual(16);
  expect(m.paddingBottom, '展開區底部內距').toBeGreaterThanOrEqual(16);
});

test('展開區內「目前搭配」的分隔線看得見（#54 加淡底後的回歸）', async ({ page }) => {
  const result = await naming(page, { year: '2026', month: '6', day: '15' });
  const combo = await openComboWithAvoid(result);
  const m = await combo.evaluate((d) => {
    const lum = (rgb: string) => {
      const [r, g, b] = rgb
        .match(/\d+(\.\d+)?/g)!
        .slice(0, 3)
        .map(Number)
        .map((v) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const compose = getComputedStyle(d.querySelector('.combo__body .compose')!);
    const body = getComputedStyle(d.querySelector('.combo__body')!);
    const [hi, lo] = [lum(compose.borderTopColor), lum(body.backgroundColor)].sort((a, b) => b - a);
    return {
      width: compose.borderTopWidth,
      style: compose.borderTopStyle,
      contrast: (hi! + 0.05) / (lo! + 0.05),
    };
  });
  console.log(`[compose-divider] ${JSON.stringify(m)}`);
  expect(m.width).toBe('1px');
  expect(m.style).not.toBe('none');
  // WCAG 1.4.11：區隔操作區的非文字元素對比 ≥ 3:1。
  expect(m.contrast, '「目前搭配」分隔線與展開區底色對比不足').toBeGreaterThanOrEqual(3);
});

/** 生肖喜忌卡片裡「X忌」那一列的原因文字——忌字清單要沿用同一句，不另寫。 */
async function avoidReasons(page: Page): Promise<Map<string, string>> {
  const rows = await page.locator('#naming-result .notes li').evaluateAll((lis) =>
    lis
      .map((li) => li.textContent!.trim())
      .map((t) => /^(.)忌：(.+)$/.exec(t))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1]!, m[2]!] as const),
  );
  return new Map(rows);
}

async function expectAvoidListDeduped(
  page: Page,
  combo: Locator,
  label: string,
  expectedAnimals: number,
): Promise<void> {
  const reasons = await avoidReasons(page);
  // 明確斷言生肖數：臨界期若只擷取到一肖，後面「每肖一次」的檢查會悄悄變弱。
  expect(reasons.size, `${label}：生肖喜忌卡片應列出 ${expectedAnimals} 隻生肖的忌用原因`).toBe(expectedAnimals);
  const avoid = combo.locator('details.cand-avoid').first();
  await avoid.locator(':scope > summary').click();
  await expect(avoid).toHaveAttribute('open', '');
  const chips = await avoid.locator('.chip').count();
  const lines = await avoid.locator('li').evaluateAll((lis) => lis.map((li) => li.textContent!.replace(/\s+/g, ' ').trim()));
  const text = lines.join('\n');

  for (const [animal, reason] of reasons) {
    const occurrences = text.split(reason).length - 1;
    expect(occurrences, `${label}：${animal}的忌用原因應恰好出現一次，實際 ${occurrences} 次`).toBe(1);
    const reasonLine = lines.find((l) => l.includes(reason))!;
    expect(reasonLine, `${label}：原因列要標明生肖`).toContain(animal);
  }
  const charLines = lines.filter((l) => ![...reasons.values()].some((r) => l.includes(r)));
  expect(charLines.length, `${label}：每個忌字一列`).toBe(chips);
  for (const l of charLines) {
    expect(l, `${label}：逐字列只列命中的字根`).toMatch(/^.：.*含「[^」]+」字根$/u);
    for (const r of reasons.values()) expect(l, `${label}：逐字列不應重複原因`).not.toContain(r);
    if (reasons.size > 1) {
      expect([...reasons.keys()].some((a) => l.includes(a)), `${label}：兩肖並列時逐字列要標明是哪隻生肖`).toBe(true);
    }
  }
}

test('生肖忌字清單：原因每肖講一次，逐字只列字根（#57）', async ({ page }) => {
  const result = await naming(page, { year: '2026', month: '6', day: '15' });
  const combo = await openComboWithAvoid(result);
  await expectAvoidListDeduped(page, combo, '單一生肖', 1);
});

test('生肖忌字清單：立春臨界兩肖並列（#57）', async ({ page }) => {
  const result = await naming(page, { year: '2026', month: '2', day: '10' });
  await expect(result.getByText('距立春')).toBeVisible();
  const combo = await openComboWithAvoid(result);
  await expectAvoidListDeduped(page, combo, '立春臨界', 2);
});
