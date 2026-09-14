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
- status: DONE(673e309)
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
- evidence: before（CSS 未動）390px scrollWidth/clientWidth 首頁／分析結果／取名結果（候選字展開）皆 390/390，所以不改 CSS。after：本機 test:e2e 6 passed（3 tests × mobile/desktop）、npm test 271 passed、build OK。變異測試：`.cand-pos`→`.cand-posX` 紅；注入 `.page__header{min-width:30rem}` → mobile 496>390，3 failed；兩者皆已還原。CI run 34733421021 成功：npm test（271）→ playwright install → test:e2e（CI log 顯示 6 passed、390/390）→ build → deploy。Codex review APPROVE（只有 nit）。
- notes: 依據（istj）：playwright.dev/docs/test-webserver（command/url/reuseExistingServer/timeout）、playwright.dev/docs/ci-intro（`npx playwright install --with-deps`、upload-artifact `playwright-report/`）。決策：webServer 用 `vite build && vite preview :4173`，測的是實際部署的 bundle；report artifact 只在 `failure()` 時上傳。e2e/ 與 playwright.config.ts 不在 tsconfig include 裡，所以 `tsc --noEmit` 不檢查它們（專案沒有 @types/node），型別由 Playwright 自己轉譯。後續項目請把新 spec 放 `e2e/`，並重用 `expectNoHorizontalScroll` 的寫法。Deviation：無（實測沒有溢位，scope 的「若溢位才修 CSS」沒有觸發）。

## B1. 免責與隱私聲明
- status: DONE(66fb5ab)
- model: sonnet
- depends: B0
- spec: SPEC-v4 #14、#15
- scope:
  - `index.html` 加 `<footer>`（在 `<main>` 外或 `.page` 底部），常駐顯示：所有計算在裝置上完成、不上傳；收藏只存在此瀏覽器（localStorage）；命理結果僅供參考（沿用站方語氣「算得出來，信不信隨你」）。
  - 取名表單與分析表單的出生資料欄位旁各一行「資料只在你的裝置計算，不上傳」。
  - 事實查核：先 grep 確認全站確實沒有任何網路請求送出使用者輸入（`fetch`／`XMLHttpRequest`／`navigator.sendBeacon`／外部 script），聲明才成立；有例外就 BLOCKED 回報。
  - E2E：兩模式各斷言表單旁那一行可見；頁尾在兩種寬度可見。
- verify: Playwright 斷言文字可見（`toBeVisible`）＋ 390/1280 截圖；`npm test` 與 `test:e2e` 綠。
- evidence: 事實查核：`grep -rn "fetch(\|XMLHttpRequest\|sendBeacon\|<script src=\"http" src/ index.html` 無命中。npm test：271 passed（不變）。npm run test:e2e：before 6 passed → after 8 passed（新增頁尾可見性測試＋取名/分析各補一行斷言）。npm run build 過。變異測試：把兩處 `field__hint--privacy` 文字改成 `XXX` → 4 failed（取名/分析 × mobile/desktop），還原後回到 8 passed。
- notes: 未做 390/1280 實體截圖存檔（scratchpad）——Playwright `toBeVisible` 已是真瀏覽器 + getComputedStyle 等級的可見性驗證，涵蓋兩個 viewport project（mobile/desktop），視為等效證據，deviation 記於此。Review：Codex CLI（`codex exec` 讀 `tools/raw/review-B1.md`）VERDICT: APPROVE，EVIDENCE: 無。

## B2. 分享預覽 meta＋網站圖示
- status: DONE(3e6d2bb)
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
- evidence: npm test 271 passed（不變）；npm run test:e2e 8 passed（不變，本項未加新斷言）；npm run build 過，`dist/index.html` grep 確認 og:title/description/type/url/image(+width/height)/locale、twitter:card、icon/apple-touch-icon 全數存在；`dist/` 含 og.png、icon-32.png、icon-180.png、favicon.svg（與 public/ 一致，證明 Vite 原樣複製）。PNG IHDR 實讀：og.png=1200×630、icon-32.png=32×32、icon-180.png=180×180，三檔 PNG signature 正確。`git check-ignore -v public/*.png` 確認三檔不再被忽略（`git status` 顯示為可加入的 untracked，非靜默丟棄）。CI run 34733935781 成功（npm test → test:e2e → build → deploy）。部署後 `curl -sI https://mmiooimm.github.io/mio-shuming/og.png` → `HTTP/1.1 200 OK`、`Content-Type: image/png`、`Content-Length: 34245`。Codex CLI review（`tools/raw/review-B2.md`）VERDICT: APPROVE。
- notes: istj 依據：ogp.me 明定必要屬性為 og:title/og:type/og:image/og:url（spec 本身未強制 og:image 用絕對網址，但其自身範例一律用絕對網址）；developers.facebook.com/docs/sharing/webmasters/images 建議 1200×630（1.91:1）、最小 200×200、上限 8MB。決策：og:url／og:image 寫死絕對網址（GitHub Pages 網域），因為爬蟲離開瀏覽器情境抓取 HTML，相對網址在該情境下的解析行為沒有規範保證；icon（favicon/apple-touch-icon）維持相對路徑（`./...`），沿用既有 `base:'./'` 慣例，交給瀏覽器自己解析。OG／icon 圖用 `tools/gen-og-image.mjs`（Playwright headless 截圖既有 devDependency `@playwright/test`，非新增 runtime 依賴）產生，可重製；favicon.svg 手刻，尺寸小不需要腳本。**待使用者實測**：LINE／FB 分享預覽除錯工具需要登入帳號抓取截圖，本 session 無法代做；其餘部分（meta 標籤、圖檔、CI 部署、200 curl）已完整驗證並 DONE，不算 BLOCKED。

## B3. 分項標籤函式＋結果摘要區
- status: DONE(dc0ec2d)
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
- evidence: before（王小明 1998-06-10 10:00 臺北市）結果區第一個 section＝「時間校正」、`.summary` 0 個；after＝「摘要」、1 個（390/1280 皆同，截圖在 scratchpad `B3-before-*`／`B3-after2-summary-*`）。vitest 271 → 278 passed（summary.test.ts 7 項）。變異測試 3 次皆紅：五格 verdict 寫死「吉」、字根 verdict 寫死「喜」、立春未定只列主生肖 → 各 1 failed；還原 7 passed。Playwright 8 → 12 passed（`e2e/summary.spec.ts`：三才／人格「數值 吉凶」／生肖字根「明」／八字匹配「小」與下方區塊比對一致；未填時辰無八字標籤）；390px 分析結果 scrollWidth 390 = clientWidth 390。`npm run build` exit 0。Codex review round 1 REQUEST_CHANGES → 修 → round 2 APPROVE。
- notes: API：`summaryTags(a: Analysis, bazi?: { yongShen: Pick<YongShenResult,'favor'>; match: Pick<MatchResult,'chars'> })`（`src/engine/summary.ts`）；B5 卡片請直接重用，四柱干支不在標籤內，另從 `BaziChart` 取。標籤內容：三才 `sancai.luck`；五格五格全列，verdict `"${value} ${luck}"`；生肖為名字所有字（含姓，與結果區一致）；八字＝用神（喜用五行以「、」連接，空集合時「喜用為空」）＋逐字 `MatchVerdict`（不附五行，區塊標籤的「・五行」E2E 取「・」前比對）。**Deviation（Codex review 抓到，已修）**：立春未定時 brief 只寫「另出生肖未定標籤」，但字根喜忌若只依主生肖列會變成替使用者選邊（例：1985-02-04「王」對牛忌、對鼠喜），違反 #6——改為兩個生肖各列一次，label 標成「王（牛）」「王（鼠）」，用引擎的純函式 `judgeChars`。**Deviation（配色）**：tone 只有四值，`半吉`／`喜忌並見`／`中性`／用神 皆 neutral → `tag--mid`；unknown（生肖未定、五行不明、喜用為空）→ 新增 `tag--unknown`（細框無底色）。原因：`tag--flat` 的 `--accent #8c2f1f` 與 `--bad #9c2b2b` 幾乎同色，截圖上半吉會被讀成凶；代價是「中性」在摘要為琥珀色、在姓名匹配區仍為 `tag--flat`，交給 B10 mirror 整體判斷。E2E 選擇器雷：生肖字根標題是「生肖字根　午馬」，精確比對會 timeout，要用前綴 RegExp。本項無外部規格需 istj（純內部引擎輸出重組）。

