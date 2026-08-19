import { SessionProviders } from '@app/session-providers'

/**
 * The website — everything a person browses to: the shell in `(main)`, the auth screens,
 * and the dev previews. A route group, so no URL changes.
 *
 * Its whole job is to be the one place the **session** stack is mounted (auth, balance,
 * own channel, the login/switcher dialogs, the splash cover). That used to live in the root
 * layout, where `/app/*` inherited it: opening a webview legal screen ran the full session
 * bootstrap — fingerprint, `/me` or a Firebase anonymous sign-in — for a page that reads no
 * account. Now the root layout carries only what any document needs (QueryClient, theme,
 * i18n) and `/app/*` opts in per screen instead.
 *
 * Session providers cannot be mounted per top-level route (one each in `login/`, `(main)/`,
 * `dev/`) for the same reason they cannot be omitted from the root: sibling layouts unmount
 * on a client-side navigation, so signing in and landing on `/` would tear down
 * `AuthProvider` and bootstrap the session a second time. They need exactly one common
 * ancestor, and this is it.
 *
 * No chrome here — that is `(main)/layout.tsx`, so `/login`, `/signup` and `/dev/*` get a
 * session without a navbar.
 */
export default function WebLayout({ children }: { children: React.ReactNode }) {
    return <SessionProviders>{children}</SessionProviders>
}
