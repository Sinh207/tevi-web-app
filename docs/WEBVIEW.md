# `/app/*` — webview screens

`/app/*` is not part of the website. It is the namespace the **mobile app** opens in a
WKWebView / Android WebView and presents as one of its own screens: no navigation, no top
bar, no tab bar, no back button — the native chrome is already around it.

The consequence is that the app, not the browser, owns the presentation context. A
WebView's `Accept-Language` is the OS locale, not the language the user picked inside the
app, and there is no `prefers-color-scheme` that follows an in-app theme switch. So the
app passes that context on the URL.

Contract lives in [`src/shared/config/webview.ts`](../src/shared/config/webview.ts);
[`src/proxy.ts`](../src/proxy.ts) applies it. Both are covered by
`src/shared/config/webview.test.ts`.

## URL

```
https://tevi.com/app/<screen>?lang=vi&theme=dark&platform=ios&v=3.14.0
```

| Param      | Values                                          | Aliases          | If missing                                    |
| ---------- | ----------------------------------------------- | ---------------- | --------------------------------------------- |
| `lang`     | any code in `SUPPORTED_LOCALES` (`vi`, `zh-Hant`, `en_US`, `tl`, … — region and script tags are normalized) | `lan`, `hl`      | cookie → `Accept-Language` → `en`             |
| `theme`    | `light` · `dark` · `system`                     | —                | web default (follows the OS)                  |
| `platform` | `ios` · `android` (`iphone`/`ipad` fold to `ios`) | `os`             | unknown                                       |
| `v`        | the app's version string, free-form             | `app_version`    | unknown                                       |

Everything is **optional**, and anything unrecognised is **ignored, not clamped**:
`?lang=de` falls through to the normal locale chain instead of pinning the screen to
English, and a bare `/app/privacy` keeps working — old app builds send exactly that.

`lan` is an alias because the app team's mini-app URLs already use it (see the legacy
`MINIAPP_INTEGRATION.md`); `hl` because that is what most webviews send by habit.

## What the params actually do

Effects are applied **server-side, before the first paint** — the point is that a dark
Vietnamese screen never flashes white English first.

- `lang` → `<html lang dir>`, the i18n instance, and `getServerT()` (so `generateMetadata`
  agrees with the body). RTL locales flip `dir` and the whole layout mirrors.
- `theme` → the `dark` class is rendered on `<html>` *and* handed to next-themes as
  `forcedTheme`, which also disables the in-page toggle. That is correct here: the app's
  own settings screen owns that choice. `system` means "follow the OS", which is already
  the web default, so nothing is forced.
- `platform`, `v` → parsed and exposed on the request; no consumer yet. They exist for the
  first screen that needs to say something different on iOS (payment wording, say) or to
  gate behaviour on an app version.

Route-agnostic and per-request: every `/app/*` screen gets this, now and later, without
the page taking a single parameter.

## How it is wired

1. `proxy.ts` matches `/app/*`, parses the query, and forwards the values as
   `x-tevi-webview*` request headers. Those headers are **stripped from every incoming
   request first**, so a client cannot fake webview context on a normal page.
2. `app/layout.tsx` reads them, resolves the locale (webview → cookie →
   `Accept-Language`) and paints the theme class.
3. The same values are also written as cookies (`tevi.locale`, `tevi.theme`), because a
   client-side navigation *inside* the webview arrives without the entry URL's params. The
   theme cookie is only ever honoured on `/app/*` — on the public site the user's own
   next-themes preference still wins.
4. `app/app/layout.tsx` reserves the safe area with `env(safe-area-inset-top/bottom)`.
   Don't send insets as params: `env()` can't go stale on rotation, and a number can.

## No session, unless a screen asks for one

The root layout mounts only what any document needs — `QueryClient`, theme, i18n
([`app/providers.tsx`](../src/app/providers.tsx)). The session stack — auth, balance, own
channel, the login/switcher dialogs, the splash cover
([`app/session-providers.tsx`](../src/app/session-providers.tsx)) — is mounted one level down
by `(web)/layout.tsx`, which covers the website and not this namespace.

That split is the point. `AuthProvider` is not passive: on mount it makes sure the *device* has
a session — a device fingerprint, then `/me` on an existing token or, on a cold device, a
Firebase anonymous sign-in followed by `v1/connect/anonymous`. Right for the website; pure waste
on `/app/privacy`, which renders a static legal document, reads no account, and is opened inside
an app that already has the session. Measured on the dev server, the webview screen went from
four cross-origin requests (two Firebase, `auth/v1/token/`, `auth/v1/me/`) to none, and from 56
script chunks to 28.

