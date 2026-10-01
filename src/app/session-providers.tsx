'use client'

import { AccountSwitcherDialog, AuthProvider, LoginDialog, SplashGate } from '@features/auth'
import { BalanceProvider } from '@features/balance'
import { MyChannelProvider } from '@features/channel'
import { ShareInMessage } from '@features/message'
import { MiniAppHost } from '@features/mini-app'
import { PaymentProvider } from '@features/payment'
import { PermissionProvider } from '@features/permission'
import { RealtimeProvider } from '@features/realtime'
import { ShareInMessageProvider } from '@features/share'
import { PostComposerHost } from './post-composer-host'
import { ReplyDialogHost } from './reply-dialog-host'

/**
 * Everything that depends on there being a session (outer → inner):
 *
 *   Auth → Realtime → Permission → Balance → Payment → MyChannel → children,  plus the dialogs and the splash cover
 *
 * Sits **below** `AppProviders` (QueryClient/Theme/Locale), because all three of these are
 * queries keyed on the active account, and it is mounted by `(web)/layout.tsx` rather than
 * by the root layout — so `/app/*` webviews pay for none of it.
 *
 * ## Why it is a separate tree from the base providers
 *
 * Mounting `AuthProvider` is not free and not passive: on mount it bootstraps a session for
 * the device — a device fingerprint, then either `/me` on an existing token or a Firebase
 * anonymous sign-in plus `v1/connect/anonymous`. That is exactly right for the website,
 * where the app must always have *some* session, and exactly wrong for a webview screen
 * like `/app/privacy`, which renders a static legal document and reads no account: the
 * native app already owns the session, and the tokens are same-origin `localStorage`
 * either way.
 *
 * A `/app/*` screen that does need the session imports this and mounts it in its own
 * layout, one subtree at a time. Import it from here, not from `(web)/` — a route group is
 * a routing detail, not a module boundary.
 *
 * ## Why the order inside is load-bearing
 *
 * `BalanceProvider` and `MyChannelProvider` both sit **immediately inside** `AuthProvider`,
 * in both directions. Each is a function of the active account and nothing else, so neither
 * can be outside Auth; and everything below them reads what they hold.
 *
 * `myChannel` is consumed in roughly eighty files in legacy (nav avatar, post composer,
 * comments, DMs, membership, wallet, monetization), which is why it is a provider rather
 * than a hook each of them calls.
 *
 * **The balance is global for a sharper reason than being widely read**: Star is what the
 * product is priced in, so every gift, paywalled post, membership and paid live has to know
 * *before it runs* whether this account can afford it — `useRequireStars` is that check, and
 * it has to be available wherever a price is. The app shell reads the figure too (the
 * drawer's balance card, the mobile top bar's Star pill), on every route.
 *
 * `PermissionProvider` is **above both**, and highest of the three for a reason that is not about
 * dependencies — it has none beyond the active account. It is about *what reads it*: a grant decides
 * whether a feature is **offered**, so it is read by the app shell (which drawer rows exist) as well as
 * by the screens behind them, and it must not sit under a gate that can replace those routes. It also
 * fails closed, which means anything rendered above it would silently be treated as ungranted.
 *
 * Balance is **outside** MyChannel because it does not depend on the channel: an account has
 * a balance whether or not it has a space, and the create-space gate below must not stand
 * between a price and the balance it is checked against.
 *
 * It also owns a **gate**: a real (non-anonymous) account with no channel gets the
 * create-space screen in place of every route, because posting, streaming, messaging and
 * earning all belong to the channel. `features/channel/lib/onboarding-gate.ts` holds that
 * decision as a pure, tested function — including the two states legacy gets wrong (it
 * blanks the whole app while loading, and pushes to `/500` on any unexpected status).
 *
 * `PaymentProvider` sits between the two, and both edges are load-bearing. It is **inside
 * Balance** because a settled payment invalidates `balanceKeys.all` — the figure and both
 * ledgers — so the balance has to exist above it, and the pair are two halves of one
 * sentence: Balance answers whether this account can afford something, Payment is how it
 * comes to be able to. And it is **outside MyChannel** for the reason Balance is: the
 * create-space gate replaces every route, and it must not stand between a price and the
 * wallet paying for it. Somebody with no space can still buy Star, top up, or be gifted
 * Premium; a gate that swallowed the checkout would make the one thing they can do
 * unreachable.
 *
 * It holds the checkout machine, the status dialog and the watcher that finishes a payment
 * returning from a 3DS or gateway redirect — all three of which have to outlive the screen
 * that started the payment, which is the whole reason it is a provider and not a hook.
 *
 * The dialogs stay below it so a gated account can still be signed out of.
 */
