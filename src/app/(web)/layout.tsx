import { SessionProviders } from '@app/session-providers'
import { readCountryHeader } from '@shared/lib/geo'
import { CountryProvider } from '@shared/lib/geo-provider'
import { headers } from 'next/headers'

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
 *
 * ## The country is resolved here, and for free
 *
 * The edge already knows which country the visitor is calling from (`shared/lib/geo.ts`), so it is
 * read **during this render** and handed down — the same route the locale takes. That is what "detect
 * it when the site opens" means with no request in it: by the first paint the payout billing form
 * already knows which country to preselect. `CountryProvider` asks `/api/client-ip` only if this came
 * back empty.
 *
 * It sits **outside** `SessionProviders` deliberately: the country is a property of the connection,
 * not of the account, so it must not be torn down and re-resolved when somebody switches accounts.
 * It is also *not* in `app/providers.tsx`, which every `/app/*` webview shares — the native app owns
 * that context, and a webview screen must not pay for a signal it does not read.
 *
 * Reading `headers()` costs nothing extra here: the root layout already reads cookies for the locale,
 * so this document is dynamic either way.
 */
export default async function WebLayout({ children }: { children: React.ReactNode }) {
    const country = readCountryHeader(await headers())

    return (
        <CountryProvider country={country}>
            <SessionProviders>{children}</SessionProviders>
        </CountryProvider>
    )
}
