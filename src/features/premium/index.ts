/**
 * The Premium feature — **what Tevi Premium is, what it costs, and the state of this account's
 * subscription.**
 *
 * ```
 * api/        the `premium` service: packages, benefits, this account's grant, code redemption
 * lib/        the pure parts — plan grouping and the discount arithmetic, the reverse-lookup
 *             localiser for server-written copy, the brand paints, the column, the art
 * hooks/      three queries, the subscribe flow, the billing portal, the post-purchase re-read
 * components/ the `/premium` screen: hero, plans, benefits + detail carousel, about
 * ```
 *
 * ## What this owns, and what it does not
 *
 * It owns **the offer**: the price table, the benefit list, whether this account is inside the
 * subscription and until when. It does **not** take the money — `features/payment` does, through
 * `{ kind: 'premium', priceId }`, which that feature has carried since its first pass. So nothing
 * here mentions Stripe except the billing portal, and that is a link, not a charge.
 *
 * It also does not own the *boolean*. `useMyChannel().isPremium` is what the rest of the app branches
 * on — the avatar ring, the drawer's card, the payout screen's fast-withdrawal option, this screen's
 * own two states — because it is fetched once per account for the whole session and refreshed by the
 * `premium_info` socket frame. This feature adds the **expiry date**, which is the one thing only
 * `premium/v1/user/info/` knows. Two sources for one boolean is how legacy's badge and avatar come to
 * disagree with the rest of the channel body.
 *
 * ## The purchase does not finish on this page, and the screen is built for that
 *
 * A Premium checkout is a **hosted redirect**: the browser leaves for Stripe and comes back to
 * `/premium` as a fresh document with no client secret on the URL, so there is nothing for
 * `useCheckoutCallback` to resume and no `payment:succeeded` on that path. What confirms the purchase
 * is the backend's webhook, and what tells the client is the socket frame — which flips `isPremium`,
 * which swaps the hero's copy and removes the plan grid on its own. `usePremiumSync` adds the second
 * half (the date) and also listens on the event bus, because the same order *can* come back as a
 * `STRIPE` action and settle in place. Both signals, one refetch each.
 *
 * ## Three of the four sections resolve independently
 *
 * There is no whole-screen skeleton and no page-level error state: the prices, the benefits and the
 * grant are three requests, and a screen that waits for the slowest shows nothing until then. The
 * two that can fail answer differently on purpose — the price grid says so and offers a retry
 * (somebody came here to buy), the benefits section simply is not there (it is the argument, not the
 * control). Legacy toasts both and renders neither.
 *
 * ## The gate is the press
 *
 * Every read here is enabled for the anonymous session the app always holds, so a visitor from an ad
 * reads the pitch and the prices; `useSubscribePremium` composes `useRequireAuth`, so pressing
 * Subscribe raises the sign-in dialog and leaves them where they are. Legacy gates the *data*, which
 * leaves a signed-out visitor on an empty page with nothing to sign in for.
 *
 * ## Two screens, one feature
 *
 * `/gift-premium` is here too — buying Premium **for somebody else** (`containers/giftPremium` in
 * legacy: a creator search, a recipient, three gift packages). It is a *screen* and not a variant of
 * `/premium`: a different catalogue (`v1/gift-packages/`, at 90/180/365 days), a step in front of it
 * that picks a person, and a checkout that names a receiver.
 *
 * It lives in this feature rather than its own because the thing it sells is this feature's: the
 * price table, the benefit list and the brand paints are the same, and splitting it out would mean
 * either widening this barrel with the price formatter, the gold, the benefits dialog and the
 * package DTO — or a second feature holding its own copy of all four. What it adds is a picker
 * (`api/gift-recipient-api.ts`, and see its note on why it calls two other features' endpoints), a
 * duration→plan mapping that is not the subscription's, and the `?gift_token=` round trip
 * (`lib/gift-token.ts`).
 *
 * ## What is deliberately not built
 *
 * **Two of legacy's eight `premium` calls** — both dead in legacy itself — and a third that belongs
 * to the post composer's upload limits. `api/premium-api.ts` names each one.
 *
 * **A gift *message*.** Legacy has a `MessageGiftPremium` component, a `message` state, a 100-character
 * limit and an error toast for exceeding it — and **renders none of it**: `containers/giftPremium/components/info`
 * never mounts the component, and `checkoutGiftPremium`'s payload has no such field. Porting it
 * would be porting a control the backend cannot receive. B99 in
 * [`docs/BACKEND_QUESTIONS.md`](../../../docs/BACKEND_QUESTIONS.md) asks whether it is meant to
 * exist.
 *
 * ## The barrel is narrow on purpose
 *
 * Everything below is something *outside* this feature reads: the page mounts one component and one
 * colour, `features/navigation` takes a path (from `routes.ts`, never from here), and
 * `features/gift-code` uses the service. The bar, the plan cards, the benefit dialog, the two
 * skeletons, the plan arithmetic and the copy localiser are all internal — they are reached through
 * `dev.ts` by the `/dev/premium` harness and through relative paths by their own tests, which is
 * what keeps a feature's shape from being decided by what happens to be exported.
 *
 * Open contract questions: **B93** (the service's own DTOs) and **B99** (the gift flow) in
 * [`docs/BACKEND_QUESTIONS.md`](../../../docs/BACKEND_QUESTIONS.md).
 */

