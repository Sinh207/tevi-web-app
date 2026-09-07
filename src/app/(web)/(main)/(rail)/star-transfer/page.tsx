import { StarTransferView } from '@features/star-transfer'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/star-transfer` — moving Star to another account, singly or in bulk.
 *
 * ## The same address legacy uses
 *
 * `pages/star-transfer` in the legacy app, so there is nothing for `proxy.ts` to redirect: a bookmark, a
 * link from support or an email lands on this screen at the URL it always had.
 *
 * A sub-page, so it sits in `(main)` and **not** in `(tabs)`: it brings its own back bar instead of the
 * global mobile top bar. The group a route joins is what decides its chrome, which is why nothing here
 * inspects the pathname. It is in `(rail)` because its column caps at 612 — the condition for the desktop
 * end rail, stated in that layout.
 *
 * ## The page is a shell; even the bar belongs to the view
 *
 * Legacy is **one URL with three screens** — transfer, the full history, the receipt — with the title and
 * the back button switching between them. That makes the bar *state*, so `StarTransferView` owns it. This
 * file is left with the metadata and the `<main>` element, which is the honest division: nothing here
 * knows anything the server can answer.
 *
 * Everything below is client code and has to be: three of the four things on the screen are per-bearer —
 * the capability grant, the balance, the history — and there is no SSR bearer in this app by construction
 * (`shared/lib/api/token.ts`). Client components are still server-rendered, so the shell and the bar are
 * in the first paint either way.
 *
 * ## `noindex, nofollow`, and deliberately **not** in `robots.ts`
 *
 * A screen most accounts cannot even open, showing a personal balance. Legacy sets the same pair on its
 * wallet routes.
 *
 * Disallowing it in `robots.ts` would be the reflex and it is the wrong move, for the reason `/my-star` and
 * `/identification` both write down: a disallowed URL is one a crawler never *fetches*, so it never reads
 * the `noindex` either — and a URL linked from a row in the account drawer can still surface as a bare
 * address. Crawlable + `noindex` is the combination that actually keeps it out of the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('star_transfer_title'),
        alternates: { canonical: '/star-transfer' },
        robots: { index: false, follow: false },
    }
}

export default function StarTransferPage() {
    return (
        <main className="flex flex-1 flex-col">
            <StarTransferView />
        </main>
    )
}
