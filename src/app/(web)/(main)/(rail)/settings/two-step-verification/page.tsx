import { TwoFaSettings } from '@features/auth'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/settings/two-step-verification` — turn the account passcode on, change it, turn it off.
 *
 * **A new URL, not a ported one.** Legacy's web app never built this screen: its `models/twoFa.js`
 * carries all eight endpoints and its locale files carry the whole copy, but only the mobile apps
 * render it. So there is nothing to keep verbatim, and the address is chosen to sit beside the
 * settings pages that *do* keep legacy's own names (`/settings/password`,
 * `/settings/space-visibility`). It is reached from the account drawer's Privacy and Security screen.
 *
 * A sub-page, so it sits in `(main)` and not in `(tabs)`: it brings its own back bar instead of the
 * global mobile top bar, like `/settings/password` and `/identification`.
 *
 * **`noindex, nofollow`**, and deliberately *not* added to `robots.ts`'s disallow list — the
 * reasoning is spelled out on `/identification` and `/settings/password`: a disallowed URL is one a
 * crawler never fetches, so it never reads the `noindex` either, and a page linked from the drawer on
 * every screen can still surface as a bare URL. Crawlable + `noindex` is the pair that keeps it out.
 *
 * Everything under `<main>` is client code. Which state shows depends on `two_fa_passcode` on a
 * `/me` fetched with this account's bearer, and there is no bearer server-side — so there is no
 * useful server render of "does this person have a passcode". The bar and the title still reach the
 * first paint (a client component is server-rendered too), and the state resolves from the query
 * cache without a request of its own.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('auth_two_fa_page_title'),
        alternates: { canonical: '/settings/two-step-verification' },
        robots: { index: false, follow: false },
    }
}

export default function TwoStepVerificationPage() {
    return (
        /*
         * **The bar is not here**, unlike every other sub-page in this app. This screen is one URL
         * with several states — the passcode gate, the setup flow, the change flow — and the comps
         * draw exactly one back control for all of them, so Back has to mean "up one step" while
         * there is one. That decision lives with the state, i.e. in `TwoFaSettings`, which renders
         * its own bar (`TwoFaBackBar` says why it cannot be `PageBackBar`). `/star-transfer` is the
         * same shape and solves it the same way, through `PageBackBar`'s `onBack`.
         */
        <main className="flex flex-1 flex-col">
            <TwoFaSettings />
        </main>
    )
}
