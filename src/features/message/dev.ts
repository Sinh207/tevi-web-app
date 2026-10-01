/**
 * What `/dev/messages` needs, kept out of `index.ts` so production never imports it.
 *
 * The rows are the shipped component fed through the shipped parser and view — so a fixture that
 * the schema would reject renders the way the real screen would render it, not the way the fixture
 * author hoped.
 */

import { useAuth } from '@features/auth'
import { type Channel, type ChannelStats, channelKeys } from '@features/channel'
import { normalizeChannel } from '@features/channel/dev'
import { postKeys } from '@features/post'
import { makePostFixture } from '@features/post/dev'
import { type QueryKey, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { normalizeConversations, normalizeMessages } from './api/types'
import { toConversationView } from './lib/conversation-view'

/** The floating window, drawn in the corner of the harness — signed out it shows its guest state. */
export { ChatPopupWindow } from './components/chat-popup-window'
export { ConversationRow } from './components/conversation-row'
export { ConversationSkeleton } from './components/conversation-skeleton'
export { MESSAGE_ART } from './lib/illustrations'
export { ROOM_GROUND } from './lib/room-ground'
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
export { ChatRoomMenu } from './components/chat-room-menu'
export { ChatWall } from './components/chat-walls'
export { ConnectionStrip } from './components/connection-banner'
export { MessageComposer } from './components/message-composer'
export { MessageSettingsDialog } from './components/message-settings-dialog'
export { MessageThreadView } from './components/message-thread-view'

/**
 * A conversation's worth of messages — one of everything a bubble draws: yesterday and today,
 * replies (text and photo), 1/2/3/5/10 photos, an edit, bot buttons, an external link, a Tevi link
 * of each kind that gets a card (space, post, collection, mini app) and one that does not (event),
 * and the gift in both wire spellings plus one with no plan. `me` is alias 1. The cards' data is
 * seeded by `useSeedEmbedFixtures`, so nothing here reaches the API.
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
            images: [{ url: AVATAR, w: 400, h: 400 }],
            text: 'The stage for Friday — what do you think of the new set?',
            created_at: minutes(45),
        },
        {
            id: 't5b',
            sender: them,
            images: [
                { url: AVATAR, w: 400, h: 400 },
                { url: AVATAR, w: 400, h: 400 },
                { url: AVATAR, w: 400, h: 400 },
            ],
            created_at: minutes(44),
        },
        {
            id: 't5c',
            sender: me,
            images: [
                { url: AVATAR, w: 400, h: 400 },
                { url: AVATAR, w: 400, h: 400 },
                { url: AVATAR, w: 400, h: 400 },
                { url: AVATAR, w: 400, h: 400 },
                { url: AVATAR, w: 400, h: 400 },
            ],
            created_at: minutes(40),
            seen_by: { 7: true },
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
        {
            id: 't7b',
            sender: them,
            images: [
                { url: AVATAR, w: 400, h: 400 },
                { url: AVATAR, w: 400, h: 400 },
            ],
            created_at: minutes(4.8),
        },
        {
            id: 't7c',
            sender: me,
            images: Array.from({ length: 10 }, () => ({ url: AVATAR, w: 400, h: 400 })),
            text: 'All ten from the rehearsal',
            created_at: minutes(4.6),
            seen_by: { 7: true },
        },
        {
            id: 't7d',
            sender: them,
            text: 'This one?',
            reply_message: { id: 't5', sender: them, images: [{ url: AVATAR, w: 400, h: 400 }] },
            created_at: minutes(4.4),
        },
        // ---- links: external, then one of each card the room draws ----
        {
            id: 'l1',
            sender: them,
            text: 'The venue guide is at https://example.com/guide, a new tab.',
            created_at: minutes(4.2),
        },
        {
            id: 'l2',
            sender: them,
            text: 'Come say hi on my space https://tevi.com/@ada',
            created_at: minutes(4),
        },
        {
            id: 'l3',
            sender: me,
            text: 'New post 👉 https://tevi.com/@ada/post/42',
            created_at: minutes(3.8),
            seen_by: { 7: true },
        },
        {
            id: 'l4',
            sender: them,
            text: 'Everything from the tour: https://tevi.com/@ada/collections/3',
            created_at: minutes(3.6),
        },
        {
            id: 'l5',
            sender: them,
            text: 'Play the game: https://tevi.com/@arcade',
            created_at: minutes(3.4),
        },
        {
            id: 'l6',
            sender: them,
            text: 'An event stays a link: https://tevi.com/@ada/event/7',
            created_at: minutes(3.2),
        },
        // ---- gifts: Android's tevi:// text, iOS's attachment, and a plan with no duration ----
        {
            id: 'g1',
            sender: them,
            text: 'tevi://TEVI_PREMIUM_GIFT?product_name=Gift%20Premium%20(3%20months)',
            created_at: minutes(3),
        },
        {
            id: 'g2',
            sender: me,
            text: 'Gift',
            attachments: [
                {
                    type: 'TEVI_PREMIUM_GIFT',
                    preview_data: { product_name: 'Gift Premium 1 year' },
                },
            ],
            created_at: minutes(2.5),
            seen_by: { 7: true },
        },
        {
            id: 'g3',
            sender: them,
            text: 'tevi://TEVI_PREMIUM_GIFT?id=1',
            created_at: minutes(2),
        },
        { id: 't9', sender: me, text: 'My space: https://tevi.com/@ada', created_at: minutes(1) },
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

function devChannel(overrides: Record<string, unknown>): Channel {
    const parsed = normalizeChannel({
        id: 'ch-1',
        owner_id: '7',
        slug: 'ada',
        name: 'Ada Lovelace',
        description: 'Live coding, every Friday.',
        privacy: 'public',
        images: { thumb: AVATAR, cover: null, avatar_video: null },
        is_premium: true,
        ...overrides,
    })
    if (!parsed) throw new Error('dev channel did not parse')
    return parsed
}

/** The two spaces the thread's links point at: Ada's, and one that *is* a mini app. */
export const DEV_SPACES = {
    ada: devChannel({}),
    arcade: devChannel({
        id: 'ch-2',
        owner_id: '8',
        slug: 'arcade',
        name: 'Tevi Arcade',
        description: 'Tiny games you can play right here in the chat.',
        has_mini_app: true,
        mini_app_url: 'https://example.com/app',
        mini_app_id: 'app-1',
    }),
}

/** The conversation `ChatRoomMenu` is drawn over — Ada, not muted. */
export const DEV_CONVERSATION = normalizeConversations([
    {
        id: 'conv-dev',
        recipient: { id: 7, active: true, name: 'Ada Lovelace', channel_slug: 'ada' },
        me: { tevi_user_alias: 1 },
        my_settings: { muted: false },
    },
])[0]

/**
 * Put every card's data in the cache, under the keys the cards read, and never let it go stale —
 * so the harness's space, mini-app, post and collection cards render from fixtures and nothing asks
 * the API about spaces that do not exist. Re-seeded when the session's account settles, because
 * every one of those keys carries it.
 *
 * Returns whether the seed is in: render the cards only after it, or a card that mounts first
 * starts its own request, and that request's 404 lands *on top of* the fixture.
 */
export function useSeedEmbedFixtures(): boolean {
    const queryClient = useQueryClient()
    const { activeId, isBootstrapping } = useAuth()
    const [seededFor, setSeededFor] = useState<string | null | undefined>(undefined)
    useEffect(() => {
        if (isBootstrapping) return
        const seed = (key: QueryKey, data: unknown) => {
            queryClient.setQueryDefaults(key, { staleTime: Number.POSITIVE_INFINITY })
            queryClient.setQueryData(key, data)
        }
        // The reader's own space, for the settings dialog: members-only is the saved choice, so the
        // dialog shows both rows whatever the (unseeded) membership read answers.
        seed(channelKeys.myChannel(activeId), {
            ...DEV_SPACES.ada,
            messaging_settings: { sender: 'subscriber' },
        })
        for (const space of Object.values(DEV_SPACES)) {
            seed(channelKeys.detail(space.slug, activeId), space)
        }
        seed(channelKeys.stats('ada', activeId), {
            follower_count: 12_400,
            member_count: 318,
            post_count: 96,
            income_usd: 0,
        } satisfies ChannelStats)
        seed(
            postKeys.detail('42', activeId),
            makePostFixture({
                id: '42',
                text: 'Friday’s set list is up — eleven songs, two of them new, and one I have never played live.',
                shareable_url: '/@ada/post/42',
                images: [{ uri: AVATAR, thumb: AVATAR, w: 400, h: 400 }],
                channel: {
                    id: 'ch-1',
                    slug: 'ada',
                    name: 'Ada Lovelace',
                    images: { thumb: AVATAR, uri: AVATAR, avatar_video: null },
                },
            }),
        )
        seed(postKeys.spaceCollection('ada', '3', activeId), {
            id: '3',
            name: 'On tour 2026',
            post_count: 12,
            created_at: new Date(Date.now() - 86_400_000 * 9).toISOString(),
        })
        setSeededFor(activeId)
    }, [activeId, isBootstrapping, queryClient])
    return seededFor === activeId && !isBootstrapping
}
