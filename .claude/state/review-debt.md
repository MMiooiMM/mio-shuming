# Review debt

Contract rule 7 的對帳結果：實質 commit 但沒有獨立 review verdict 者記在這裡，事後補審勾除。

- [x] `2d7eff4` fix(v2): `[hidden]` 被 `.field` 的 `display:flex` 蓋掉（2026-08-10）
      **補審完成 2026-08-11，Copilot CLI 獨立 review → APPROVE（四項判準全 PASS）**。
      Claude 親核 EVIDENCE：`hidden` 屬性操作僅 `main.ts:546-547`（屬性切換，無 CSS 蓋寫依賴）；
      `pillar__hidden` 是 class 非屬性，不受 `[hidden] !important` 影響；
      `.field--check > span:not(.field__hint)` 命中對象正確，`.field__hint` 仍獨占一行。
