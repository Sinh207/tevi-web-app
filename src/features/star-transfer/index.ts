/**
 * `/star-transfer` — **moving Star from this account to another one**, singly or in bulk.
 *
 * ```
 * StarTransferView          the screen: the gate, the balance, the two modes, the history
 * StarTransferSkeleton      its loading shape, reused by the route's loading.tsx
 * STAR_TRANSFER_CONTAINER   the 612 content column
 * STAR_TRANSFER_PATH        the address — from ./routes, not from here (see below)
 * ```
 *
 * Five endpoints, one question. It is not the wallet (`features/balance` owns the figure), not a ledger
 * (`features/my-star` owns the Star history), and not a gift: a transfer moves Star between accounts at
 * face value, where a gift is priced and a donation is bought from an offer.
 *
 * ## The feature the permission gate was built for
 *
 * `features/permission` shipped ahead of its consumers precisely so this screen could be right on its
 * first commit, and its `index.ts` names this route as the consumer of `can('star-transfer')`. The four
 * states of `useCapability` are legacy's bug on *this screen*, written down: it renders **Access
 * Denied** for anything that is not an explicit `true`, so one 502 tells an agency it has lost a
 * feature it pays for. `StarTransferView` handles all four, plus the guest case.
 *
 * ## Two barrels, and it is a hard constraint rather than a preference
 *
 * `features/navigation` links here (the drawer's SERVICES row) and this feature reaches into
 * `features/channel` for its empty states. Through one barrel each, those form a module cycle — and ESM
 * resolves a cycle by handing one side a half-initialised module, which surfaces as
 * `undefined is not a function` at render time rather than as a build error. So the address lives in
 * `./routes`, which imports nothing, and `features/navigation` imports **that**. This file must never
 * become the drawer's dependency.
 *
 * Same shape, and the same class of trap, as `features/my-star` and `features/earnings`.
 *
 * ## ⚠ Radii: legacy's pixels are **not** Tailwind's default steps
 *
 * The DS ramp in `globals.css` is `sm 4 · md 8 · lg 12 · xl 16 · 2xl 24 · 3xl 32`, which is one step
 * *off* Tailwind's own defaults — `rounded-2xl` here is 24, not 16. Every radius on this screen was one
 * step too big for a while because legacy's `12` was written as `rounded-xl` and its `16` as
 * `rounded-2xl`. The mapping, from `web-app`'s own numbers:
 *
 * | legacy | step | where |
 * |---|---|---|
 * | 8 | `rounded-md` | the hero's `+` box |
 * | 12 | `rounded-lg` | the hero top, the purple seam, the white panel, the dialog and the sheet, an expanded history row, the receipt's party cards |
 * | 16 | `rounded-xl` | the Features tiles, the dropzone, the file chip, every dashed receiver card, and the receipt surface (legacy's `Paper` at MUI `4`) |
 * | 32 / 40 | `rounded-full` | every pill button |
 *
 * Same class of trap as the spacing indices `CLAUDE.md` warns about, and it is invisible in review: a
 * 16 where a 12 belongs looks deliberate. Check the number in `web-app` before adding a radius here.
 *
 * ## Save as PDF
 *
 * Legacy's *Save as PDF* is ported — on the receipt screen and on every history row — with the same
 * dependency legacy uses (`jspdf`, dynamically imported so no other route pays for it). `lib/transfer-pdf.ts`
 * draws it and states the one limitation that came with it: the standard PDF fonts are Latin-1, so the
 * document's labels are English and names are transliterated. Embedding an Inter subset lifts both, and
 * that file says exactly where.
 */

/**
 * The skeleton is its own module and **not** `'use client'`, so the route's `loading.tsx` — a server
 * component — can import it without pulling both dialog stacks and four hooks into the loading chunk.
 * See the file; it is a mistake this feature made once.
 */
export { StarTransferSkeleton } from './components/star-transfer-skeleton'
export { StarTransferView } from './components/star-transfer-view'
export { STAR_TRANSFER_CONTAINER } from './lib/container'
export { STAR_TRANSFER_PATH } from './routes'

/**
 * Deliberately **not** exported: `transferApi`, `transferKeys`, all four hooks, and every component
 * below the view.
 *
 * A component calling the model directly is what CLAUDE.md's "never call axios from components"
 * forbids, and exporting it is the invitation — the same reasoning `features/balance/index.ts` and
 * `features/donation/index.ts` both spell out. The flow hooks are internal for a sharper reason: each
 * owns a dialog stack, so a second caller mounting one would put a second dialog stack on the page.
 */