A screen that genuinely needs the account opts in **for its own subtree**, and mounts the
**smallest** thing that answers its question. `/app/privacy-settings` — the app's account privacy
screen, the three `nsfw_settings` switches and a way out — is the one that exists today, and it
needs `/me` and nothing else:

```tsx
// src/app/app/privacy-settings/layout.tsx
import { AuthProvider } from '@features/auth'

export default function Layout({ children }: { children: React.ReactNode }) {
    return <AuthProvider>{children}</AuthProvider>
}
```

No `LoginDialog`, `AccountSwitcherDialog` or `SplashGate` either, and the first of those is the
interesting omission. A signed-out webview screen does not raise a dialog — it renders the sign-in
**in place of itself**, `<LoginScreen webview />`, because a modal is for interrupting something and
there is nothing behind it to protect. That flag is what makes `/login`'s own screen safe inside
this namespace: it takes its height from the shell rather than the viewport (see the safe-area note
above), and it points the consent line's two links at `/app/terms` and `/app/privacy` instead of the
website's, so the app never lands its user on the public site with the full web shell around it. A
webview screen that renders **any** of the website's chrome should be read the same way: check
where its links go.

**Not `SessionProviders`.** That is the website's stack — Realtime, Permission, Balance, Payment
and MyChannel on top of Auth — and each layer is a request or a socket a webview would open and
never read: a user-room websocket, `permission/v3/…`, the balance, `my-channel/`. Measured on the
dev server, the signed-in privacy screen touches exactly one W_API path (`GET /auth/v1/me/`) with
`AuthProvider` alone. Reach for a second provider when a screen actually reads it — a wallet
webview wants `BalanceProvider`, and a screen that must show the space's slug or verified badge
wants `MyChannelProvider`, because those are channel fields and `/me` does not carry them.

If a screen does need most of the stack, `SessionProviders` still takes `showSplash={false}` — the
native app has already shown its own splash.

Never for the whole namespace, and never by moving it back up: the legal screens are the
majority of `/app/*` and they must stay free.

### The screen that opts in to **nothing**: `/app/[channelSlug]/membership/[packageId]`

The app's **card checkout** for a membership tier — and the counter-example to this whole section. It
mounts no provider at all, not even `AuthProvider`, because on that integration point **the host owns
the session**. The native app opens the webview to charge *its* account, having already shown its
tier picker; the page is a renderer, not a client. So the account-scoped operations are asked of the
app over the JS bridge (`shared/lib/native-bridge.ts`):

```
TeviJS.membershipCheckout({ packageId, priceInfo })  → the PaymentIntent
TeviJS.myPaymentMethods({})                          → the saved cards
TeviJS.createStripeCallback({ clientSecret })        → has it settled?
TeviJS.membershipResult({ status })                  → dismiss me
```

Two things follow, and both are easy to get wrong in the other direction:

- **Public reads stay on HTTP.** The tier (`billy/v3/subscription/channel/{slug}/packages/{id}/`) and
  the Stripe publishable key need no session, and routing them through another process to fetch what
  anyone can fetch buys nothing. Legacy makes the same split.
- **Almost nothing else changes.** The state machine, the settle schedule, the payload parsers, the
  Stripe loader and the card panel all come from `features/payment` unchanged — only the transport
  differs. What that screen cannot use is `useCheckout`, `useSavedCards` and `useCheckoutCallback`,
  each for one mechanical reason: they call `useAuth()`, which throws outside `AuthProvider`.

This is **not** evidence that a webview has no session in general — `/app/privacy-settings` reads and
writes `/me` through the same-origin token store and works. It is a statement about one integration:
that flow was designed app-first, and the app is the client of record for it.

#### Testing it without a device: `/app/dev-checkout`

The screen is gated on a host being present, so in a browser it correctly draws `unsupported` and
stops — which is right, and untestable. `app/app/dev-checkout/` supplies the missing half: a
`TeviJSInterface` stub that answers the four messages by making **the same backend calls the app
would**, as whatever account this browser is signed in as. Real tier, real cards, a real
PaymentIntent, real Stripe Elements, a real settle including the `PM0003` branch. Give it a slug and
a package id and press Run; every message that crosses the bridge is logged under the frame.

Two things worth knowing about it:

- **It is under `/app/`, not `/dev/`, and that is deliberate.** It was at `/dev/membership-checkout`
  first, where the website's `PaymentProvider` sits above the page and its `useCheckoutCallback` won
  the returning-3DS callback every time — settling it over HTTP and stripping the parameters before
  the screen could look. Three attempts to win that race each lost to a different part of React's and
  Next's ordering, and the deeper point is that a harness rendering this screen inside providers the
  real route does not have is not testing the real screen.
