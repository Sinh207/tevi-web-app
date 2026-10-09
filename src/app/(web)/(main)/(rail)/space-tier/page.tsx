import { SpaceTierView } from '@features/space-tier'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/space-tier` — the creator's Space tier. Legacy has no URL for it (a modal opened from the
 * account drawer); `features/space-tier/routes.ts` says why it is a page here.
 *
 * Everything below is client code and has to be: the tier, the estimate and the write are all
 * per-bearer, and there is no SSR bearer in this app. The bar belongs to the view because its
 * column and ground follow the view's state.
 *
 * `noindex`, and deliberately **not** disallowed in `robots.ts` — a disallowed URL is never fetched,
 * so the `noindex` that keeps it out of the index would never be read.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('space_tier_title'),
        alternates: { canonical: '/space-tier' },
        robots: { index: false, follow: false },
    }
}

export default function SpaceTierPage() {
    return (
        <main className="flex flex-1 flex-col">
            <SpaceTierView />
        </main>
    )
}
