import { readWebviewHeaders } from '@shared/config/webview'
import { getServerT } from '@shared/i18n/server'
import { Button } from '@shared/ui/button'
import { headers } from 'next/headers'
import Link from 'next/link'

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
 * including one for a screen that does not exist. What differs is the way out: the website offers
 * one, and a webview must not. Its native header already has a back button the app controls, and
 * sending the WebView to the public site strands the user in a browser-shaped screen inside the
 * app. The insets are applied here too, since the `/app/*` shell is not in this branch's tree.
 */
export default async function NotFound() {
    const [t, headerStore] = await Promise.all([getServerT(), headers()])
    const { isWebview } = readWebviewHeaders(name => headerStore.get(name))

    return (
        <main
            className={`mx-auto flex min-h-[var(--window-height)] max-w-md flex-col items-center justify-center gap-4 p-6 text-center${
                isWebview ? ' pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]' : ''
            }`}
        >
            <h1 className="font-brand type-display-hero-bold text-primary-500">404</h1>
            <p className="type-dense-default text-text-body">{t('notfound_message')}</p>
            {!isWebview && (
                <Button data-testid="app-not-found-home" render={<Link href="/" />}>
                    {t('common_back_home')}
                </Button>
            )}
        </main>
    )
}
