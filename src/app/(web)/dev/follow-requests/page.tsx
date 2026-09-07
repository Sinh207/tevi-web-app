import {
    CHANNEL_SETTINGS_CONTAINER,
    ChannelEmptyState,
    FOLLOW_REQUESTS_ART,
    type FollowRequest,
    FollowRequestsSkeleton,
} from '@features/channel'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FollowRequestsPreview } from './preview'

export const metadata: Metadata = {
    title: 'Follow requests',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of the follow-requests row: `pnpm dev`, then open /dev/follow-requests.
 * 404s in production (`proxy.ts` stops the request; the `notFound()` below is the belt to that
 * braces).
 *
 * It exists for the reason `/dev/blocked-accounts` does, only more so: this screen is unreachable
 * without a signed-in account whose space is **protected** and whom strangers have actually asked
 * to follow — three conditions a developer cannot arrange, the last of which needs somebody else.
 * Every state the row has is pure props, so all of them render here honestly: this is a preview
 * of the shipped component with the shipped geometry, not a mock of it.
 *
 * What it deliberately does **not** preview is `FollowRequestsView` — that component owns a query
 * and two mutations, and a version of it that did not would be a second implementation of the
 * screen with its own drift. Its "public space" state is reachable by switching a real space to
 * public, and the signed-out state by signing out.
 */

/** Fixtures, covering the payload shapes the row has to survive rather than four nice names. */
const ROWS: FollowRequest[] = [
    {
        id: 'r1',
        created_at: '2026-08-12T09:00:00Z',
        user: {
            id: 'u1',
            name: 'ada',
            display_name: 'Ada Lovelace',
            slug: 'ada',
            avatar: { thumb: null, avatar_video: null },
            verified_tick_badge: { image: null },
            is_premium: false,
        },
    },
    {
        // Premium: the name takes the brand gradient, and the row still shows a still avatar.
        id: 'r2',
        created_at: '2026-07-03T09:00:00Z',
        user: {
            id: 'u2',
            name: null,
            display_name: 'Grace Hopper',
            slug: 'grace',
            avatar: { thumb: null, avatar_video: null },
            verified_tick_badge: { image: null },
            is_premium: true,
        },
    },
    {
        // No date: the row drops the meta line and centres the two it has left.
        id: 'r3',
        created_at: null,
        user: {
            id: 'u3',
            name: 'katherine',
            display_name: null,
            slug: 'katherine',
            avatar: { thumb: null, avatar_video: null },
            verified_tick_badge: null,
            is_premium: false,
        },
    },
    {
        // The truncation case, and the one with no slug at all — no handle line, no link. This is
        // the row that decides whether two buttons fit beside a long name on a phone.
        id: 'r4',
        created_at: '2026-08-20T09:00:00Z',
        user: {
            id: 'u4',
            name: null,
            display_name: 'A display name long enough that it has to truncate before the buttons',
            slug: '',
            avatar: { thumb: null, avatar_video: null },
            verified_tick_badge: null,
            is_premium: false,
        },
    },
]

export default function DevFollowRequestsPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-10 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Follow requests</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/channel` — the DS List/User Item row (2089:2965) as /follow-requests
                    renders it, with the bulk bar under it. Press Accept or Decline to watch the
                    exit; narrow the window to 390px to check that two buttons and a long name still
                    fit.
                </p>
            </header>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">rows</h2>
                <div className={CHANNEL_SETTINGS_CONTAINER}>
                    <FollowRequestsPreview rows={ROWS} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">empty</h2>
                <div
                    className={`${CHANNEL_SETTINGS_CONTAINER} overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]`}
                >
                    {/* No action here, unlike the shipped state: `ShareProfileButton` reads
                        `useMyChannel`, and this page mounts no session — the button would throw
                        rather than preview. What it looks like is a `Button variant="accent"
                        size="large"` with the `share` glyph, which `/dev/*` shows elsewhere. */}
                    <ChannelEmptyState
                        art={FOLLOW_REQUESTS_ART.empty}
                        title="No follow requests yet"
                        body="When someone requests to follow you, they'll appear here. Share your profile to get discovered."
                    />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">public space</h2>
                <div
                    className={`${CHANNEL_SETTINGS_CONTAINER} overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]`}
                >
                    <ChannelEmptyState
                        icon="globe"
                        title="Your space is public"
                        body="Anyone can follow a public space right away, so there is nothing to approve. Protect your space to review followers first."
                    />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">loading</h2>
                <div
                    className={`${CHANNEL_SETTINGS_CONTAINER} overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]`}
                >
                    <FollowRequestsSkeleton count={3} />
                </div>
            </section>
        </main>
    )
}
