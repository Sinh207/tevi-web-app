'use client'

import { CHANNEL_NOT_FOUND_ART, ChannelEmptyState } from '@features/channel'
import { useTranslation } from '@shared/i18n/use-translation'
import { ERROR_ART } from '@shared/lib/error-art'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import { EVENT_ART } from '../lib/illustrations'

/**
 * The two ways this page can have nothing to show, and they are **not** the same screen.
 *
 * The distinction is the whole reason `useEvent` separates `notFound` from `isError`, and it matters
 * more here than on most pages: this URL is what gets printed on posters and encoded into QR codes,
 * so telling somebody their link is broken when the service merely blinked is a lie with a long
 * tail. See `event-api.ts`, where the 404 is made to reject rather than resolve to `null`.
 *
 * Both are `ErrorScreen` — the app's own full-page frame, art and backdrop included — rather than a
 * card inside the page's column. There is no page left to be inside: no title, no host, no banner.
 */

/**
 * The 500 wall's art — the **same file** `app/error.tsx` draws, at a smaller drawn box.
 *
 * `ERROR_ART.failed` declares 328×312, which is legacy's **full-page** size and what the app's own
 * error boundary needs. Inside this screen's card it is too big: 328 of the 612 column, and 328 of
 * the ~398 a phone has left after the inset, so the illustration reads as the content and the
 * sentence under it as a caption.
 *
 * 180 wide keeps the source's 0.951 ratio and puts it in the same visual weight class as the 404
 * wall beside it (153×200 — near-identical area), so the two states of one screen look like
 * siblings. `ChannelEmptyState` caps at `art.width`, so the declared box *is* the drawn size.
 *
 * A local box rather than a second `ERROR_ART` entry or an edit to that one: the file belongs to
 * `shared/lib/error-art.ts` and its 328 is correct for the boundary that owns it. How large a
 * caller draws it is the caller's business.
 */
const LOAD_FAILED_ART = { src: ERROR_ART.failed.src, width: 180, height: 171 }

/**
 * **404 – Live Not Found** — no such event.
 *
 * ## A block inside the page, like every other state
 *
 * This was `ErrorScreen`, the app's full-bleed frame. Same argument as `EventErrorState` below and
 * the same conclusion: `app/not-found.tsx` is for a URL that matches **no route in the app**, and a
 * route that exists answers for itself *without* throwing its own chrome away. A reader who followed
 * a dead link still wants the back button and still wants to see which space the link named.
 *
 * ## Both paths render this, which is the whole point
 *
 * The **server** discovers a missing event through `notFound()` → `[code]/not-found.tsx`, and the
 * **client** through a 404 on its own fetch. That boundary composes the page's bar and column and
 * puts this block inside, so the two are the same screen rather than two ideas of one. Getting that
 * split wrong is what produced the earlier bug where a missing event rendered the *channel's* wall.
 *
 * The art is legacy's own (`EVENT_ART.notFound`), not the app's generic 404 illustration: at this
 * point we know what was being looked for.
 */
export function EventNotFoundState() {
    const { t } = useTranslation()

    return (
        <ChannelEmptyState
            // Fills the column so the block centres — see `EventErrorState`.
            className="flex-1"
            testId="event-not-found"
            art={EVENT_ART.notFound}
            title={t('event_not_found_title')}
            body={t('event_not_found_body')}
            action={
                <Button variant="accent" size="large" render={<Link href="/" />}>
                    {t('event_not_found_action')}
                </Button>
            }
        />
    )
}

/**
 * The request failed — a 5xx, a timeout, an unparseable body. **Not** "this does not exist".
 *
 * ## A block inside the page, not a page of its own
 *
 * This was `ErrorScreen` — the app's full-bleed frame with its own `<main>`, its pastel backdrop and
 * a `min-h-[var(--window-height)]`. That component is for a **boundary**: `app/error.tsx` and
 * `app/not-found.tsx`, where there is no page left because the route itself could not render.
 *
 * Here the route rendered fine. The bar is correct, the URL is correct, the column is correct — one
 * *fetch* failed. Replacing all of it took away the back button and the page's identity, so a reader
 * whose request 500'd could not tell which event they were even looking at, and had to use the
 * browser's back to leave.
 *
 * So the screens keep their chrome and put this where the content would be. That is the same call
 * `ChannelError` makes — *"a failed region and an empty one are the same moment"* — and the reason
 * `EventCardState` exists one level down for a card slot. This is that shape at page scale.
 *
 * The **not-found** wall is deliberately *not* changed: a missing event is answered by a route
 * boundary (`[code]/not-found.tsx`), which replaces the page by design, and the client path renders
 * the same full screen so both look identical.
 *
 * The action is a **retry**, not a way out: the reader's link is fine and the next attempt may work.
 * `refetch` rather than a page reload, so it costs one request and keeps their scroll position.
 */
