import { ChannelEmptyState } from '@features/channel'
import {
    NOTIFICATION_ART,
    NOTIFICATION_CONTAINER,
    NotificationSkeleton,
} from '@features/notification'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ComponentProps } from 'react'
import { NotificationPreview } from './preview'

export const metadata: Metadata = {
    title: 'Notifications',
    robots: { index: false, follow: false },
}

type Message = ComponentProps<typeof NotificationPreview>['rows'][number]

/**
 * Dev-only preview of the notification row: `pnpm dev`, then open /dev/notification. 404s in
 * production (`proxy.ts` stops the request; the `notFound()` below is the belt to that braces).
 *
 * It exists for the reason `/dev/blocked-accounts` does — the screen is otherwise **unreachable
 * without a signed-in account that has actually received notifications**, so a design pass on it
 * meant faking an API response. Every state the row has is pure props, so all of them render here
 * honestly: this is a preview of the shipped component with the shipped copy, not a mock of it.
 *
 * What it deliberately does **not** preview is `NotificationView` or the filter sheet — both own
 * queries, and versions of them that did not would be second implementations of the screen with
 * their own drift. The states the view adds (error, signed out) are `ChannelEmptyState` with
 * different copy, and the empty state is below.
 */

/**
 * Fixtures, chosen to cover the payload shapes and press outcomes the row has to survive rather
 * than four nice sentences. In order: an unread internal link, a read external link, an app-only
 * transaction, a body long enough to clamp, a row with no title, and a row with nothing but a date.
 */
const ROWS: Message[] = [
    {
        id: 'n1',
        message_id: null,
        read: false,
        created_at: new Date(Date.now() - 4 * 60_000).toISOString(),
        icon: null,
        category: 'creator_activity',
        content: {
            title: 'Ada Lovelace',
            body: 'has become your channel’s subscriber.',
            payload: { clickable_url: 'https://tevi.com/@ada', type: null },
        },
    } as Message,
    {
        // Read: no tint, no dot. External target — a new tab, `rel="noopener noreferrer"`.
        id: 'n2',
        message_id: null,
        read: true,
        created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
        icon: null,
        category: 'system',
        content: {
            title: 'Community Guidelines update',
            body: 'We have updated our guidelines. Read what changed.',
            payload: { clickable_url: 'https://help.example.com/guidelines', type: 'notice' },
        },
    } as Message,
    {
        // App-only: `money` + `transaction`. The press opens `GetAppDialog` on the real screen;
        // here it only marks the row read, since this page mounts no dialog.
        id: 'n3',
        message_id: null,
        read: false,
        created_at: new Date(Date.now() - 26 * 3600_000).toISOString(),
        icon: null,
        category: 'money',
        content: {
            title: 'Star topup successful',
            body: 'As you requested, 1,200 Star had been added to your account.',
            payload: { clickable_url: null, type: 'transaction' },
        },
    } as Message,
    {
        // The clamp: two lines, then ellipsis. Legacy clamps nothing and this row is four lines
        // tall there, which is what takes the rhythm out of the list.
        id: 'n4',
        message_id: null,
        read: false,
        created_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        icon: null,
        category: 'system',
        content: {
            title: 'Your Space has been labelled NSFW',
            body: 'Your Space has been labeled as NSFW. Please refer to our policy and tutorial here so your users can see your content, and review the settings on your space before publishing anything else.',
            payload: { clickable_url: 'https://tevi.com/settings/space-sensitive', type: null },
        },
    } as Message,
    {
        // No title — the social kinds send a body alone. The time takes the whole first line and
        // the separator dot is dropped with the title it separated from.
        id: 'n5',
        message_id: null,
        read: false,
        created_at: new Date(Date.now() - 9 * 86_400_000).toISOString(),
        icon: null,
        category: 'post',
        content: {
            title: null,
            body: 'reacted to your post',
            payload: { clickable_url: 'https://tevi.com/@grace/post/12', type: null },
        },
    } as Message,
    {
        // Nothing but a date: no title, no body, no URL. Still a row, because it is still an entry
        // the reader may want to clear — and its press falls back to the app-only prompt.
        id: 'n6',
        message_id: null,
        read: true,
        created_at: new Date(Date.now() - 400 * 86_400_000).toISOString(),
        icon: null,
        category: null,
        content: null,
    } as Message,
]

export default function DevNotificationPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-10 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Notifications</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/notification` — the DS List/User Item row (2089:2965) as /notification
                    renders it. Press a row to mark it read; the kebab’s Delete plays the exit. The
                    unread tint is `--primary-50`, which inverts between modes, so check both.
                </p>
            </header>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">rows</h2>
                <div className={NOTIFICATION_CONTAINER}>
                    <NotificationPreview rows={ROWS} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">empty</h2>
                <div
                    className={`${NOTIFICATION_CONTAINER} overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]`}
                >
                    <ChannelEmptyState
                        art={NOTIFICATION_ART.empty}
                        title="No buzz yet"
                        body="When something happens on your space, you'll hear about it here."
                    />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">loading</h2>
                <div
                    className={`${NOTIFICATION_CONTAINER} overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]`}
                >
                    <NotificationSkeleton count={3} />
                </div>
            </section>
        </main>
    )
}
