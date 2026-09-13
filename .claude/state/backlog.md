# Backlog — v4 可分享的產品外殼

> 凍結判準：[SPEC-v4.md](../../SPEC-v4.md)（2026-09-13 凍結，commit `1b8bc9a`）。本檔是 v4 實作的**唯一真相源**。
> 每項自包含：sub-agent 只讀本檔＋SPEC-v4.md＋repo 即可冷啟動。完成一項立即 commit＋push＋回寫 `status: DONE(<sha>)` 與 `evidence`。
> 執行模式：`/mio-boom --seq`（B 系列都動 `index.html`／`src/main.ts`／`src/naming-ui.ts`／`src/style.css`，且 E2E 共用一台瀏覽器與 dev server）。依編號順序做，`depends` 未 DONE 不可開工。

## 全域 watch-outs（每項都適用）

- **SPEC 原則**：不合成單一總分（標籤不計數、不加總、不排序）；引擎純函式（不讀當下時間與隨機數）；罕字與範圍外據實回報不猜；每條規則出處進資料檔 `source`。
- **網址不帶任何使用者輸入**（SPEC-v4 #7）：任何項目都不得寫 `location.search`／`location.hash`／`history.pushState`。
- **卡片不印時分、出生地；比較卡不印預產期**（#3、#13）。
- **jsdom 不套 stylesheet**：顯示／隱藏、版面、溢位只能在真瀏覽器（Playwright）驗 `getComputedStyle`／`checkVisibility()`。曾踩過 `[hidden]` 被 `.field{display:flex}` 蓋掉。
- **jsdom 沒有 Canvas 實作**：卡片把「版面模型（純函式，吐出要畫的文字行與區塊）」與「Canvas 繪製」分開；版面模型用 vitest 測，繪製結果用 Playwright 驗。
- `.gitignore` 有 `*.png`：要入庫的圖檔（OG 圖、icon）必須加 `!public/**/*.png` 例外，並用 `git check-ignore -v` 確認。
- 用神「永遠不可能算對」，`yongshen.ts` 的操作化規則是本站自訂，名詞解釋與卡片文案不得把它寫成古籍定論（見 `docs/v2-sources.md` 第 10、15、16 節）。
- 背景 vite dev server 用 TaskStop 殺不掉，收工前以 `Get-CimInstance Win32_Process` 查 `node` + `vite` 實殺；殘留 service worker 會劫持 localhost。
- 動到畫面外觀的項目：verify 階段附 390px 與 1280px 截圖（存 scratchpad，不入庫）；整體 `/mio-mirror` 在 B10 由主 agent 統一做。
- Diff review 走 Contract rule 7 鏈（Copilot CLI → Codex CLI → `diff-reviewer`）；Codex prompt 寫進 `tools/raw/review-*.md` 再叫它讀。
- 對齊外部規格（Web Share、OG、Lighthouse、Playwright 設定）先走 `/mio-istj` 讀權威文件，引用進 commit message 或 notes。

## 全域驗證腳本（v4 完成的證據）

- Claim 1：分析「王小明 2024-03-15 10:30 臺北市」→ 按分享卡片 → 得到 PNG，內容含姓名、生日、生肖、四柱與分項標籤，**不含**「10:30」「臺北」 → Playwright 攔下載檔＋`toMatchSnapshot` 或讀 PNG 尺寸／像素非空，並斷言卡片版面模型文字不含時分與地名。
- Claim 2：CI 在 Playwright 故意失敗時 deploy job 不跑（before：現行 workflow 無 E2E；after：`needs` 鏈擋下）→ 開一個故意改壞的 branch 跑 workflow 看結果，或以 `act`／workflow 結構審查＋變異測試證明。
- Claim 3：Lighthouse 無障礙三狀態 before 分數 → after 皆 ≥ 95 → `npx lighthouse --only-categories=accessibility` 輸出數字。

---

