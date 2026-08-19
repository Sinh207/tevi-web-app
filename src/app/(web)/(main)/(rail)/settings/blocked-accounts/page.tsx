import { BlockedAccountsView, CHANNEL_SETTINGS_CONTAINER } from '@features/channel'
import { PageBackBar } from '@features/navigation'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/settings/blocked-accounts` — the accounts this person has blocked, and the way to undo it.
 *
 * The URL is legacy's (`pages/settings/blocked-accounts`), kept so existing links and anything
 * the mobile apps deep-link to still resolve. It is reached from the account drawer's Privacy
 * and Security screen, which is the only entry point either app has ever had.
 *
 * A sub-page, so it sits in `(main)` and not in `(tabs)`: it brings its own back bar instead of
 * the global mobile top bar, like `/identification` and `/settings/password`.
 *
 * **`noindex, nofollow`.** A personal account screen whose content differs for every visitor
 * and means nothing to a crawler — and, unlike most of them, one whose content is a list of
 * other people's names. Deliberately *not* added to `robots.ts`'s disallow list, for the reason
 * spelled out on `/identification`: a disallowed URL is one a crawler never fetches, so it
 * never reads the `noindex` either, and a page linked from the drawer on every screen can still
 * surface as a bare URL. Crawlable + `noindex` is the combination that actually keeps it out.
 *
 * Everything below the bar is client code, and it has to be: the list is `my-channel/blocks/`
 * as *this bearer*, and there is no SSR bearer in this app by construction
 * (`shared/lib/api/token.ts`). The page still renders on the server — shell, bar and title are
 * there on first paint, and the rows resolve after.
 *
 * The content column carries **no side padding and a bottom one only from `md`**. The panel is
 * a full-bleed card below `md` — its rows run edge to edge on a phone, as the mobile app's do,
 * and it should meet the bottom edge — so a `px-3` here would inset it by 12px at every width
 * with nothing the panel could do about it. From `md` the panel is a rounded surface, and
 * `md:pb-6` is what leaves its bottom two corners something to be seen against; the panel
 * claims the rest of the column with `flex-1`, so the gap comes out of its height rather than
 * being added below the fold.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('blocked_accounts_title'),
        alternates: { canonical: '/settings/blocked-accounts' },
        robots: { index: false, follow: false },
    }
}

export default async function BlockedAccountsPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            {/* No hairline under the bar, matching `/identification` and `/settings/password`:
                the card below brings its own edge at `md` and up, and a full-bleed rule across
                a screen whose content is already a bounded surface only draws a second one. */}
            <div className="sticky top-0 z-20 bg-(--background)">
                <PageBackBar
                    title={t('blocked_accounts_title')}
                    className={CHANNEL_SETTINGS_CONTAINER}
                />
            </div>
            <div className={`${CHANNEL_SETTINGS_CONTAINER} flex flex-1 flex-col md:pb-6`}>
                <BlockedAccountsView />
            </div>
        </main>
    )
}