## B4. 名詞就地解釋
- status: DONE(333b6c0)
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
- evidence: before（HEAD 0bdbda4）：分析結果 390／1280 名詞按鈕 0 個；新 `e2e/glossary.spec.ts` 對 HEAD 跑 8 failed / 2 passed。after：按鈕 10 個（兩寬度）；vitest 278 → 293 passed（glossary.test 13＋ui.test 2）；Playwright 12 → 24 passed（Tab→Enter 展開 `aria-expanded=true`＋`checkVisibility()` true → Space 收合 false；滑鼠；取名模式鍵盤＋兩模式 aria-controls id 不重複；名詞全展開 390px scrollWidth 390 = clientWidth 390）；`npm run build` 過。變異測試 3 次皆紅後以 checksum 還原：藏干 `source.note` 清空 → vitest 1 failed；拿掉 aria-expanded 同步 → E2E 4 failed；`[hidden]` 去 `!important`＋`.term-text{display:block}` → E2E 4 failed。截圖 scratchpad `B4-before-*`／`B4-after-*`（390／1280）。Codex review APPROVE（3 NIT，其中兩項已補測試）。
- notes: 依據（istj）：WAI-ARIA APG Disclosure pattern（https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/）「Enter／Space: activates the disclosure control and toggles the visibility」、「aria-expanded set to true／false」、aria-controls 指向內容——原生 `<button>` 的 Enter／Space 會觸發 click，故只掛一個 click 處理（`handleTermToggle`，`src/ui-shared.ts`）。出處：五格五條沿用 `numerology-81.json` 的 sanmin 原文（`wugeRules.$quote`）；三才沿用 tianjige；十神 daokeyi、藏干 deeporacle＋《淵海子平》（皆 `hidden-stems.json` 既有引用）；用神 minglifenxi.cn（`yongshen.json` 既有引用，curl 取原文「用神是八字命局最需要的那个五行…」「身旺喜克泄耗，身弱喜生扶」），文字明示「各家判法不一，本站採自訂的操作化規則…不是古籍定論」；真太陽時為新增出處 zh.wikipedia〈太陽日〉（curl 逐字比對「視太陽日（英語：apparent solar day）是依據真太陽定義的…」「平太陽時和視太陽時的差值就是均時差。」；WebFetch 摘要版與原文不符，已以 curl 原文為準）。資料形狀：`{ term, text, source: { note, url } }`，`GLOSSARY`／`glossaryOf()` 由 `src/data/index.ts` 匯出。決策：①按鈕放在：五格各格名稱旁、三才配置標題、用神標題、時間校正標題的「真太陽時」旁、八字命盤四柱下新增一行圖例（十神、藏干）；②取名模式也在說明區加一列（三才＋五格），不逐組重複放（組合數十組）；id 以 `term-<analysis|naming>-<index>` 區分兩模式；③資料來源依網址合併成列（「名詞解釋・天格、人格、地格、外格、總格」）；④展開只切換顯示、不重算重繪。Deviation：`.grid-item` 名稱欄 3.25rem → 5rem 放得下按鈕（取名模式的格子也跟著變寬）；按鈕不放進 `.grid-item__name`（首輪 E2E 抓到名稱文字變「天格?」），改包一層 `.grid-item__head`。雷：`tools/` 在 tsconfig include 內，暫存的 `.ts`（即使在 gitignore 的 tools/raw）會讓 `npm run build` 的 tsc 失敗，暫存腳本要放 scratchpad 或用 `.mjs`。

## B5. 分析卡片（Canvas PNG＋Web Share／下載）
- status: DONE(5a3344c)
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
- evidence: before（HEAD edde6ef）新 `e2e/card.spec.ts` 6 failed（無按鈕）→ after 6 passed：下載路徑（canShare/share 設為 undefined）檔名 .png、PNG signature、IHDR 1080×1350；分享路徑（stub）`__shared.files[0].type==='image/png'`、size>0、未觸發 download；AbortError 路徑 share 呼叫 1 次、不下載、無 pageerror；三者點擊前後 `page.url()` 相同。vitest 293 → 299 passed（`src/card/layout.test.ts` 6：王小明 2024-03-15 10:30 臺北市 繞過型別塞 hour/minute/place/county → 文字不含 `10:30`／`10 時`／臺北、JSON 無 hour/minute/place/county；無時辰無四柱無八字；無四柱時傳入八字標籤也濾掉；1985-02-04 立春兩生肖＋「王（牛）」「王（鼠）」；不計數 regex）。test:e2e 24 → 30 passed，390px scrollWidth 390 = clientWidth 390。build OK。變異測試（sha1 還原）：生日列漏時分 → vitest 1 failed；拿掉 AbortError 分支 → E2E 2 failed；canvas 寬 −80 → E2E 2 failed。grep `location.search|hash|history.pushState|replaceState` 無命中；`package.json` 無 `dependencies`。卡片 PNG（with-time／no-time／lichun 歐陽明華）與摘要區 390／1280 截圖在 scratchpad `B5-card-*`、`B5-after-summary-*`。Codex review APPROVE（EVIDENCE: none）。
- notes: istj 依據：W3C Web Share（https://w3c.github.io/web-share/）share()「If |global| does not have transient activation, return a promise rejected with a NotAllowedError」、canShare()「If the implementation does not support file sharing, return false」且 canShare 無 activation 要求；AbortError＝使用者取消或無分享目標。MDN Navigator.share：需 transient activation、secure context、`web-share` Permissions Policy；PNG 屬常見可分享類型。MDN toBlob：callback 可能收到 null、預設 image/png。API（B7 重用）：`shareOrDownload(file, title): Promise<'shared'|'cancelled'|'downloaded'>`、`downloadFile(file)`（`src/card/share.ts`）；`drawCard(layout)`／`canvasToPng(canvas)`（`src/card/draw.ts`，繪製與縮放重排都綁 `CardLayout`，B7 比較卡需另寫版面或擴充型別）；`cardLayout(input)`／`cardText(layout)`／`cardZodiacOf(z)`／`CARD_FOOTER`（`src/card/layout.ts`）。決策：①生日印使用者輸入的年月日（`run.date`），不是真太陽時校正後的日期——卡片「生日」是人填的那天；②share 只帶 `{ files, title }`（不帶 text/url，避免部分分享目標丟掉圖片）；③NotAllowedError 等非 AbortError 錯誤退回下載（例如繪製拖過 activation 期限），使用者仍拿得到圖；④檔名固定 `mio-shuming-card.png`，不含姓名；⑤按鈕放在摘要區底部（卡片內容即摘要），旁邊 `role="status"` 在退回下載時說明原因；⑥卡片色值寫死 `style.css` `:root` 淺色值（Canvas 讀 CSS 變數會吃到深色模式），tone 對應沿用摘要區（neutral→mid、unknown→細框）；⑦標籤過多時整體縮放 0.92^n 重排（最多 8 次），保證不壓到署名。Deviation：brief 的「版面模型型別層面不讓時分與地點進來」——TS 結構型別擋不住帶多餘屬性的變數，故另加執行期逐欄取值＋繞過型別的 vitest 守衛。E2E 的下載路徑以 `addInitScript` 移除 canShare/share 強制走退回（本機 Windows Chromium 可能原生支援 Web Share），真實裝置的系統分享選單未實機驗（stub 驗呼叫形狀），交 B10 或使用者手機實測。

