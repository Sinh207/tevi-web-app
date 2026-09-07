/**
 * Gift codes — **turning a code somebody was given into whatever it contained, and nothing else.**
 *
 * ```
 * GIFT_CODE_PATH            the address (also `@features/gift-code/routes`, import-free)
 * GIFT_CODE_CONTAINER       the 612px content column the page and its back bar share
 * GIFT_CODE_SCREEN          what paints the screen: full-bleed surface below md, page colour above
 * <RedeemGiftCodeView/>     the whole screen: the card, the field, and the result dialog
 * ```
 *
 * ## What is in scope, and what is a different feature
 *
 * One question — *what is this string worth* — answered against two services, because a code can
 * come from either (`api/gift-code-api.ts` has the table). That is the whole feature.
 *
 * It is **not** the gifting rail (`gifting/send/`, a livestream catalogue), **not** buying a gift for
 * somebody else (`gifting/gift-packages/`, which is the drawer's separate "Gift Tevi Premium" row),
 * and **not** Premium itself. The two Premium calls that used to live here — `v1/redeem/` and
 * `v1/user/info/` — moved to `features/premium` the day that feature landed, which is what this note
 * used to promise; this feature asks for them through its barrel. It never owns the figures a
 * redemption moves either: the balance belongs to `features/balance`, the account's Premium standing
 * to `features/channel`, and the grant's expiry to `features/premium`. It only invalidates them.
 *
 * ## Deliberately **not** exported
 *
 * `giftCodeApi`, `useRedeemCode`, `RedeemResultDialog` and everything in `lib/`.
 *
 * A component calling the model directly is what `CLAUDE.md`'s "never call axios from components"
 * forbids, and exporting it is the invitation — the same reasoning `features/balance/index.ts` and
 * `features/donation/index.ts` both spell out. The flow hook is internal for a sharper reason: it
 * owns the result dialog's state, so a second caller mounting it would put a second dialog on the
 * page. There is one screen, and it mounts it once.
 */

export { RedeemGiftCodeView } from './components/redeem-gift-code-view'
export { GIFT_CODE_CONTAINER, GIFT_CODE_SCREEN } from './lib/container'
export { GIFT_CODE_PATH } from './routes'
