// 分析卡片與比較卡片的 Canvas 繪製（SPEC-v4 #1、#13）：寬 1080，不用任何執行期套件。
// 版面內容由 layout.ts／compare-layout.ts 決定，這裡只負責排字與上色；驗證在 Playwright（jsdom 沒有 Canvas）。
//
// 配色固定用 style.css `:root` 的**淺色**變數——卡片是要傳出去的圖片，不跟觀看者的深色模式。

import type { CardLayout, CardTag, CardTagGroup } from './layout.ts';
import type { CompareCardLayout } from './compare-layout.ts';
import type { SummaryTone } from '../engine/summary.ts';

/** 與 src/style.css `:root`（淺色）同值。 */
const COLOR = {
  bg: '#f7f5f1',
  surface: '#ffffff',
  ink: '#1f1c19',
  inkSoft: '#5c554d',
  line: '#e2ddd4',
  accent: '#8c2f1f',
  good: '#2f6b3f',
  goodSoft: '#e6f0e8',
  mid: '#8a6d1f',
  midSoft: '#f6efdc',
  bad: '#9c2b2b',
  badSoft: '#f7e4e4',
} as const;

/** 與 src/style.css `body` 同一組 font stack。 */
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif";

/** 與摘要區 TONE_CLASS 同一套對應：neutral 用 mid（accent 與 bad 幾乎同色），unknown 只有細框。 */
const TONE: Record<SummaryTone, { fill?: string; stroke?: string; text: string }> = {
  good: { fill: COLOR.goodSoft, text: COLOR.good },
  bad: { fill: COLOR.badSoft, text: COLOR.bad },
  neutral: { fill: COLOR.midSoft, text: COLOR.mid },
  unknown: { stroke: COLOR.line, text: COLOR.inkSoft },
};

const MARGIN = 56;
const PAD = 64;
/** 繪製內容不得超過這條線，底下保留給署名。 */
const CONTENT_BOTTOM_GAP = 150;
/** 比較卡片最多加高到這裡；再多就縮小字級。 */
const COMPARE_MAX_HEIGHT = 2700;

const font = (px: number, weight = 400) => `${weight} ${Math.round(px)}px ${FONT_STACK}`;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

type TextFn = (str: string, x: number, baseline: number, f: string, color: string, align?: CanvasTextAlign) => void;

function textPainter(ctx: CanvasRenderingContext2D, paint: boolean): TextFn {
  return (str, x, baseline, f, color, align = 'left') => {
    if (!paint) return;
    ctx.font = f;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(str, x, baseline);
  };
}

/** 分項標籤：左欄組名，右側標籤自動換行。回傳最後一行標籤的底緣。 */
function groupsPass(
  ctx: CanvasRenderingContext2D,
  groups: readonly CardTagGroup[],
  left: number,
  right: number,
  y: number,
  s: number,
  paint: boolean,
): number {
  const text = textPainter(ctx, paint);
  ctx.font = font(30 * s, 600);
  const groupW = ctx.measureText('三才').width + 40 * s;
  const tagLeft = left + groupW;
  const pillH = 52 * s;
  const lineH = pillH + 22 * s;
  const gapX = 30 * s;

  for (const g of groups) {
    y += 34 * s;
    let x = tagLeft;
    let top = y;
    text(g.group, left, top + pillH * 0.68, font(30 * s, 600), COLOR.inkSoft);
    for (const t of g.tags) {
      const w = tagWidth(ctx, t, s);
      if (x > tagLeft && x + w > right) {
        x = tagLeft;
        top += lineH;
      }
      if (paint) paintTag(ctx, t, x, top, pillH, s);
      x += w + gapX;
    }
    y = top + pillH;
  }
  return y;
}

/**
 * 依縮放比例排一次版；`paint` 為 false 時只量高度。
 * 標籤多（例如立春未定、複姓雙名）時由呼叫端縮小比例重排，保證不超出卡片。
 */
function layoutPass(ctx: CanvasRenderingContext2D, layout: CardLayout, s: number, paint: boolean): number {
  const left = MARGIN + PAD;
  const right = layout.width - MARGIN - PAD;
  const text = textPainter(ctx, paint);
  let y = MARGIN + PAD;

  // 站名
  y += 34 * s;
  text(layout.heading, left, y, font(32 * s, 600), COLOR.accent);

  // 姓名
  y += 120 * s;
  text(layout.name, left, y, font(104 * s, 700), COLOR.ink);
  y += 44 * s;

  // 生日／生肖／四柱
  ctx.font = font(30 * s, 600);
  const rowLabelW = ctx.measureText('四柱').width + 32 * s;
  for (const row of layout.rows) {
    y += 58 * s;
    text(row.label, left, y, font(30 * s, 600), COLOR.inkSoft);
    text(row.value, left + rowLabelW, y, font(38 * s, 500), COLOR.ink);
  }

  // 分隔線＋說明
  y += 40 * s;
  if (paint) {
    ctx.fillStyle = COLOR.line;
    ctx.fillRect(left, y, right - left, Math.max(1, 2 * s));
  }
  y += 54 * s;
  text(layout.groupsNote, left, y, font(26 * s), COLOR.inkSoft);

  return groupsPass(ctx, layout.groups, left, right, y, s, paint);
}