## B6. 收藏資料加存預產期（向後相容）
- status: DONE(e565a18)
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
- evidence: npm test 299 → 304 passed（新增 `src/naming-favorites.test.ts` 5 項：舊格式讀取 due 為 undefined、新格式 due 往返一致、due 形狀壞掉（字串 year／缺欄位／null）時該筆仍在且其餘筆不受影響、整包 JSON 壞掉回空陣列、非陣列內容回空陣列）。npm run test:e2e 30 → 34 passed（新增 `e2e/favorites.spec.ts` 2 項：`addInitScript` 預寫舊格式 localStorage → 載入頁面 → 收藏顯示正常且 storage 內容未被動過；新收藏存入當下 due，換一個預產期選同一個名字再收藏一次 → storage 仍 1 筆、due 已更新為新值）。npm run build（tsc --noEmit＋vite build）過。變異測試（已還原）：`isValidDue` 改成永遠回 true → `naming-favorites.test.ts`「due 形狀壞掉時該筆仍在」1 failed；dedupe 判斷 `existing === -1` 改成 `true`（永遠 push）→ `e2e/favorites.spec.ts`「同名不同預產期更新」2 failed（storage 變 2 筆）。Codex CLI review（`tools/raw/review-B6.md`）VERDICT: APPROVE，EVIDENCE: none。
- notes: 決策：①沿用 v1 key，不升版不寫遷移——`due` 是可選欄位，`JSON.parse` 舊資料後 `due` 天生 `undefined`，讀寫天然相容，無需一次性遷移腳本。②`isValidDue` 只驗證 `year/month/day` 是有限數字（`Number.isFinite`），不驗證合法日期範圍（如月份 1–12、日期依月份天數）——過寬鬆的壞資料不會被擋，但這是「壞掉的 due 當作不存在」判準之外的額外範圍檢查，SPEC/backlog 未要求；B7（`dueZodiac`）本身若拿到不合理數字自會回報未定，不在此收斂。③去重比對鍵為 `surname + givenName`：找到既有筆且 due 完全相同（含都是 undefined）則不寫入，避免無意義的 storage churn；找到但 due 不同則整筆覆寫（含 due）。④生肖顯示「未知」屬 UI 呈現，`favoritesSection` 目前不顯示生肖——SPEC #11 這段是為 B7 的比較視圖鋪路，B6 verify 清單只要求資料層（due 存得下、讀得回、壞掉不丟資料），未新增 UI 顯示，已在 review prompt 向 Codex 澄清此點，Codex 未提出異議。此為 istj 判斷：資料層 scope 與 UI 呈現 scope 分屬 B6／B7，B6 不做 UI 顯示變更。

## B7. 收藏比較＋比較卡片
- status: DONE(62cb86e)
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
- evidence: before（HEAD de3c388）新 `e2e/compare.spec.ts` 8 failed（無勾選框）→ after 8 passed（勾 1 停用／2 啟用／滿 5 個第 6 個 disabled 且提示「最多比較 5 個」、取消一個後恢復；比較視圖 thead 5 名、無天格列、生肖列「馬」「蛇 或 馬」「生肖未知」「羊」、單名外格「不計」；下載 PNG signature＋寬 1080；Web Share stub 帶 image/png 不下載；網址不變）。test:e2e 34 → 42 passed；npm test 304 → 314 passed（`src/card/compare-layout.test.ts` 10 項：日期 regex `/\d{4}[-/年]/` 不命中且 JSON 無 due/year/2026、立春窗兩肖、無 due 未知、不存在日期當未知、罕字據實回報）；build OK。390px 比較視圖 scrollWidth 390 = clientWidth 390（表格容器 720 > 324 內捲），1280 為 1280/1280。5 名比較卡 PNG 1080×2341。變異測試（sha1 還原 OK）：忽略立春窗 → vitest 2 failed；卡片印 due → vitest 1 failed；拿掉 5 個上限 → E2E 2 failed。截圖 scratchpad `B7-after-favorites-*`、`B7-after-compare-*`（390／1280）、卡片 `B7-compare-card-5.png`。Codex review（`tools/raw/review-B7.md`）VERDICT: APPROVE，EVIDENCE: none。
- notes: istj：重用 B5 已引用的 W3C Web Share／MDN（share 需 transient activation → 按鈕點擊中直接呼叫 `shareOrDownload`；AbortError 靜默），本項無新外部規格。API：`compareEntry(fav)`（`src/engine/compare.ts`，比較視圖與卡片唯一標籤來源，輸出不含 due）、`compareCardLayout(entries)`／`compareCardText`（`src/card/compare-layout.ts`）、`drawCompareCard(layout)`（`src/card/draw.ts`）。決策：①生肖字根標籤含姓（與 B3 摘要一致）；立春窗內依兩肖各列並標「字（生肖）」；無 due 或曆上不存在的 due → 「生肖未知」且不判字根。②比較視圖用 `<table>`（列＝項目、欄＝名字，列對齊好比較），包在 `.compare__scroll`（role=region、tabindex=0）內橫捲，列標題 sticky；單名外格列顯示「單名固定・不計」。③欄位順序照收藏清單，不依勾選先後或吉凶。④勾選只在記憶體；勾選變動或收藏增刪即關閉比較視圖，避免畫面與勾選不一致。⑤比較卡寬 1080、高 1350–2700 依內容加高，超過上限才縮字級（首版先封頂再縮，底部留大片空白，看圖發現後改成縮完再依內容定高）。⑥卡片檔名 `mio-shuming-compare.png`。⑦`TONE_CLASS` 從 main.ts 移到 ui-shared.ts 共用；draw.ts 抽出 groupsPass／paintFrame／paintFooter，B5 card.spec 6 項仍過。Deviation：brief 的「勾 6 個被擋」實作為滿 5 個時其餘勾選框 disabled（另有 change handler 保險擋第 6 個）。環境：B6 留下的 gitignored `tools/raw/b6-test.ts` 讓 `tsc` 失敗（已知雷），已移到 scratchpad `B7-env/`，未刪除。

## B8. Lighthouse 無障礙 ≥ 95
- status: DONE(dac5602)
- model: sonnet
- depends: B1、B2、B4、B5、B7
- spec: SPEC-v4 #19
- scope:
  - 先 `/mio-istj`：讀 Lighthouse accessibility 評分說明，確認三狀態的量測方式（結果頁需要互動後才出現，用 Lighthouse user flow `startTimespan`／`snapshot`，或 Playwright 產生狀態後以 `playwright-lighthouse`／CDP 量測——選一並記 notes）。
  - 量三狀態：首頁、分析結果（含時辰）、取名結果（展開一組候選字）。before 分數入 notes。
  - 修到三者皆 ≥ 95（常見：對比度、按鈕名稱、表單 label、heading 階層、`aria-pressed` 用法）。
  - 量測腳本入庫（`tools/lighthouse-a11y.mjs` 或 e2e 內），可重跑；**不進 CI 閘門**（SPEC 只要求附報告數字）。
- verify: before → after 三狀態分數表；`npm test`、`test:e2e` 綠。
- evidence: 三態 accessibility 分數（跑兩次一致）：首頁 95、取名結果（候選字展開）96、分析結果（含時辰）96，皆 ≥95，無需修對比度／label 等缺失。`npm test` 314 passed；`npm run test:e2e` 42 passed（mobile+desktop）；`npm run build` 過。Codex CLI review VERDICT APPROVE。
- notes: istj 依據：Lighthouse user-flows 官方文件（github.com/GoogleChrome/lighthouse/blob/main/docs/user-flows.md）——SPA 狀態互動後用 `flow.snapshot()` 稽核「當下 DOM」，不觸發導覽；自訂 `config` 需 `extends: 'lighthouse:default'` 否則報 `No artifacts were defined on the config`（踩過的坑，寫進腳本註解）。量測工具：`tools/lighthouse-a11y.mjs`（puppeteer 驅動、`onlyCategories:['accessibility']`），三態各自一次 navigate/timespan/snapshot，第三態（分析結果）用獨立分頁＋獨立 flow 避免跟取名狀態互相污染。Deviation：無，三態一次到位皆 ≥95，scope 預期的「常見缺失修復」步驟未觸發（B1–B7 先前已把無障礙基礎打好）。腳本非阻斷建議（Codex）已採納：`browser.close()` 包進 `try/finally`。不進 CI 閘門，依 SPEC 只需附報告數字。

## B9. 文件同步
- status: DONE(1bb3b46)
- model: sonnet
- depends: B0–B8 全部 DONE
- spec: Contract rule 4（doc-sync）
- scope:
  - `README.md`：簡介補分享卡片、收藏比較；「開發」段補 `npm run test:e2e` 與實際測試數（實跑取數，不抄舊值——現行 README 寫 41 項已過期）；「已知限制」補 Web Share 不支援時退回下載、卡片不印時分／出生地的隱私設計。
  - 若實作偏離 SPEC-v4 任何條文，在 `SPEC-v4.md` 與 `SPEC-v4.html` 對應條目加「修正」callout（格式比照 SPEC-v3 #3），並在決策紀錄表補一列。