export function SessionProviders({
    children,
    showSplash = true,
}: {
    children: React.ReactNode
    /**
     * Cover the app with the brand splash until the session bootstraps.
     *
     * Default on, and left as a prop only so a webview screen that opts into the session
     * can turn it off — the native app has already shown its own splash there. Legacy's
     * auth gate does not exempt `/app/*`, which is why the mobile app flashes a white Tevi
     * screen mid-session, in dark mode too.
     */
    showSplash?: boolean
}) {
    return (
        <AuthProvider>
            {/* Realtime sits between Auth and the three providers that consume it: it needs the active
                account to decide whether to open at all, and Permission, Balance and MyChannel all
                subscribe.
                It renders `children` untouched and holds no state — see `features/realtime`. */}
            <RealtimeProvider>
                {/* What this account is *allowed* to do — the feature grants the backoffice has switched
                    on for it. Above Balance and MyChannel because a grant decides whether a surface is
                    offered at all, so it is read by the shell as well as by the screens; and it
                    subscribes to `premium_info`, so it belongs inside Realtime. See
                    `features/permission`. */}
                <PermissionProvider>
                    <BalanceProvider>
                        {/* The live checkout: the machine, the status dialog, and the URL watcher
                            that finishes a payment coming back from a redirect. Inside Balance
                            because it invalidates it; outside MyChannel because the create-space
                            gate must not stand between a price and the wallet paying it. See
                            `features/payment`. */}
                        <PaymentProvider>
                            <MyChannelProvider>
                                {/* The share sheet's "Send in message" block. A slot rather than an
                                    import because `features/share` cannot reach `features/message`
                                    without closing a barrel cycle (message → channel → share); `app/`
                                    sees both. Inside the session because the block reads the inbox,
                                    and a webview — which mounts none — gets a sheet without it. */}
                                <ShareInMessageProvider component={ShareInMessage}>
                                    {children}
                                    {/* The mini-app player — third-party apps framed inside Tevi
                                    (`features/mini-app`). An overlay, not a wrapper: it renders
                                    **nothing** until an app is opened, and the window itself is a
                                    dynamic import, so a visit that opens none costs one store
                                    subscription and no bundle.

                                    It is a *sibling of `children`* rather than of the dialogs
                                    because the bridge reads `myChannel.slug` — the reader's own
                                    space slug is part of the mini-app URL contract
                                    (`docs/MINI_APP.md` §3), and `useMyChannel` throws outside its
                                    provider. That also puts it under the create-space gate, which
                                    is right: an account with no space has no surface from which to
                                    open an app in the first place.

                                    Deliberately **not** above the dialogs. Both of those can be
                                    raised *by* a mini app — the sign-in dialog when a guest presses
                                    Open, the Star purchase sheet when an app asks for one — and the
                                    player is `z-40` against their `z-50`, so an application is
                                    never drawn on top of the question it just asked. */}
                                    <MiniAppHost />
                                    {/* One mount for two openers — the rail's `+` and the tab bar's
                                    FAB are both in the DOM, so the dialog cannot live beside
                                    either. Inside `MyChannelProvider` because it draws the
                                    author's own avatar. */}
                                    <PostComposerHost />
                                    <ReplyDialogHost />
                                </ShareInMessageProvider>
                            </MyChannelProvider>
                        </PaymentProvider>
                    </BalanceProvider>
                </PermissionProvider>
            </RealtimeProvider>
            {/* Raised by `useRequireAuth` when a guest triggers a guarded action.
                Mounted here rather than inside AuthProvider: it renders LoginForm,
                which reads useAuth.

                Outside MyChannelProvider on purpose: these are how an account is
                signed in and switched, so they must keep working while the onboarding
                gate is replacing the routes. */}
            <LoginDialog />
            {/* Same reasoning, and the two hand over to each other: "Add account" in
                the switcher is a sign-in. */}
            <AccountSwitcherDialog />
            {/* Chrome, like the dialogs, and mounted for the same reason they are: it
                reads the auth store, and it must keep working while the onboarding gate
                is replacing the routes — a brand-new account waits on the same
                bootstrap as everyone else.

                It is a sibling of `MyChannelProvider`, not a wrapper: the splash covers
                the app, it does not stand in for it. */}
            {showSplash && <SplashGate />}
        </AuthProvider>
    )
}
