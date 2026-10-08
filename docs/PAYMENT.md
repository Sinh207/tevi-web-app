# Payment (Stripe) — legacy review + UI/UX & state design

> Status: **passes 1–5 done, plus `/get-star`** — `api/` + `lib/` + the checkout engine + the card
> management screen (`/card-management`), the Stripe SDK and the CSP are in; buying Star now has a
> **page as well as the sheet** (§4.1b). Passes 6–7 remain (§8). Three places were
> drilled out in advance and were waiting only on this feature:
> `features/donation` (**now enabled**, `canPayByCard`),
> `features/membership` (**dropped** `RenewalNeedsPaymentError` — `subscribe` returns a
> `CheckoutAction`),
> `features/balance` (`useRequireStars` → **wired to the sheet** in pass 4).
> The `menu_card_management` row in the drawer got its `href` in pass 2
> (`navigation/lib/menu-rows.ts`).

---

## 1. Review — what legacy does today

### 1.1 Four services, three payment "shapes"

| Group | Endpoint (legacy) | Service |
|---|---|---|
| Stripe config | `payment/v3/stripe/config/` → `{ publishable_key }` | `paymee` |
| Saved cards | `payment/v3/my-payment-methods/` `GET` / `POST` (SetupIntent) / `DELETE {id}` / `POST {id}/set-as-default/` | `paymee` |
| Gateways & pricing | `payment/v3/countries/`, `payment/v3/payment-methods/?country`, `stars/v3/conversion-packages/` | `paymee` |
| Checkout | `checkout/v3/checkout/` (Star), `…/checkout/donation/`, `…/checkout/premium/`, `…/checkout/gift-premium/` | `paymee` |
| Settlement | `payment/v3/stripe/callback/` (`{ clientSecret }`), `payment/v3/redirect-callback/?{query}` | `paymee` |
| Billing portal | `payment/v3/stripe/portal/?success_url=` | `paymee` |
| Card fee (donation) | `payment/v3/direct-donation-fee/` → `{ x, y, z }` | `paymee` |
| Payout (Connect) | `v5/billing/payout/stripe-onboard-link/` | `billy` |
| Membership | `v3/subscription/channel/{slug}/packages/{id}/subscribe/` → `action_data.clientSecret` | `billy` |

**Every checkout returns the same envelope** (`providers/balance/hooks/useGetStar.js`):

```js
{ action: 'STRIPE' | 'REDIRECT' | 'CODA' | 'NOW_PAYMENT', action_data: { clientSecret | redirectURL | txnId | … } }
```

This is the single most important point of the whole review: **Stripe is only one of four branches
of the same response.** If the client models "payment = Stripe", the other three branches end up
stuffed into scattered `if`s — exactly what legacy does (a `switch` in `useGetStar`, a different
`if` in `useMembership`, yet another in `usePremium`).

Three different UX shapes, and legacy uses all three for **the same act of "paying"**:

1. **Elements in place** (`clientSecret`) — buying Stars, membership by card, donation by card.
2. **Redirect to an external page** (`redirectURL`) — Premium, gift Premium (Stripe hosted
   Checkout), and every domestic gateway.
3. **Embedded iframe** (`txnId`) — Coda; `NOW_PAYMENT` returns raw data (crypto).

### 1.2 The lifecycle of one card payment (legacy)

```
POST checkout/            → { action: STRIPE, action_data.clientSecret }
  ↓
stripe.confirmCardPayment(clientSecret, { payment_method: card.id })      ← saved card
or  stripe.confirmPayment({ elements, confirmParams.return_url })        ← PaymentElement
  ↓ (3DS may redirect away and come back with ?payment_intent_client_secret=)
POST payment/v3/stripe/callback/ { clientSecret }
  ├─ 200                 → success (carries `type`, used to pick the copy)
  ├─ code === 'PM0003'   → processing → setInterval 2s, call the callback again until the state changes
  └─ anything else       → failed (message from BE)
```

`PM0003` is the important contract: **"received, not yet settled"** — not an error. It appears in
`components/stripe/listCard`, `providers/balance/index.js` (the URL-callback branch) and
`containers/app/membershipDetails/hooks/useMembershipResult.js` (the webview version, called through
the `window.TeviJS.stripeCallback` bridge) — **three copies of the same loop**.

### 1.3 Fees & totals

Two different formulas, neither with a test:

- **Gateway** (`useGetStar.handleTotalCost`):
  `round(((price·fee_percent_rate/100 + fee_flat_amount + price) · usd_conversion_rate) / min_unit) · min_unit`,
  plus the `price <= 0.01 ? price*100 : price` hack and a divide-by-100 again at display time.
- **Donation by card**: `(x·amount + y)/z` — the new repo **has ported it and has tests**
  (`features/donation/lib/donation-amount.ts` + `api/donation-fee-api.ts`). That is the template for
  the gateway side.

### 1.4 Where legacy is wrong — must be fixed while porting

Read closely, this is a list of real bugs, not "old code, therefore ugly":

| # | Where | Problem |
|---|---|---|
| 1 | `components/stripe/hook.js:getAllCards` and `cardManagement/hook` | `setAllCards(res)` **before** checking the status → the state takes the raw axios object and is only overwritten afterwards; if the status ≠ 200 then `allCards` is a response object and `.map` blows up. |
| 2 | `components/stripe/index.js` | `stripe={loadStripe(publishable_key)}` called **during render** → a new Stripe instance every render, losing the Elements state. |
| 3 | `components/stripe/index.js` | `useEffect(..., [isAuthenticated && clientSecret])` — the dependency is a **boolean**, so changing `clientSecret` does not refetch. |
| 4 | `paymentMethods/index.js:handleSubmit` | After `confirmPayment` it reads `error.type` **without a null check** → a non-redirect success is a TypeError. |
| 4b | `paymentMethods/index.js:handleSubmit` | No `redirect: 'if_required'`, so **a new card always leaves the page** — full reload, cold restart of the settle poll, client secret through the address bar, and (here) the order gone. A saved card confirms in place. One purchase, two experiences; this client now passes the option. |
| 5 | All 3 `PM0003` polling sites | `setInterval` with **no attempt cap, no timeout, no clear on unmount** → polls forever, keeps polling after you leave the page. |
| 6 | `providers/balance/index.js` | `checkoutResult` is **3 independent booleans** (`processing`/`success`/`failed`) → two dialogs can be open at once; every branch has to turn the others off by hand (and one branch forgets). |
| 7 | `cardManagement/hook:deleteCard` | The "can't delete the last card" rule lives in **two** places and only one runs: the hook `return`s silently (pressing the menu item does nothing), while the UI opens a *This Card Can't Be Removed* dialog. The new version keeps the dialog and drops the silent `return`. |
| 8 | `cardManagement/hook:createCard` | `allCards?.length > 10` → off-by-one, allows an 11th card. |
| 9 | `stripe/hook:deleteCard` expects `200`, `cardManagement:deleteCard` expects `204` | Two places read the same endpoint differently. |
| 10 | Every handler | Reads `res.response.data.errors.length` unguarded → an undefined `errors` is a crash; and it reads `res.response` off a **resolved** promise (relying on the old interceptor returning errors as values). |
| 11 | `setupPayouts/formStripe` | `window.open(url, '_seft')` — a **typo**, opening a new window named `_seft` instead of `_self`. |
| 12 | `premium/hook/usePremium:initData` | `getStripePortal()` is called for **everybody** who lands on `/premium`, including people who never bought anything. |
| 13 | Premium vs Star | Both are "paying", but one redirects to a hosted page and the other uses Elements in place — two UX for one job. |
| 14 | `models/api.js:155` (`retryRequest`) | Legacy **retries every non-GET request** on network error / 5xx / 429, up to `MAX_RETRY_ATTEMPTS` — meaning `POST checkout/` **is being replayed**, with no idempotency key anywhere. A 502 arriving after the charge landed is a double charge. |
| 15 | `stripeCallback` | Does not strip `?payment_intent_client_secret` on every branch → refreshing the page re-settles. |

---

## 2. Proposed architecture — `features/payment/`

### 2.1 Principles

1. **The feature models `CheckoutAction`, not Stripe.** Stripe is *one* handler. Coda/redirect/crypto
   are other handlers of the same union.
2. **One state machine, one status dialog.** Fixes bug #6 at the root: two states cannot be held at
   once.
3. **The order is the input, the gateway is a detail.** Every surface (Star, donation, membership,
   premium) builds a `CheckoutOrder` and hands it to `useCheckout`; no surface knows about
   `clientSecret`.
4. **No feature imports another feature's internals** — `payment` imports `balance` through the
   barrel (one way), `balance` does **not** import `payment`; see §2.4.
5. **Money is pure logic, with tests.** Gateway fees, `min_unit` rounding, totals, action parsing,
   callback-URL parsing, the reducer — all pure functions in `lib/`.

### 2.2 Module tree

```
src/features/payment/
  api/
    stripe-config-api.ts     # payment/v3/stripe/config/ ; long staleTime, account-independent
    payment-methods-api.ts   # my-payment-methods: list | createSetupIntent | remove | setDefault
    checkout-api.ts          # checkout/ , /donation/ , /premium/ , /gift-premium/ , callback , redirect-callback , portal
    catalog-api.ts           # countries , payment-methods?country , stars conversion-packages
    types.ts                 # zod: SavedCard, Gateway, StarPackage, CheckoutAction, CallbackResult
  lib/
    stripe-loader.ts         # loadStripe cached by publishableKey (module-level) + injectable for tests
    stripe-appearance.ts     # DS tokens → Stripe Appearance API (§4.6)
    stripe-locale.ts         # app locale (all 9) → a Stripe-supported locale, fallback 'en'
    checkout-action.ts       # body → CheckoutAction union (fixes bugs #4, #10)
    checkout-machine.ts      # pure reducer: CheckoutState × CheckoutEvent → CheckoutState
    checkout-callback.ts     # URLSearchParams → CallbackIntent | null + the sweep (fixes #15; a bare `?gateway=` is not a callback)
    settle-poll.ts           # polling with bounded attempts + AbortSignal + pause on hidden tab (fixes #5)
    gateway-fee.ts           # total from fee_percent_rate/fee_flat_amount/usd_conversion_rate/min_unit (tested)
    card-brand.ts            # brand → label + asset (see §4.7: the DS has no glyph)
  hooks/
    use-stripe-config.ts     use-saved-cards.ts      use-add-card.ts
    use-checkout.ts          use-checkout-callback.ts use-billing-portal.ts
    use-star-packages.ts     use-gateways.ts          use-star-purchase.ts
  providers/
    payment-provider.tsx     # holds the machine + mounts the dialog + watches the callback URL
  components/
    star-purchase-dialog.tsx  star-package-grid.tsx   order-summary-panel.tsx
    gateway-list.tsx          pay-with-card-panel.tsx saved-card-list.tsx
    add-card-dialog.tsx       stripe-elements-scope.tsx checkout-status-dialog.tsx
    card-management-view.tsx
  index.ts
```

