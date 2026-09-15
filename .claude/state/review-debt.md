# Review debt

Contract rule 7 的對帳結果：實質 commit 但沒有獨立 review verdict 者記在這裡，事後補審勾除。

- [x] `2d7eff4` fix(v2): `[hidden]` 被 `.field` 的 `display:flex` 蓋掉（2026-08-10）
      **補審完成 2026-08-11，Copilot CLI 獨立 review → APPROVE（四項判準全 PASS）**。
      Claude 親核 EVIDENCE：`hidden` 屬性操作僅 `main.ts:546-547`（屬性切換，無 CSS 蓋寫依賴）；
      `pillar__hidden` 是 class 非屬性，不受 `[hidden] !important` 影響；
      `.field--check > span:not(.field__hint)` 命中對象正確，`.field__hint` 仍獨占一行。

- [ ] `4d7e849` fix(v4): 摺疊列 hover 包進 `@media (hover: hover)`（2026-09-14）
      Codex 複審 APPROVE 之後才加的 CSS，無獨立 verdict。範圍：`src/style.css` 一個 media query。證據：模擬觸控點擊底色透明、滑鼠點擊 focus-visible=false、E2E 96。
- [ ] `b098478` feat(v4): B21 的 review 後增量（2026-09-15）
      Codex APPROVE 審的是加「目前搭配」虛線修正之前的 diff。未審增量：`.combo__body .compose{margin-top:16px;border-top-color:var(--neutral)}`、`e2e/combo-body.spec.ts` 新測試（虛線對比 ≥3:1）、`expectAvoidListDeduped` 加 expectedAnimals 參數與 regex `u` 旗標。證據：變異 1.20:1 變紅、after 5.17:1、E2E 108。