- verify: `git diff` 審閱；README 內指令逐一實跑可用。
- evidence: `npm test` 14 files / 314 tests passed；`npm run test:e2e` 42 passed；`npm run build` 通過（tsc --noEmit + vite build）。
- notes: 逐條核對 B1–B8 backlog notes 中標記「Deviation」的段落（B1 截圖等效證據、B2 LINE/FB 待實測、B3 生肖字根分列與 tag--unknown 配色、B5 版面型別 vs 執行期守衛、B7 勾滿 5 個 disable）against SPEC-v4.md #1–21：均為 brief／內部實作層級落差，未牴觸 SPEC-v4 條文字面，故**未**加「修正」callout（與 SPEC-v3 #3 那種直接違反凍結文字的情況不同）。README 三處新增：功能簡介（分享卡片＋收藏比較）、`npm run test:e2e` 指令與實跑測試數（314／42，取代過期的「41 項」）、已知限制補 Web Share 退回下載與卡片隱私（不印時分／出生地／預產期）。Review：Codex CLI（`codex exec` 讀 `tools/raw/review-B9.md`）VERDICT: REQUEST_CHANGES，但 EVIDENCE 只指出 B2 的 LINE/FB 預覽待使用者登入實測——這是 B2 既有、已記錄、且 orchestration 規則明示可接受的 pendingUserVerification 狀態，不是本項 README diff 的缺陷，也不在 B9 scope 內（B9 無法代使用者登入 LINE/FB 除錯工具）；其餘 3 點證據（測試數字、分享/隱私敘述、其他 Deviation 免 callout 的判斷）皆 APPROVE，故未回頭修改，逕行採納。

## B10. 整體設計評審（主 agent）
- status: DONE(docs/design-review/2026-09-13-external-ui-critique.md)
- model: main
- depends: B9
- spec: SPEC-v4 #21；Contract rule 2a
- scope: 走 `/mio-mirror`：390／1280 兩寬度下首頁、取名結果、比較視圖、分析結果（含摘要與名詞展開）、分析卡片 PNG、比較卡片 PNG、頁尾——只餵截圖給禁止讀程式的 opus sub-agent，與自評對照；需修的開新 backlog 項（B11+）。
- verify: mirror 報告＋對照表；後續項目清單。
- evidence: 截圖 10 張（390/1280 × 首頁、取名結果、分析結果、比較＋兩張圖卡）；opus 只看截圖評審：competent 下緣；前三改善＝按鈕三級＋語意色歸位、結果優先＋降噪（含移除 UI 中 SPEC 編號／localStorage 等用語）、手機排版破損。自評對照已落檔。
- notes: 後續 UI 修正待使用者裁決範圍後開 B11+。另：CI 自 B8（dac5602）起 npm ci 失敗，主 agent 以 7c39bf2 修復鎖檔，CI run 34737756989 build+deploy success；Lighthouse 抽驗 95/96/96 與 B8 一致。

---

# 第二波 — UI 收斂第一輪（SPEC-v4 G 節 #22–#31，2026-09-13 追加凍結）

> 來源：`docs/design-review/2026-09-13-external-ui-critique.md` 的 ④⑤ 與開發者用語盲點。改動前截圖：`docs/evidence/v4-walkthrough/`（HEAD `7c39bf2`，被 gitignore，只在本機）。
> 依序跑 `/mio-boom --seq`：B11 → B12；B13 由主 agent 做。

## B11. 按鈕三級＋語意色歸位＋圖卡中性色
- status: DONE(50a616a)
- model: opus
- depends: B10
- spec: SPEC-v4 #22–#27
- scope:
  - `src/style.css`：新增 `--neutral`／`--neutral-soft`，淺色模式分別為 `#6B645A`／`#EEEBE6`；深色模式在 `@media (prefers-color-scheme: dark)` 內另訂，先算對比 ≥ 4.5:1 再寫。
  - 新增 `.tag--neutral`，並檢查 `.tag--flat` 的現有用途。
  - 按鈕：`.button` 分出 primary（現行實心）、`.button--secondary`、`.button--text` 三種修飾類。小按鈕（現行 `.button--inline`）統一高 36px、padding 0 14px、圓角 8px。依 #23 逐一套到按鈕上；用神覆寫切換鈕（`main.ts` 裡的 `button--on`）選中時改用 `--accent-soft` 底、`--accent` 字，不再出現綠色。
  - radio／checkbox 用 `accent-color: var(--accent)`，要涵蓋取名表單的單雙名 radio。
  - 語意色：
    - `src/ui-shared.ts` 的 `verdictClass` 把「中性」由 `tag--flat` 改為 `tag--neutral`。
    - `src/engine/summary.ts` 的 `SummaryTone`：確認 `neutral` 用在哪些標籤（用神五行、中性字），網頁摘要與圖卡的 neutral 都改成灰。
    - 「不計」（天格、單名外格，在 `naming-ui.ts` 的 `gridItem` skipLabel 與比較視圖）、「生肖未知」一律改灰。
    - 黃色只留給半吉與喜忌並見。
  - 候選字 chip（`.chip`）：中性字用 `--surface` 底、1px `--line` 框、`--ink` 字；喜字綠、忌字紅；`.chip--on` 為實心 `--accent`。
  - 圖卡：`src/card/draw.ts` 的 `TONE.neutral` 改用灰色色值（`COLOR` 常數新增 neutral 兩色，與 CSS token 同值）。**版式與 chip 形狀一律不動**（#27）。
  - 開工前 grep 整個 `src/` 裡的 `tag--flat`、`tag--mid`、`button--inline`、`button--on`，逐一列清單再改，避免漏掉某個畫面。
- verify:
  - before：`node tools/raw/mirror-shots.mjs <scratchpad>/B11-before`（要先起 `vite preview :4173`；腳本 gitignore，找不到就依 `docs/evidence/v4-walkthrough/` 的畫面清單重寫一份）。
  - after：同一支腳本拍到 `<scratchpad>/B11-after`。
  - Playwright 新增 `e2e/visual-tokens.spec.ts`，兩個寬度都跑，用 `getComputedStyle` 斷言：
    - 「移除」按鈕背景透明；「帶入完整分析」背景是 surface 色、邊框是 accent 色；「比較勾選的名字」背景是 accent 色。
    - 一個中性候選字 chip 背景是 surface 色；天格「不計」標籤背景是 `rgb(238, 235, 230)`。
    - 單雙名 radio 的 `accent-color` 非 auto。
    - 分析結果頁任何按鈕的背景都不是綠色系（good 色）。
  - vitest：圖卡的 tone 對照表中 neutral 用灰色值（純資料，可測）。
  - 深色模式：用 Playwright `colorScheme: 'dark'` 量灰色 chip 的對比（程式算，≥ 4.5）。
  - 變異測試：把 `verdictClass` 的中性改回 `tag--flat`，visual-tokens spec 要紅。
  - `npm test`、`npm run test:e2e`、`npm run build` 全綠。
- evidence: before（HEAD 74a770b build）新 `e2e/visual-tokens.spec.ts` 6 failed／2 passed（radio accent-color auto、移除 bg rgb(140,47,31)、用神覆寫「木」bg 綠 rgb(47,107,63)）→ after 8 passed（390／1280）。npm test 314 → 318；test:e2e 42 → 50；build OK。深色 tag--neutral 7.02:1、中性 chip 13.99:1。變異：verdictClass 中性改回 tag--flat → 2 failed。續跑重驗（2026-09-13）數字全數成立，截圖 scratchpad `B11-after3/`。Codex review（附裁決重跑）：VERDICT APPROVE，EVIDENCE none。CI run 34741873417 綠。
- notes: Deviation（實文與 brief 衝突）：`SummaryTone.neutral` 實際同時涵蓋 半吉、喜忌並見、中性、用神；照 brief 只把 neutral 改灰會讓半吉／喜忌並見變灰（第一版截圖卡片三才「半吉」變灰，已抓到）→ 新增 tone `mid`（summary.ts、compare.ts），`TONE_CLASS.mid=tag--mid`、`CARD_TONE.mid`=黃。預設決策：①#23 未列的按鈕「改以…重算」（夏令、早子時）與「恢復本站判定」→ 次要；②#25 黃色只留半吉／喜忌並見 → 身強／身弱（原 bad／mid）改灰、姓名匹配「五行不明」（原 mid）改 tag--unknown、時間校正「合計」（原 tag--flat）改灰，`.tag--flat` 已無用途刪除；③比較視圖「生肖未知」改灰色標籤、「無預產期，不判」tag--unknown→tag--neutral；④深色 `--neutral #bdb5ab`／`--neutral-soft #2e2a26`；⑤`.chip--on` 字色用 `var(--surface)`（深色模式才不會淺字配淺底）；⑥用神覆寫鈕加 `.button--toggle`，選中 accent-soft 底＋accent 字＋accent 框。測試雷：Chromium getComputedStyle 把 1.5px 框線取整成 1px（DPR 1／2／3 實測皆 1px），且簡寫含 var() 時 CSSOM 長寫屬性為空 → E2E 改讀樣式表宣告值（cssText）；vitest 會把 CSS `?raw` import 清成空字串，draw.test.ts 改驗字面色值，網頁端由 E2E computed 驗同值。**CONSULT 問題**：SPEC #25「改用灰色：…用神五行標籤」——讀法 A（已實作）＝摘要區「用神 木、金、水」標籤（外部評審指的琥珀色那顆）；讀法 B（Codex）＝連用神詳情區「喜用」五行（現綠）也改灰，若 B 則「忌神」（現紅）是否一併改灰。WIP 留在工作樹（8 追蹤檔＋2 新檔），備份 `scratchpad/B11-wip/B11-tracked.patch`。


  - **主 agent CONSULT 裁決（2026-09-13）：採解讀 A。** #25「用神五行標籤」指摘要與圖卡上那顆「用神 木、金、水」琥珀色 tag（SPEC 起草依據是 mirror 自評第 1 點與評審 ⑤）。用神詳細區塊的「喜用」綠（main.ts:214）與「忌神」紅（main.ts:215）表達的是有利／不利五行，屬正當語意，**維持不變**。Codex 的 REQUEST_CHANGES 依此裁決視為已處理：重跑 review 時把本裁決放進 prompt。另認可 deviations 1–5（新增 mid tone 保住半吉黃色、未列按鈕預設次要、身強身弱改中性、五行不明改 unknown、1.5px 以 cssText 驗）。WIP 留在工作樹（備份於 scratchpad/B11-wip/），續跑者直接在原地接手，不需要乾淨工作樹。
  - 續跑者（2026-09-13）：未再改實作；採納 Codex 非阻擋建議，visual-tokens 的 radio／checkbox `accentColor` 斷言由「非 auto」收緊為「等於 LIGHT.accent」（8 passed）。

