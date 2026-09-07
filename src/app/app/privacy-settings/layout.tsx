import { AuthProvider } from '@features/auth'

/**
 * The one `/app/*` subtree with a session — and it is **only** the session.
 *
 * `/app/*` deliberately has none (`app/app/layout.tsx`,
 * [`docs/WEBVIEW.md`](../../../../docs/WEBVIEW.md)): the legal screens are the majority of the
 * namespace and they read no account. This screen is the opposite — every line on it is the
 * signed-in account — so it opts in for its own subtree.
 *
 * ## `AuthProvider`, not `SessionProviders`
 *
 * `SessionProviders` is the **website's** stack: Realtime, Permission, Balance, Payment and
 * MyChannel on top of Auth. This screen reads none of them, and each one is a request or a socket
 * this webview would open and never look at — a user-room websocket, `permission/v3/...`, the
 * balance, `my-channel/`. So the tree is one provider deep.
 *
 * What that costs, stated so the next person does not go looking: **no `myChannel`**. The space
 * slug, the verified mark and the animated (Premium) avatar are channel data, so the profile card
 * is `/me` only — display name, avatar, user id. Legacy's card shows the slug and the badge; if
 * they are wanted back, the honest way is `MyChannelProvider` beside `AuthProvider` here, not a
 * bare fetch from the screen.
 *
 * Nothing beside it either. `SessionProviders` also mounts `LoginDialog`, `AccountSwitcherDialog`
 * and `SplashGate`; none of the three has a job here. The sign-in is not a dialog on this screen —
 * with no account there is nothing behind it to protect, so the screen renders `LoginScreen`
 * itself. The app owns one account at a time, and it has already shown its own splash.
 *
 * ## The device id is why this is a provider and not nothing
 *
 * A screen that only *reads* needs no provider at all — the token store hydrates itself on first
 * read. This one **writes** `/me`, and `AuthProvider`'s bootstrap is the only thing that primes
 * the device fingerprint that every token-minting call carries, the refresh included
 * (`{ refresh_token, ...getDeviceInfo() }`). Without it the writes work and then stop the moment
 * the access token expires, which for a webview the app leaves open is the ordinary case. It also
 * brings the only listener for `auth:session-expired`, so a dead session falls to the sign-in
 * state instead of failing silently.
 *
 * The cost, accepted rather than worked around: on a **cold** device with no token in the
 * same-origin store the bootstrap mints an anonymous session (Firebase + `v1/connect/anonymous`) —
 * the one thing `docs/WEBVIEW.md` says a webview should not do. It happens only when the app opened
 * account settings with no session to show, the anonymous account lands in the sign-in branch, and
 * the alternative is a screen whose writes die an hour in.
 */
export default function PrivacySettingsLayout({ children }: { children: React.ReactNode }) {
    return <AuthProvider>{children}</AuthProvider>
}
