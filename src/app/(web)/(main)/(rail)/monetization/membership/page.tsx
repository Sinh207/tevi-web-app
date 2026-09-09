import { MembershipDashboard } from '@features/monetization'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/monetization/membership` — the creator's membership tier and the people paying for it.
 *
 * Legacy's address, unchanged.
 *
 * ## The page is a shell; even the bar belongs to the view
 *
 * Legacy is **one URL with two screens** — the overview and the create/edit form — with the title
 * and the back button switching between them. That makes the bar *state*, so `MembershipDashboard`
 * owns it, and this file is left with the metadata and the `<main>` element. The same division
 * `/star-transfer` makes, and for the same reason: nothing here knows anything the server can
 * answer.
 *
 * Everything below is client code and has to be — the tier, the member list and the writes are all
 * per-bearer, and there is no SSR bearer in this app by construction (`shared/lib/api/token.ts`).
 * Client components are still server-rendered, so the shell and the bar are in the first paint.
 *
 * ## `noindex`, and deliberately **not** in `robots.ts`
 *
 * A private dashboard listing people who pay this creator. Legacy sets `noindex, nofollow` here too.
 * Disallowing it would be the reflex and it is the wrong move, for the reason `/my-star` and
 * `/star-transfer` both write down: a disallowed URL is never *fetched*, so the `noindex` is never
 * read.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('monetization_membership_title'),
        alternates: { canonical: '/monetization/membership' },
        robots: { index: false, follow: false },
    }
}

export default function MonetizationMembershipPage() {
    return (
        <main className="flex flex-1 flex-col">
            <MembershipDashboard />
        </main>
    )
}