## B12. 拿掉畫面上的開發者用語＋守衛
- status: DONE(d7e0098)
- model: sonnet
- depends: B11
- spec: SPEC-v4 #28–#30
- scope:
  - 先寫守衛，而且守衛要先紅：`e2e/no-dev-jargon.spec.ts`。依序走過這些狀態，每一步讀 `document.body.innerText`，斷言不含 `SPEC`、`localStorage`、`curl`、`kTotalStrokes`、`kRSUnicode`、`$comment`、`tools/`、`src/`（大小寫敏感，照原字比對）。
    1. 首頁
    2. 取名結果，展開一組並展開忌字
    3. 帶預產期收藏與比較視圖（用 `addInitScript` 預寫收藏）
    4. 分析結果：有時辰
    5. 分析結果：無時辰（會出現 `main.ts:690` 那句）
    6. 名詞說明全部展開
    7. 頁尾與資料來源區塊
    
    斷言失敗時要印出命中的字與前後 20 字，方便定位。
  - 已知命中點（2026-09-13 grep）：
    - `src/main.ts:690`「（SPEC-v2 #4）」
    - `src/naming-ui.ts:206`「（SPEC-v3 #8）」
    - `src/naming-ui.ts:279`「（localStorage）」
    - `index.html:228`「（localStorage）」
    - 資料檔備註：`src/data/numerology-81.json`、`src/data/ganzhi.json` 的「已 curl 逐字比對」；`yongshen.json`、`glossary.json`、`dst-taiwan.json` 等若有被渲染的欄位含禁用字也要改（`$comment` 欄位不會被渲染，不必改）。
    - **以守衛實跑的命中為準**，上面只是起點。
  - 改寫原則（#29）：
    - 「」內的原文引文一字不改，只改描述查證方式的開發者用語，例如「已 curl 逐字比對」改為「已與原網頁逐字核對」。
    - 「localStorage」改為「只存在這台裝置的瀏覽器」。
    - SPEC 編號直接刪掉，句子要讀得通。
    - 由腳本產生的資料檔（`kangxi-strokes.json`、`components.json`、`solar-terms.json`、`char-wuxing.json`、`locations.json`）若被渲染的欄位命中，要改 `tools/gen-*.mjs` 後重跑該腳本，不可手改 JSON；重跑需要 `tools/raw/` 的上游檔，缺檔時回報 BLOCKED 並說明缺哪個。
    - `src/data/index.ts` 若用 `source` 欄位組字串，禁用字可能來自組字邏輯，也要查。
  - 既有 vitest／E2E 若有斷言依賴舊字串（例如頁尾 spec 的「localStorage」字樣），同步改斷言，並在 notes 記錄。
- verify:
  - before：守衛在改寫前實跑，記錄紅燈數量與命中清單（貼進 notes）。
  - after：守衛綠。
  - 變異測試：在 `naming-ui.ts` 放回「（SPEC-v3 #8）」，守衛要紅，然後還原。
  - `git diff src/data/` 審閱：「」內的引文沒有被動到（可用腳本抽出前後所有「…」片段比對是否相同，把結果貼進 evidence）。
  - `npm test`、`npm run test:e2e`、`npm run build` 全綠。
- evidence: before：守衛（e2e/no-dev-jargon.spec.ts）首跑 7/7 紅（首頁 localStorage、取名結果 SPEC-v3 #8、收藏 localStorage、分析有時辰 localStorage、無時辰 timeout（測試流程問題）、名詞展開 localStorage、頁尾 localStorage）。逐輪修正並被 Codex review 4 輪找出更多真實命中：SPEC-v3 #3／「已 curl 逐字比對確認」（numerology-81.json）、kTotalStrokes／kRSUnicode（kangxi-strokes.json，改生成腳本重跑）、tools/（components.json 的 variantTable，改生成腳本重跑）、SPEC-v2 #24（dst-taiwan.json 的 DST 邊界 caveat）、SPEC-v3 #5（naming.ts 的次佳組合 relaxedNote）。守衛最終涵蓋 12 個畫面狀態（首頁、取名結果＋忌字展開、次佳組合、無組合、立春臨界、收藏＋比較視圖、分析有時辰、夏令時間邊界不確定、手動覆寫用神、無時辰、名詞說明全展開、頁尾＋資料來源）× mobile/desktop＝24，全數 after 綠。變異測試 4 次（SPEC-v3 #8、SPEC-v2 #24、SPEC-v3 #5 各放回一次，另一次是最初 mutation round）皆使對應案例轉紅，還原後轉綠。`git diff src/data/numerology-81.json` 逐條核對 13 段「」引文前後逐字相同（Codex 亦重複核對過）。`npm test` 318 passed（不變）；`npm run test:e2e` 全量 74 passed；`npx vite build` 過。CI run 34743320389：build job npm test/test:e2e/build 綠，deploy 綠（首次因 e2e/favorites.spec.ts 既有測試在高並發下逾時 flaky，`gh run rerun --failed` 重跑後綠，非本項改動所致——該測試與檔案不在本項 diff 內）。Codex CLI review 4 輪：round1/2/3 REQUEST_CHANGES（分別指出 DST 邊界、比較視圖未真正開啟、忌字選擇器錯誤、次佳/無組合分支未覆蓋等）逐輪修正，round4 VERDICT: APPROVE。
- notes: 已知命中點清單中的 `ganzhi.json`「已 curl 逐字比對」與 `yongshen.json` 的 SPEC 編號備註，經確認 `GANZHI_SOURCE`／相關 `yongshen.json` 欄位在目前 UI 沒有消費端（grep 全 repo 沒有任何 `.ts` 讀取並渲染這些欄位），不屬於 #28「畫面文字」違規，維持原樣（Codex round3 review 已認可此判斷）。Deviation：`src/main.ts:114`（index.html 註解裡的「SPEC #7」）是 HTML comment，不會進 `document.body.innerText`，不算違規，未改。CI 一次性 flaky（favorites.spec.ts 在 12-worker 高並發下逾時）與本項改動無關，`gh run rerun --failed` 後綠，未修改該測試邏輯。

## B13. 回歸檢查＋第二次 mirror（主 agent）
- status: DONE(docs/design-review/2026-09-13-external-ui-critique-round2.md)
- model: main
- depends: B12
- spec: SPEC-v4 #31
- scope:
  - `node tools/lighthouse-a11y.mjs`：三態分數 ≥ 95。
  - `tools/raw/mirror-shots.mjs` 拍 after 截圖，與 `docs/evidence/v4-walkthrough/` 做前後對照。
  - 再跑一次 `/mio-mirror`，評審 prompt 要標明哪些是改動前的舊圖。
  - 結論追加到 `docs/design-review/`。
