# 數名其妙

> 算得出來，信不信隨你。

線上版：<https://mmiooimm.github.io/mio-shuming/>

純前端靜態站，雙入口：

- **我要取名**（產前）：輸入姓氏＋預產期，列出三才五格全吉的筆畫組合，
  展開看依生肖喜忌標註的候選字（忌字預設收合、標註不刪），組好的名字可收藏在
  瀏覽器（localStorage），出生後一鍵帶入完整分析。
- **分析名字**：以**康熙筆畫**計算三才五格、依**立春**換算生肖判定喜忌字根、
  分析姓名五行；補出生時辰與出生地即做八字排盤（真太陽時校正）、用神判定與姓名匹配。
  結果可存成**分享卡片**（PNG，支援 Web Share 時叫出系統分享選單）。
- **收藏比較**：取名模式收藏的候選名可勾 2–5 筆並排比較三才五格與生肖字根，
  同樣能輸出比較卡片。

每條規則都標出處，各分項獨立評述，**不合成單一總分**。

凍結的驗收判準：v1 見 [SPEC.md](./SPEC.md)、v2（八字）見 [SPEC-v2.md](./SPEC-v2.md)、
v3（取名模式）見 [SPEC-v3.md](./SPEC-v3.md)、
v4（分享卡片・摘要・品質門檻）見 [SPEC-v4.md](./SPEC-v4.md)。

## 開發

```bash
npm install
npm run dev      # 開發伺服器
npm test         # 引擎單元測試（14 個檔案、314 項）
npm run test:e2e # Playwright E2E（390px／1280px 各跑一遍，共 42 項）
npm run build    # tsc --noEmit + vite build -> dist/
```

`vite.config.ts` 設 `base: './'`，`dist/` 可直接部署在 GitHub Pages 的
使用者頁（`/`）或專案頁（`/<repo>/`），不必重 build。推上 `main` 由
`.github/workflows/deploy.yml` 自動部署。

## 資料檔怎麼來的

`src/data/*.json` 全部由 `tools/gen-*.mjs` 產生或人工整理自標註出處的來源，
**不要手改**。重新產生前先抓上游原始資料：

```bash
mkdir -p tools/raw
curl -o tools/raw/Unihan.zip      https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip
curl -o tools/raw/CJKRadicals.txt https://www.unicode.org/Public/UCD/latest/ucd/CJKRadicals.txt
curl -o tools/raw/ids.txt         https://raw.githubusercontent.com/cjkvi/cjkvi-ids/master/ids.txt
unzip -o tools/raw/Unihan.zip -d tools/raw/
# gen-solar-terms.mjs 不需要下載檔，它純算；其 golden check 的對照值抄自
# 中央氣象署《天文年曆》，出處寫在腳本註解裡。

npm run gen:data                    # 依序跑下列三支
node tools/gen-kangxi-strokes.mjs   # -> kangxi-strokes.json
node tools/gen-solar-terms.mjs      # -> solar-terms.json
node tools/gen-components.mjs       # -> components.json（相依 zodiac-radicals.json）
```

每支生成腳本結尾都有 golden check，對不上就 exit 1。

| 檔案 | 來源 | 說明 |
|---|---|---|
| `kangxi-strokes.json` | Unicode Han Database `kRSUnicode` ＋ `CJKRadicals.txt` | 康熙筆畫 ＝ 康熙部首本字筆畫 ＋ 部首外筆畫。**不用** `kTotalStrokes`（那是現代筆畫：江 6 而非 7、陳 10 而非 16）。涵蓋 BMP 27,584 字 |
| `solar-terms.json` | Meeus《Astronomical Algorithms》ch.25／ch.28 ＋ Espenak & Meeus ΔT，對照**中央氣象署《天文年曆》** | 1900–2100 各年**十二節**時刻（UTC+8）＋均時差表。立春即黃經 315° 的那個節——年柱（生肖）與月柱共用這一份，不另立表 |
| `components.json` | [cjkvi-ids](https://github.com/cjkvi/cjkvi-ids)（源自 CHISE） | 每字含哪些生肖字根；含康熙部首變體正規化（氵→水、艹→艸…） |
| `zodiac-radicals.json` | 網路主流通行版（檔內註明 URL 與原文） | 十二生肖喜忌字根、地支六合三合沖害 |
| `numerology-81.json` | 網路主流通行版（檔內註明 URL 與原文） | 81 數理吉凶、五格假1 規則、五行配屬與生剋 |

各資料檔的 `source` 欄位存有來源 URL 與抓到的原文片段，網頁的「資料來源」區塊
直接讀這些欄位呈現。

## 已知限制

- **罕字**：字典只涵蓋 BMP（`U+4E00`–`U+9FFF`、`U+3400`–`U+4DBF`）。
  擴充區 B 以上的字回報「查無此字」，不猜測、不產出結果。
- **立春當日出生**：只收年月日、未收時辰，生肖無法定案。此時據實提示兩種可能，
  不擅自選一個。
- **流派差異**：81 數理表在 17、18、25、39 等數，各家判定不一（本站固定採
  `numerology-81.json` 註明的那一張表）；外格另有「總格 − 人格 ＋ 1」的算法，
  與本站採用的結構規則在單姓單名、複姓雙名時不同。詳見
  `numerology-81.json` 的 `wugeRules.conflict`。
- **取名模式的計分格**：天格由姓氏先天決定、單名時外格不含名字筆畫——兩者取名
  無法改變，故不計吉凶（照列並標示不計；出處見 `numerology-81.json` 的
  `source.tianGrid` 與 `source.waiGridSingleGiven`）。分析模式不受影響。
- **預產期不是出生日**：距立春 ±3 週內並列兩生肖不選邊；部分姓氏（如陳）在單名下
  連次佳組合都不存在，照實回報並建議雙名。
- **分享卡片**：裝置或瀏覽器不支援 Web Share（或分享目標不接受檔案）時自動退回
  直接下載 PNG，不會卡住；使用者取消分享（AbortError）則靜默、不觸發下載。
- **卡片隱私設計**：分析卡片與比較卡片皆不印出生時分、出生地；比較卡片另外
  不印預產期——這些是使用者在分析／收藏時填的私人資訊，分享出去的圖片刻意不帶。
- 本站僅供興趣與學習參考，結果不構成任何建議。

## 授權

GPLv2（見 [LICENSE](./LICENSE)）—— `components.json` 衍生自 GPLv2 的 CHISE IDS
資料，故全案採同一授權。Unicode 資料依
[Unicode Terms of Use](https://www.unicode.org/terms_of_use.html)。
