'use client'

import { NsfwGatePanel } from '@features/nsfw'
import { cn } from '@shared/lib/utils'
import type { Channel } from '../api/types'
import { CHANNEL_PADDING } from '../lib/container'

/**
 * What a sensitive space shows **instead of its tabs**.
 *
 * ## The gate is a state of the page, not a dialog over it
 *
 * It was a dialog, and it cost more than it looked. The scrim hid the space's identity, so a visitor
 * could not tell they had reached the right URL; the page underneath had to be *faked* — a blurred
 * band and a `220px` spacer standing in for a header nobody could see; and the only way out was a
 * Close button that pushed them off the site.
 *
 * Now the space renders: name, handle, stats, the follow button — everything except what the gate is
 * actually about. **The tabs are replaced by this**; the cover and avatar come through blurred and
 * the description and links do not come through at all (`ChannelHeader`'s `blurred`, `ChannelBio`'s
 * `withheld`). What is withheld is the content, the art and whatever the creator wrote or points
 * at, which is what "sensitive" refers to; a display name is not sensitive, and hiding it only hid
 * the address.
 *
 * Legacy renders the real space behind its dialog and blurs the backdrop, so the same information is
 * on screen — but its content is *there*, merely out of focus, which a blur cannot be trusted to
 * withhold. Here the tabs are not rendered at all: no threads, no live list, no posts request.
 *
 * ## Everything about the question itself lives in `features/nsfw`
 *
 * The two faces, both writes and the auth requirement are `NsfwGatePanel`'s — a live event and a post
 * ask the same question about the same subject, and copying it per surface is how the wording, the
 * consent key and the auth rule drift apart. This file is only *where* it goes on this page.
 *
 * Never shown to an owner: `channelVisibility` resolves ownership first.
 */
export function ChannelNsfwGate({
    channel,
    onAllowed,
}: {
    channel: Channel
    /** The viewer satisfied the gate — the page can render the tabs. */
    onAllowed: () => void
}) {
    return (
        <NsfwGatePanel
            slug={channel.slug}
            onAllowed={onAllowed}
            /*
             * The tab strip's own surface, so the panel continues the card the header starts rather
             * than floating under it: same padding as every other tab body, and the bottom corners
             * that the tabs would have rounded.
             */
            className={cn(
                CHANNEL_PADDING,
                'bg-(--background-surface) md:rounded-b-[var(--radius-xl)]',
            )}
        />
    )
}