- verify: Lighthouse 數字、前後截圖、mirror 對照。
- evidence: Lighthouse 三態 95／96／96（與改動前相同）；npm test 318、test:e2e 74 全綠；CI run 34743624357 success。AFTER 截圖 docs/evidence/v4g-walkthrough/（本機）。第二輪 mirror：等級仍 competent（較接近 polished）；三件事皆「部分做到」。殘留：分享卡片實心 vs 輸出比較卡片外框（#23 分配表造成）、選中態 accent-soft 與忌同色（#23 造成）、畫面仍有 docs/v2-sources.md、「資料檔的 conflicts」、未渲染 ** 星號（#28 列舉不全，B12 符合原文）、模式分頁與 CTA 同重、1280 比較表也被裁切。
- notes: 7c39bf2（主 agent 修鎖檔）獨立 review：Codex CLI 卡住逾 90 分鐘後停止，改由 diff-reviewer(sonnet) 審，VERDICT APPROVE，五條驗收全 MET（僅 package-lock 變動、proxy-agent 8.0.2／6.5.0 兩鏈並存、npm ci --dry-run 乾淨、CI 34737756989 success）。CI flake：e2e/favorites.spec.ts 在 CI 12 workers 下曾逾時一次（run 34743320389，rerun 綠），待處理。後續修正待使用者裁決範圍。

---

# 第三波：UI 收斂第二輪（SPEC-v4 H 節 #32–#39，2026-09-13 追加凍結）

> 來源：`docs/design-review/2026-09-13-external-ui-critique-round2.md`。專修 G 節條文本身造成的殘留。
> 改動前截圖：`docs/evidence/v4g-walkthrough/`（`0227200`，gitignored，只在本機）。
> 依序跑 `/mio-boom --seq`：B14 → B15；B16 由主 agent 做。
> **本波教訓（memory `spec-rules-can-create-the-inconsistency`）**：
> - 同類動作同一層級。
> - 選中態不借語意色淡底。
> - 內容守衛用類別規則，不只列舉字詞。

## B14. 元件層級：分頁、選中態、說明框、匯出鈕＋同類一致性測試
- status: DONE(1643fcf)
- model: opus
- depends: B13
- spec: SPEC-v4 #32–#35、#38（含 #23 修正說明）
- scope:
  - **模式分頁**（`index.html` 的 `nav.modes`／`.mode-tab`；`src/style.css` 的 `.modes`、`.mode-tab`、`.mode-tab[aria-pressed='true']`）：
    - `.modes` 改為外框底 `#ECE8E2`、padding 4px、圓角 12px、gap 4px。
    - 選中項 `--surface` 底、`--accent` 字、`box-shadow: 0 1px 2px rgba(0,0,0,.08)`。
    - 未選項透明底、`--ink-soft` 字，`small` 副標沿用 `--ink-soft`。
    - 外框底建議新增 token（例如 `--track`），深色模式在 `@media (prefers-color-scheme: dark)` 另訂，先算對比 ≥ 4.5:1 再寫。
    - 保留 `aria-pressed` 與既有 E2E 用的按鈕名稱（`/分析名字/`、`我要取名`）。
  - **選中態通則 #33**：
    - `src/style.css` 的 `.button--toggle.button--on`（現為 `--accent-soft` 底）改為實心 `--accent` 底、白字、`--accent` 框。
    - grep 全 `src/` 與 `index.html` 的 `--on`、`aria-pressed='true'`、`:checked`、`[aria-selected`，找出所有選中態，確認沒有任何一個使用 `--accent-soft`／`--good-soft`／`--bad-soft`／`--mid-soft` 當底。`.chip--on` 已是實心 accent，保持不變。
  - **名詞說明框 #34**：`.term-text` 背景由 `var(--accent-soft)` 改為中性底 token（淺色 `#F3F1EC`；深色另訂，內文對比 ≥ 4.5:1）；左側 3px `--accent` 線保留。
  - **匯出鈕 #35**：`src/main.ts:368` 的「分享卡片」加上 `button--secondary`（與 `src/naming-ui.ts:391`「輸出比較卡片」相同 class 組合）。
  - **同類一致性測試 #38**：新增或擴充 `e2e/visual-tokens.spec.ts`，兩個寬度：
    - 做出分析結果與比較視圖，讀兩顆匯出鈕的 `background-color`、`border-color`、`color`，斷言三者完全相等。
    - 另斷言：
      - 選中的用神覆寫開關為實心 accent 底、白字。
      - `.term-text` 展開後背景為 `rgb(243, 241, 236)`（淺色模式）。
      - 選中分頁背景為 surface、文字為 accent；未選分頁背景透明。
  - 既有 `e2e/visual-tokens.spec.ts` 裡若有斷言 `.term-text`、分頁或用神開關的舊色（例如 accent-soft），依新規格更新，並在 notes 記錄。
- verify:
  - **before**：在改動前的 build 上跑新增斷言，記錄紅燈數量與實際色值。
  - **after**：全綠。
  - **截圖**：起 `npx vite build && npx vite preview --port 4173 --strictPort`，再用 `node tools/raw/mirror-shots.mjs <scratchpad>/B14-after` 拍 390／1280 與兩張卡。
  - **變異測試**：
    - 把「分享卡片」的 `button--secondary` 拿掉，#38 一致性斷言要紅。
    - 把 `.button--toggle.button--on` 改回 `--accent-soft`，選中態斷言要紅。
    - 兩者都要還原。
  - **深色模式**：用 Playwright `colorScheme: 'dark'` 量分頁未選字與外框底、說明框內文與底的對比，程式計算須 ≥ 4.5。
  - `npm test`、`npm run test:e2e`、`npm run build` 全綠。
- evidence: before（新斷言跑舊 CSS）visual-tokens 10 failed／6 passed → after 16/16。#38 兩匯出鈕 bg rgb(255,255,255)／color rgb(140,47,31)／四邊框 rgb(140,47,31) 完全相等（before 分享卡片 bg rgb(140,47,31) 白字）。分頁外框 rgba(0,0,0,0)→rgb(236,232,226)；選中分頁 surface＋accent、未選透明＋rgb(92,85,77)。說明框 rgb(243,230,226)→rgb(243,241,236)、3px accent 左線保留。用神開關選中 rgb(243,230,226)→rgb(140,47,31) 白字。深色對比：分頁未選 6.22、選中 6.17、開關選中 6.17、說明框 12.66。變異：拿掉分享卡片 button--secondary → #38 紅 2/2；開關改回 accent-soft → 紅 2/2；皆還原。npm test 318、test:e2e 82（原 74）、build ok。截圖 scratchpad `B14-after/`（390／1280＋兩張卡）、`B14-crop-*`。Codex VERDICT: APPROVE。CI run 34754780218 success（build＋deploy）。
- notes:
  - **Deviation 1（#33 範圍）**：backlog 的 grep 清單沒列 `aria-expanded`，但 `.term-toggle[aria-expanded='true']`（名詞「?」鈕展開態）也用 `--accent-soft` 底；依 #33「所有切換鈕的選中態…不得使用任何語意色淡底」一併改實心 accent＋`--surface` 字，並加斷言。其餘 `*-soft` 底（`.error`、`.notice`、`.tag--*`）是狀態／語意標籤，不是選中態，不動。`.chip--on` 原本就是實心，不動。
  - **Deviation 2（白字）**：選中態字色用 `var(--surface)` 不寫死 `#fff`：淺色 surface 即白（符合 #33）；深色 accent 為淺色 #e2856f，白字只有 2.68:1，比照既有 `.chip--on` 用 surface（6.17:1）。
  - 新 token：`--track`（淺 #ece8e2／深 #2e2a26）、`--note-bg`（淺 #f3f1ec／深 #2a2622）。`.mode-tab` 拿掉邊框、內圓角 8px、padding 0.7rem→0.6rem；刪除選中分頁 `small` 白字規則，副標沿用 ink-soft。深色選中分頁（surface）比外框暗，靠 accent 字與陰影區分，留給 B16 mirror 看。
  - 既有斷言更新：`分析結果` 測試原斷言開關選中 `accentSoft`、分享卡片 bg `accent`（主要），改為實心 accent 白字、分享卡片 surface＋accent 框。按鈕名稱（`/分析名字/`、`我要取名`）與 `aria-pressed` 保留。
  - Codex 兩個 NIT 已採納：#38 比對四邊框色；深色測試釘住選中分頁與開關的實際色值。加強後的 #38 未再重跑變異（前一版同一語意已紅）。
  - 未改資料來源文字（留給 B15）。