/** 比較卡片：站名＋說明，接著每個名字一塊（姓名、生肖、分項標籤），塊與塊之間分隔線。 */
function comparePass(ctx: CanvasRenderingContext2D, layout: CompareCardLayout, s: number, paint: boolean): number {
  const left = MARGIN + PAD;
  const right = layout.width - MARGIN - PAD;
  const text = textPainter(ctx, paint);
  let y = MARGIN + PAD;

  y += 34 * s;
  text(layout.heading, left, y, font(32 * s, 600), COLOR.accent);
  y += 48 * s;
  text(layout.groupsNote, left, y, font(26 * s), COLOR.inkSoft);

  layout.blocks.forEach((b, i) => {
    y += (i === 0 ? 36 : 44) * s;
    if (paint) {
      ctx.fillStyle = COLOR.line;
      ctx.fillRect(left, y, right - left, Math.max(1, 2 * s));
    }
    y += 84 * s;
    text(b.name, left, y, font(64 * s, 700), COLOR.ink);
    ctx.font = font(64 * s, 700);
    let x = left + ctx.measureText(b.name).width + 36 * s;
    for (const row of b.rows) {
      text(row.label, x, y, font(28 * s, 600), COLOR.inkSoft);
      ctx.font = font(28 * s, 600);
      x += ctx.measureText(row.label).width + 14 * s;
      text(row.value, x, y, font(34 * s, 500), COLOR.ink);
      ctx.font = font(34 * s, 500);
      x += ctx.measureText(row.value).width + 32 * s;
    }
    y += 10 * s;
    if (b.note) {
      y += 46 * s;
      text(b.note, left, y, font(28 * s), COLOR.inkSoft);
    }
    y = groupsPass(ctx, b.groups, left, right, y, s, paint);
  });

  return y;
}

function tagWidth(ctx: CanvasRenderingContext2D, t: CardTag, s: number): number {
  ctx.font = font(32 * s, 500);
  const labelW = ctx.measureText(t.label).width;
  ctx.font = font(30 * s, 700);
  const verdictW = ctx.measureText(t.verdict).width;
  return labelW + 12 * s + verdictW + 36 * s;
}

function paintTag(ctx: CanvasRenderingContext2D, t: CardTag, x: number, top: number, h: number, s: number): void {
  const baseline = top + h * 0.68;
  ctx.textAlign = 'left';
  ctx.font = font(32 * s, 500);
  ctx.fillStyle = COLOR.ink;
  ctx.fillText(t.label, x, baseline);
  const labelW = ctx.measureText(t.label).width;

  ctx.font = font(30 * s, 700);
  const verdictW = ctx.measureText(t.verdict).width;
  const px = x + labelW + 12 * s;
  const pw = verdictW + 36 * s;
  const tone = TONE[t.tone];
  roundRect(ctx, px, top, pw, h, 10 * s);
  if (tone.fill) {
    ctx.fillStyle = tone.fill;
    ctx.fill();
  }
  if (tone.stroke) {
    ctx.strokeStyle = tone.stroke;
    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.stroke();
  }
  ctx.fillStyle = tone.text;
  ctx.fillText(t.verdict, px + 18 * s, baseline);
}

async function newCanvas(width: number, height: number): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> {
  if (document.fonts?.ready) await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('此瀏覽器無法使用 Canvas，無法產生卡片。');
  return { canvas, ctx };
}

function paintFrame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, width, height);
  roundRect(ctx, MARGIN, MARGIN, width - MARGIN * 2, height - MARGIN * 2, 28);
  ctx.fillStyle = COLOR.surface;
  ctx.fill();
  ctx.strokeStyle = COLOR.line;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** 底部署名（SPEC-v4 #4）。 */
function paintFooter(ctx: CanvasRenderingContext2D, footer: string, width: number, height: number): void {
  const footerY = height - MARGIN - 64;
  ctx.fillStyle = COLOR.line;
  ctx.fillRect(MARGIN + PAD, footerY - 58, width - (MARGIN + PAD) * 2, 2);
  ctx.font = font(28, 500);
  ctx.fillStyle = COLOR.inkSoft;
  ctx.textAlign = 'center';
  ctx.fillText(footer, width / 2, footerY);
}

/** 畫出分析卡片（固定 1080×1350）。會先等 `document.fonts.ready`，避免字型未載入時量錯寬度。 */
export async function drawCard(layout: CardLayout): Promise<HTMLCanvasElement> {
  const { canvas, ctx } = await newCanvas(layout.width, layout.height);

  const limit = layout.height - MARGIN - CONTENT_BOTTOM_GAP;
  let scale = 1;
  for (let i = 0; i < 8 && layoutPass(ctx, layout, scale, false) > limit; i++) scale *= 0.92;

  paintFrame(ctx, layout.width, layout.height);
  layoutPass(ctx, layout, scale, true);
  paintFooter(ctx, layout.footer, layout.width, layout.height);
  return canvas;
}

/**
 * 畫出比較卡片：寬固定 1080，高度依名字與標籤數量在 1350–2700 之間加高；
 * 超過上限才縮小字級，保證不壓到署名。
 */
export async function drawCompareCard(layout: CompareCardLayout): Promise<HTMLCanvasElement> {
  const { canvas, ctx } = await newCanvas(layout.width, layout.minHeight);
  const reserve = MARGIN + CONTENT_BOTTOM_GAP;

  const fit = (s: number) => Math.max(layout.minHeight, Math.ceil(comparePass(ctx, layout, s, false) + reserve));
  let scale = 1;
  for (let i = 0; i < 12 && fit(scale) > COMPARE_MAX_HEIGHT; i++) scale *= 0.92;
  // 縮完字級後依實際內容定高，不留一大截空白（上限 COMPARE_MAX_HEIGHT）。
  const height = Math.min(COMPARE_MAX_HEIGHT, fit(scale));
  // 改 canvas 尺寸會重置 context 狀態，量完再定高。
  canvas.height = height;

  paintFrame(ctx, layout.width, height);
  comparePass(ctx, layout, scale, true);
  paintFooter(ctx, layout.footer, layout.width, height);
  return canvas;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('卡片圖片產生失敗。'))), 'image/png');
  });
}