## B0. Playwright E2E 基礎建設＋CI 閘門＋手機不溢位
- status: TODO
- model: opus
- depends: —
- spec: SPEC-v4 #17（基礎＋既有兩模式主流程）、#18、#20
- scope:
  - 新增 devDependency `@playwright/test`；`playwright.config.ts` 以 `webServer` 起 `vite preview`（先 build）或 `vite`，兩個 project：`mobile`（390×844）與 `desktop`（1280×800），只用 chromium。
  - 新增 `e2e/` 目錄與 npm script `test:e2e`；vitest 設定要排除 `e2e/`（避免 vitest 撿到 Playwright spec）。
  - 既有主流程 spec：取名模式（輸入姓＋預產期 → 出現筆畫組合 → 展開候選字 → 收藏 → 帶入分析）；分析模式（姓名＋生日＋時辰＋縣市 → 出現五格、四柱、用神、匹配）。
  - #20 斷言：兩模式結果頁在 390px 下 `document.documentElement.scrollWidth <= clientWidth`；若現況溢位，**在本項修 CSS**（表格包進可橫捲容器）。
  - `.github/workflows/deploy.yml`：build job 內依序 `npm test` → `npx playwright install --with-deps chromium` → `npm run test:e2e` → `npm run build`；任一失敗不部署。失敗時上傳 Playwright report artifact。
  - `.gitignore` 加 `playwright-report/`、`test-results/`。
- verify:
  - before：記錄 390px 下兩模式的 `scrollWidth/clientWidth` 實測值。after：E2E 全綠。
  - 變異測試：暫時把某個斷言對象改壞（例如刪掉候選字區塊的 selector），確認 spec 會紅，再還原。
  - 推上 main 後 GitHub Actions 該次 run 成功且含 E2E 步驟（`gh run view` 輸出）。
- evidence:
- notes:

## B1. 免責與隱私聲明
- status: TODO
- model: sonnet
- depends: B0
- spec: SPEC-v4 #14、#15
- scope:
  - `index.html` 加 `<footer>`（在 `<main>` 外或 `.page` 底部），常駐顯示：所有計算在裝置上完成、不上傳；收藏只存在此瀏覽器（localStorage）；命理結果僅供參考（沿用站方語氣「算得出來，信不信隨你」）。
  - 取名表單與分析表單的出生資料欄位旁各一行「資料只在你的裝置計算，不上傳」。
  - 事實查核：先 grep 確認全站確實沒有任何網路請求送出使用者輸入（`fetch`／`XMLHttpRequest`／`navigator.sendBeacon`／外部 script），聲明才成立；有例外就 BLOCKED 回報。
  - E2E：兩模式各斷言表單旁那一行可見；頁尾在兩種寬度可見。
- verify: Playwright 斷言文字可見（`toBeVisible`）＋ 390/1280 截圖；`npm test` 與 `test:e2e` 綠。
- evidence:
- notes:

## B2. 分享預覽 meta＋網站圖示
- status: TODO
- model: sonnet
- depends: B0
- spec: SPEC-v4 #16
- scope:
  - 先 `/mio-istj`：讀 Open Graph protocol（ogp.me）與 LINE／Facebook 對 `og:image` 的尺寸與絕對網址要求，引用進 notes。
  - `index.html` 加 `og:title`、`og:description`、`og:type`、`og:url`、`og:image`（**絕對網址** `https://mmiooimm.github.io/mio-shuming/og.png`，1200×630）、`og:locale=zh_TW`、`twitter:card=summary_large_image`；`<link rel="icon">`（SVG＋32px PNG 備援）、`<link rel="apple-touch-icon">`（180×180）。
  - 圖檔放 `public/`（Vite 原樣複製到 `dist/`，`base: './'` 下 icon 用相對路徑）。OG 圖視覺沿用站內配色（見 `src/style.css` 的 CSS 變數）與站名「數名其妙」＋標語；可用 Playwright 對一個臨時 HTML 截圖產生 PNG，產生腳本放 `tools/gen-og-image.mjs` 以便重製。
  - `.gitignore` 加 `!public/**/*.png` 例外。
