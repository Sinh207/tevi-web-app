/**
 * What `/dev/messages` needs, kept out of `index.ts` so production never imports it.
 *
 * The rows are the shipped component fed through the shipped parser and view — so a fixture that
 * the schema would reject renders the way the real screen would render it, not the way the fixture
 * author hoped.
 */

import { normalizeConversations, normalizeMessages } from './api/types'
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

export { ChatHeader } from './components/chat-header'
export { ChatWall } from './components/chat-walls'
export { MessageComposer } from './components/message-composer'
export { MessageThreadView } from './components/message-thread-view'

/**
 * A conversation's worth of messages: yesterday and today, a reply, photos, an edit, a link, a bot
 * with buttons and a Premium gift. `me` is alias 1.
 */
export function threadFixtures(now: number) {
    const minutes = (n: number) => now - n * 60_000
    const them = {
        id: 7,
        alias: 7,
        name: 'Ada Lovelace',
        channel_slug: 'ada',
        avatar: { thumb: AVATAR },
    }
    const me = { id: 1, alias: 1, name: 'You', channel_slug: 'me' }
    return normalizeMessages([
        {
            id: 't1',
            sender: them,
            text: 'Hi! Thanks for the follow 🙌',
            created_at: minutes(60 * 26),
        },
        {
            id: 't2',
            sender: me,
            text: 'Loved the last live. When is the next one?',
            created_at: minutes(60 * 25),
            seen_by: { 7: true },
        },
        {
            id: 't3',
            sender: them,
            text: 'Friday 8pm — details here: https://tevi.com/@ada/live/123.',
            created_at: minutes(60 * 3),
        },
        {
            id: 't4',
            sender: me,
            text: 'Perfect, see you then',
            created_at: minutes(60 * 2),
            reply_message: { id: 't3', sender: them, text: 'Friday 8pm — details here' },
            seen_by: { 7: true },
        },
        {
            id: 't5',
            sender: them,
            images: [
                { url: AVATAR, w: 400, h: 400 },
                { url: AVATAR, w: 400, h: 400 },
            ],
            created_at: minutes(40),
        },
        {
            id: 't6',
            sender: me,
            text: 'Fixed the typo, sorry',
            edited_at: minutes(10),
            created_at: minutes(12),
        },
        {
            id: 't7',
            sender: them,
            text: 'Pick one:',
            created_at: minutes(5),
            inline_menu: {
                items: [
                    [
                        { label: 'Yes', action: 'CALLBACK_DATA', target: 'y' },
                        { label: 'No', action: 'CALLBACK_DATA', target: 'n' },
                    ],
                    [{ label: 'Open site', action: 'OPEN_URL', target: 'https://tevi.com' }],
                ],
            },
        },
        { id: 't8', sender: them, text: 'tevi://TEVI_PREMIUM_GIFT?id=1', created_at: minutes(2) },
    ])
}

/** The channel the dev preview's header and walls draw — parsed by nothing, shaped by hand. */
export const DEV_CHANNEL = {
    id: 'ch-1',
    owner_id: '7',
    slug: 'ada',
    name: 'Ada Lovelace',
    privacy: 'public',
    images: { thumb: AVATAR, cover: null, avatar_video: null },
    is_premium: true,
    is_suspended: false,
    verified_tick_badge: null,
    is_followed: false,
    follow_requested: false,
} as const
