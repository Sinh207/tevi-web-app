import { IDENTIFICATION_CONTAINER, IdentificationView } from '@features/identification'
import { PageBackBar } from '@features/navigation'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/identification` — the identity verification (KYC) screen, reached from the menu
 * drawer's "Identification" row and, later, from the withdrawal flow that requires it.
 *
 * A sub-page, so it sits in `(main)` and not in `(tabs)`: it brings its own back bar
 * instead of the global mobile top bar, like `/privacy` and `/brand-assets`.
 *
 * **`noindex, nofollow`**, as legacy sets it, and no breadcrumb: this is a personal
 * account screen whose content is different for every visitor and meaningless to a
 * crawler. It is also the one page in `(main)` that mounts a third-party iframe, which is
 * a second reason not to advertise the URL.
 *
 * It is deliberately **not** in `robots.ts`'s disallow list, unlike `/my-space`, which is
 * personal in the same way. A disallowed URL is one a crawler never fetches — so it never
 * reads the `noindex` either, and a disallowed page that is linked from every screen in the
 * app (the drawer links here) can still surface as a bare URL. Crawlable + `noindex` is the
 * combination that actually keeps it out.
 *
 * Everything below the bar is client code — the flow is a session with Sumsub, and there
 * is no useful server render of "how far through verification this person is". The page
 * still renders on the server: the shell, the bar and the title are there on first paint,
 * and the state screens resolve after.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('identification_title'),
        alternates: { canonical: '/identification' },
        robots: { index: false, follow: false },
    }
}

export default async function IdentificationPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            {/* No hairline under the bar, unlike the policy pages: those are long documents
                where the rule marks where the chrome ends and the reading starts. This screen
                is a short form on the same `--background`, and a full-bleed line across it
                only cuts the illustration off from its own title. The opaque background is
                what keeps the content from showing through while it scrolls under. */}
            <div className="sticky top-0 z-20 bg-(--background)">
                <PageBackBar
                    title={t('identification_title')}
                    className={IDENTIFICATION_CONTAINER}
                />
            </div>
            <div className={`${IDENTIFICATION_CONTAINER} flex flex-1 flex-col`}>
                <IdentificationView />
            </div>
        </main>
    )
}
