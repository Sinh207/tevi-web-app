import { SetupPayoutsView } from '@features/payout'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/my-wallet/setup-payouts` — add a payout method.
 *
 * Legacy's address unchanged. Reached from `/my-wallet/payout-method` (both the Add button and its
 * empty state) and, for a creator with nothing saved, directly.
 *
 * A shell: every part of this screen needs a bearer — the countries, the methods, the account's own
 * contact details — so the view is client-side and owns its bar.
 *
 * **No screen-colour class**, like `/my-wallet/payout-method`: this screen stacks cards on the page
 * colour rather than filling one panel, so `<main>` inherits `--background` at every width.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('payout_setup_title'),
        alternates: { canonical: '/my-wallet/setup-payouts' },
        robots: { index: false, follow: false },
    }
}

export default function SetupPayoutsPage() {
    return (
        <main className="flex flex-1 flex-col">
            <SetupPayoutsView />
        </main>
    )
}