- verify:
  - build 後 `dist/` 含 `og.png`、icon 檔，`dist/index.html` meta 正確（grep 輸出）。
  - 部署後 `curl -sI https://mmiooimm.github.io/mio-shuming/og.png` 為 200 且 `content-type: image/png`。
  - LINE／FB 預覽除錯工具實際抓取截圖——**需要使用者帳號登入時，標 `BLOCKED(需使用者以 FB Sharing Debugger 或 LINE Page Poker 實測)`，其餘部分照常 DONE 成另一個 commit**。
- evidence:
- notes:

## B3. 分項標籤函式＋結果摘要區
- status: TODO
- model: opus
- depends: B0
- spec: SPEC-v4 #8、#2（標籤內容）、#6
- scope:
  - 新增純函式模組（建議 `src/engine/summary.ts`），輸入 `Analysis`（`src/engine/types.ts`）＋可選的八字結果（`BaziChart`、`YongShenResult`、`MatchResult`），輸出有序的標籤陣列 `SummaryTag[]`：`{ group: '三才'|'五格'|'生肖'|'八字', label: string, verdict: string, tone: 'good'|'neutral'|'bad'|'unknown' }`。
  - 標籤內容（每項各自一個判定，**不計數、不加總、不產生「N 吉 M 凶」**）：
    - 三才：`sancai.luck`。
    - 五格：五格各一個標籤「人格 24 吉」；分析模式五格全列（取名模式的「天格不計」規則只屬取名模式，見 SPEC-v3 #3，不帶進分析模式）。
    - 生肖：名字每個字一個標籤，值為 `CharVerdict.verdict`（喜／忌／喜忌並見／中性）；`boundaryAmbiguous` 時另出一個「生肖未定：X 或 Y」標籤（#6）。
    - 八字（僅有時辰時）：用神五行標籤；名字每個字的 `MatchVerdict`（補用神／傷用神／中性／五行不明）。
  - 分析結果頂端（`src/main.ts` 的 `render`／`runAndRender` 組裝處，排盤區之前）新增「摘要」section，**只呈現**此函式的輸出。B5 卡片必須重用同一函式。
  - vitest：至少涵蓋 有時辰／無時辰／立春當日未定／含查無五行字 四種輸入；並斷言輸出中沒有任何計數型字串（例如 regex `/\d+\s*[項個]\s*[吉凶]/` 不命中）。
- verify:
  - before：結果頁頂端無摘要（截圖）；after：摘要標籤與下方各分項判定一致——Playwright 抽 3 個標籤與對應 section 的判定文字比對。
  - 變異測試：故意把某標籤 verdict 寫錯，確認 vitest 會紅。
- evidence:
- notes:

## B4. 名詞就地解釋
- status: TODO
- model: opus
- depends: B3
- spec: SPEC-v4 #9、#10
- scope:
  - 新增 `src/data/glossary.json`：每個名詞 `{ term, text, source }`。至少涵蓋 人格、天格、地格、外格、總格、三才、用神、十神、藏干、真太陽時。解釋文字 1–2 句白話；**定義性敘述要有出處**（優先沿用 `numerology-81.json`、`docs/v2-sources.md` 已引用的來源，不另編）。用神的解釋須明示「各家判法不一，本站採自訂操作化規則」。
  - 在 `src/data/index.ts` 以型別化方式匯出。
  - UI：名詞旁一個 `<button type="button" aria-expanded="false" aria-controls="…">`，點擊或 Enter／Space 切換說明區塊（`hidden` 屬性），同步 `aria-expanded`。注意 `[hidden]` 被 class 的 `display` 覆蓋的舊雷。
  - 「資料來源」區塊（`sourcesSection`）納入 glossary 的出處。
