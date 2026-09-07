'use client'

import type { Channel } from '@features/channel'
import { ChannelAutoFollow } from '@features/channel/dev'
import { notFound } from 'next/navigation'
import { useState } from 'react'

/**
 * Dev-only preview of the follow prompt: `pnpm dev`, then `/dev/auto-follow`. 404s in production.
 *
 * The bar replaces the action row's Follow button, so it is now the only place a space is followed
 * from — and it is only reachable on somebody else's published space, which a developer does not
 * have. What it cannot show is the **countdown**: that needs a signed-in account with `auto_follow`
 * switched on, and faking it would mean mocking the auth provider rather than seeding a cache. The
 * clock is pinned by `use-auto-follow.test.tsx` instead, where fake timers can assert things a
 * browser cannot — that it ticks real seconds, fires once, and pauses in a background tab.
 *
 * So this page answers the questions a test cannot: does it sit over the content correctly, does it
 * survive the theme, and does it mirror.
 */
export default function AutoFollowDevPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    const [followed, setFollowed] = useState(false)

    const channel = {
        slug: 'ada',
        name: 'Ada Lovelace',
        is_followed: followed,
        follow_requested: false,
        privacy: 'public',
    } as unknown as Channel

    return (
        <main className="flex flex-col gap-6 p-6 pb-40">
            <header className="flex max-w-2xl flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Auto follow</h1>
                <p className="type-dense-default text-(--text-body)">
                    The prompt that replaced the action row’s Follow button. Signed out it shows
                    without a countdown and pressing Follow opens the login dialog — which is the
                    state you are looking at.
                </p>
                <ul className="type-caption-meta flex list-disc flex-col gap-1 ps-5 text-(--text-body)">
                    <li>
                        Skip stops the clock and leaves the offer; only the Skip button goes away.
                    </li>
                    <li>The bar disappears entirely once the space is followed.</li>
                    <li>
                        Toggle the theme and an Arabic locale — the blur and the fill are tokens.
                    </li>
                </ul>
                <button
                    type="button"
                    className="type-dense-emphasis w-fit rounded-[var(--radius-md)] bg-(--background-segment) px-3 py-2 text-(--text-title)"
                    onClick={() => setFollowed(!followed)}
                >
                    {followed ? 'is_followed: true — bar hidden' : 'is_followed: false — bar shown'}
                </button>
            </header>

            {/* Enough text to scroll under the bar, which is the point of a pinned prompt. */}
            {Array.from({ length: 12 }, (_, i) => (
                <p
                    // biome-ignore lint/suspicious/noArrayIndexKey: static filler
                    key={i}
                    className="type-body-default max-w-2xl text-(--text-body)"
                >
                    Filler paragraph {i + 1}. The bar is fixed to the bottom of the channel column,
                    so content passes behind it and the blur is what keeps it legible.
                </p>
            ))}

            <ChannelAutoFollow channel={channel} />
        </main>
    )
}
