/**
 * What `/dev/messages` needs, kept out of `index.ts` so production never imports it.
 *
 * The rows are the shipped component fed through the shipped parser and view — so a fixture that
 * the schema would reject renders the way the real screen would render it, not the way the fixture
 * author hoped.
 */

import { normalizeConversations } from './api/types'
import { toConversationView } from './lib/conversation-view'

export { ConversationRow } from './components/conversation-row'
export { ConversationSkeleton } from './components/conversation-skeleton'
export { MESSAGE_ART } from './lib/illustrations'
export { toConversationView }

/** A committed image — `pnpm art:audit` fails on a remote one anywhere in `src/`. */
const AVATAR = '/illustrations/no-live-events.png'

/**
 * One row per thing the row has to survive: the four DS axes, typing, a photo, the sent / seen
 * ticks, an inactive account, a name long enough to truncate, and a count past 99.
 */
export function messageFixtures(now: number) {
    const minutes = (n: number) => now - n * 60_000
    const recipient = (over: Record<string, unknown> = {}) => ({
        id: 7,
        active: true,
        name: 'Ada Lovelace',
        channel_slug: 'ada',
        avatar: { thumb: AVATAR },
        ...over,
    })
    const me = { tevi_user_alias: 1 }

    return normalizeConversations([
        {
            id: 'unread',
            recipient: recipient({ is_premium: true, last_online_at: minutes(1) }),
            me,
            stats: { unread_messages: 3 },
            latest_message: {
                id: 'm1',
                text: 'Are you going live tonight?',
                created_at: minutes(4),
                sender: { alias: 7 },
            },
        },
        {
            id: 'read-mine-seen',
            recipient: recipient({ name: 'Grace Hopper', channel_slug: 'grace', space_tier: 2 }),
            me,
            latest_message: {
                id: 'm2',
                text: 'Thanks for the support!',
                created_at: minutes(90),
                sender: { alias: 1 },
                seen_by: { 7: true },
            },
        },
        {
            id: 'muted-unread',
            recipient: recipient({ name: 'Linus', channel_slug: 'linus' }),
            me,
            my_settings: { muted: true },
            stats: { unread_messages: 120 },
            latest_message: {
                id: 'm3',
                html_text: '<p>New post: <b>kernel</b> &amp; coffee</p>',
                created_at: minutes(60 * 26),
                sender: { alias: 9 },
            },
        },
        {
            id: 'pinned-blocked',
            recipient: recipient({ name: 'Margaret', channel_slug: 'margaret', blocking: true }),
            me,
            my_settings: { pinned: true, muted: true },
            latest_message: {
                id: 'm4',
                text: 'ok',
                created_at: minutes(60 * 24 * 4),
                sender: { alias: 1 },
            },
        },
        {
            id: 'photo',
            recipient: recipient({ name: 'Katherine', channel_slug: 'katherine' }),
            me,
            latest_message: {
                id: 'm5',
                images: [{ url: AVATAR, w: 100, h: 100 }],
                created_at: minutes(60 * 24 * 40),
                sender: { alias: 7 },
            },
        },
        {
            id: 'typing',
            recipient: recipient({
                name: 'A display name long enough to have to truncate somewhere',
                channel_slug: 'long-name-that-keeps-going',
            }),
            me,
            latest_message: {
                id: 'm6',
                text: 'hi',
                created_at: minutes(60 * 24 * 400),
                sender: { alias: 7 },
            },
        },
        {
            id: 'inactive',
            recipient: recipient({ active: false }),
            me,
            latest_message: {
                id: 'm7',
                text: 'This account no longer exists',
                created_at: minutes(60 * 24 * 2),
                sender: { alias: 7 },
            },
        },
    ])
}