**Pass 1 built** (14 modules + 12 test files, 107 tests):
`api/{types,keys,stripe-config-api,payment-methods-api,catalog-api,checkout-api}.ts` and
`lib/{checkout-action,checkout-order,checkout-machine,checkout-callback,settle-poll,settle-outcome,gateway-fee,card-brand,return-url,stripe-locale}.ts`.

Three changes from the tree above, each with a reason:

- **`lib/checkout-order.ts`** (new) — the `CheckoutOrder` union + the `checkoutRequest` builder.
  Legacy's four payloads differ field by field (`quantity` / `donation_usd_amount` / `price_id` +
  `receiver_user_id`), so the place where the body is built is the place most worth testing;
  `checkout-api.ts` is left picking a path and calling the builder. It is also where the
  **`handoff`** kind is declared: membership is bought through billy — an endpoint owned by
  `features/membership` — so that feature calls it, parses the action itself and *hands the action
  over*, instead of `features/payment` having to import another feature's API.
- **`lib/settle-outcome.ts`** (new) — maps HTTP → `SettleOutcome`. Split out because it is the most
  important contract in the whole flow: `PM0003` → `pending`, any other 4xx → `rejected`, and
  **5xx/network/429 rethrow** (a 502 mid-poll says nothing about whether the money moved).
- **`lib/stripe-loader.ts` + `lib/stripe-appearance.ts` deferred to pass 3** — both need
  `@stripe/stripe-js` (the `Appearance` and `loadStripe` types), and pass 1 deliberately added no
  dependency. `lib/stripe-locale.ts` is pure, so it shipped immediately.
- **`api/catalog-api.ts` does not port `payment/v3/countries/`** — the card form uses Stripe's
  `AddressElement` (which carries its own country list and translates itself), and the gateway list
  takes `country` as **optional** because legacy passes nothing (BE geolocates). Do not model an
  unconfirmed payload for a control that no longer exists.

