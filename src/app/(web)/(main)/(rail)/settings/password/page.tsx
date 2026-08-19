import { PASSWORD_CONTAINER, PasswordSettings } from '@features/auth'
import { PageBackBar } from '@features/navigation'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/settings/password` — add a first password, or change the one this account has.
 *
 * The URL is legacy's (`pages/settings/password`), kept so existing links and anything the
 * mobile apps deep-link to still resolve. It is reached from the account drawer's Privacy
 * and Security screen.
 *
 * A sub-page, so it sits in `(main)` and not in `(tabs)`: it brings its own back bar instead
 * of the global mobile top bar, like `/identification` and `/privacy`.
 *
 * **`noindex, nofollow`.** A personal account screen whose content differs for every visitor
 * and means nothing to a crawler. Deliberately *not* added to `robots.ts`'s disallow list,
 * for the reason spelled out on `/identification`: a disallowed URL is one a crawler never
 * fetches, so it never reads the `noindex` either — and a disallowed page linked from the
 * drawer on every screen can still surface as a bare URL. Crawlable + `noindex` is the
 * combination that actually keeps it out.
 *
 * Everything below the bar is client code: which of the five screens shows depends on a
 * request made as this account, and there is no useful server render of "does this person
 * have a password". The page still renders on the server — shell, bar and title are there on
 * first paint, and the form resolves after.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('password_title'),
        alternates: { canonical: '/settings/password' },
        robots: { index: false, follow: false },
    }
}

export default async function PasswordSettingsPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            {/* No hairline under the bar, matching `/identification`: this is a short form on
                the same `--background`, not a long document where a rule marks where the
                chrome ends and the reading starts. The opaque background is what keeps the
                content from showing through as it scrolls under. */}
            <div className="sticky top-0 z-20 bg-(--background)">
                {/*
                 * **`md:px-0`, overriding `AppBar`'s own `px-4` from md up — and the mocked
                 * edge is the panel's *border*, not the text inside it.**
                 *
                 * From md the content below stops being bare and becomes a card with a
                 * visible frame at the column's edge (`PageSurface`). Once there is a frame,
                 * that is what the eye measures the bar against: any padding here pulls the
                 * back button inside the card's outline and the whole header reads as *narrower
                 * than the block under it* — which is what it looked like at `px-4`, and still
                 * looked like at `px-6` matching the panel's inner padding. Zero puts the
                 * button flush with the border and the two read as one column.
                 *
                 * Below md the padding stays `AppBar`'s 16, because there the content is
                 * full-bleed on the page background with no frame at all — so the **content**
                 * is the only edge that exists to line up with, and `PageSurface` uses 16.
                 *
                 * The pair lives in two files because the bar and the panel are two components;
                 * the note on `PageSurface` is the other half of it.
                 */}
                <PageBackBar
                    title={t('password_title')}
                    className={`${PASSWORD_CONTAINER} md:px-0`}
                />
            </div>
            <div className={`${PASSWORD_CONTAINER} flex flex-1 flex-col`}>
                <PasswordSettings />
            </div>
        </main>
    )
}
