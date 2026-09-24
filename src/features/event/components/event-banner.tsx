'use client'

import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { liveAccess } from '../access'
import type { EventDetail } from '../api/types'

/**
 * The stream's art — 16:9, full-bleed at the top of the page, with the access badge over it.
 *
 * ## The badge is `liveAccess`'s, not a second opinion
 *
 * The same descriptor, the same three phrasings and the same call as the card on the space page, so
 * a reader who taps a *Members only* card cannot land on a page that says *Unlock for 250*. That is
 * the whole reason the rule lives in `@features/event/access` rather than in either component — its
 * own doc records the bug the divergence produces, and it is a price tag printed over a free stream.
 *
 * `null` means the stream is open, or this reader is already inside it, and **nothing is drawn**.
 * A badge is an invitation; showing one to somebody who has paid is a second bill.
 *
 * ## No banner is an ordinary state
 *
 * A creator who has not uploaded art yet gets the placeholder glyph on a segment fill — the same
 * treatment, and the same glyph, as `ChannelEventCard`. It is not an error and it must not look like
 * one: the page still has a title, a schedule and a host.
 */
export function EventBanner({
    event,
    showAccess = true,
}: {
    event: EventDetail
    /**
     * The access pill — *Unlock for 250 ⭐*, *Members only*.
     *
     * ⚠ Set `false` for **the host's own stream**. `liveAccess` already withholds it when the
     * payload says `purchased`, and a host's own event does come back that way — but that is a
     * backend fact being trusted to prevent telling a creator to buy their own broadcast, and the
     * cost of it being wrong once is a price tag on the page they send people to. `EventHostScreen`
     * states the rule for the report ("no access badge"); this is the same rule where the host
     * reuses the viewer's card.
     */
    showAccess?: boolean
}) {
    const { t, currentLanguage } = useTranslation()
    const access = showAccess ? liveAccess(event) : null
    const banner = event.images.banner

    return (
        <div
            className={cn(
                'relative aspect-video w-full overflow-hidden bg-(--background-segment)',
                /*
                 * The card's own top radius, at **every** width.
                 *
                 * ⚠ It was `md:` only, which was correct while the screen was painted full-bleed
                 * below `md` and the card had no edges there — a rounded corner would have been cut
                 * in half by the screen edge. The event page is on §6's *multi-block* branch now
                 * (`EVENT_CARD` paints and rounds at every width), so a square-cornered banner
                 * inside a rounded card leaves the art bleeding past the corner on a phone.
                 */
                'rounded-t-2xl',
            )}
        >
            {banner ? (
                <Image
                    src={banner}
                    // The title is already an `<h1>` two rows down, so the art is decorative here
                    // and an `alt` repeating it would announce the same words twice in one stop.
                    alt=""
                    fill
                    // The column is 612 from `md` and the viewport below it. `priority`, because
                    // this is the page's largest contentful paint by a wide margin.
                    sizes="(max-width: 900px) 100vw, 612px"
                    priority
                    className="object-cover"
                />
            ) : (
                /*
                 * Decorative, and deliberately unlabelled: the event's title is the page's `<h1>`
                 * two rows down, so naming the placeholder would announce the same words twice in
                 * one stop. `Icon` is `aria-hidden` without a `title`.
                 */
                <div className="flex size-full items-center justify-center text-(--text-placeholder)">
                    <Icon name="signal-stream" weight="filled" size={32} />
                </div>
            )}

            {access && (
                /*
                 * Legacy's pill: a lock glyph and the label on a translucent black plate with a
                 * hairline, pinned to the bottom trailing corner.
                 *
                 * The colours are **literals and stay literals** — `#fff` ink on a black scrim over
                 * arbitrary creator art. This is the one place in the app where a semantic token
                 * would be wrong rather than merely unnecessary: `--text-title` inverts between
                 * modes, so in Light it would be near-black text on a black plate. The plate is not
                 * a surface of ours, it is a scrim over a photograph, and a scrim has no theme.
                 *
                 * `end-2 bottom-2` rather than `right`/`bottom` — logical properties, so the badge
                 * moves to the other corner in Arabic with the rest of the page.
                 */
                <div className="absolute end-2 bottom-2 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-(--radius-fill) border border-white/50 bg-black/50 px-2 py-1 backdrop-blur-sm">
                    <Icon name="lock-simple" size={16} className="flex-none text-white" />
                    <span className="type-caption-label-strong min-w-0 truncate text-white">
                        {access.price === null
                            ? t(access.key)
                            : t(access.key, {
                                  price: formatStarAmount(access.price, currentLanguage),
                              })}
                    </span>
                    {/* The mark only where there is a figure for it to qualify. "Members only" has
                        no price, and a Star beside it would read as a price of nothing. */}
                    {access.price !== null && <StarMark size={14} />}
                </div>
            )}
        </div>
    )
}
