# Review debt

Contract rule 7 的對帳結果：實質 commit 但沒有獨立 review verdict 者記在這裡，事後補審勾除。

- [ ] `2d7eff4` fix(v2): `[hidden]` 被 `.field` 的 `display:flex` 蓋掉（2026-08-10）
      scope：`src/style.css` 兩條規則（`[hidden] { display: none !important }`、
      `.field--check > span` 的 flex）。當下以真實 Chrome 的 `getComputedStyle` 前後對照驗過
      （none → flex/grid），但**沒有跑獨立 diff review**。純樣式、無邏輯分支，風險低；
      補審時一併看有沒有 `!important` 影響到其他該顯示的元素。
