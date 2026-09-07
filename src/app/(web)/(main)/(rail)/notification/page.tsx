import { PageBackBar } from '@features/navigation'
import {
    NOTIFICATION_CONTAINER,
    NotificationBarActions,
    NotificationView,
} from '@features/notification'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/notification` — the account's notification inbox.
 *
 * The URL is legacy's (`pages/notification`), **singular**, kept verbatim: the mobile apps deep-link
 * to it, push notifications land on it, and the cutover is same-origin, so every one of those links
 * resolves straight here. Renaming it to the plural buys a nicer address and loses all of them. See
 * `NOTIFICATION_PATH`.
 *
 * A sub-page, so it sits in `(main)` and not in `(tabs)`: it brings its own back bar instead of the
 * global mobile top bar, like `/follow-requests` and `/identification`. It is reached from the bell
 * — in the desktop rail and in the mobile top bar — which are the only two entry points either app
 * has.
 *
 * **`noindex, nofollow`.** A personal screen whose content differs for every visitor, means nothing
 * to a crawler, and names other people. Deliberately *not* added to `robots.ts`'s disallow list, for
 * the reason spelled out on `/identification`: a disallowed URL is one a crawler never fetches, so
 * it never reads the `noindex` either, and a page linked from the shell on every screen can still
 * surface as a bare URL. Crawlable + `noindex` is the combination that actually keeps it out.
 *
 * Legacy renders this page `ssr: false` behind a `dynamic()` import and gives it
 * `revalidate: 3600` — a full second of blank screen on a slow phone for a page whose shell does
 * not depend on the data. Everything below the bar here is still client code, and has to be: the
 * inbox is `v1/inbox/messages/` as *this bearer*, and there is no SSR bearer in this app by
 * construction (`shared/lib/api/token.ts`). But the shell, the bar and the title render on the
 * server and are in the first HTML byte.
 *
 * ## Why the bar is here and its menu is a prop
 *
 * `PageBackBar` is `features/navigation`'s, and `features/navigation` imports **this** feature (the
 * bell's unread dot). So the notification feature must not import navigation back — see
 * `NotificationBarActions` for what an ESM cycle does at render time. Composing the bar here, on
 * the server, and passing the feature's menu into its `actions` slot breaks the cycle at no cost:
 * a server component can hand a client element to a client component as a prop.
 *
 * The content column carries **no side padding and a bottom one only from `md`**, exactly as
 * `/follow-requests` does: the panel is full-bleed below `md` (its rows run edge to edge, as the
 * mobile app's do), so a `px-3` here would inset it by 12px at every width with nothing the panel
 * could do about it. From `md` the panel is a rounded surface and `md:pb-6` is what leaves its
 * bottom two corners something to be seen against.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('notification_title'),
        alternates: { canonical: '/notification' },
        robots: { index: false, follow: false },
    }
}

export default async function NotificationPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            {/* Opaque, or the list scrolls through the bar — `AppBar` deliberately paints no
                background of its own (Figma draws it over a screen). No hairline underneath,
                matching `/follow-requests`: the panel below brings its own edge from `md`, and a
                full-bleed rule across a screen whose content is already a bounded surface only
                draws a second one. */}
            <div className="sticky top-0 z-20 bg-(--background)">
                <PageBackBar
                    title={t('notification_title')}
                    className={NOTIFICATION_CONTAINER}
                    actions={<NotificationBarActions />}
                />
            </div>
            <div className={`${NOTIFICATION_CONTAINER} flex flex-1 flex-col md:pb-6`}>
                <NotificationView />
            </div>
        </main>
    )
}
