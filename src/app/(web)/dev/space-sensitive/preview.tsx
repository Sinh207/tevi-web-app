'use client'

import {
    type Channel,
    ChannelHeader,
    ChannelNsfwGate,
    normalizeChannel,
} from '@features/channel/dev'
import { Button } from '@shared/ui/button'
import { useState } from 'react'

/**
 * A space that is flagged sensitive, with the two things the state is made of: the **shell** (real
 * header, art blurred) and the **gate** where the tabs would be.
 *
 * The fixture goes through `normalizeChannel`, the same parser the API responses take, so the harness
 * cannot drift into a shape the app never sees.
 */
const CHANNEL: Channel | null = normalizeChannel({
    id: 1,
    owner_id: 9,
    slug: 'ada',
    name: 'Ada Lovelace',
    privacy: 'public',
    is_nsfw: true,
    /*
     * `description`, not `bio` — the wire field. It said `bio` for a while, which `looseObject`
     * carried through untouched and `ChannelBio` never read, so the harness silently had no
     * description to withhold at all.
     */
    description: 'Analytical engine enthusiast. Notes, numbers, and the occasional loom.',
    created_at: '2019-04-11T09:00:00Z',
    /*
     * One named link and two platform marks, because those are three separate rows in `ChannelBio`
     * and the sensitive state has to take all three — a harness that only carries a description
     * would pass with the socials row still standing.
     */
    social_links: [
        { id: 1, platform: 'custom_link', url: 'https://example.com/notes', title: 'My notes' },
        { id: 2, platform: 'x', url: 'https://x.com/ada' },
        { id: 3, platform: 'instagram', url: 'https://instagram.com/ada' },
    ],
    /*
     * Real files from `public/`, and deliberately **busy** ones: a pale gradient blurs to a white
     * smear, which tells you nothing about whether the blur is doing its job.
     */
    images: {
        thumb: '/illustrations/identification/verified.webp',
        cover: '/illustrations/campaign/grow-your-fans.webp',
    },
})

const STATS = { follower_count: 12400, member_count: 320, post_count: 46, income_usd: 0 }

export function SensitiveSpacePreview() {
    /** What the page's own `nsfwAllowed` does — flipped here by the button, not by consent. */
    const [allowed, setAllowed] = useState(false)
    /**
     * Who is looking. Only one thing in the header reads it — the NSFW row, which offers the
     * **appeal** to the space's own creator (`ChannelBio` → `NsfwInfoDialog`) — but that one thing
     * is otherwise unreachable without signing in as one particular account, which is exactly the
     * kind of surface a harness exists for.
     */
    const [asOwner, setAsOwner] = useState(false)

    if (!CHANNEL) return <p className="p-6">fixture failed to parse</p>

    return (
        <main className="flex flex-1 flex-col gap-6 py-6">
            <div className="mx-auto flex w-full max-w-[612px] flex-col gap-2 px-3 md:px-0">
                <h1 className="type-title-t1-bold text-(--text-title)">Sensitive space</h1>
                <p className="type-dense-default text-(--text-subtitle)">
                    The shell renders with a <strong>shortened</strong> cover band, cover and avatar
                    blurred, and no description or links; the gate takes the tabs' place. Identity
                    and stats are deliberately <strong>not</strong> withheld — a visitor has to be
                    able to tell whose space they reached.
                </p>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" size="small" onClick={() => setAllowed(!allowed)}>
                        {allowed ? 'blur it again' : 'pretend the gate opened'}
                    </Button>
                    <Button variant="secondary" size="small" onClick={() => setAsOwner(!asOwner)}>
                        {asOwner ? 'view as visitor' : 'view as owner'}
                    </Button>
                    <span className="type-dense-default text-(--text-subtitle)">
                        {allowed ? 'gate satisfied → art sharp, tabs would render' : 'gate closed'}
                        {asOwner ? ' · NSFW row offers the appeal' : ''}
                    </span>
                </div>
            </div>

            <div className="mx-auto flex w-full flex-col md:max-w-[612px]">
                <ChannelHeader
                    channel={CHANNEL}
                    stats={STATS}
                    // `strong`, as the sensitive state uses — see `ChannelCover`'s note on the two.
                    blurred={allowed ? false : 'strong'}
                    isOwner={asOwner}
                    /*
                     * Mirrors the page: a sensitive space renders **no action row**. Become-a-member
                     * and Donate act on content the reader has not agreed to see, so the page passes
                     * nothing and the slot collapses. The button below the fold is the harness's own.
                     */
                    actions={
                        allowed ? (
                            <Button variant="accent" size="large" fullWidth>
                                Follow
                            </Button>
                        ) : undefined
                    }
                />
                {allowed ? (
                    <p className="px-3 py-10 text-center type-dense-default text-(--text-subtitle) md:rounded-b-[var(--radius-xl)] md:bg-(--background-surface) md:px-6">
                        (the tabs would be here)
                    </p>
                ) : (
                    <ChannelNsfwGate channel={CHANNEL} onAllowed={() => setAllowed(true)} />
                )}
            </div>
        </main>
    )
}