- verify:
  - vitest：每個指定名詞在 glossary 皆存在且 `source` 非空。
  - Playwright（兩寬度）：Tab 到按鈕 → Enter 展開 → 說明 `checkVisibility()` 為 true、`aria-expanded="true"` → Space 收合 → false。
- evidence:
- notes:

## B5. 分析卡片（Canvas PNG＋Web Share／下載）
- status: TODO
- model: opus
- depends: B3
- spec: SPEC-v4 #1–#7
- scope:
  - 先 `/mio-istj`：讀 MDN／W3C Web Share API Level 2（`navigator.canShare({ files })`、`navigator.share` 需使用者手勢、`AbortError` 為使用者取消），引用進 notes。
  - 版面模型純函式（建議 `src/card/layout.ts`）：輸入姓名、生日（**只收年月日**）、生肖（或未定的兩生肖）、四柱干支（可選）、B3 的 `SummaryTag[]`，輸出要繪製的行與標籤區塊。型別層面就不讓時分與地點進來。
  - Canvas 繪製（建議 `src/card/draw.ts`）：固定尺寸（例如 1080×1350），字型沿用站內 font stack，配色沿用 `style.css` 變數（淺色版即可，卡片不跟深色模式）；等 `document.fonts.ready` 再畫。底部固定「數名其妙・https://mmiooimm.github.io/mio-shuming/・僅供參考」。
  - 輸出（建議 `src/card/share.ts`，B7 重用）：`canvas.toBlob` → `File`；`navigator.canShare?.({ files: [file] })` 為真則 `navigator.share`，使用者取消（`AbortError`）靜默；否則以 `<a download>` 觸發下載。**不寫入網址**。
  - 分析結果區加「分享卡片」按鈕；無時辰時四柱與八字標籤不出現（#3）。
  - 不新增執行期依賴（#1）：`package.json` 的 `dependencies` 保持空。
- verify:
  - vitest：版面模型對「王小明 2024-03-15 10:30 臺北市」的輸出文字 join 後不含 `10`＋`30` 時分字串與縣市名；無時辰輸入不含四柱；立春當日輸出含兩生肖。
  - Playwright（下載路徑）：`page.waitForEvent('download')` → 檔名 `.png`、檔案大小 > 0、以 PNG signature 開頭、寬高 1080×1350。
  - Playwright（分享路徑）：`addInitScript` stub `navigator.canShare = () => true`、`navigator.share = (d) => { window.__shared = d; return Promise.resolve(); }` → 點按鈕 → 斷言 `__shared.files[0].type === 'image/png'`，且未觸發 download。
  - Playwright：點按鈕前後 `page.url()` 相同。
  - 截圖卡片 PNG 本身存 scratchpad，供 B10 mirror。
- evidence:
- notes:

## B6. 收藏資料加存預產期（向後相容）
- status: TODO
- model: sonnet
- depends: B0
- spec: SPEC-v4 #11
- scope:
  - `src/naming-ui.ts` 的 `Favorite` 加可選 `due?: { year: number; month: number; day: number }`；新收藏時存入取名表單當下的預產期。
  - 儲存 key 決策：沿用 `mio-shuming:favorites:v1` 並讓 `due` 為可選欄位（舊資料天然相容），或升 `v2` 並寫一次性遷移——擇一，理由寫進 notes；**無論哪種，舊 v1 資料必須讀得到且不遺失**。
  - `loadFavorites` 驗證 `due` 形狀，壞掉的 `due` 當作不存在（不丟整筆收藏）。
  - 去重規則：同姓名、同預產期視為重複；同姓名不同預產期是否並存——預設**視為同一筆並更新預產期**，寫進 notes。
- verify:
  - vitest：舊格式 `[{surname,givenName}]` 讀得到且 `due` 為 undefined；新格式往返一致；`due` 壞掉時該筆仍在。
  - Playwright：`addInitScript` 預寫舊格式 localStorage → 載入頁面 → 舊收藏顯示正常。
- evidence:
- notes:

