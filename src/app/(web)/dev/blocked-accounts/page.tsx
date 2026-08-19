import {
    BLOCKED_ACCOUNTS_ART,
    type BlockedAccount,
    BlockedAccountsSkeleton,
    CHANNEL_SETTINGS_CONTAINER,
    ChannelEmptyState,
} from '@features/channel'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BlockedAccountsPreview } from './preview'

export const metadata: Metadata = {
    title: 'Blocked accounts',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of the blocked-accounts row: `pnpm dev`, then open
 * /dev/blocked-accounts. 404s in production (`proxy.ts` stops the request; the `notFound()`
 * below is the belt to that braces).
 *
 * It exists for the reason `/dev/identification` does — the screen is otherwise
 * **unreachable without a signed-in account that has actually blocked someone**, so a design
 * pass on it meant either blocking a stranger or faking an API response. Every state the row
 * has is pure props, so all of them render here honestly: this is a preview of the shipped
 * component with the shipped copy, not a mock of it.
 *
 * What it deliberately does **not** preview is the `BlockedAccountsView` around it — that
 * component owns a query, and a version of it that did not would be a second implementation
 * of the screen with its own drift. The states it adds (empty, error, signed out) are
 * `ChannelEmptyState` with different copy and are reachable by signing out.
 */

/** Fixtures, covering the payload shapes the row has to survive rather than four nice names. */
const ROWS: BlockedAccount[] = [
    {
        id: 'b1',
        created_at: '2026-01-12T09:00:00Z',
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
        id: 'b2',
        created_at: '2025-11-03T09:00:00Z',
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
        id: 'b3',
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
        // The truncation case, and the one with no slug at all — no handle line, no link.
        id: 'b4',
        created_at: '2026-07-30T09:00:00Z',
        user: {
            id: 'u4',
            name: null,
            display_name: 'A display name long enough that it has to truncate before the button',
            slug: '',
            avatar: { thumb: null, avatar_video: null },
            verified_tick_badge: null,
            is_premium: false,
        },
    },
]

export default function DevBlockedAccountsPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-10 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Blocked accounts</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/channel` — the DS List/User Item row (2089:2965) as
                    /settings/blocked-accounts renders it. Press Unblock to watch the exit.
                </p>
            </header>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">rows</h2>
                <div className={CHANNEL_SETTINGS_CONTAINER}>
                    <BlockedAccountsPreview rows={ROWS} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">empty</h2>
                <div
                    className={`${CHANNEL_SETTINGS_CONTAINER} overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]`}
                >
                    <ChannelEmptyState
                        art={BLOCKED_ACCOUNTS_ART.empty}
                        title="No blocked accounts"
                        body="You have not blocked anyone yet. Accounts you block will show up here."
                    />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">loading</h2>
                <div
                    className={`${CHANNEL_SETTINGS_CONTAINER} overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]`}
                >
                    <BlockedAccountsSkeleton count={3} />
                </div>
            </section>
        </main>
    )
}
