import { ErrorScreen } from '@shared/components/error-screen'
import { readWebviewHeaders } from '@shared/config/webview'
import { getServerT } from '@shared/i18n/server'
import { ERROR_ART } from '@shared/lib/error-art'
import { Button } from '@shared/ui/button'
import { headers } from 'next/headers'
import Link from 'next/link'

/**
 * Tevi's official space — where legacy's **Return to Safe Space** sends a reader who followed a
 * dead link (`components/errors/404`, `router.push('/@tevi')`).
 *
 * A literal here rather than a constant borrowed from `features/channel`, and the reason is the
 * import graph: that feature has no root `routes.ts` (its paths live in `lib/routes.ts` behind
 * `index.ts`), so naming it properly would pull the whole channel barrel into the 404 chunk —
 * the exact cost the four narrow barrels in CLAUDE.md exist to avoid. One string, on the one
 * screen that must stay cheap, is the better trade. It becomes an import the day
 * `features/channel/routes.ts` exists.
 */
const OFFICIAL_SPACE_PATH = '/@tevi'

/**
 * The 404, for both surfaces.
 *
 * **One file with a branch, and not the two obvious alternatives**, because an unmatched URL is
 * answered by *this* file no matter how deep it is:
 *
 * - `app/app/not-found.tsx` would never be reached. A nested not-found only renders when a page in
 *   that subtree calls `notFound()` itself, and `/app/anything-stale` matches no page at all.
 * - A catch-all `app/app/[[...rest]]/page.tsx` calling `notFound()` *would* reach it — and would
 *   answer **200**. Every route here is dynamically rendered (the root layout reads headers to
 *   resolve locale and theme), and a dynamic route cannot set the status from inside its render;
 *   `(main)/[slug]/page.tsx` documents the same limitation at length, and `proxy.ts` hard-404s
 *   `/dev/*` for exactly this reason. Trading a real 404 for a prettier body is the wrong trade.
 *
 * So the difference is made here, from the webview flag `proxy.ts` sets on every `/app/*` request —
 * including one for a screen that does not exist. What differs is the **way out**: the website
 * offers two, and a webview must offer none. Its native header already has a back button the app
 * controls, and sending the WebView to the public site strands the user in a browser-shaped screen
 * inside the app. (The safe-area insets are `ErrorScreen`'s own, unconditionally — see there.)
 */
export default async function NotFound() {
    const [t, headerStore] = await Promise.all([getServerT(), headers()])
    const { isWebview } = readWebviewHeaders(name => headerStore.get(name))

    return (
        <ErrorScreen
            testId="app-not-found"
            art={ERROR_ART.notFound}
            title={t('notfound_title')}
            body={
                <>
                    {/*
                     * Two sentences, two elements — legacy's own `<Stack direction='column'>` of
                     * two paragraphs, not one string with a break in it. They are separate keys
                     * upstream and a translator may need to reorder or merge them.
                     */}
                    <p>{t('notfound_message')}</p>
                    <p>{t('notfound_message_broken_link')}</p>
                </>
            }
            actions={
                isWebview ? undefined : (
                    <>
                        {/*
                         * `accent` is the CTA and `secondary` the way out, which inverts legacy's
                         * weighting (it paints both in flat black and white). The DS reserves accent
                         * for the action a screen is asking for, and on a dead link that is "go find
                         * a creator", not "go home".
                         */}
                        <Button
                            data-testid="app-not-found-safe-space"
                            variant="accent"
                            size="large"
                            render={<Link href={OFFICIAL_SPACE_PATH} />}
                        >
                            {t('notfound_safe_space')}
                        </Button>
                        <Button
                            data-testid="app-not-found-home"
                            variant="secondary"
                            size="large"
                            render={<Link href="/" />}
                        >
                            {t('common_back_home')}
                        </Button>
                    </>
                )
            }
        />
    )
}
