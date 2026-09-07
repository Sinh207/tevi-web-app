import { PAYOUT_SCREEN, PayoutRequestView } from '@features/payout'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/my-wallet/payout-request` — legacy's address unchanged, because the mobile apps link to it.
 *
 * A shell: the whole screen is one client component, since every part of it depends on a bearer (the
 * balance, the methods, the quote) and the form's state is the reader's. So this file is metadata plus a
 * `<main>`, and the view brings its own back bar.
 *
 * `noindex` and absent from `robots.ts`'s disallow list, for the reason the wallet routes all give: a
 * *disallowed* URL is never fetched, so its `noindex` is never read — and the tag is the only thing
 * keeping a withdraw form out of an index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('payout_request_title'),
        alternates: { canonical: '/my-wallet/payout-request' },
        robots: { index: false, follow: false },
    }
}

export default function PayoutRequestPage() {
    /*
     * `PAYOUT_SCREEN` on `<main>`, and it corrects a mismatch rather than adopting a rule.
     *
     * The view's sticky bar already carried this class, so below `md` the bar was the surface colour and
     * the content underneath it was the page colour — a white bar sitting on a grey column, with the
     * seam visible the whole way across. One of the two had to move, and the content is the one that
     * should: this is a form, and below `md` the column *is* the screen.
     *
     * ⚠ It makes the screen surface-coloured under surface-coloured cards, which §6 warns about for a
     * **multi-block** screen — the page colour in the gaps is normally what separates the blocks. So the
     * cards carry their own edge instead (`PAYOUT_BLOCK` in `lib/container.ts`): a hairline below `md`,
     * nothing from `md` up where the page colour returns and does the work again.
     */
    return (
        <main className={`flex flex-1 flex-col ${PAYOUT_SCREEN}`}>
            <PayoutRequestView />
        </main>
    )
}