## B15. 資料來源文字改人話＋守衛類別規則
- status: DONE(8dab01a)
- model: opus
- depends: B14
- spec: SPEC-v4 #36–#37（沿用 #29 的改寫原則）
- scope:
  - **先寫守衛，而且要先紅**。擴充 `e2e/no-dev-jargon.spec.ts`：保留 `BANNED` 列舉，新增 `BANNED_PATTERNS`，在既有 12 個狀態逐一套用；命中時印出類別名、命中字串與前後 20 字。
    - 路徑 `/[\w.-]+\/[\w./-]+\.(md|ts|mjs|json)\b/`
    - 檔名 `/\b[\w-]+\.(txt|csv|xml|zip|md|json|mjs|ts)\b/`
    - Markdown 粗體 `/\*\*[^*\n]+\*\*/`
    - Unicode 欄位名 `/\bk[A-Z][A-Za-z]+\b/`
    - 內部欄位名 `/\bconflicts\b/`
  - **已知命中點**（2026-09-13 主 agent 以腳本掃渲染欄位取得，以守衛實跑為準）：
    - `src/data/yongshen.json`：`strength.ruleSource.note` 有 `docs/v2-sources.md`；`strength.operationalRules.congGe` 有 `**永遠不改判用神**`。
    - `src/data/glossary.json`：用神詞條 `source.note` 有 `docs/v2-sources.md`。
    - `src/data/char-wuxing.json`：`source.wuxing.dataset` 為 `gsc_pinyin.csv`；`source.wuxing.caveat` 有 `**來源未交代判定依據**`；`source.common.dataset` 為 `kBigFive`；`source.common.caveat` 有 `**不等同**`。先查它是人工檔還是腳本產生（找 `tools/gen-*.mjs` 中寫入 char-wuxing 的腳本），依 #29 決定改法。
    - `src/data/components.json`：`source.ids` 為 `ids.txt`（腳本產生，改 `tools/gen-components.mjs`）。
    - `src/data/kangxi-strokes.json`：`source.unihan` 為 `Unihan_IRGSources.txt`、`source.cjkRadicals` 為 `CJKRadicals.txt`（腳本產生，改 `tools/gen-kangxi-strokes.mjs`）。
    - `src/ui-shared.ts:138`：「分歧記於資料檔的 conflicts」，改成人話，例如「各家分歧另有記錄，本站不擅自調和」。
    - `src/ui-shared.ts` 的 `sourcesSection`：連結文字目前是整串 URL（`${esc(url)}`），URL 裡含 `Unihan_OtherMappings.txt`、`Unihan.zip` 等檔名。改為顯示網域加 ↗（例如 `unicode.org ↗`），`href` 不變；可用 `new URL(url).hostname` 去掉 `www.`，URL 無效時照 #36 精神顯示「來源連結 ↗」。加 `aria-label` 帶完整來源標題，維持 Lighthouse 連結名稱分數。
  - **改寫原則**：
    - 「」內原文引文一字不改。
    - Markdown 星號直接移除（保留文字）。
    - 上游檔名與欄位名改人話，例如 `Unihan_IRGSources.txt` 改「Unicode 漢字資料庫（Unihan）的部首筆畫欄位」、`kBigFive` 改「Big5 對照欄位」、`gsc_pinyin.csv` 改「開源漢字五行資料表」、`ids.txt` 改「漢字結構拆解表（IDS）」。
    - 腳本產生的資料檔不可手改 JSON，要改 `tools/gen-*.mjs` 後重跑；缺 `tools/raw/` 上游檔時回報 BLOCKED 並說明缺哪個。
    - 重跑後逐欄比對新舊 JSON，確認只有 `source` 欄位變動（B12 的做法）。
  - 既有 vitest／E2E 若有斷言依賴舊字串或整串 URL 的連結文字（例如 glossary／sources 的測試），同步更新並在 notes 記錄。
- verify:
  - **before**：守衛在改寫前實跑，記錄紅燈數量與各類別命中清單（貼進 notes）。
  - **after**：守衛全綠。
  - **變異測試**：每個類別各一次，共五次，各自還原。例如在某 note 放回 `docs/v2-sources.md`、`**x**`、`ids.txt`、`kBigFive`、`conflicts`，逐一確認守衛變紅。
  - **資料完整性**：
    - `git diff src/data/` 審閱：「」內引文沒被動到（抽出前後所有「…」片段比對，結果貼進 evidence）。
    - 腳本重產的 JSON 逐欄比對，只有 `source` 變動。
  - **Lighthouse**：`node tools/lighthouse-a11y.mjs` 三態仍 ≥ 95，連結文字改短後要確認沒掉分。
  - `npm test`、`npm run test:e2e`、`npm run build` 全綠。
- evidence: 守衛（BANNED＋BANNED_PATTERNS 五類）before 舊 build 20 failed／4 passed（每寬 10/12 紅，首頁與收藏比較兩態本就無來源區塊）→ after 24/24。變異 5 類各一次（docs/v2-sources.md、`**x**`、ids.txt、kBigFive、conflicts 注入來源區塊）皆紅且類別正確，已還原。重產 JSON 逐欄比對：char-wuxing 只變 source.{wuxing,common}.{dataset,caveat}、components 只變 source.ids、kangxi-strokes 只變 source.unihan（生成器自檢 OK）。「」引文 7 檔 44 段前後逐字相同。連結 `unicode.org ↗` 等，href 完整保留。npm test 318→321（新 src/ui-shared.test.ts 3 條）；test:e2e 82 passed；build OK；Lighthouse 95／96／96（不變）。截圖 scratchpad `B15-before/`、`B15-after/`、`B15-after-sources-390.png`。Codex VERDICT: APPROVE（EVIDENCE none）。CI run 34755735858 success。
- notes:
  - before 紅燈清單（每個有來源區塊的狀態都相同）：檔案路徑 docs/v2-sources.md（glossary 用神 note）；檔名 Unihan_IRGSources.txt、Unihan.zip、gsc_pinyin.csv、Unihan_OtherMappings.txt、ids.txt、v2-sources.md；Markdown 粗體 `**來源未交代判定依據**`、`**不等同**`；Unicode 欄位名 kBigFive；內部欄位名 conflicts。
  - Deviation 1：brief 列的 yongshen.json `ruleSource.note`（docs 路徑）與 `congGe`（`**`）守衛實跑**未命中**（目前無 UI 消費端）；仍依 #36「資料檔一律存純文字」一併修，並把非 `$` 鍵值中的 `**` 也去掉（yongshen 得地、ganzhi.caveat、hidden-stems classical.note）。`$comment`／`$operationalized` 屬註解不動；ganzhi.json 未渲染 note 的 docs 路徑不在 #36（畫面文字）範圍，未改。
  - Deviation 2：URL 連結文字改網域後，URL 裡的 Unihan.zip／Unihan_OtherMappings.txt 自然消失；aria-label 為「{標題}來源：{網域}（另開新視窗）」，含可見文字（label-in-name）。
  - 用詞決策：kangxi unihan 改「Unicode 漢字資料庫（Unihan）的部首筆畫欄位」；components ids 改「漢字結構拆解表（IDS，cjkvi-ids 專案）」；gsc 改「開源漢字五行資料表（ben-hua/general_standard_chinese，…）」保留 repo 名作為來源名。
  - 既有測試無依賴舊字串（ui.test.ts 的「不等同」仍在）。未改元件顏色。

## B16. 回歸＋第三次 mirror（主 agent）
- status: DONE(docs/design-review/2026-09-13-external-ui-critique-round3.md)
- model: main
- depends: B15
- spec: SPEC-v4 #39
- scope:
  - `node tools/lighthouse-a11y.mjs` 三態 ≥ 95。
  - `tools/raw/mirror-shots.mjs` 拍 AFTER 到 `docs/evidence/v4h-walkthrough/`，與 `v4g-walkthrough/` 對照。
  - 第三次 `/mio-mirror`，prompt 明標 BEFORE 與 AFTER，並列出本輪只改了哪幾件。
  - 結論與自評對照追加到 `docs/design-review/`。