New route: `/card-management` (wired to the row already in the drawer). Buying Stars has **no route**
— it is a dialog, because it is always opened *on top of* whatever someone is doing (the "gate the
action, never the route" principle in `docs/DEFINITION_OF_DONE.md` §3).

### 2.3 The state machine (replacing legacy's 3 booleans)

```ts
export type CheckoutState =
    | { kind: 'idle' }
    | { kind: 'creating'; order: CheckoutOrder }                              // POST checkout/ in flight
    | { kind: 'card'; order: CheckoutOrder; clientSecret: string }            // Elements open
    | { kind: 'confirming'; order: CheckoutOrder; clientSecret: string }      // stripe.confirm* in flight
    | { kind: 'leaving'; order: CheckoutOrder; url: string }                  // about to redirect away
    | { kind: 'embedded'; order: CheckoutOrder; provider: 'coda' | 'crypto'; data: unknown }
    | { kind: 'settling'; clientSecret: string; attempt: number }             // PM0003
    | { kind: 'slow'; clientSecret: string }                                  // attempts exhausted, still pending
    | { kind: 'succeeded'; purchaseType: string | null }
    | { kind: 'failed'; messageKey: string; text?: string }
```

```
idle ──START──▶ creating ──ACTION(stripe)──▶ card ──SUBMIT──▶ confirming ──OK──▶ settling
                   │                                              └──ERR──▶ failed
                   ├──ACTION(redirect)──▶ leaving  (leaves the page; comes back via use-checkout-callback)
                   ├──ACTION(embedded)──▶ embedded ──POSTMESSAGE/close──▶ settling
                   └──ERR──────────────▶ failed
settling ──200──▶ succeeded   ──PM0003 & attempt<N──▶ settling(attempt+1)
         ──else─▶ failed      ──attempt≥N──────────▶ slow
```

The state rules, each fixing one of the bugs above:

- **`settling` is bounded**: 2s × 5 → 4s × 5 → 8s × 3 (≈50s, 13 attempts) then `slow`. `slow` is
  **not failed**: the copy says "the transaction is being processed, your balance will update" plus a
  link to `/my-star`. Legacy polls forever and the user watches a spinner indefinitely (bug #5).
- **Pause while the tab is hidden** (`document.visibilityState`), resume when it comes back; cancel
  outright on provider unmount via `AbortSignal`.
- **The dialog cannot be closed while `confirming`.** In `settling` it can — the money has left, and
  closing the dialog does not cancel the transaction; the machine keeps polling in the provider.
- **`succeeded` does not auto-close.** Whoever paid gets to read the confirmation.
- **`purchaseType`** = the `type` field in legacy's callback response, used only to pick the copy —
  never to infer success or failure.

### 2.4 The three primitives — which one holds what

| Data | Primitive | Key / channel |
|---|---|---|
| `publishable_key` | Query, `staleTime: Infinity` | `paymentKeys.stripeConfig()` — **not** account-scoped (platform config) |
| Saved cards | Query, account-scoped | `paymentKeys.cards(accountId)` |
| Star packages, gateways by country | Query | `paymentKeys.packages()`, `paymentKeys.gateways(country)` |
| Donation fee `{x,y,z}` | Query (already exists) | `donationFeeKeys.coefficients(accountId)` |
| The running checkout | **`useReducer` inside `PaymentProvider`** | not Zustand: it is one session's state, and it dies with the dialog |
| "Open the buy-Stars sheet" | **Event bus** | `payment:star-purchase-requested { shortfall }` |
| "Payment finished" | **Event bus** + invalidate | `payment:succeeded`; the provider itself calls `invalidateQueries(balanceKeys.all)` |
| The balance moving after settlement | **Socket** (already exists) | `balanceChange` is only a *signal* → invalidate, never write the cache |

**The import direction is a design decision, not an accident.** `useRequireStars` (in
`features/balance`) needs to open the purchase sheet; `features/payment` needs to refresh the
balance. If both imported each other through their barrels, that is a cycle. So:

- `payment` → `balance` (barrel, one way): reads `balanceKeys` in order to invalidate.
- `balance` → `payment`: **no import**. `useRequireStars` does
  `emit('payment:star-purchase-requested', { shortfall })`; `PaymentProvider` subscribes and opens
  the sheet with the missing Star count pre-selected.

That is exactly the role of primitive #2 in CLAUDE.md ("imperative UI signals") and it keeps
`use-require-stars.ts`'s promise: *the day the purchase flow ships, a dozen call sites do not need
touching.*

Mounting: `PaymentProvider` sits **inside `BalanceProvider`, outside `MyChannelProvider`** in
`app/session-providers.tsx` — it needs balance in order to invalidate, and the create-space gate has
no business standing between a price and the wallet that pays it.

### 2.5 API layer — what has to follow `shared/lib/api`

- `apiBase: ${W_API}/paymee` (there is precedent: `donation-fee-api.ts`).
- **No retry on any checkout POST.** `apiClient` only replays a POST with `{ retry: true }`; here a
  502 arriving *after* the charge landed is a double charge. Same as `donateStars` and `subscribe`.
- Thread `activeId` through every mutation (the account as of the **button press**, not as of the
  request taking off).
- The saved-cards query key **must** be account-scoped — the ETag store is account-scoped, and an
  unscoped key means account A replaying account B's body (the same reason `membershipKeys` spells
  it out).
- `clientSecret` **never** goes into localStorage, is never logged, and never appears in a query key.
- `return_url` is built from `env.NEXT_PUBLIC_BASE_URL` + the current pathname, **never** from any
  user input (open-redirect protection).

---

## 3. The surfaces that consume this feature

| Surface | Order | Action branches in practice | Current state in the repo |
|---|---|---|---|
| Buy Stars | `{ kind: 'stars', quantity, gatewayId }` | all 4 | **done** — the sheet (§4.1) and `/get-star` (§4.1b), one flow |
| Donate by card | `{ kind: 'donation', slug, amount, message }` | STRIPE | `CASH_ENABLED = false`, the fee is fully ported |
| Membership by card | `{ kind: 'membership', slug, packageId, priceId }` | STRIPE | `RenewalNeedsPaymentError` |
| Premium / gift Premium | `{ kind: 'premium', priceId }` | REDIRECT | no premium feature yet |
| Card management | — | — | the drawer row has no `href` |
| Billing portal | — | REDIRECT (`_blank`) | — |
| Payout onboarding (Connect) | — | REDIRECT | **not part of this feature** — see §5 |

**Webview `/app/*`: hidden by default, with one deliberate exception.**

The default stands: a card price must **not** appear on a `/app/*` screen the reader *navigated* to
inside the app. Those are the app's own surfaces, the app sells through IAP, and offering a card
beside an IAP price is what breaks store policy. `shared/config/webview.ts` has the flag, and it is
the reason `PaymentProvider` must not sit in the base providers.

The exception is **`/app/[channelSlug]/membership/[packageId]`** — the screen the native app *opens
in order to* take a card, having already shown its tier picker and been told "pay by card". It is not
the website's card lane leaking into a webview; it is the app's own card lane, and legacy has shipped
exactly this screen at exactly this URL. Confirmed for **both platforms**.

So the rule is about *who chose the lane*, not about `isWebview`. Everything else follows from that:

- **The host owns the session on that screen, so the transport is the JS bridge, not this feature's
  API.** The native app opens the webview to charge *its* account; the page has no bearer, mounts no
  `AuthProvider`, and asks the host for the three account-scoped operations —
  `TeviJS.membershipCheckout` (the intent), `TeviJS.myPaymentMethods` (the cards),
  `TeviJS.createStripeCallback` (the settle) — then hands back a verdict with
  `TeviJS.membershipResult`. The contract lives in `shared/lib/native-bridge.ts`.
- **What that screen still shares with this feature is everything except the transport**:
  `checkoutReducer`, `runSettlePoll` (so there remains **one** settle schedule in the app),
  `settledFrom`, `parseCheckoutAction`, `parseCheckoutCallback`, `normalizeSavedCards`, `getStripe`,
  `useStripeConfig`, `StripeElementsScope` and `PayWithCardPanel`. Only `useCheckout`,
  `useSavedCards` and `useCheckoutCallback` are out of reach, and for one mechanical reason: each
  calls `useAuth()`, which throws outside `AuthProvider`. If a third transport ever appears, lift a
  transport-agnostic engine out of `use-checkout.ts` rather than writing that glue again.
- **`PaymentProvider` is not mounted either**, and that part is unchanged in spirit: it exists so a
  payment can outlive its surface, and there the surface *is* the payment — one route, nothing behind
  it. The card panel and the outcome are drawn in place, not in three modals over a phone screen.
- `useJoinMembership`'s `canPayByCard(offer, slug, hasPaymentProvider)` is unchanged and still
  correct: the **join dialog** on a space page inside a webview has no provider and must say so. That
  is a different surface from this one.
- **The tier itself stays on HTTP** (`billy/v3/subscription/channel/{slug}/packages/{id}/`), as does
  the Stripe publishable key. Both are public reads; routing them through another process to fetch
  something anyone can fetch buys nothing. Legacy makes the same split.

---

## 4. UI/UX

All markup comes from the DS (`docs/DESIGN_SYSTEM.md`): semantic tokens, `.type-*`, spacing per the
Figma table, `Dialog`/`ConfirmDialog`/`Card`/`List`/`Radio`/`SegmentedControl`/`Banner`/`Skeleton`/`Loader`.

**The common frame for every surface:** at `md+` a `max-w` dialog centred on screen; **below `md` a
full-bleed bottom sheet** (the surface takes the full width, header included) — the convention
already recorded in the repo. The status dialog uses a 96px illustration slot following the Figma
50:15797 geometry, with the mark reading at 60px.

### 4.1 Star purchase sheet — 3 steps, one dialog

```
[1] Packages                     [2] Order summary                [3] Payment
┌────────────────────────────┐   ┌────────────────────────────┐   ┌──────────────────────────┐
│ Get Star            ✕      │   │ ← Order summary       ✕    │   │ ← Checkout          ✕    │
│ Balance  ★ 1,240           │   │ ★ 1,000  ·  $9.99          │   │ Debit/Credit card        │
│ ┌────┐┌────┐┌────┐         │   │ Bonus    +100 ★            │   │ ● Visa ····4242 [Default]│
│ │★100││★500││★1k │  grid   │   │ ─────────────────────      │   │ ○ Mastercard ····1881    │
│ │$0.99││$4.9││$9.9│  2 cols│   │ Payment method        ▾    │   │ ＋ Add card              │
│ └────┘└────┘└────┘  <md    │   │  [gateway list radio]      │   │ ⇄ Pay another way        │
│  … bonus badge in corner   │   │ Fee            $0.30       │   │ ────────────────────     │
│                            │   │ **Total**      $10.29      │   │ [ Pay $10.29 ]  accent   │
│                            │   │ [ Continue ]  accent       │   │ 🔒 Secured by Stripe     │
└────────────────────────────┘   └────────────────────────────┘   └──────────────────────────┘
```

- **Step 1** always shows the current balance; when the sheet is opened from `useRequireStars`, the
  smallest package that **covers the `shortfall`** is pre-selected, with a sub-line "You're ★ N
  short".
- **Step 2** is the only place money is computed. `Total` = `gatewayFee()` — tested. When
  `usd_conversion_rate`/`min_unit` are missing it **prints no invented number**: the fee row is `—`
  and the button still lets you continue (the BE is the final source), the same way the donation
  dialog handles an unknown fee.
- **Step 3** depends on the `action`:
  - `STRIPE` → `pay-with-card-panel` (§4.2)
  - `REDIRECT` → nothing is drawn: a "taking you to <gateway>" banner for a second or two, then
    `window.location.assign`
  - `CODA` → an iframe in a full-height panel
  - `NOW_PAYMENT` → a wallet-address + QR panel (a later stage)
- The "Back" button in step 3 **cannot** go back once `confirming` has begun — it becomes a
  "Processing…" label instead.

### 4.1b `/get-star` — the same purchase as a page

**Every Star affordance in the chrome now leads here.** The mobile top bar's pill, the desktop end
rail's pill, the drawer's *Get more Star* row, the *Get Star* row on `/my-star`, and the `+` on the
transfer balance card. The two **pills** are a single link each: the `+` inside the top bar's capsule
is the affordance that says what pressing it does, not a second control, so splitting it — which this
briefly did, sending the figure to `/my-star` — only made the two pieces of chrome disagree about a
press that means the same thing. `/my-star` keeps its own drawer row.

Legacy's own address, and this app keeps it. §4.1's sheet was built on "gate the action, never the
route", which is right for the press it was built for — a gift the balance could not cover — and
wrong for the other half of the presses, which *are* navigations: the `+` in the mobile top bar, the
**Get Star half of the account drawer's balance card**, the *Get Star* row on `/my-star`, the `+` on
the transfer balance card, a bookmark, a link in an old email. Seven places in the repo were carrying
a "when `/get-star` lands" note against that half.

The drawer's half needed one DS change: `LeftBarBalanceAction` was a hard `<button>`, so it gained
the same `href` fork `AppBarButton` already had (`disabled` still wins — an `<a>` has no disabled
state, and *Withdraw* is still a later pass). It navigates through the drawer's own `navigate`, which
closes before it pushes; without that the reader lands on the purchase page with the drawer still
over it.

**One flow, two frames.** `useStarCatalogue` holds what is being bought — both catalogues, the
shortfall pre-selection, `gatewayTotal`, `gatewayAccepts`. `useStarPurchase` adds the sheet's three
steps; `useGetStar` adds the page's auth gate and its sticky total. Written twice, the two would
eventually disagree about which package a shortfall lands on, and the one that disagreed would be
the one nobody tested.

```
 ← Get Star
 ┌──────────────────────────────────────────────────────┐
 │ Get Star                          ↺ Transaction history│   ← /get-star/transaction-history
 │ Stars will be sent directly to you                   │
 │ ──────────────────────────────────────────────────── │
 │ (face) Wondercat @wondercat              ★ 8,734     │
 │        ID: 1107201702              Current star balance│
 └──────────────────────────────────────────────────────┘
 Choose an amount of Star
 ┌ ★300 $3 ┐┌ ★500 $5 ┐   … 2 columns, the badge on the row the payload tags
 Payment method
 ◉ Credit or Debit Card (USD)      ≈ $0.0185 each
 ──────────────────────────────────────────────
 Total                                   $6.85    ← sticky
 Credit or Debit Card (USD)
 Includes $1.85 in payment-processing fees.
 [                 Pay $6.85                  ]
```

- **No steps.** A page can hold the grid, the method list and the total at once, so every one of the
  sheet's Back presses disappears. Legacy folds the grid *inside* an accordion per gateway, which
  renders the same eight tiles once per method and hides every amount behind a press.
- **The sticky bar names the method and the fee, and both are load-bearing.** The live catalogue
  returns **seven** gateways whose fees run 15–45%, and the default (card) is the **last** row — so
  on a phone the total is read with the selected row off screen, next to rows that price Star
  differently. Without the name the figure is unattributed; without the fee line a $5.00 tile
  charges $6.85 with nothing on screen explaining the difference. `gatewayFeeCharge` answers in the
  **charged** currency (it prices the package twice through the same rounding, with fees and
  without), so the line under a 250,000 ₫ total is in dong rather than in dollars.
- **A guest is not a state.** The catalogue is public and the prices are why somebody came, so being
  signed out does not replace the screen: `canPay` ignores auth, the press runs through
  `useRequireAuth`, and the login dialog opens without the URL moving. A caption says so in advance.
- **`NotSupported` is a screen with a way out, not a notice.** The catalogue answering *empty* — no
  packages, or no gateway enabled for this region — used to share the error branch's `Alert`, which
  had the words right and the shape wrong: a one-line notice on a blank page, offering nothing. Legacy
  is right about the part that matters, that **there is still a way to buy Star and it is the app**.
  Its version draws a QR of the current URL plus an *Open Tevi App* button hidden behind `isMobile`;
  this presses through to `GetAppDialog`, which this app already owns — store links from remote config
  and a Tevi-branded QR — so the way out is one press and it works on a desktop too. Still **no
  retry**: an empty catalogue answered, and asking again returns the same answer with a spinner in
  front of it.
- **No "balance after" preview.** An earlier version previewed what the balance would become. It
  earned its place when a package could carry a bonus; on the live catalogue every `bonus_amount` is
  `0`, so it was printing *balance + the number already on the tile*.
- **The money is an `aria-live` region**, with the button deliberately outside it. Changing package or
  method moves the total by dollars and neither radio announces it — a screen reader hears
  "500 Star, selected" and nothing else. The button carries the same figure, so including it would
  read the amount twice on every arrow key.
- **A wallet gateway says where it is taking you.** `REDIRECT` leaves a second or two between the
  press and the browser going, and without a line under the button the only sign is a spinner — the
  same sentence the sheet has drawn since pass 4.
- **Choosing an amount reveals the methods.** The two choices are independent and stacked, so on a
  phone the second is below the fold while the reader is making the first — the tile lights up and
  nothing says there is a step after it. `scrollIntoView({ block: 'nearest' })` on select, which is
  also the entire guard: it does nothing when the list is already visible (desktop, a second press,
  a keyboard user arrowing through the grid). The scroll margins that keep the result clear of the
  two sticky bars are **measured** — 60 for the back bar, 222 for the total bar at its tallest.
  Called from `onSelect`, never an effect on `selected`, so the *seeded* choice cannot scroll a page
  nobody has touched.
- **The masthead is outside the loading branch.** Its heading, note and history link depend on no
  request, so gating them on `isLoading` made the reader wait on `payment-methods/` to be told what
  page they were on — and kept the whole thing out of the server's HTML. Only the account row inside
  it waits, and it has its own unknown state.
- **Transaction history is `/get-star/transaction-history`, and it is not `/my-star`.** The masthead
  pointed at that route for a while and it answered the wrong question: `/my-star` is billy's
  **balance movements**, this is paymee's **payments** (`GET checkout/v3/checkout/` — the same path
  `create` posts to). A top-up that failed or is still pending has no ledger entry at all, and is
  exactly the row somebody opens this to find.

  It was a dialog first, on the argument that somebody checking last week's top-up is mid-purchase. A
  **page** wins anyway: this is a list people link to, bookmark, and send to support with a
  transaction id in it, and a modal can do none of those. The address is nested under the screen that
  owns it and named the way its sibling is (`/my-wallet/transaction-history`). Legacy has no such URL
  — its history is a modal — so nothing in `proxy.ts` redirects: no address moved, one was added.

  Being a route, it gates the **action** rather than the route: a guest gets the page and a sign-in
  prompt, exactly as `/my-star` does. One list at every width; legacy ships a **DataGrid table** above
  `sm` and a list below, ~230 lines each. Grouped by month in one panel — the grammar `/my-star` and
  `/my-wallet` already use — with the ledger's own stagger rule (`riseDelay(position++ % pageSize)`, a
  running index **across** groups so the ramp does not reset at every month header). Rows the backend
  sends with no `created_at` get their own trailing label rather than sitting under the month above
  them, which read as a purchase made in it. `lib/transaction-status.ts` maps the wire vocabulary to
  `settled | pending | failed` and fails unknown values to **pending** — the only one of the three
  that is honest about a state this client does not recognise (**B87**). `TransactionList` is
  props-only, so `/dev/get-star` previews the month headers and all three statuses without an account
  that has actually bought Star.
