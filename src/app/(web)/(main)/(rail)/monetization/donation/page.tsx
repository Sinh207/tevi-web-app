import { DonationDashboard } from '@features/monetization'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/monetization/donation` — the creator's donation offer and the people who have paid it.
 *
 * Legacy's address, unchanged.
 *
 * ## The page is a shell; even the bar belongs to the view
 *
 * Legacy is **one URL with two screens** — the overview and the setting form — and it swaps the bar
 * along with the content (`TopBar`/`Content` or `SettingTopBar`/`SettingContent`). That makes the bar
 * *state*, so `DonationDashboard` owns it and this file is left with the metadata and the `<main>`
 * element. The same division `/monetization/membership` and `/star-transfer` make, for the same
 * reason: nothing here knows anything the server can answer.
 *
 * Everything below is client code and has to be — the offer, the supporters and the writes are all
 * per-bearer, and there is no SSR bearer in this app by construction (`shared/lib/api/token.ts`).
 * Client components are still server-rendered, so the shell and the bar are in the first paint.
 *
 * ## `noindex`, and deliberately **not** in `robots.ts`
 *
 * A private dashboard listing people who have paid this creator. Legacy sets `noindex, nofollow`
 * here too. Disallowing it would be the reflex and it is the wrong move, for the reason `/my-star`,
 * `/star-transfer` and `/monetization/membership` all write down: a disallowed URL is never
 * *fetched*, so the `noindex` that would actually keep it out of the index is never read.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('monetization_donation_title'),
        alternates: { canonical: '/monetization/donation' },
        robots: { index: false, follow: false },
    }
}

export default function MonetizationDonationPage() {
    return (
        <main className="flex flex-1 flex-col">
            <DonationDashboard />
        </main>
    )
}
