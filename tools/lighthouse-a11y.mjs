// SPEC-v4 #19：首頁、分析結果、取名結果三種狀態的 Lighthouse 無障礙分數皆需 ≥ 95。
// 這三個狀態都是同一個 SPA 頁面「互動後」的樣子，不是三個不同網址，
// 所以不能用一般的 `lighthouse <url>`（那只測初始 DOM）。
// 依 Lighthouse user-flows 文件（https://github.com/GoogleChrome/lighthouse/blob/main/docs/user-flows.md）：
// `flow.startTimespan()` 包住互動，`flow.snapshot()` 對「當下 DOM 狀態」跑一次稽核（不觸發網址導覽）。
// 跑法：先 `npm run build && npx vite preview --port 4173`（或讓本腳本重用既有的 preview），
// 再 `node tools/lighthouse-a11y.mjs`。不進 CI 閘門（SPEC 只要求附報告數字），純本機可重跑腳本。
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import puppeteer from 'puppeteer';
import { startFlow } from 'lighthouse';

const BASE_URL = process.env.LH_BASE_URL ?? 'http://localhost:4173/';
const flowConfig = {
  config: { extends: 'lighthouse:default', settings: { onlyCategories: ['accessibility'] } },
};

/** @param {import('puppeteer').Page} page */
async function fillNamingForm(page) {
  await page.locator('#naming-surname').fill('王');
  await page.locator('#naming-year').fill('2026');
  await page.locator('#naming-month').fill('6');
  await page.locator('#naming-day').fill('15');
}

/** @param {import('puppeteer').Page} page */
async function fillAnalysisForm(page) {
  await page.locator('#surname').fill('王');
  await page.locator('#givenName').fill('小明');
  await page.locator('#year').fill('1998');
  await page.locator('#month').fill('6');
  await page.locator('#day').fill('10');
  await page.locator('#hour').fill('10');
  await page.locator('#minute').fill('0');
  await page.select('#county', '臺北市');
}

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  try {
    await run(browser);
  } finally {
    // Codex review B8：導覽／selector／報告寫入任一步失敗都要關瀏覽器，不留殘留 Chrome 行程。
    await browser.close();
  }
}

/** @param {import('puppeteer').Browser} browser */
async function run(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const flow = await startFlow(page, { ...flowConfig, name: '數名其妙 無障礙量測' });

  // 狀態一：首頁（未送出任何表單）。
  await flow.navigate(BASE_URL);
  await page.waitForSelector('#mode-naming');
  await flow.snapshot({ ...flowConfig, name: '首頁' });

  // 狀態二：取名結果（展開一組候選字）。
  await flow.startTimespan({ ...flowConfig, name: '取名：填表送出並展開候選字' });
  await fillNamingForm(page);
  await page.locator('#naming-form button[type="submit"]').click();
  await page.waitForSelector('#naming-result details.combo');
  const summary = await page.$('#naming-result details.combo summary');
  await summary.click();
  await page.waitForSelector('#naming-result .cand-pos .chips [data-action="pick-char"]');
  await sleep(200);
  await flow.endTimespan();
  await flow.snapshot({ ...flowConfig, name: '取名結果（候選字展開）' });

  // 狀態三：分析結果（含時辰）——用新分頁重新導覽到首頁再切模式，狀態互相獨立。
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1280, height: 800 });
  await page2.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await page2.locator('.mode-tab[data-mode="analysis"]').click();
  await page2.waitForSelector('#mode-analysis');
  await fillAnalysisForm(page2);
  await page2.locator('#form button[type="submit"]').click();
  await page2.waitForSelector('#result section.card');
  await sleep(200);

  // Lighthouse flow 綁定在建立時的 page；用同一個 flow 對 page2 快照前先切換目標。
  const flow2 = await startFlow(page2, { ...flowConfig, name: '分析結果快照' });
  await flow2.snapshot({ ...flowConfig, name: '分析結果（含時辰）' });

  const flowResult1 = await flow.createFlowResult();
  const flowResult2 = await flow2.createFlowResult();
  const results = [...flowResult1.steps, ...flowResult2.steps].map((step) => ({
    name: step.name,
    kind: step.lhr.gatherMode,
    accessibility: Math.round((step.lhr.categories.accessibility?.score ?? 0) * 100),
  }));

  writeFileSync('lighthouse-a11y-report.html', await flow.generateReport());
  writeFileSync('lighthouse-a11y-report-analysis.html', await flow2.generateReport());

  console.log('=== Lighthouse 無障礙分數（accessibility, 0-100） ===');
  for (const r of results) {
    if (r.kind === 'timespan') continue; // timespan 本身不出 accessibility 分數，只有 snapshot/navigation 有。
    console.log(`${r.name}: ${r.accessibility}`);
  }

  const failing = results.filter((r) => r.kind !== 'timespan' && r.accessibility < 95);
  if (failing.length > 0) {
    console.error('未達 95 分：', failing.map((f) => `${f.name}=${f.accessibility}`).join(', '));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
