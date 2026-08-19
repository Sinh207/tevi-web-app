/**
 * The `/app/*` webview shell.
 *
 * Deliberately almost nothing: these routes are screens the mobile app presents as its
 * own, so there is no navigation, no top bar and no tab bar — the native chrome is
 * already around them. What the shell does own is the part a page cannot: the safe area.
 *
 * The root viewport is `viewport-fit=cover`, so a WebView draws under the notch and the
 * home indicator. `env(safe-area-inset-*)` is the only honest source for those — a
 * number passed on the URL would be stale the moment the device rotates. Horizontal
 * insets are left alone on purpose: `env()` is physical (left/right) while our padding
 * is logical (start/end), and mixing the two mirrors wrongly in Arabic.
 *
 * The language and theme for these screens come from the URL — see
 * `shared/config/webview.ts` and `proxy.ts`.
 *
 * ## No session in here
 *
 * This namespace deliberately mounts **no** auth/balance/channel providers. The root layout
 * gives every document a QueryClient, a theme and i18n; the session stack is mounted one
 * level down on the website side (`(web)/layout.tsx`), not here. `/app/privacy` is a static
 * legal document — it used to pay for a device fingerprint, a `/me` and, on a cold device, a
 * Firebase anonymous sign-in plus `v1/connect/anonymous`, none of which anything on the
 * screen reads. The native app owns the session, and the token store is same-origin
 * `localStorage` regardless.
 *
 * A screen that *does* need the account (a wallet or settings webview, later) opts in for its
 * own subtree — never for the whole namespace:
 *
 * ```tsx
 * // app/app/wallet/layout.tsx
 * import { SessionProviders } from '@app/session-providers'
 *
 * export default function Layout({ children }: { children: React.ReactNode }) {
 *     // No splash: the native app has already shown its own.
 *     return <SessionProviders showSplash={false}>{children}</SessionProviders>
 * }
 * ```
 */
export default function WebviewLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-[var(--window-height)] flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
            {children}
        </div>
    )
}