- **`/dev/get-star` covers every state no URL reaches**: the package grid (bonus badge, recommended
  badge, the "you receive" line on the selected tile), the gateway rows, the purchase history's month
  headers and four row shapes, the **not supported** screen — which on the real page needs a region
  with no gateway enabled, i.e. an intercepted request — and **both skeletons**. Each is the shipped
  component, not a mock: `TransactionList` and `StarCatalogueUnavailable` were extracted precisely so
  the harness renders the real thing rather than a copy that drifts.

  **Below `md` the surface is the screen, not a card**, and the row stacks. One class in two places
  (`<main>` and the sticky bar, `GET_STAR_TRANSACTIONS_SCREEN`): on a phone the column is already
  full width, so there is nothing for a card to be a card against, and `<main>` has to paint it or
  the area under a two-row history is a strip of page colour beneath the panel. The reference pair is
  `GIFT_CODE_SCREEN` / `GIFT_CODE_PANEL`. The row's second line splits there too — joined,
  `Credit or Debit Card (USD) · Aug 26, 2026, 02:02 AM` is ~230px against the ~190 a 390px row has
  left, so the **method name** was what elided, and the method is the half being scanned for. The `·`
  is drawn only from `md`, since it separates two things on a line.
- **A guest gets the account row too, carrying a Log in control.** It was hidden for them at first,
  on the argument that there is no balance, handle or id to print — which left the masthead a heading
  and a sentence, and the only thing on screen saying an account matters was a caption under the Pay
  button at the very bottom. The row's job is to name who is being credited, and *nobody yet* is an
  answer with an action attached. The **history link is** hidden for them, and that is not a gate:
  they have no purchases, so it would lead to a page whose only content is the prompt they can
  already see one row below. Legacy hides it on the same condition. The button says **Sign in**, the
  app's own word, not the comp's *Log in* — two words for one action across one app is worse than
  matching a mock exactly. Its glyph is the **filled** person because the DS ships no other weight:
  `user-simple-alt` is one of the 65 bare ids aliased onto `--filled`, and there is no
  `--regular` for it in the upstream sprite.
- **The masthead names the account being credited.** This app holds up to ten (`token.ts`), and this
  is the one screen where somebody spends real money *into* one — so the face, the handle and the
  numeric id are on screen before the press, which is what makes a top-up bought on the wrong account
  a mistake the reader can see rather than discover. (What a *guest* gets in that row is the bullet
  above.)

  **One row at every width — it never stacks.** The identity is `flex-auto min-w-0` and the balance
  sits beside it, so the split is `100% − the other side` with **content flex-bases**. `flex-1`
  (basis 0) was wrong: it made the identity absorb every pixel of shortfall on its own, so the
  balance column never yielded and its caption — 116px, labelling a 91px figure — cost the display
  name its last 20px at 390.

  Priority *inside* the identity is a rule, not a ratio: the name is `shrink-0`, the row above it
  `overflow-hidden` (so a 40-character name clips at the row instead of spilling out of the card),
  and the **handle** is what gives way. Shrink *factors* were tried first — 1 against 999 — and did
  not hold: flex weights shrinkage by factor × basis, and a truncating item's basis is not what it
  looks like. Below the comp's own ~470 the caption wraps to two lines, which is the one thing that
  degrades; nothing disappears.

  ⚠ **Verify this by screenshot, never by measurement.** `scrollWidth`, a `Range` rect and a detached
  clone all reported "Wondercat" as 92px in a 92px box — *not* truncated — while the render clearly
  showed `Wonder…`. Every width API is clipped by the element's own `overflow: hidden`, so a
  `truncate` element cannot measure its own overflow. Two rounds of this work were spent trusting
  those numbers.
- **`?need=` exists but is not the normal path.** `useRequireStars` still opens the *sheet*; the
  parameter is for surfaces that cannot open one (a webview link, a notification). It is read after
  mount from `window.location` — never `useSearchParams()`, which would opt the route into dynamic
  rendering — and then swept, so a reload after a purchase does not re-apply a gap that is closed.
  It is also cleared when a Star purchase **settles**, or somebody who arrives on `?need=1000`, buys
  it and presses Done lands back on a page still reading *"You need 1,000 more Star"* over a balance
  that now covers it. Cleared from the **bus**, not from a `succeeded` render: a settle can land with
  the dialog closed and the machine already back at `idle`. The read itself is behind a ref — the
  effect depends on `router`, whose identity is not ours, and a re-run puts the gap straight back.
- **No `loading.tsx`**, for the CSP reason `CardManagementSkeleton` records; `GetStarSkeleton` is
  driven from the view's own `isLoading`.
- The status dialog's *Get more* and the transfer dialogs deliberately keep the **sheet** (or plain
  text): all three sit over work in progress, and a link out of them discards it. On `/get-star`
  itself *Get more* opens nothing — the catalogue is already mounted behind the dialog, so the press
  is only the close it already performs. The button stays drawn, because an absent `onBuyMore` means
  "this surface cannot offer Star" and this one offers it in one press instead of two.

**A second bug, found while restyling the masthead: `type-title-t3-semibold` does not exist.**
The DS scale runs T1 = 24 and T2 = 20 and stops there (`card.tsx` spells out that the numbering runs
opposite to the sizes). Three call sites used a T3 that Tailwind therefore emitted nothing for, so an
`<h2>` and a total rendered at inherited body size with no weight — which is exactly what "the
heading looks too light" turned out to be. Fixed here, in `get-star-view.tsx` and in
`features/nsfw/nsfw-gate-panel.tsx`, which had the same dead class and no connection to this work.
A `.type-*` typo is silent: it is a plain class name, so nothing type-checks it and nothing lints it.

**The masthead's link is purple through `--text-brand`, not through the accent-button token.** The
Primary ramp mirrors around 500, so `--primary-500` (and `--button-accent-bg` with it) is `#501bc0`
in **both** modes — **1.91:1** on the dark surface, i.e. unreadable. `--text-brand` is the one that
inverts (500 → 600): 9.3:1 in Light, 3.6:1 in Dark. Same token, same divergence-from-blue, as
`/my-wallet`'s **View all**.

**A bug this shipped with, found against the real catalogue.** `MOST_POPULAR_INDEX` badged tile 0
unconditionally — but `stars/v3/conversion-packages/` carries `labels: ["Most popular"]`, and on the
live catalogue it is on the **500** package while **300** is listed first. The app was printing a
recommendation the backoffice never made, over a price. `recommendedIndex` now reads the field (the
badge's *words* stay ours — the payload's are English and this app ships in nine languages), with
index 0 as the fallback for a catalogue that tags nothing.

### 4.2 `pay-with-card-panel`

Legacy's structure exactly, minus the Accordion (legacy puts the radio list inside an accordion plus
accordion actions, making three levels of nesting for one list):

- The card list is `List` + `Radio`, each row: brand + `····last4`, sub-line `Expires MM/YYYY`, a
  `Default` badge.
- Two action rows below the list: `＋ Add card` (`plus`), `Pay another way` (`address-card`).
- "Pay another way" = `PaymentElement` (`layout: 'tabs'`) → Apple/Google Pay, local wallets. It has a
  link back to "Use a saved card" when the account has cards.
- **No cards at all** → open `PaymentElement` directly, do not show an empty list.
- Submit button: `accent`, and the label **carries the amount** (`Pay $10.29`) — not "Done" as in
  legacy.