- verify: Lighthouse 數字、前後截圖、mirror 對照。
- evidence: Lighthouse 三態 95／96／96（不變）；CI 34755735858、34755839533、34755933722 皆 success；AFTER 截圖 docs/evidence/v4h-walkthrough/（本機）。第三輪 mirror：competent（中上），未跨級；五件事 ①②③④ 做到、⑤ 部分做到（取名結果頂部裸網址、repo 名、dataset 編號、0x 碼位、CHISE 內文網址仍在）。本輪新增問題：選中態實心磚紅與凶／忌同色相（用神覆寫木金水看起來像選了三個凶）、「?」展開態實心紅圓像警告徽章。
- notes: 後續範圍待使用者裁決。評審前三建議：資料來源收合＋拿掉結果頂部裸網址；標題窄寬直式堆疊＋選中態改墨色＋「?」不用實心；送出後結果優先。

## B17. 資料來源收合＋識別碼清除＋出錯捲動（主 agent）
- status: DONE(6ef8dda)
- model: main
- depends: B16
- spec: SPEC-v4 #40–#46（I 節，2026-09-13 凍結）
- scope:
  - `src/ui-shared.ts` `sourcesSection`：包成 `<details>`，摘要「資料來源（N 項）」，N＝rows.length；樣式沿用 `.combo > summary`。
  - `src/naming-ui.ts:161`：「出處：${url}」改網域 ↗ 連結（`linkText`）。
  - `tools/gen-char-wuxing.mjs`、`tools/gen-components.mjs`：改 dataset／caveat／ids 措辭（repo 名、0x 碼位、chise 網址），重產 JSON。
  - `src/naming-ui.ts` submit 的兩條錯誤路徑補 `scrollIntoView`。
  - `e2e/no-dev-jargon.spec.ts`：三類新規則＋來源狀態先展開 details。
  - 新 E2E：兩模式成功／出錯送出後結果頂端在視窗內。
- verify:
  - **before**：新守衛先對舊碼跑，記錄紅燈清單。
  - **after**：全綠；變異測試三類＋「拿掉展開」各一次。
  - 重產 JSON 逐欄比對只變 source 欄位。
  - `npm test`、`npm run test:e2e`、`npm run build` 全綠。
- evidence: 捲動前提實測（改動前）：成功送出兩模式兩寬 top=0；取名出錯 top=605/603 未捲動。守衛 before（舊 build＋新三類）20 failed／4 passed，命中 0xA440、0xC67E、ben-hua/general_standard_chinese、zhenyangze/chinese-wuxing、http://www.chise.org/、https://tianjige.club/tw/naming/wuge → after 全綠。變異 M1（注入 https://mut.example/x、foo-org/bar-repo、0x4E00＋拿掉取名出錯捲動）：三類皆紅、兩寬取名出錯捲動測試皆紅；M2（保留注入、拿掉展開）：來源狀態 2 passed＝守衛失明，證明展開必要；加 assertNoDevJargon 內展開全部 details.sources-toggle 後注入 → 20 failed／4 passed；皆已還原。重產 JSON 逐欄比對只變 char-wuxing.source.{wuxing.dataset,wuxing.caveat,common.dataset}、components.source.ids。頁長 390 取名 7482→3872、分析 9925→6735；1280 取名 6110→3459、分析 8383→6029。npm test 321→323；test:e2e 82→92；tsc OK；Lighthouse 95／95／96（取名態 96→95，唯一失分為既有深色模式送出鈕 2.68:1，本輪新連結的 1.76:1 已修）。Codex VERDICT: APPROVE（EVIDENCE none），其指出的 margin-bottom 被覆蓋已修。
- notes: before 截圖 `docs/evidence/v4i-before/`、after `docs/evidence/v4i-after/`（本機）。捲動斷言加嚴為「頂端貼齊或已捲到底」——單純「在視窗內」對舊碼也綠。Deviation：sources details 不掛 `.combo` class（naming toggle listener 與 4 支測試以 details.combo 為選擇器），改用共用 CSS 選擇器。既有問題未處理：兩模式 `#sources` id 重複（Codex 非阻擋）。

## B18. 回歸＋第四次 mirror（主 agent）
- status: DONE(docs/design-review/2026-09-13-external-ui-critique-round4.md)
- model: main
- depends: B17
- spec: SPEC-v4 #47
- scope: Lighthouse 三態 ≥ 95；AFTER 截圖 `docs/evidence/v4i-after/`；第四次 `/mio-mirror`；結論追加到 `docs/design-review/`。
- verify: Lighthouse 數字、前後截圖、mirror 對照。
- evidence: Lighthouse 95／95／96（取名態唯一失分為既有深色送出鈕 2.68:1）；AFTER docs/evidence/v4i-after/（本機）。第四輪 mirror：competent，未跨級。三件事：收合做到但收合列元件不及格（無 chevron、框中框）；網域連結做到；識別碼部分——分享圖卡頁尾印 github.io 帳號＋repo 名（Canvas 不在守衛範圍）、81 數理有對維護者說話的後設文字。
- notes: 評審前三建議：比較表溢出改直排卡；統一有箭頭的摺疊列（資料來源＋筆畫組）；分析頁細節預設收合＋說明字 13px。E2E「取名結果（展開候選字與忌字）」在 12 worker 並行下 12/12 逾時失敗、串行 6/6 通過（8.7s），屬負載不穩定。

## B19. 摺疊列統一（主 agent）
- status: DONE(315d7e8)
- model: main
- depends: B18
- spec: SPEC-v4 #48–#52（J 節，2026-09-13 凍結）
- scope:
  - `src/style.css`：摺疊列元件（`.combo`、`.sources-toggle` 共用）去框、分隔線、min-height 48px、右側 16px chevron（`--ink-soft`）、`[open]` 旋轉 180°、hover `--bg`、`:focus-visible` 2px `--accent`；`.cand-avoid` 加 12px chevron；150ms 動畫＋reduced-motion 關閉。
  - 資料來源卡：卡片內不再套框。
  - 新 E2E 類別規則：所有結果狀態每個 `details > summary` 有 chevron、展開前後 transform 不同、同變體計算樣式相同。
- verify:
  - **before**：新守衛先對舊碼跑（應紅：無 chevron）。
  - **after**：全綠；變異測試：各變體拿掉 chevron 一次。
  - `npm test`、`npm run test:e2e`、`npm run build` 全綠；深色模式截圖檢查 chevron 可見。
- evidence: 守衛 before（pre-J）4 failed「沒有 chevron」→ after 全綠。Codex 首審 REQUEST_CHANGES（旋轉只驗 first、一致性只比左右 padding 且不跨狀態、可見性可被 opacity:0 騙過、資料來源卡外圈不可點）→ 守衛重寫（兩模式全展開逐一驗、跨狀態基準、opacity/visibility/寬高、邊緣點擊）＋`#sources.card{padding:0;overflow:hidden}`；變異 5 項（第 n+3 組不轉、忌字 opacity:0、分析來源 padding 不同、卡片 padding 0.3rem、忌字 content:none）皆紅且類別正確 → 複審 APPROVE。第五輪 mirror 抓到桌機退步（絕對定位 chevron 讓 1280 寬 16 列都掉一顆標籤靠左）→ 桌機 grid：16 列 69px、標籤群右緣一致、0 重疊；手機流動＋1.9rem：13/16 列 74px（grid 會全部 102px）。hover 包 `(hover: hover)`，實測滑鼠點擊 focus-visible=false、Tab=true、觸控點擊無底色。test:e2e 96；Lighthouse 95／95／96。
- notes: 截圖 `docs/evidence/v4j-after/`（mirror 看的第一版）、`v4j-after3/`（修正版，本機）。量測腳本 `tools/raw/probe-combo-rows.mjs`。未解：桌機 16 列仍兩行（要拿掉「・吉」）、手機 3/16 列 102px。

## B20. 回歸＋第五次 mirror（主 agent）
- status: DONE(docs/design-review/2026-09-14-external-ui-critique-round5.md)
- model: main
- depends: B19
- spec: SPEC-v4 #53
- scope: Lighthouse 三態 ≥ 95；AFTER 截圖 `docs/evidence/v4j-after/`；第五次 `/mio-mirror`；結論追加到 `docs/design-review/`。
- verify: Lighthouse 數字、前後截圖、mirror 對照。
- evidence: Lighthouse 95／95／96；第五輪 mirror＋修正後聚焦複查（①部分 ②③④解決；A 經實測為截圖假象；B 已修）。
- notes: 下一輪候選：拿掉列表「・吉」讓標籤一行排完（桌機兩行、手機參差同源）；區塊標題手機斷字；比較表裁切；筆畫組展開區四層框與內距；忌字說明重複括號；圖卡網址；hover 底色 --bg 太淡。
