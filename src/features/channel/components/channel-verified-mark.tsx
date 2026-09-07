'use client'

import { VerifiedBadge } from '@shared/components/verified-badge'
import type { Channel } from '../api/types'
import { SUPPORT_MESSAGES_PATH } from '../lib/routes'

/**
 * The verified mark, wherever a **channel** payload's name is written.
 *
 * A thin adapter, and that is the whole job: this file knows the payload shape
 * (`verified_tick_badge.image`, and that the object is present-but-empty on an unverified account)
 * and where the *Learn more* link goes; `VerifiedBadge` in `shared/components/` knows what a tick is
 * and what pressing one does. The rule the two must not disagree about — **image, else nothing** —
 * now lives in one file rather than in eight, which is why the badge moved out of this feature: three
 * other features draw the same mark and a feature may not import another.
 *
 * ## `interactive` is the space header's, and nowhere else's
 *
 * Pressing the tick opens the panel that says what verification means. Every other surface draws it
 * *inside* a link — a following row, a search result, the drawer's profile card — where a `<button>`
 * is invalid markup and would steal the press meant for the space. See `VerifiedBadge`.
 */
export function ChannelVerifiedMark({
    channel,
    /** 24 — the header, the bar and the rows all pass it; the live card passes 14. */
    size = 24,
    label,
    interactive,
    testId,
}: {
    channel: Channel
    size?: 16 | 18 | 20 | 22 | 24
    /** Overrides the default `channel_verified` name — a row already holding a `t()` can pass it. */
    label?: string
    /** Press to open the "what does this mean?" dialog. Header only. */
    interactive?: boolean
    /** The dialog derives `-panel`, `-title` and `-close` from this — see `VerifiedBadge`. */
    testId?: string
}) {
    const image = channel.verified_tick_badge?.image

    /*
     * The two shapes are spelled out rather than spread from one object, because `interactive` is a
     * discriminant on `VerifiedBadge`'s prop union: spreading collapses it, and the union is what
     * makes "a decorative badge cannot take a `learnMoreHref`" a type error.
     */
    if (!interactive) {
        return <VerifiedBadge image={image} size={size} label={label} data-testid={testId} />
    }

    return (
        <VerifiedBadge
            image={image}
            size={size}
            label={label}
            interactive
            /*
             * Support's message thread, **not** `/identification`: the reader pressing this tick is
             * asking what somebody's badge means, not asking to be verified themselves. The screen
             * does not exist yet — see `SUPPORT_MESSAGES_PATH`, where that is stated rather than
             * discovered.
             */
            learnMoreHref={SUPPORT_MESSAGES_PATH}
            data-testid={testId}
        />
    )
}