- **An expired card is unusable, and checkout never opens pre-selected on one.** `isCardPayable` /
  `pickPayableCard` (`lib/card-brand.ts`): the row is disabled, prints `Expired MM/YYYY` in the error
  colour, and the "Expired" badge **wins** the slot over "Default" — someone looking at their own
  default card needs to know that exactly that card is the unusable one. If **no** payable card is
  left, the panel opens on the new-method form. `pickDefaultCard` (`api/types.ts`) deliberately does
  *not* do this — it belongs to the management screen (§4.4). Returning `null` is also why the panel
  is never in a "there is a list but nothing is selected" state.
- Under the button: a `lock-simple` line + "Card details are handled by Stripe; Tevi never stores
  your card number."

### 4.3 `add-card-dialog`

Legacy mounts four separate elements itself (`cardNumber`/`cardExpiry`/`cardCvc`/`postalCode`) via
`elements.create` + `mount('#id')` + refs, manages `complete`/`error` for each one, and builds a
country select from `CoreModel.getCountries`. **Drop all of it.** Use one `PaymentElement` with
`setup_future_usage` + `AddressElement` (`mode: 'billing'`, `fields.phone: 'never'`) — Stripe
validates, translates, and owns the country list.

- The "Set as default card" checkbox → after a successful `confirmCardSetup`, call `setDefault`
  (keeping legacy's behaviour) and invalidate the card list.
- The **10-card cap**: at 10, the `＋ Add card` action row is disabled with helper text; fixes
  off-by-one #8.

### 4.4 `/card-management` — **1:1 with the web app's layout**

Not the DS list panel. Legacy (`containers/cardManagement`) lays out: **a sticky header section →
one bordered box per card on the page background → the scheme strip → the PCI line**. This is what
shipped:

```
 Payment methods                          [＋ Add new card]   ← sticky; at the cap it becomes `10/10`
 ┌──────────────────────────────────────────────────────────┐
 │ [VISA]  ···· ···· ···· 4242            Default      ⋮    │  ← bordered box, radius 8
 │         Expires 05/2030                                  │
 └──────────────────────────────────────────────────────────┘
        [ VISA  MC  AMEX  JCB … ]                             ← 324×58 strip from legacy's CDN
   We are fully compliant with Payment Card Industry…         ← 12/400, centred
```

- **There is no panel wrapping the rows.** Two reasons, and the second is technical: legacy draws
  separate boxes, and a `position: sticky` header **cannot** live inside an `overflow-hidden`
  ancestor — it would stick to the bottom of the panel instead of the viewport (the trap already
  recorded by the `/my-membership` panel).
- **Real brand marks**, via `react-svg-credit-card-payment-icons` (§4.7). Import the 9 specific icons
  rather than using `PaymentIcon`: that component resolves names at runtime, so it drags all 6
  formats × every brand (`dist` is 4.8 MB) into the bundle.
- **A two-block empty state** like legacy: the notice "You don't have any card. Please *add a new
  card..*" (inline link, `--button-accent-bg` = legacy's `#501BC0`), then an illustration block
  227×204 + a title + one line + an `accent` button. Both blocks carry the scheme strip and the PCI
  line.
- **The row**: 42px brand mark · `···· ···· ···· 4242` · `Expires MM/YYYY` · `Default` **or** an
  inline `Set as default` text button · `⋮`.
- **Expired cards**: print `Expired MM/YYYY` in `--text-error`. Here they are **still selectable** —
  this is the *management* screen, and an expired card is precisely the row someone came here to deal
  with. Checkout is the opposite: see §4.2.
- **`⋮` has exactly one item: `Delete`** (destructive). "Set as default" is an **inline** text button
  on the row — as in legacy, and more correct: it is the row's primary action.
- **Three dialogs**: confirm set-as-default (*Set as Default? / Yes, I want*), confirm delete
  (*Delete This Card? / Yes, Delete*), and the **notice** *This Card Can't Be Removed* when only one
  card is left — legacy has this dialog, it is only the silent `return` in its hook that is dropped
  (§1.4 #7).
- **Loading**: a skeleton built to the row's geometry (remember the "black skeleton in dark mode"
  trap). **Error**: `Alert` + `Retry` — legacy shows nothing. **Signed out**: gate the action with a
  prompt.
- No optimistic update for `remove`/`setDefault`: this screen is about money, and both are fast.
- Tokens instead of hex: `#A3A3A3` → `--text-placeholder`, `#666` → `--text-subtitle`, `#C2C2C2` →
  `--text-disabled`, `#E0E0E0` → `--separator-default`. That is why this version works in dark mode.

### 4.5 `checkout-status-dialog` — **one** dialog, five states

| State | Art (no tile — the art is transparent) | Title | Body | Actions |
|---|---|---|---|---|
| `confirming` | `progress.webp` (loops) | Confirming… | "Don't close this window." | — (cannot be closed) |
| `settling` | `progress.webp` (loops) | Processing your transaction | "Your bank is confirming. This can take a few seconds." | `Close` (keeps polling in the background) |
| `slow` | 60px **warning** disc + a white `clock` | Still processing | "Your balance will update once it's done. You can follow it in My Star." | `View My Star`, `Close` |
| `succeeded` | `success.webp` (plays **once**) | **copy chosen by the callback response's `type`** | see the table below | `Get more` (only for Star purchases) + `Done` |
| `failed` | `failed.webp` (plays **once**) | Payment unsuccessful | the BE message if it is a 4xx, otherwise our own key | `Retry`, `Close` |

**The success copy is chosen by `type`** — `lib/purchase-kind.ts` maps the wire strings once, so the
dialog is left with three pairs of literal keys (`keys.test.ts` can only see literal keys):

| `type` | Title | Secondary button |
|---|---|---|
| `subscription` | "You're now a member of this Space" | — |
| `direct_donation`, `crowdfunding_donation` | "Thank you!" | — |
| everything else (Star) | "Payment successful" | **Get more** → reopens the sheet |

Those three strings are legacy's; the fallback branch is legacy's `default` too, and it is also where
a **Star purchase** lands — legacy never enumerates a type for Star at all. The cost if the default
is wrong: a "Get more" button on a non-Star transaction — slightly off, not a money bug. **B69** is
the question that closes it. Legacy's "Get more" pushes `/get-star`; this app has no such route
because buying Stars is a sheet layered over what you were doing, so the provider passes
`purchase.open()` itself.

Error copy follows the rule already in the repo for `signInErrorText`: take the BE's body message
**only** when it is a 4xx and a short sentence; on a 5xx use our own key. Never print axios's
`error.message`. `aria-live="polite"` on the status region so a screen reader hears the state change.

**All five states share one 96px slot, and that slot has no tile.** The art is the design team's
animation, with the white background keyed to real alpha (§4.7), so the mark sits directly on the
dialog in both themes. An earlier version put the art on a **white disc** — which art without alpha
forces you to do — and in dark mode it read as a white sticker. The slot is a fixed 96px because the
art must not make the dialog jump: three states share this header and two of them *arrive* while
someone is looking. 96 = the DS's 60px mark plus breathing room; the success canvas (144px, nearly
all of it transparent confetti) is allowed to overflow the slot rather than forcing the other four
states to reserve that height.

Each asset ships with a **still** for `prefers-reduced-motion`, and the pair swaps in CSS
(`motion-reduce:hidden` / `motion-reduce:block`) rather than through a media query read in JS — CSS
is a *fact*, so server and client render the same thing and there is no hydration mismatch.

The verdicts still `POP` (the app's "something just arrived" motion); the two in-progress states do
**not** pop, because nothing has arrived yet — popping at every step turns one purchase into three
"just arrived"s.

`slow` is the only state without art (the set only covers success/failed/in-progress), so it keeps
the **60px amber disc + a white `clock`**: the same construction as the three marks beside it (a
coloured disc with a white symbol), round rather than the DS's square tile — next to three circles, a
square tile reads as a different design language. Amber rather than grey: the money has gone, the
transaction is unfinished, and nobody is watching it any more; grey says "there is nothing here",
which is the opposite of what that state means.

⚠ **A sprite trap, already fallen into once.** `scripts/build-icon-sprite.mjs` subsets the sprite by
**scanning literals**. The glyph table passed `name={GLYPHS[k].name}` (now down to just
`SLOW_GLYPH`) + `weight="filled"` on the tag ⇒ pass 1 could not pair them up (the name is a
variable), pass 2 kept only the **bare** id ⇒ we shipped `<use href="#clock--filled">` pointing at a
symbol that is not in the file: **an empty amber tile**, caught by no test, visible only by staring
at a screenshot. Pass 3 exists for exactly this shape (`{ name: 'x', weight: 'y' }` spread into
`<Icon />`) and its regex needs the two keys **adjacent** — which is why `tile` has to come last.
`check-circle--filled` / `xmark-circle--filled` survive only because `shared/ui/alert.tsx` lists them
in the builder's `KEEP` — i.e. **by luck**, exactly as that list's comment predicted.

⚠ **A link inside this dialog has to close it, and that is not the general rule.** `View My Star` is a
real `<Link>` — and this dialog is mounted by `PaymentProvider`, *above every route*, which is the
whole reason a payment survives a 3DS hop. So a client-side navigation unmounts nothing: pressing it
took the reader to `/my-star` **with the modal still over it**. `redeem-result-dialog.tsx` has the
identical construction and is correct without an `onClose`, because it is rendered by its own page.
The rule is not "links in dialogs close them" — it is that *a dialog outliving the route it was opened
from must close itself*. Pinned by a test that fails when the `onClick` is removed.

Preview all five states at `/dev/checkout-status`.

### 4.6 Theming Stripe Elements

Elements live in an iframe → they **cannot read our CSS variables**. So:

- `stripe-appearance.ts` reads the resolved tokens
  (`getComputedStyle(document.documentElement)`) for `--surface-*`, `--text-title`, `--text-body`,
  `--border-*`, `--primary-*`, radii and `--font-inter`, then builds the `appearance` object.
- On a theme change (next-themes) → pass a new `appearance`; `@stripe/react-stripe-js` can update
  appearance without remounting. **Only** a changed `clientSecret` remounts (`Elements` is keyed on
  `clientSecret`).
- `locale` is mapped from the app locale through `stripe-locale.ts`; Stripe supports `ar`, so RTL is
  Elements' own problem. Any locale Stripe does not have → `'en'` (not `'auto'`: that reads the
  browser locale, which can disagree with the locale the user picked in the app).

