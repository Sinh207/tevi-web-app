import { CHANNEL_NOT_FOUND_ART, ChannelEmptyState } from '@features/channel'
import { getServerT } from '@shared/i18n/server'
import { Button } from '@shared/ui/button'
import Link from 'next/link'

/**
 * Legacy's own destination for **Discover Creators** — `router.push('/search')` in
 * `containers/channel/.../viewer/components/noData`, which is the whole point of the button:
 * someone who followed a dead space link is looking for *a* creator, not for the home feed.
 *
 * A literal rather than `features/search`'s `SEARCH_PATH`, for the reason
 * `channel/components/following-view.tsx` states at the same call: a route this page merely links
 * to is not worth pulling another feature's barrel into this chunk. `features/search` has no root
 * `routes.ts`, so the constant only reaches here through `index.ts`.
 */
const DISCOVER_PATH = '/search'

/**
 * No such channel — a **real 404**, not a 200 with a sad face.
 *
 * `notFound()` on a dynamic route does set the status correctly, unlike a page that merely renders
 * "not found" content. Which is why `resolveChannelFetchStatus` is careful that only a definitive
 * upstream 404 reaches here: a 5xx routed to this page would tell a crawler a live profile had been
 * deleted.
 *
 * Rendered inside the `(main)` shell, so the rail and the tab bar stay put and the visitor can go
 * somewhere else without using the browser's back button.
 *
 * ## The block is `ChannelEmptyState`, and the picture is Brand's
 *
 * This is the same shape of moment as every other wall on this page — a mark, a title, a sentence,
 * a way out — so it is that component rather than a fourth hand-rolled arrangement of the same
 * three elements. It also gets the art for free, which is what this screen was missing: legacy
 * draws `channel/not-found.svg` at 227×225 here and a 32px sprite glyph stood in for it, which
 * `ChannelEmptyState` documents as "the honest minimum for a state nobody has drawn" — this one
 * *is* drawn (see `CHANNEL_NOT_FOUND_ART`), so the glyph was simply wrong.
 */
export default async function ChannelNotFound() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
            <ChannelEmptyState
                testId="channel-not-found"
                art={CHANNEL_NOT_FOUND_ART.space}
                title={t('channel_not_found_title')}
                body={t('channel_not_found_body')}
                action={
                    /*
                     * **One row, hug-width — where legacy stacks two 400px-wide bars.**
                     *
                     * Both halves of that are deliberate. The 400px bar is what MUI's mobile-first
                     * `Button` does on a screen with no other content; this block is
                     * `ChannelEmptyState`, whose column is `items-center`, and every other wall on
                     * this page centres a hug-width button there. A `fullWidth` would also be
                     * silently inert here: the component wraps `action` in a shrink-to-fit flex
                     * item, so `w-full` inside it resolves against its own content width — the bug
                     * that shipped in the first cut of this.
                     *
                     * Which leaves the axis, and `app/not-found.tsx` already answers it for the
                     * same pair of buttons: a row, reading order first. `flex-wrap` is what keeps
                     * that safe rather than a breakpoint — the two labels are ~360px together
                     * against 318px of column on a 390px phone, so they fall back to legacy's
                     * stack exactly where there is no room, in every one of the nine locales
                     * (`ko` fits on one line, `fil` does not, and no `sm:` guess covers both).
                     */
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        {/*
                         * `accent` for the CTA and `secondary` for the way out, as `app/not-found.tsx`
                         * weights the same pair — the DS reserves accent for the action the screen is
                         * asking for, and on a dead space link that is "go find a creator". Legacy
                         * paints them contained-primary and text for the same ordering.
                         */}
                        <Button
                            data-testid="channel-not-found-discover"
                            variant="accent"
                            size="large"
                            render={<Link href={DISCOVER_PATH} />}
                        >
                            {t('channel_not_found_discover')}
                        </Button>
                        <Button
                            data-testid="channel-not-found-home"
                            variant="secondary"
                            size="large"
                            render={<Link href="/" />}
                        >
                            {t('channel_return_home')}
                        </Button>
                    </div>
                }
            />
        </main>
    )
}
