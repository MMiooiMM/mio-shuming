// Regenerate public/og.png and public/icon-180.png (apple-touch-icon).
// public/favicon.svg and public/icon-32.png share the same glyph but are
// simple enough to hand-author; icon-32.png is produced here too so all
// raster assets come from one reproducible script.
//
// Uses Playwright (already a devDependency for E2E) purely as a headless
// renderer at build/authoring time — this script is never run in CI or by
// the shipped app, so it does not add a runtime dependency (SPEC-v4 #1).
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');

const COLORS = {
  bg: '#f7f5f1',
  accent: '#8c2f1f',
  ink: '#1f1c19',
  inkSoft: '#5c554d',
};

function ogHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:1200px; height:630px; }
    body {
      background:${COLORS.bg};
      font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      position:relative;
    }
    .badge {
      width:160px; height:160px; border-radius:32px; background:${COLORS.accent};
      display:flex; align-items:center; justify-content:center; margin-bottom:36px;
    }
    .badge span { color:${COLORS.bg}; font-size:96px; font-weight:700; }
    h1 { color:${COLORS.ink}; font-size:72px; font-weight:700; margin-bottom:16px; }
    p { color:${COLORS.inkSoft}; font-size:32px; }
    .frame { position:absolute; inset:24px; border:2px solid #e2ddd4; border-radius:24px; }
  </style></head><body>
    <div class="frame"></div>
    <div class="badge"><span>數</span></div>
    <h1>數名其妙</h1>
    <p>康熙筆畫三才五格・立春換算生肖字根・五行分佈</p>
  </body></html>`;
}

function iconHtml(size, radius) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:${size}px; height:${size}px; background:transparent; }
    .box {
      width:${size}px; height:${size}px; border-radius:${radius}px; background:${COLORS.accent};
      display:flex; align-items:center; justify-content:center;
    }
    .box span {
      color:${COLORS.bg}; font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif;
      font-size:${Math.round(size * 0.6)}px; font-weight:700;
    }
  </style></head><body><div class="box"><span>數</span></div></body></html>`;
}

async function shoot(browser, html, width, height, outPath) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: outPath, omitBackground: false });
  await page.close();
}

const browser = await chromium.launch();
await shoot(browser, ogHtml(), 1200, 630, path.join(publicDir, 'og.png'));
await shoot(browser, iconHtml(180, 40), 180, 180, path.join(publicDir, 'icon-180.png'));
await shoot(browser, iconHtml(32, 7), 32, 32, path.join(publicDir, 'icon-32.png'));
await browser.close();

console.log('Wrote public/og.png, public/icon-180.png, public/icon-32.png');
