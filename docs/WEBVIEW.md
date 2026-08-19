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

A screen that genuinely needs the account opts in **for its own subtree**:

```tsx
// src/app/app/wallet/layout.tsx
import { SessionProviders } from '@app/session-providers'

export default function Layout({ children }: { children: React.ReactNode }) {
    // No splash: the native app has already shown its own.
    return <SessionProviders showSplash={false}>{children}</SessionProviders>
}
```

Never for the whole namespace, and never by moving it back up: the legal screens are the
majority of `/app/*` and they must stay free.

You may not even need it. The token store hydrates itself on first read (`getAccessToken()` →
`hydrate()`), so a screen that only *reads* with the session the app already has gets its bearer
from the axios interceptor with no provider beyond the `QueryClient` the root layout already
gives it. What `AuthProvider` adds, and what you are choosing to go without, is:

- **the device id.** `primeDeviceInfo()` / `initDeviceInfo()` run in its bootstrap and nowhere
  else, and every token-minting call carries `device_id` — including the **refresh**, whose body
  is `{ refresh_token, ...getDeviceInfo() }`. So reads work and then stop working the moment the
  access token needs renewing. Mount `SessionProviders`, or prime the device yourself.
- **the only listener for `auth:session-expired`.** The axios client still drops the dead account
  and emits; with no provider mounted, nothing clears the query cache or re-establishes an
  anonymous session, so the request simply fails. Inside a webview that is usually right — the
  native app owns re-auth — but it should be a decision, not a surprise.
- the anonymous session itself, which a webview should not be minting: the app has one.

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
blank screen instead of a message. The namespace is `noindex` and disallowed in `robots.ts`, so
nothing is crawling it and the status is read by no one; the message is read by a person. Body wins.

## Don't send auth

The webview is same-origin, so it already shares the `tevi.*` localStorage that
[`shared/lib/api/token.ts`](../src/shared/lib/api/token.ts) keeps tokens in — the session
is simply there. A token in a URL ends up in server logs, the `Referer` header and the
app's own history.

## Adding a screen

Create `src/app/app/<screen>/page.tsx`. Nothing else: the shell, the locale, the theme and
the safe area are already handled. Give it `robots: { index: false }` and a `canonical`
pointing at the public equivalent when one exists (`/app/privacy` → `/privacy`); `/app/`
is disallowed in [`robots.ts`](../src/app/robots.ts) so the two copies never compete. If the
screen reads the signed-in account, add a sub-layout that mounts `SessionProviders` — see above.

## Checking it by hand

```bash
curl -s 'http://localhost:3000/app/privacy?lang=vi&theme=dark' | grep -o '<html[^>]*>'
# <html lang="vi" dir="ltr" data-webview="" class="… dark">

curl -s 'http://localhost:3000/privacy?theme=dark' | grep -o '<html[^>]*>'
# no dark, no data-webview — the param only means something inside /app/*
```