- **It does not prove the app's reply envelope.** The stub answers in the shape this client expects.
  Whether a real host sends `data` as a JSON string, what its refusal codes look like, and which
  fields of `priceInfo` it reads are **B85** — only a device answers those.

It has already earned its keep: it is what surfaced the resume deadlock under React's development
double-mount (the teardown aborted the settle and a once-flag declined to restart it, leaving
*Processing your payment* on screen with no request in flight). No unit test had reached it; there is
one now.

You may not even need it. The token store hydrates itself on first read (`getAccessToken()` →
`hydrate()`), so a screen that only *reads* with the session the app already has gets its bearer
from the axios interceptor with no provider beyond the `QueryClient` the root layout already
gives it. What `AuthProvider` adds, and what you are choosing to go without, is:

- **the device id.** `primeDeviceInfo()` / `initDeviceInfo()` run in its bootstrap and nowhere
  else, and every token-minting call carries `device_id` — including the **refresh**, whose body
  is `{ refresh_token, ...getDeviceInfo() }`. So reads work and then stop working the moment the
  access token needs renewing. Mount `AuthProvider`, or prime the device yourself.
- **the only listener for `auth:session-expired`.** The axios client still drops the dead account
  and emits; with no provider mounted, nothing clears the query cache or re-establishes an
  anonymous session, so the request simply fails. Inside a webview that is usually right — the
  native app owns re-auth — but it should be a decision, not a surprise.
- the anonymous session itself, which a webview should not be minting: the app has one. Note that
  mounting `AuthProvider` **does** mint one on a cold device with no token in the same-origin store
  — `/app/privacy-settings` accepts that (the anonymous account lands in its sign-in state, which
  offers `LoginDialog`) because it *writes* `/me` and cannot go without the device id the refresh
  needs. A read-only screen should prefer `primeDeviceInfo()` to a whole bootstrap.

Two more notes for the opt-in path: the onboarding gate exempts `/app` by path
([`onboarding-gate.ts`](../src/features/channel/lib/onboarding-gate.ts)), so a creator without a
channel is not sent to create-space inside the app — that exemption is load-bearing precisely
here; and the tokens come from the same-origin store, so there is still nothing to put on the URL.

## 404

A stale link from an old app build (`/app/wallet` before that screen exists) gets a real **404**
plus a webview-shaped body: `404` and one line, no "Back to home". The branch is in the **root**
[`not-found.tsx`](../src/app/not-found.tsx), keyed off the webview flag, and it has to be there —
an unmatched URL is answered by the root not-found however deep it is, so an `app/app/not-found.tsx`
would never run, and a catch-all page calling `notFound()` would answer **200** because a
dynamically rendered route cannot set its own status (the same trap `(main)/[slug]/page.tsx`
documents and `proxy.ts` hard-404s `/dev/*` for).

One deliberate exception: **`/app` on its own answers 200** with that same body. The folder has a
layout and no page, so Next renders the not-found *inside* the layout — a dynamic render, hence no
404 status. It could be hard-404'd in `proxy.ts` like `/dev/*`, at the cost of showing the user a
blank screen instead of a message. The namespace is `noindex` — the `X-Robots-Tag` from `proxy.ts`
covers this page-less response too — so the status keeps nothing out of the index that the header
does not already; the message is read by a person. Body wins.

## Don't send auth

The webview is same-origin, so it already shares the `tevi.*` localStorage that
[`shared/lib/api/token.ts`](../src/shared/lib/api/token.ts) keeps tokens in — the session
is simply there. A token in a URL ends up in server logs, the `Referer` header and the
app's own history.

## Adding a screen

Create `src/app/app/<screen>/page.tsx`. Nothing else: the shell, the locale, the theme and
the safe area are already handled. Give it `robots: { index: false }` and a `canonical`
pointing at the public equivalent when one exists (`/app/privacy` → `/privacy`); `/app/`
is `noindex` by an `X-Robots-Tag` from [`proxy.ts`](../src/proxy.ts) as well, so the two copies
never compete. It is deliberately **not** disallowed in [`robots.ts`](../src/app/robots.ts): a
disallowed URL is never fetched, so its `noindex` would never be read. If the
screen reads the signed-in account, add a sub-layout that mounts `SessionProviders` — see above.

## Checking it by hand

```bash
curl -s 'http://localhost:3000/app/privacy?lang=vi&theme=dark' | grep -o '<html[^>]*>'
# <html lang="vi" dir="ltr" data-webview="" class="… dark">

curl -s 'http://localhost:3000/privacy?theme=dark' | grep -o '<html[^>]*>'
# no dark, no data-webview — the param only means something inside /app/*
```