### 4.6b Gateways have a **band** — and the sheet has to respect it

The real `gw.stripe` payload carries `min_payment_amount: "0.00"` / `max_payment_amount: null` (no
limit), but the fields exist, and a local wallet with a floor is the reason they exist.
`gatewayAccepts` compares against the **package price**, reading `0` as "no floor" and `null` as "no
ceiling" — exactly how the payload writes it. Without it, the sheet offers a $0.99 package for a
gateway with a $5 floor, and the user presses Pay to receive a **400 with nothing on screen to
explain it**. The band is declared by the catalogue, so refusing client-side is the right place.
Details + the open question: **B70**.

From the same payload: one card gateway ships **two** logos (Mastercard *and* Visa); legacy draws
`images[0]`, so it advertises one scheme. The row now draws up to three.

### 4.7 The asset gaps — stated plainly

- The DS sprite has a generic `credit-card` (since the 2026-10-08 library import; only `address-card`
  before) and no brand logos. **Solved, and not by drawing anything by hand:** the brand marks come from `react-svg-credit-card-payment-icons` —
  the very package legacy uses. These are **trademarks**, not DS iconography, so they do not belong
  in the sprite: Visa's mark is Visa's, and the DS has no right to restyle it. Import the 9 specific
  icons rather than `PaymentIcon` (which resolves names at runtime → drags all 6 formats × every
  brand, `dist` 4.8 MB).
- The "Add new card" button draws `card-plus` (legacy inlines its own SVG of the same thing); it was
  `plus` until the 2026-10-08 library import. No approximation remains on the card screens.
- The empty-state illustration + the scheme strip **reuse legacy's exact assets**, through
  `lib/illustrations.ts`. Two assets, two treatments, per the rule in
  [`docs/STATIC_ASSETS.md`](STATIC_ASSETS.md):
  - `no-cards.png?v5` (70 KB) → `public/illustrations/payment/no-cards.webp` (**25 KB**), clamped to
    341px, which is the source's real resolution. `?v5` — legacy's cache-buster — disappears with the
    URL: a file in the repo has the commit that landed it as its version.
  - `icon-cards.svg` (45 KB) → **copied verbatim** as `card-schemes.svg`. It is a genuine vector, so
    no re-encode (rasterising a strip of scheme logos blurs it at the DPR people read it at), but a
    remote SVG is **passed through** untouched by `next/image` — 45 KB straight into the browser, on
    the very screen that holds card details. `dangerouslyAllowSVG` is permission to *serve*, not to
    process.

  Both are local because of the general rule: `src/` does not point a static image at another host.
  On the card screens the reason is even less about bytes — every cross-origin request is one more
  party inside the transaction.
- ~~The checkout status dialog needs 3 illustrations~~ **✅ done** — the design team published 3 GIFs
  on `static.tevi.dev/home/`, and `scripts/build-payment-art.mjs` turns them into shippable assets in
  `public/illustrations/payment/`:

  | source | | result | |
  |---|---|---|---|
  | `payment-success.gif` | 126 KB | `success.webp` (plays once) | **53 KB** |
  | `payment-faileds.gif` | 90 KB | `failed.webp` (plays once) | **18 KB** |
  | `payment-inprogress.gif` | **1.26 MB** | `progress.webp` (one cycle, loops) | **64 KB** |
  | | 1.45 MB | + 3 stills for reduced-motion | **144 KB total** |

  Four transformations, each with a measurable reason:

  1. **Keying the white background to real alpha.** Not a threshold: a threshold cannot tell white
     *behind* the art from white *inside* it, and both marks are built out of it — the tick inside the
     green badge, the cross inside the red disc (21,748 px). So the background is defined by
     **reachability**, the way a paint bucket does it: flood from the frame's edge through pixels
     bright enough to be background; whatever the flood cannot reach is art, however white it is. A
     reached pixel is *un-blended*, not erased: `P = αF + (1−α)·255`, so `α = 1 − min(P)/255` and
     `F = (P − 255(1−α))/α`. That is what keeps the edges from fringing white — and more importantly,
     it makes the success animation's faint glow go *dark* on a dark background, just as it is nearly
     invisible on white, instead of becoming a bright disc.
  2. **Normalise to the mark, not to the frame.** The two marks are drawn at completely different
     scales: the failed disc is 562px, the success badge 190px, inside the same 640px frame. Fit the
     frame into a box and the tick ends up a third the size of the cross — exactly the bug the
     previous version had. The crop is now measured from the **settled mark**, all three scale so the
     mark reads at 60px (the DS illustration size), and around it sits a `ratio` of canvas for
     whatever the animation throws outside the mark (success confetti reaches 2.4× the badge; the
     other two barely leave their silhouette). The canvas is transparent, so extra width is nearly
     free — success spends 8 KB to go from "clips the outermost confetti" to "clips nothing".
  3. **One cycle of the loop, and cut the intro that only works on white.** The progress cycle is
     7.08 seconds with every frame unique, so there is nothing to dedupe — but it is a **rigid
     rotation** (measured: 8.0°/frame, residual 13× below baseline) of a two-fold symmetric shape, so
     it repeats after ~23 frames. `findCycle` measures that period and keeps one cycle: that is where
     1.26 MB → 64 KB comes from. Measured rather than hard-coded, so a republished GIF gets measured
     again instead of cut wrongly. The success art is the opposite — its first 30 frames draw a circle
     and then **fill it white before filling it green**: on a white background that reads as "the
     badge is filling up"; once keyed it is a white disc flashing for 0.2s. Cut. The mark now enters on
     its confetti burst — which is also the better dialog: the spinner it replaces has been turning
     for seconds already, and nobody needs a second spin-up to be told it is done. Finally, **the
     settled tail is cut**: `-loop 1` holds the last frame forever, so encoding 25 more copies of an
     unchanging badge buys nothing.
  4. **Animated WebP for all three.** Not because it is the smallest but because it is the **only**
     widely supported animation format that keeps alpha: h264 has no alpha channel, and the
     WebM/HEVC-alpha pair means a different file per browser. Once cut to a single cycle, WebP's lack
     of temporal prediction stops mattering.

  On top of that: both marks are re-encoded to **play once** (the sources loop ~63,777 times — a tick
  redrawing itself every 5 seconds under "Payment successful" is a tic, not a state), and each asset
  gets a **still** for `prefers-reduced-motion` (the last frame for the two verdicts, one frame of the
  cycle for the loop — an animation that is not allowed to run should hold its *conclusion*, not its
  first frame).

  `unoptimized` on `next/image` is **mandatory**, not a shortcut: the optimiser renders an animated
  file down to its **first frame**, so the tick would appear already drawn and the arrow would never
  turn.

  `expect` in `ART` fingerprints each source file (byte count + frame count), because `from`/`count`
  were measured against exactly those three files. A republished GIF **fails the build** rather than
  silently cutting in the wrong place.

  What remains: `slow` has no art (the set only covers success/failed/in-progress), so it keeps the
  **60px amber disc + a white `clock`** — the same construction as the three marks beside it (a
  coloured disc with a white symbol), not the DS's square tile, because next to three circles a
  square tile reads as a different design language.
- ⚠ **Try again was a dead button on the 3DS return.** The callback URL can rebuild the *payment* but
  not the *order* — `RESUME` leaves `order: null`, as the type says — and `retry()` is
  `if (order) start(order)`. So on the redirect path the failure dialog rendered a Try again that did
  **nothing at all**, on the one screen where that is least affordable. It is now offered only when
  there is an order to restart; without one the dialog shows Close alone, as the primary action, and
  the reader starts again from the screen they are standing on. Pinned in
  `checkout-status-dialog.test.tsx`.
- ⚠ **The callback has no envelope — and that was a real bug, now fixed.** Every other `paymee`
  endpoint wraps its payload in `{ data }` (legacy reads `res.data.data` for checkout /
  payment-methods / packages), but for the two callbacks legacy reads **`res.data.type`**: a flat
  body. The client unwraps by *origin*, so this body was "unwrapped" into its own `data` field —
  `null`. A donation that really did charge came back with no `type`, and the dialog printed the
  **Star copy** ("your balance has been updated") with a Get more button. Fixed with
  `enveloped: false` in `checkout-api.ts` (a per-request opt-out, not a loosening of the general rule
  — because if the payload's `data` were an object rather than `null`, any heuristic would break
  again). Pinned at three layers: the interceptor (`client.test.ts`), the call site
  (`checkout-api.test.ts` — where `expect.anything()` used to let it through), and the parser
  (`settle-outcome.test.ts`, both shapes). **B70** asks the backend whether this is deliberate or just
  out of sync.
- Sprite: see the literal-scanning trap in §4.5.

### 4.8 i18n

New key namespace: `payment_*` (`payment_get_star_title`, `payment_total`, `payment_fee`,
`payment_pay_amount`, `payment_secured_by_stripe`, `payment_card_added`, `payment_card_deleted`,
`payment_status_processing_*`, `payment_status_slow_*`, `payment_status_failed_*`,
`payment_card_limit_reached`, …). Restating the repo rule: a new key must exist in **all 9 locales**,
not just `en` (`resources.test.ts` fails if one is missing).

### 4.9 Tracking (keep legacy's funnel)