## B7. 收藏比較＋比較卡片
- status: TODO
- model: opus
- depends: B5、B6
- spec: SPEC-v4 #12、#13
- scope:
  - 收藏區每筆加勾選框；勾選數在 2–5 之間才啟用「比較」按鈕，超過 5 個時其餘勾選框停用並說明原因。
  - 比較視圖：每個名字一欄（窄螢幕改為直向堆疊或容器內橫捲，不得造成整頁溢位），列三才、`judgedGrids(grids, doubleGiven)`（`src/engine/naming.ts`，只列取名可改變、計吉凶的格）、生肖喜忌逐字標籤。生肖依收藏的 `due` 走 `dueZodiac()`；無 `due` 顯示「生肖未知」（不猜）；立春 ±3 週（`LICHUN_WINDOW_DAYS`）時兩生肖並列。
  - 標籤一律不計數、不排序、不選「最佳」。
  - 「輸出比較卡片」：重用 B5 的 `share.ts` 與繪製基礎；卡片**只印生肖、不印預產期**，底部署名同 B5。
- verify:
  - vitest：比較卡版面模型輸出不含任何日期字串（regex `/\d{4}[-/年]/` 不命中）；立春窗內含兩生肖；無 due 顯示未知。
  - Playwright（兩寬度）：勾 1 個比較鈕停用、勾 2 個啟用、勾 6 個被擋；比較視圖 390px 不溢位；比較卡下載為 PNG。
- evidence:
- notes:

## B8. Lighthouse 無障礙 ≥ 95
- status: TODO
- model: sonnet
- depends: B1、B2、B4、B5、B7
- spec: SPEC-v4 #19
- scope:
  - 先 `/mio-istj`：讀 Lighthouse accessibility 評分說明，確認三狀態的量測方式（結果頁需要互動後才出現，用 Lighthouse user flow `startTimespan`／`snapshot`，或 Playwright 產生狀態後以 `playwright-lighthouse`／CDP 量測——選一並記 notes）。
  - 量三狀態：首頁、分析結果（含時辰）、取名結果（展開一組候選字）。before 分數入 notes。
  - 修到三者皆 ≥ 95（常見：對比度、按鈕名稱、表單 label、heading 階層、`aria-pressed` 用法）。
  - 量測腳本入庫（`tools/lighthouse-a11y.mjs` 或 e2e 內），可重跑；**不進 CI 閘門**（SPEC 只要求附報告數字）。
- verify: before → after 三狀態分數表；`npm test`、`test:e2e` 綠。
- evidence:
- notes:

## B9. 文件同步
- status: TODO
- model: sonnet
- depends: B0–B8 全部 DONE
- spec: Contract rule 4（doc-sync）
- scope:
  - `README.md`：簡介補分享卡片、收藏比較；「開發」段補 `npm run test:e2e` 與實際測試數（實跑取數，不抄舊值——現行 README 寫 41 項已過期）；「已知限制」補 Web Share 不支援時退回下載、卡片不印時分／出生地的隱私設計。
  - 若實作偏離 SPEC-v4 任何條文，在 `SPEC-v4.md` 與 `SPEC-v4.html` 對應條目加「修正」callout（格式比照 SPEC-v3 #3），並在決策紀錄表補一列。
- verify: `git diff` 審閱；README 內指令逐一實跑可用。
- evidence:
- notes:

## B10. 整體設計評審（主 agent）
- status: TODO
- model: main
- depends: B9
- spec: SPEC-v4 #21；Contract rule 2a
- scope: 走 `/mio-mirror`：390／1280 兩寬度下首頁、取名結果、比較視圖、分析結果（含摘要與名詞展開）、分析卡片 PNG、比較卡片 PNG、頁尾——只餵截圖給禁止讀程式的 opus sub-agent，與自評對照；需修的開新 backlog 項（B11+）。
- verify: mirror 報告＋對照表；後續項目清單。
- evidence:
- notes:
