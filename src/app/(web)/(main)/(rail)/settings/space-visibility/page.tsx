import { CHANNEL_SETTINGS_CONTAINER, SpaceVisibilityView } from '@features/channel'
import { PageBackBar } from '@features/navigation'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/settings/space-visibility` — who can see the signed-in creator's space.
 *
 * **The URL is legacy's, exactly.** `pages/settings/space-visibility` in the old app, which is
 * why there is no redirect for it in `proxy.ts`: the path survives the cutover unchanged, so
 * every link already in the wild — the mobile app's menu, a support article, someone's
 * bookmark — keeps working. Renaming it to something tidier would be the one change here with
 * a cost outside this repo.
 *
 * A sub-page, so it sits in `(main)` and not `(tabs)`: it brings its own back bar instead of
 * the global mobile top bar, like `/identification` and `/privacy`.
 *
 * **`noindex, nofollow`**, as legacy sets it — a personal account screen whose content differs
 * for every visitor and means nothing to a crawler.
 *
 * It is deliberately **not** added to `robots.ts`'s disallow list, like `/my-space`. A
 * disallowed URL is one a crawler never fetches, so it never reads the `noindex` either — and
 * a disallowed page that is linked from the account drawer on every screen can still surface
 * as a bare URL. Crawlable + `noindex` is the combination that actually keeps it out. Same
 * reasoning, and the same decision, as `/identification`.
 *
 * The bar, the title and the standing explanation render on the server; only the picker is
 * client code, because there is no useful server render of "which mode this person's space is
 * in" — there is no bearer server-side (`shared/lib/api/token.ts`), so the answer would be a
 * guess that the first client paint then corrected.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('space_visibility_title'),
        alternates: { canonical: '/settings/space-visibility' },
        robots: { index: false, follow: false },
    }
}

export default async function SpaceVisibilityPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            {/* No hairline under the bar, and an opaque background: the same call
                `/identification` makes. These are short forms on a flat `--background`, where
                a full-bleed rule only cuts the first card off from its own title — but the
                background has to be opaque or the cards show through as they scroll under. */}
            <div className="sticky top-0 z-20 bg-(--background)">
                <PageBackBar
                    title={t('space_visibility_title')}
                    className={CHANNEL_SETTINGS_CONTAINER}
                />
            </div>
            <div className={`${CHANNEL_SETTINGS_CONTAINER} flex flex-1 flex-col`}>
                {/* Server-rendered, so the screen says what it is on the first paint rather
                    than after the channel query resolves. It is also true in every state the
                    view below can be in — loading, signed out, failed — which is why it sits
                    out here and the 24-hour note does not. */}
                <p className="type-dense-default px-3 pt-3 text-(--text-subtitle) md:px-6">
                    {t('space_visibility_lede')}
                </p>
                <SpaceVisibilityView />
            </div>
        </main>
    )
}