export function EventErrorState({ onRetry }: { onRetry: () => void }) {
    const { t } = useTranslation()

    return (
        <ChannelEmptyState
            /*
             * Fills the column so the block centres in whatever height the page has, rather than
             * hugging the top with the rest of a tall window empty beneath it. `ChannelEmptyState`
             * is already `justify-center`; it just needs somewhere to do it. Same reason the report's
             * panel grows — `PROFILE_PANEL` and `MCN_INVITATION_PANEL` both carry the sentence.
             */
            className="flex-1"
            testId="event-error"
            /*
             * The app's own failure illustration, at this screen's own size — see `LOAD_FAILED_ART`.
             *
             * `tone` is dropped with the glyph it used to colour: that prop paints a **mark** and
             * does nothing once there is art, so leaving it set would be a flag that reads as
             * load-bearing and is not.
             */
            art={LOAD_FAILED_ART}
            title={t('event_error_title')}
            body={t('event_error_body')}
            action={
                <Button
                    data-testid="event-error-retry"
                    variant="accent"
                    size="large"
                    onClick={onRetry}
                >
                    {t('common_retry')}
                </Button>
            }
        />
    )
}

/**
 * Legacy's own destination for **Discover Creators** on this wall — `router.push('/search')` in
 * `viewer/components/banned`. A literal for the reason `[slug]/not-found.tsx` gives at the same
 * button: a route this page only links to is not worth another feature's barrel.
 */
const DISCOVER_PATH = '/search'

/**
 * **Banned from this channel** — the page, not a panel.
 *
 * Legacy's `viewer/index.js` asks this *before* anything else in the viewer tree:
 * `isBlocked ? <Banned/> : <ViewerProvider>…`. So it replaces Live details and Live studio alike,
 * and it is raised by the live room's `block_user` frame — `useLiveRefusals` carries the note on why
 * that is not the chat's `block_chat`, which only disables the comment box and shares its name.
 *
 * The wall is legacy's composition: the refusal stated on its own line, then the **space**
 * not-found art and copy, then *Discover Creators* / *Return to home*. The space copy is not a
 * shortcut — from this reader's side the channel is, for every purpose, not available — so it is
 * `[slug]/not-found.tsx`'s block, strings and art included, rather than a second drawing of it.
 *
 * ⚠ **One divergence, and it is a contrast one.** Legacy prints the sentence in `#D00416` on white.
 * The DS error ink is under AA as body text in Light (3.28 against 4.5), so the sentence sits on the
 * error *tint* in title ink with the mark alone in the accent — the pattern `AuthErrorMessage` and
 * the 2FA reset note already use. Same red signal, legible to the people it is addressed to.
 */
export function EventBannedState() {
    const { t } = useTranslation()

    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
            <p
                data-testid="event-banned-notice"
                role="alert"
                className="flex max-w-full items-center gap-2 rounded-xl bg-(--accents-error-bg-active) p-3 text-(--text-title)"
            >
                <Icon
                    name="exclamation-circle"
                    size={16}
                    className="flex-none text-(--accents-error-active)"
                />
                <span className="type-dense-emphasis">{t('event_banned_notice')}</span>
            </p>
            <ChannelEmptyState
                testId="event-banned"
                art={CHANNEL_NOT_FOUND_ART.space}
                title={t('channel_not_found_title')}
                body={t('channel_not_found_body')}
                action={
                    // The same pair, weighted the same way, as `[slug]/not-found.tsx` — see its note
                    // on why it is a wrapping row rather than legacy's two stacked 400px bars.
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        <Button
                            data-testid="event-banned-discover"
                            variant="accent"
                            size="large"
                            render={<Link href={DISCOVER_PATH} />}
                        >
                            {t('channel_not_found_discover')}
                        </Button>
                        <Button
                            data-testid="event-banned-home"
                            variant="secondary"
                            size="large"
                            render={<Link href="/" />}
                        >
                            {t('channel_return_home')}
                        </Button>
                    </div>
                }
            />
        </div>
    )
}