`tapped_buy_stars` (+ `purchase_trigger`, `source_screen`), `viewed_star_packages`,
`selected_payment_method` (`method` = the gateway id **exactly as sent to checkout**, so it can be
joined against the BE's `purchased_stars_v2`), `star_purchase_started`. Added: `payment_settled`
(`gateway`, `purchase_type`, `attempts`) and `payment_failed` (`gateway`, `code`) — legacy has no
event for the outcome, so the drop-off at the last step cannot be measured.

---

## 5. Payout / Stripe Connect — **not** part of this feature

`v5/billing/payout/stripe-onboard-link/` is **money going out**; it belongs to
`features/earnings`/`my-wallet`, not to checkout. It only shares the word "Stripe". UI states:
`not_connected` → `onboarding` (leaves the page, comes back via `return_url`/`refresh_url` =
`/my-wallet/payout-method`) → `pending` → `active`. Remember to fix `'_seft'` → open in the **same
tab** (`window.location.assign`), because Connect onboarding returns via `return_url`.

---

## 6. Tests

**Vitest (pure):** `gateway-fee` (including the missing-`min_unit` branch, rounding, cent units),
`checkout-action` (all 4 actions + garbage bodies), `checkout-machine` (every transition, especially
`settling → slow` and "never accept `succeeded` from `idle`"), `checkout-callback` (legacy's 3 query
shapes, the bare-`?gateway=` guard, and both sweeps), `settle-poll` (bounded, abort, backoff — with fake timers).

**Vitest (hooks, the `Probe` pattern):** `use-checkout` with `stripe` **injected** (which is why
`stripe-loader.ts` allows injection, the same way `shared/lib/socket/` injects `io`) — this pins two
races: "switching accounts mid-confirm still charges the account that was active at the press" and
"unmounting mid-poll leaves no live timer".

**Playwright:** `/card-management` renders 3 states; returning to the app with
`?payment_intent_client_secret=…` (mocked BE) → the `settling` dialog then `succeeded`, and **the URL
has been stripped**. Remember the trap in `e2e/README.md`: scope queries to `main`, because the
account drawer is mounted on every route.

---

## 7. Questions for the backend — **added to `docs/BACKEND_QUESTIONS.md` as B62–B67**

(And the **duplicated B60** is fixed: the memberships block became **B61**, while the
`top-earning-content` block keeps B60 because `features/analytics/api/types.ts` cites the "B57–B60"
range; the 3 citations in `my-membership` were updated accordingly.)

| # | Question | Cited in |
|---|---|---|
| B62 | Does `checkout/*` deduplicate / accept an `Idempotency-Key`? Is it retryable? | `api/checkout-api.ts` |
| B63 | Is Star really priced from `quantity` (no package id sent)? Is `bonus_amount` applied by the BE? | `api/types.ts`, `lib/checkout-order.ts` |
| B64 | Is `action` a closed set, and is its casing fixed? Does `action_data` reliably carry the matching field? | `lib/checkout-action.ts` |
| B65 | How long can `PM0003` last? Is there a socket event on settlement so we can drop the poll? | `lib/settle-poll.ts` |
| B66 | Does `DELETE my-payment-methods/{id}/` return 200 or 204? Who promotes the new default? Is there a rule against deleting the last card? | `api/payment-methods-api.ts` |
| B67 | Is the 10-card cap enforced by the BE or the FE? What is the error code? Does a failed SetupIntent count? | `api/payment-methods-api.ts` |

The four remaining items from §1.4 have no B-number yet because they are *product decisions*, not
contracts: why Premium redirects while Star uses Elements (can they be unified), what set of values
`type` in the callback response takes, which parameters `redirect-callback/` whitelists, and whether
`stripe/config/` varies by account.

Two consequences of that third one are worth stating, because both are live in the code. **A
gateway round-trip is recognised by `TxnId`, or by `gateway` plus at least one parameter that is not
ours** (`lib/checkout-callback.ts`) — legacy's `TxnId || gateway` fires a 54-second settle poll on any
URL carrying either, and a settle with no reference for the backend to look a payment up by comes back
`rejected`, which tells the reader a payment they never made had failed. The counting rule stands in
for the whitelist nobody has yet. And **the sweep is a denylist for the same reason**: a gateway's
parameters are in no list of ours, so once they have been forwarded — which is the only thing they
are for — `stripHandledParams` clears everything on the URL except the screen's own
(`SCREEN_PARAMS`: `tab`, `gift_token`, `utm_campaign`). Keeping them would leave a provider's reference and signature
in the address bar and in history, and would nest a **stale** reference into the next payment's
return URL, where `URLSearchParams.get` answers with the first of two identical keys — the settle
would then describe the wrong charge. `stripCallbackParams` remains the by-name sweep, and is still
what `lib/return-url.ts` uses, since it builds a URL before any callback exists.

1. **Does `PM0003` have an SLA?** The client needs a number to pick a poll count from. If there is a
   webhook → socket event, the poll can be dropped entirely (polling is the worst of the three
   options).
2. **Does `checkout/` deduplicate?** If it does (an idempotency key, or dedupe by order), the client
   turns on `{ retry: true }` and a network blip stops being a lost order.
3. **Is `action` a closed set?** Legacy knows 4 values; the client parses a union and fails closed in
   `default:`.
4. **What set of values does `type` in the callback response take?** It is currently used to pick the
   success screen's copy.
5. **Does `DELETE my-payment-methods/{id}`** return `200` or `204`? Legacy believes both, in two
   different places.
6. **Is the 10-card limit the BE's or the FE's?** If the BE's, what is the error code so the client can
   say the right sentence?
7. **Deleting the default card**: does the BE promote another one, or must the client call
   `set-as-default`?
8. **Does `stripe/config/`** vary by environment/account? It decides whether `staleTime: Infinity` is
   safe.
9. **Premium uses a hosted redirect, Star uses Elements** — is that a BE limitation (subscriptions
   need a Checkout Session) or just history? If a subscription can return a `clientSecret`, the two
   flows become one UX.
10. **`redirect-callback/`** takes the gateway's query verbatim; which parameters are legitimate to
    whitelist so the client does not forward junk?

---

## 8. Order of work

| Pass | Contents | Unblocks |
|---|---|---|
| ~~1~~ | ~~`api/` + `lib/` + tests (no UI)~~ **✅ done** | the foundation for everything |
| ~~2~~ | ~~`use-saved-cards`, `add-card`, `/card-management`~~ **✅ done** | the drawer row has its `href` |
| ~~3~~ | ~~`PaymentProvider` + the machine + `checkout-status-dialog` + `use-checkout-callback`~~ **✅ done** | the backbone |
| ~~4~~ | ~~Star purchase sheet + wiring `useRequireStars`~~ **✅ done** | every price in the app |
| ~~5~~ | ~~Donation cash + membership card~~ **✅ done** | turned out not to be 2 lines — see below |
| ~~4b~~ | ~~`/get-star` — the same purchase as a page, sharing `useStarCatalogue` with the sheet~~ **✅ done** | the seven "when `/get-star` lands" notes |
| ~~6~~ | ~~Premium + billing portal~~ **✅ done** — `features/premium` and `/premium`. **Gift Premium is not built** | the `premium` order kind and `getBillingPortal` have callers |
| 7 | Coda / crypto | market-driven |

Passes 2 and 3 are independent, so they can run in parallel.

### What pass 6 landed, and what it left

`features/premium` owns the *offer* — the price table, the benefit list, this account's grant — and
this feature still owns the money: the screen builds `{ kind: 'premium', priceId }` and hands it to
`usePayment().checkout`, which was already carrying that kind and its `REDIRECT` branch. So nothing
in `features/payment` changed for it, which is the whole point of `lib/checkout-order.ts`.

Two things about that path are worth writing here rather than only in the other feature:

- **A Premium purchase does not settle on the page.** The hosted redirect comes back to `/premium` as
  a fresh document with no `payment_intent` on the URL, so `useCheckoutCallback` finds nothing and
  `payment:succeeded` never fires on that path. What confirms it is the backend's webhook, reaching
  the client as the `premium_info` socket frame. `usePremiumSync` listens to **both** that and the
  bus, because the same order *can* come back as a `STRIPE` action and settle in place.
- **`getBillingPortal` is called on a press, not on a mount** (this file's §98 lists legacy's version
  as a defect), and it opens a **new tab**, as legacy does — the portal is somebody else's site and a
  reader who came to cancel should not lose the page they were on.
  The obstacle is that the URL is only known *after* an await, by which time the gesture is spent and
  every browser blocks `window.open`. So the tab is opened **blank, inside the press**, and its
  location is set when the link arrives; a failure closes it rather than leaving an orphaned
  `about:blank`, and a popup blocked outright falls back to the current tab. `useBillingPortal`
  carries the reasoning and `use-billing-portal.test.tsx` pins the four windows a press can leave.
  `success_url` points back at `/premium`, which is what that parameter is for.
- ⚠ **Pressing Back at Stripe used to leave a dialog nothing could close**, and the fix is in
  `useCheckout` rather than in `features/premium`. `leaving` means "the browser is on its way to the
  gateway", and every consumer reads it as busy: `isCheckoutBusy` is true, so `useSubscribePremium`
  refuses its own cancel and `PremiumSubscribeConfirm` disables both buttons. Correct *while* the
  page is being replaced — and the **back-forward cache** disproves the premise. Safari and Chrome
  both restore a page that navigated away cross-origin, and they restore it whole: same tree, same
  reducer state. So the reader came back to "Purchase Tevi Premium?" with two dead buttons, no
  overlay dismiss and no Escape, and only a reload got rid of it. Measured: both buttons
  `disabled`, Escape and overlay inert, Cancel unclickable.
  `useCheckout` now dispatches `CLOSE` on a **persisted `pageshow`** when the state is `leaving` —
  `CLOSE`, because the machine already answers "may this be dismissed" and `leaving` was always
  dismissable, it was simply never asked; and keyed on `leaving` rather than on `isBusy`, so a
  `settling` poll (this page's own work, on money that has already left) survives the restore.
  `useSubscribePremium` additionally drops its `pending` package, so the dialog is *gone* rather
  than merely closable — the question was answered at Stripe. Six tests across the two hooks, and
  the guard is mutation-checked. It does **not** reproduce in a local Chromium: the cache is off
  there, so `goBack()` re-runs every script and the reducer resets by itself.
- ⚠ **Its response field was guessed wrong, and pass 6 is what found out.** The parser read `url`;
  the service answers `{ "data": { "redirect_url": "https://billing.stripe.com/p/session?secret=…" } }`,
  which is also what legacy reads. Because the parser resolves `null` for a body it cannot read,
  every press fell into the "no portal for this account" branch and toasted — a dead button on the
  one control a subscriber uses to cancel. It survived review because the **test was written from
  the same guess as the code**; `checkout-api.test.ts` now mocks the captured body, and the URL's
  `?secret=` is the reason that call is a mutation rather than a query.

**Gift Premium is still unbuilt.** It is legacy's own second screen (`containers/giftPremium`: a
creator search, a recipient, a message, three gift packages), not a variant of `/premium`, and it
needs `premium/v1/gift-packages/` — deliberately unmodelled, because an API method with no caller is
a DTO nobody has checked against a payload. The order kind (`{ kind: 'gift-premium' }`, with the
`?gift_token=` success URL) is already here and tested.

### What passes 2–3 landed

**Shared foundation (built before fanning out):** `@stripe/stripe-js` +
`@stripe/react-stripe-js`; `lib/stripe-loader.ts` (memoised by publishable key, **injectable** for
tests); `lib/stripe-appearance.ts` (reads the resolved tokens off the real document, with
**per-mode** fallbacks); `hooks/use-stripe-config.ts`; `components/stripe-elements-scope.tsx` (the
only place `<Elements>` is mounted, and `key={clientSecret}` is the only remount allowed); and the
**CSP** in `shared/config/csp.ts` — `frame-src` for `js.stripe.com` + `hooks.stripe.com`,
`connect-src` for `api.stripe.com`, and **nothing** added to `script-src` (`loadStripe` injects its
script from a bundle that already has the nonce, so `'strict-dynamic'` covers it, exactly as that
file already does for Turnstile/Google). Without those two directives the card form is a blank frame
and 3DS never appears — with only a console message to say so.

**Pass 2:** `use-saved-cards` (account-scoped key, no optimistic update, single-flight, cap 10),
`use-add-card` split into two hooks (`useAddCard` mints the SetupIntent through a **mutation** so the
client secret never enters the query cache; `useCardSetupForm` calls `confirmSetup` with
`redirect: 'if_required'`), 4 components + a skeleton, `/card-management`, and
`menu_card_management` finally having an `href`.

**Pass 3:** `use-checkout` (one `AbortController` per flow, cancelled on unmount / a new order /
resume; one shared `runSettlePoll` loop for both in-place confirmation and resume-from-URL; the
account is fixed at the press), `use-checkout-callback` (a ref guard, once per param set, skipping
`card-setup`, then stripping the params), `payment-provider` (invalidates `balanceKeys.all` + emits
`payment:succeeded`; a settlement nobody is watching becomes a **toast** rather than reopening the
dialog), and the 5-state `checkout-status-dialog`.

**One lying type, fixed after review:** `settling`/`slow` declared a `clientSecret`, but a gateway
callback **has no** secret — pass 3 had to stuff `TxnId ?? gateway ?? 'gateway'` in there. It is now
`settleRef` (an opaque handle nobody builds a request from — the request lives in the poll's
closure), together with `RESUME`. The machine, tests, hook and dialog all follow.

### What pass 4 landed

`useStarPurchase` (the sheet's state: 3 steps, package/gateway selection, the total) +
`StarPurchaseDialog` + `StarPackageGrid` + `GatewayList` + `PayWithCardPanel`, two catalogue hooks
(`useStarPackages`, `useGateways`), and `lib/star-packages.ts`.

- **The `payment:star-purchase-requested` event carries `ack()`**: `useRequireStars` emits,
  `PaymentProvider` listens and calls `ack()` **before** opening the sheet. mitt does not report
  whether there is a listener, and emit is synchronous — so `ack()` is how the emitter learns that
  somebody heard. It is needed because the provider only mounts in `(web)/layout.tsx`: a surface
  inside the `/app/*` webview (where card payment is hidden on purpose) has nobody to open the sheet,
  and there the old toast is still the right answer. It is also why this is an event rather than an
  import: `payment` already imports `balance`, so calling back the other way closes a cycle between
  two barrels — the exact bug `menu-active.ts` shipped.
- **Pre-selection by shortfall**: `pickPackageForShortfall` picks the **cheapest package that
  covers**, and it **counts the bonus** — a 900+100 package covers 1,000 Stars, and pushing the user
  to the 5,000 one is upselling them. If no package covers it, take the largest. Seeded **once per
  open**, and only once the catalogue has arrived.
- **`quantity` sends `amount`, not `packageStars`**: the bonus is the BE's addition, and sending the
  bonus-inclusive number is asking to be charged for it (B63).
- **The sheet steps aside** when the machine enters a state that `CheckoutStatusDialog` owns
  (`confirming|settling|slow|succeeded|failed`) — written as a list rather than "every other state",
  because inverting the condition makes `idle` close the sheet, i.e. close it right before
  `checkout/` answers. `leaving` is **not** in the list: the status dialog draws nothing for it, so
  closing the sheet would leave a blank screen while the browser navigates.
- **`checkoutActionOf(state)`** — a state → action projection. The machine deliberately does not store
  the action object (so impossible pairs like a `card` state holding a redirect URL cannot be
  represented); the UI wants the union back because "which panel do I draw" is one `switch` over 4
  kinds instead of 4 checks over 5 states.
- **The Pay button carries the amount** (`Pay $10.29`), not `Done` as in legacy. And "a new method" is
  a **radio in the same group** rather than a "Pay another way" button that swaps the whole panel —
  legacy loses the user's place in the list.

### What pass 5 landed

The spec said "2 lines per feature". Wrong — because pass 4 left a hole: **the card panel lived
inside the Star sheet**, so a donation or a membership tier returning a `STRIPE` action left the
machine in the `card` state with **nothing on screen**, and with `isCheckoutBusy` = true every
subsequent press was swallowed. Fixed first:

- **`CardCheckoutDialog` belongs to the provider** and serves **every** order kind. The rule is: *the
  surface builds the order, the provider collects the money.* Three surfaces growing their own card
  step is three copies of `confirm*` and three different ways to break — exactly the shape legacy has
  (`components/stripe/`, `membershipDetails/checkout/`, `getStar/`) and the reason its Premium flow
  redirects while its Star flow does not.
- `CheckoutOrder` gained **`amountLabel?`** — the *only* display field on an order, because the button
  that collects money has to say how much, and only the surface that built the order knows the
  currency, the decimals and where the symbol goes.
- `usePaymentOptional()` — returns `null` outside the provider. There is **exactly one** legitimate
  case and it is a product decision: a join dialog rendered inside a `/app/*` webview has no provider
  above it, because those screens sell through IAP (§3). It is not a way to make `usePayment` optional
  everywhere — and note the app's **own** card checkout, `/app/[channelSlug]/membership/[packageId]`,
  is not this case: it mounts no provider *and* no `AuthProvider`, because its transport is the native
  JS bridge (§3).

**Donation**: `CASH_ENABLED` (a constant) → `canPayByCard(target, hasProvider)` — it needs a **channel
id** (`checkout/v1/checkout/donation/` takes `channel_id`, whereas the Star path posts to the slug)
**and** a provider above it. Both are *read* rather than assumed, so the cash tab only appears where
it can actually be pressed. The button label is the **donation amount, not the total**: the fee row on
the confirm step already showed what the processor adds, and a button printing a bigger number than
the one someone typed reads as bait-and-switch.

**Membership**: `subscribe()` returns **`CheckoutAction | null`** instead of throwing. `null` = the
Star path is done; an action = waiting on a card → `checkout({ kind: 'handoff', source:
'membership', action })`. The envelope is checked *before* `parseCheckoutAction`, because a body with
no `action` would become `unsupported` — the one case where "unsupported" is a lie. `needsCard` is
left for the genuinely stuck case: no provider (webview).

### Left for later passes

1. **Currency selection for membership, on the website.** A tier with **only a USD price** still shows
   no button there: `renewalOffer` / `joinOffer` only build the `price_id` of the `TVS` row. This is a
   **price-selection** gap, not a payment one — the card path is alive. Sending the `USD` row as the
   default would silently change the amount a Star-priced tier collects. It belongs to the currency
   step (legacy's second screen), and goes with pass 6.

   The **webview checkout does not wait for it** and does not widen those two resolvers. It has its
   own, `lib/cash-offer.ts`, which fails closed on the *opposite* currency — because the native app has
   already chosen the lane, so `USD` is the intended currency there rather than a default nobody
   picked. Two resolvers, each fail-closed on its own currency, is what keeps the warning above true:
   neither can select a currency its caller did not ask for.
2. **The Coda iframe** (`action.kind === 'embedded'`): the sheet currently only says "taking you to
   …".
3. **`payment_price_usd` is hard-coded to USD.** If the BE starts returning `price_currency`, this key
   becomes `formatFiatAmount`.
3. **Success copy by `purchaseType`.** It is one generic sentence today, because the set of `type`
   values is an open backend question — printing "1,000 Stars" from an un-enumerated string is how a
   membership renewal ends up reporting a Star top-up.
4. **Assets:** the three success/failed/processing illustrations **exist** (§4.7 — the design team's
   GIFs, white background keyed to alpha and cut down to 144 KB). Still missing: the sprite has no
   card-brand glyphs, so the row prints `Visa ···· 4242` as text; `brandAssetName` is the only place
   to change when card art arrives. If the design team publishes versions **with alpha**, the keying
   step can go — it infers alpha from a white background, correctly, but it is still an inference.
5. **"Set as default" is lost on the 3DS redirect branch** of add-card: coming back is a new document,
   with no dialog state left. Noted in `use-add-card.ts`; fixable by putting the flag in the return
   URL if it ever proves necessary.

### Verified

`pnpm typecheck` · `pnpm lint` · `pnpm lint:rtl` clean; `pnpm test` **1525 passing** (213 of them
payment + CSP + i18n). The dev server renders `/card-management` 200 in both `en` and `vi`, and the
real response carries a CSP containing `js.stripe.com` / `hooks.stripe.com` / `api.stripe.com`.
