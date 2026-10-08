## Summary

<!-- What changed and why -->

## Definition of Done

Full checklist: [`docs/DEFINITION_OF_DONE.md`](../docs/DEFINITION_OF_DONE.md)

- [ ] Loading / error / empty / success states all handled (if data-backed)
- [ ] Forms: submit disabled while pending, no double-submit, success/error feedback shown
- [ ] Auth-covered paths tested for both anonymous and signed-in, incl. 401/refresh if touched
- [ ] Responsive at sm/md/lg/xl breakpoints, no horizontal overflow
- [ ] i18n via `useTranslation()`, RTL-safe (logical properties), dark mode checked
- [ ] Performance: images optimized, lists paginated/virtualized, no redundant refetching
- [ ] SEO metadata set (page-level routes only)
- [ ] Security: no unsanitized HTML (`dangerouslySetInnerHTML` needs a sanitizer, no exceptions),
      no open-redirects from user input, no direct axios calls from components, input validated,
      no secrets logged, new persisted keys go through `shared/lib/storage.ts`
- [ ] Testing: new pure logic has a colocated Vitest test (`pnpm test`); user-facing flow has a
      Playwright spec if reusable/regression-prone (`pnpm test:e2e`)
- [ ] Design system: no hardcoded hex or `font-size`/`font-weight`; Figma spacing indices
      mapped to Tailwind (`--spacing-5` = 24px = `p-6`); generated icon/brand/font files
      regenerated and committed if their source changed (`pnpm icons` / `pnpm brand` /
      `pnpm fonts`) — see [`docs/DESIGN_SYSTEM.md`](../docs/DESIGN_SYSTEM.md)
- [ ] Art: no image points at another host — `pnpm art:audit` is clean, new illustrations are
      committed under `public/illustrations/` and guarded by `committedArt()`, per
      [`docs/STATIC_ASSETS.md`](../docs/STATIC_ASSETS.md)
- [ ] `data-testid` on every control a test would press or type into, and every figure it would
      read, per [`docs/TEST_IDS.md`](../docs/TEST_IDS.md) — no translated text in an id, state in its
      own attribute, per-item identity in a companion attribute. `pnpm testids` re-run and
      `testids/` committed
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm lint:rtl`, `pnpm lint:links`, `pnpm lint:icons`, `pnpm lint:testids` pass