// ── The service ─────────────────────────────────────────────────────────────────────────────────
/**
 * `premiumApi` and its keys are exported for **one consumer outside this feature**:
 * `features/gift-code`, whose screen redeems a code against this service and then reads the grant it
 * produced. That is why `redeemCode` lives here at all — see its own doc.
 */
export { forgetPremiumInfoCache, premiumApi, premiumKeys } from './api/premium-api'
export type { PremiumInfo } from './api/types'
export { toPremiumInfo } from './api/types'
/**
 * `/gift-premium`'s one mounted component — the picker, the offer, the success screen, both dialogs
 * and the bar. Composed inside itself for the reason `PremiumView` is: the column carries a brand
 * band, and a page that assembled the parts itself could put the band at the wrong width.
 *
 * Its bar carries the same **"Manage in Stripe"** control `/premium`'s does — legacy puts one on
 * both screens (two byte-identical files), and `PremiumManageButton` is reused rather than
 * re-declared so the two cannot drift apart on the one thing that matters: the link is minted on the
 * **press**, where legacy calls `stripe/portal/` on mount for every visitor and throws most of the
 * answers away.
 */
export { GiftPremiumView } from './components/gift-premium-view'
// ── The screen ──────────────────────────────────────────────────────────────────────────────────
/**
 * The **only** component the page mounts. Everything else — the bar, the band, the cards, the
 * panels — is composed inside it, because the screen is one 612 column carrying a brand band and a
 * page that assembled those parts itself could put the band at the wrong width. `PREMIUM_SCREEN` is
 * the ground `<main>` paints behind it.
 */
export { PremiumView } from './components/premium-view'
// ── Hooks ───────────────────────────────────────────────────────────────────────────────────────
/** Also `features/gift-code`'s, for the receipt it prints after a Premium code is accepted. */
export { usePremiumInfo } from './hooks/use-premium-info'
// ── The column ──────────────────────────────────────────────────────────────────────────────────
export { GIFT_PREMIUM_SCREEN, PREMIUM_SCREEN } from './lib/container'
/**
 * Re-exported for the screen; anything in `features/navigation` must keep importing
 * `@features/premium/routes` directly — that module is import-free precisely so a data module can
 * read a path without pulling this barrel and closing a cycle. See its own doc.
 */
export { GIFT_PREMIUM_PATH, PREMIUM_PATH } from './routes'
