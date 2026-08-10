# 姓名學分析

純前端靜態站：以**康熙筆畫**計算三才五格、依**立春**換算生肖判定喜忌字根、並分析姓名五行。
各分項獨立評述，**不合成單一總分**。

凍結的驗收判準見 [SPEC.md](./SPEC.md)。

## 開發

```bash
npm install
npm run dev      # 開發伺服器
npm test         # 引擎單元測試（41 項）
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

node tools/gen-kangxi-strokes.mjs   # -> kangxi-strokes.json
node tools/gen-lichun.mjs           # -> lichun.json
node tools/gen-components.mjs       # -> components.json（相依 zodiac-radicals.json）
```

每支生成腳本結尾都有 golden check，對不上就 exit 1。

| 檔案 | 來源 | 說明 |
|---|---|---|
| `kangxi-strokes.json` | Unicode Han Database `kRSUnicode` ＋ `CJKRadicals.txt` | 康熙筆畫 ＝ 康熙部首本字筆畫 ＋ 部首外筆畫。**不用** `kTotalStrokes`（那是現代筆畫：江 6 而非 7、陳 10 而非 16）。涵蓋 BMP 27,584 字 |
| `lichun.json` | Meeus《Astronomical Algorithms》ch.25 ＋ Espenak & Meeus ΔT | 1900–2100 各年立春時刻（UTC+8） |
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
- 本站僅供興趣與學習參考，結果不構成任何建議。

## 尚未實作

SPEC 第 10 條的八字排盤、用神判定與八字評分屬第二階段。輸入介面已收生日，
`NameInput.birth` 即為擴充點。

## 授權

GPLv2（見 [LICENSE](./LICENSE)）—— `components.json` 衍生自 GPLv2 的 CHISE IDS
資料，故全案採同一授權。Unicode 資料依
[Unicode Terms of Use](https://www.unicode.org/terms_of_use.html)。
