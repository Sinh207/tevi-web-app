import { miniAppFromChannel } from '@features/mini-app'
import { describe, expect, it } from 'vitest'
import {
    isFollowedChannelMuted,
    listUserName,
    normalizeBlockedAccounts,
    normalizeCategoryNames,
    normalizeChannel,
    normalizeChannelActivity,
    normalizeChannelStats,
    normalizeFollowedChannels,
    normalizeFollowedLives,
    normalizeSocialPlatforms,
    parseApiMessage,
    parseChannelFieldErrors,
} from './types'

/** The smallest body the backend could plausibly return. */
const MINIMAL = { id: 1, owner_id: 9, slug: 'ada' }

describe('normalizeChannel', () => {
    it('defaults every viewer-relative flag to false so call sites need no `?? false`', () => {
        const channel = normalizeChannel(MINIMAL)
        expect(channel).not.toBeNull()
        expect(channel?.is_followed).toBe(false)
        expect(channel?.follow_requested).toBe(false)
        expect(channel?.blocking_channel).toBe(false)
        expect(channel?.blocked_user).toBe(false)
        expect(channel?.notification_settings).toBeNull()
    })

    it('normalises ids to strings, whichever way the service sends them', () => {
        expect(normalizeChannel(MINIMAL)?.id).toBe('1')
        expect(normalizeChannel(MINIMAL)?.owner_id).toBe('9')
        expect(normalizeChannel({ ...MINIMAL, id: 'abc' })?.id).toBe('abc')
    })

    it('lowercases privacy — legacy .toLowerCase()s it at six call sites', () => {
        expect(normalizeChannel({ ...MINIMAL, privacy: 'PUBLIC' })?.privacy).toBe('public')
        expect(normalizeChannel({ ...MINIMAL, privacy: ' Protected ' })?.privacy).toBe('protected')
    })

    /**
     * The single most important assertion in this file. If a privacy value cannot be parsed,
     * the one thing we must not do is expose the space. Flipping this default turns a backend
     * typo into a privacy incident.
     */
    it('fails closed on an unrecognised privacy value', () => {
        for (const privacy of ['weird', '', null, undefined, 5, {}]) {
            expect(normalizeChannel({ ...MINIMAL, privacy })?.privacy, String(privacy)).toBe(
                'protected',
            )
        }
    })

    it('keeps unknown fields rather than deleting what it does not model yet', () => {
        const channel = normalizeChannel({ ...MINIMAL, space_tier: 3, brand_new: { a: 1 } })
        expect(channel).toMatchObject({ space_tier: 3, brand_new: { a: 1 } })
    })

    it('turns blank strings into null so nothing renders an invisible value', () => {
        const channel = normalizeChannel({ ...MINIMAL, name: '   ', description: '' })
        expect(channel?.name).toBeNull()
        expect(channel?.description).toBeNull()
    })

    it('degrades one bad field instead of failing the whole channel', () => {
        const channel = normalizeChannel({
            ...MINIMAL,
            name: 'Ada',
            // All four are shapes the client does not expect.
            categories: 'not-an-array',
            social_links: null,
            images: 'nope',
            claimed_badges: 42,
        })
        expect(channel?.name).toBe('Ada')
        expect(channel?.categories).toEqual([])
        expect(channel?.social_links).toEqual([])
        expect(channel?.claimed_badges).toEqual([])
        expect(channel?.images).toEqual({ thumb: null, cover: null, avatar_video: null })
    })

    it('reads the animated avatar, and tolerates it being absent', () => {
        const withVideo = normalizeChannel({
            ...MINIMAL,
            images: {
                thumb: 'https://cdn/a.jpg',
                cover: null,
                avatar_video: {
                    playback: { url: 'https://cdn/a.mp4' },
                    thumbnail: 'https://cdn/a-frame.jpg',
                    duration_seconds: 8,
                },
            },
        })
        expect(withVideo?.images.avatar_video?.playback?.url).toBe('https://cdn/a.mp4')
        expect(normalizeChannel(MINIMAL)?.images.avatar_video).toBeNull()
    })

    /**
     * `null` means "the upstream answer was unusable" — which callers must keep distinct from
     * "there is no such channel", because only the latter may become a 404.
     */
    it('returns null only when there is nothing to degrade to', () => {
        for (const body of [null, undefined, 'a string', 42, []]) {
            expect(normalizeChannel(body), String(body)).toBeNull()
        }
    })
})

describe('normalizeChannelStats', () => {
    it('coerces counts and defaults a missing one to zero, not blank', () => {
        const stats = normalizeChannelStats({ follower_count: '1200', member_count: 5 })
        expect(stats).toMatchObject({
            follower_count: 1200,
            member_count: 5,
            post_count: 0,
            income_usd: 0,
        })
    })

    it('survives a garbage count', () => {
        expect(normalizeChannelStats({ follower_count: 'lots' })?.follower_count).toBe(0)
    })

    it('returns null for a non-object body', () => {
        expect(normalizeChannelStats(null)).toBeNull()
    })
})

describe('normalizeBlockedAccounts', () => {
    const FULL = {
        id: 77,
        created_at: '2026-01-12T09:00:00Z',
        user: {
            id: 42,
            name: 'ada',
            display_name: 'Ada Lovelace',
            slug: 'ada',
            avatar: { thumb: 'https://cdn/a.jpg', avatar_video: null },
            verified_tick_badge: { image: 'https://cdn/tick.png' },
            is_premium: true,
        },
    }

    it('keeps the block id and the user id apart — they are different identifiers', () => {
        const [entry] = normalizeBlockedAccounts([FULL])
        expect(entry.id).toBe('77')
        expect(entry.user.id).toBe('42')
    })

    it('returns [] for anything that is not an array', () => {
        for (const body of [undefined, null, {}, 'results', 5]) {
            expect(normalizeBlockedAccounts(body), String(body)).toEqual([])
        }
    })

    /**
     * A row with no id offers an Unblock button whose request is guaranteed to 404 — worse
     * than one row fewer. Legacy renders it anyway.
     */
    it('drops a row that cannot be unblocked', () => {
        expect(normalizeBlockedAccounts([{ user: { id: 1 } }])).toEqual([])
        expect(normalizeBlockedAccounts([{ id: '', user: { id: 1 } }])).toEqual([])
    })

    it('degrades field by field rather than dropping a row with a hole in it', () => {
        const [entry] = normalizeBlockedAccounts([{ id: 'b1', user: { id: 'u1' } }])
        expect(entry.user.slug).toBe('')
        expect(entry.user.display_name).toBeNull()
        expect(entry.user.avatar).toEqual({ thumb: null, avatar_video: null })
        expect(entry.user.verified_tick_badge).toBeNull()
        expect(entry.user.is_premium).toBe(false)
        expect(entry.created_at).toBeNull()
    })

    it('treats a blank string as absent, since "" is neither a name nor a URL', () => {
        const [entry] = normalizeBlockedAccounts([
            { id: 'b1', created_at: '  ', user: { id: 'u1', display_name: '   ' } },
        ])
        expect(entry.created_at).toBeNull()
        expect(entry.user.display_name).toBeNull()
    })

    it('keeps unknown fields, because the payload ships more than this file models', () => {
        const [entry] = normalizeBlockedAccounts([{ ...FULL, reason: 'spam' }])
        expect((entry as Record<string, unknown>).reason).toBe('spam')
    })
})

describe('listUserName', () => {
    const base = normalizeBlockedAccounts([{ id: 'b', user: { id: 'u' } }])[0].user

    it('prefers display_name, falls back to name, then to empty', () => {
        expect(listUserName({ ...base, display_name: 'Ada', name: 'ada' })).toBe('Ada')
        expect(listUserName({ ...base, display_name: null, name: 'ada' })).toBe('ada')
        expect(listUserName(base)).toBe('')
    })
})

describe('normalizeChannelActivity', () => {
    const ROW = {
        type: 'DONATION',
        created_at: '2026-02-01T00:00:00Z',
        actor: { id: 7, display_name: 'Ada', avatar: { thumb: 'https://cdn/a.jpg' } },
    }

    it('reads a full row', () => {
        const [row] = normalizeChannelActivity([ROW])
        expect(row.actor?.id).toBe('7')
        expect(row.actor?.display_name).toBe('Ada')
        expect(row.actor?.avatar?.thumb).toBe('https://cdn/a.jpg')
    })

    /**
     * The actor *is* the row: "«name» has donated" without a name is a sentence fragment, and the
     * feed is a courtesy block where one broken line is worse than one row fewer.
     */
    it('drops a row with no usable actor', () => {
        expect(normalizeChannelActivity([{ type: 'DONATION' }])).toEqual([])
        expect(normalizeChannelActivity([{ ...ROW, actor: null }])).toEqual([])
        expect(
            normalizeChannelActivity([{ ...ROW, actor: { id: 7, display_name: '  ' } }]),
        ).toEqual([])
    })

    /**
     * `type` stays an open string so a value the client cannot phrase is a *skipped row* at render
     * time rather than a parse failure here — the backend may add a third kind without us.
     */
    it('keeps a type it does not recognise', () => {
        const [row] = normalizeChannelActivity([{ ...ROW, type: 'SOMETHING_NEW' }])
        expect(row.type).toBe('SOMETHING_NEW')
    })

    it('returns [] for anything that is not an array', () => {
        for (const body of [undefined, null, {}, 'results', 5]) {
            expect(normalizeChannelActivity(body), String(body)).toEqual([])
        }
    })
})

/**
 * `created_at` arrives as a **number**, and it took querying the real endpoint to find out:
 * `GET /core/v3/channel/channels/sinhpn11/` answers `created_at: 1660516880264`. The field was
 * declared as text, so it parsed to `null`, and the header's joined-date row deleted itself — on
 * every channel, since the feature was written. The client's types agreed with each other the whole
 * time, which is why only the wire could settle it.
 */
describe('created_at', () => {
    const parse = (created_at: unknown) => normalizeChannel({ ...MINIMAL, created_at })?.created_at

    it('accepts epoch milliseconds as a number — the shape the API actually sends', () => {
        expect(parse(1660516880264)).toBe('2022-08-14T22:41:20.264Z')
    })

    it('accepts the same value as a numeric string', () => {
        // `new Date('1660516880264')` is `Invalid Date`, so this cannot just be passed through.
        expect(parse('1660516880264')).toBe('2022-08-14T22:41:20.264Z')
    })

    it('reads a value below the 1e11 threshold as seconds', () => {
        expect(parse(1660516880)).toBe('2022-08-14T22:41:20.000Z')
    })

    it('passes an ISO string through unchanged', () => {
        expect(parse('2022-08-14T22:41:20.264Z')).toBe('2022-08-14T22:41:20.264Z')
    })

    it('is null for anything that is not a moment in time', () => {
        for (const value of [null, undefined, '', '   ', 'nonsense', 0, -1, Number.NaN, {}, []]) {
            expect(parse(value), String(value)).toBeNull()
        }
    })

    it('never yields a string that formats as Invalid Date', () => {
        // The property the header depends on: whatever survives here is renderable.
        for (const value of [1660516880264, '1660516880264', '2022-08-14T22:41:20Z']) {
            const parsed = parse(value)
            expect(parsed).not.toBeNull()
            expect(Number.isNaN(new Date(parsed as string).getTime())).toBe(false)
        }
    })
})

/**
 * `categories` is an array of **plain strings** — `["Music", "Game", "Just Chatting", …]`, confirmed
 * against the live endpoint. It was modelled as `{ id, name }`, so every element failed and the
 * array-level `.catch([])` turned that into an empty list: the About tab lost its categories row
 * entirely, on every channel, and looked merely uneventful rather than broken.
 */
describe('categories', () => {
    const parse = (categories: unknown) => normalizeChannel({ ...MINIMAL, categories })?.categories

    it('reads the array of strings the API actually sends', () => {
        expect(parse(['Music', 'Game', 'Just Chatting'])).toEqual([
            'Music',
            'Game',
            'Just Chatting',
        ])
    })

    it('also accepts the { name } object shape it used to assume', () => {
        expect(parse([{ name: 'Music' }, { id: 2, name: 'Game' }])).toEqual(['Music', 'Game'])
    })

    it('drops only the unusable element, never the whole array', () => {
        // The actual defect: one odd element must not cost the other three.
        expect(parse(['Music', null, 42, { nope: 1 }, '  ', 'Game'])).toEqual(['Music', 'Game'])
    })

    it('trims, and treats a blank string as absent', () => {
        expect(parse(['  Music  ', '   '])).toEqual(['Music'])
    })

    it('is an empty array when the field is missing or not a list', () => {
        for (const value of [undefined, null, 'Music', 5, {}]) {
            expect(parse(value), String(value)).toEqual([])
        }
    })
})

describe('normalizeSocialPlatforms', () => {
    it('keeps every row that can actually be chosen', () => {
        expect(normalizeSocialPlatforms([{ value: 'x', name: 'X' }])).toEqual([
            { value: 'x', name: 'X' },
        ])
    })

    /** A row with no slug has nothing to send when it is picked — offering it offers a failure. */
    it('drops a row with no value', () => {
        expect(
            normalizeSocialPlatforms([{ name: 'Mystery' }, { value: '', name: 'Blank' }]),
        ).toEqual([])
    })

    it('falls back to the slug rather than dropping a row with no label', () => {
        expect(normalizeSocialPlatforms([{ value: 'tiktok' }])).toEqual([
            { value: 'tiktok', name: 'tiktok' },
        ])
    })

    it('is empty for a body that is not a list', () => {
        for (const body of [undefined, null, {}, 'x']) {
            expect(normalizeSocialPlatforms(body), String(body)).toEqual([])
        }
    })
})

describe('normalizeCategoryNames', () => {
    it('drops duplicates, which would toggle as one control and look like two', () => {
        expect(normalizeCategoryNames(['Music', 'Music', 'Game'])).toEqual(['Music', 'Game'])
    })

    it('shares the channel payload’s own tolerance for shapes', () => {
        expect(normalizeCategoryNames([' Music ', { name: 'Game' }, null, 7])).toEqual([
            'Music',
            'Game',
        ])
    })
})

describe('parseChannelFieldErrors', () => {
    it('maps a rejection onto the field it is about', () => {
        expect(
            parseChannelFieldErrors({
                errors: [
                    { input: 'slug', error: 'That username is taken.' },
                    { input: 'name', error: 'Contains a blocked word.' },
                ],
            }),
        ).toEqual({ slug: 'That username is taken.', name: 'Contains a blocked word.' })
    })

    /** The guard that matters: an unexpected `input` must not paint an unrelated field. */
    it('ignores an input this form does not have', () => {
        expect(parseChannelFieldErrors({ errors: [{ input: 'password', error: 'nope' }] })).toEqual(
            {},
        )
    })

    it('keeps the first rejection per field — one line, one sentence', () => {
        expect(
            parseChannelFieldErrors({
                errors: [
                    { input: 'name', error: 'First.' },
                    { input: 'name', error: 'Second.' },
                ],
            }),
        ).toEqual({ name: 'First.' })
    })

    it('refuses a message long enough to be a stack fragment', () => {
        expect(
            parseChannelFieldErrors({ errors: [{ input: 'name', error: 'x'.repeat(201) }] }),
        ).toEqual({})
    })

    it('is empty for every shape that is not an errors array', () => {
        for (const body of [undefined, null, 'boom', { errors: 'boom' }, { message: 'boom' }]) {
            expect(parseChannelFieldErrors(body), String(body)).toEqual({})
        }
    })
})

describe('parseApiMessage', () => {
    /** The body that started this: a whole-request rejection with no `errors` array. */
    const verified = {
        message: "You can't change username of verified space. Please contact support.",
        code: 'CHN0006',
        success: false,
    }

    it('reads the sentence a 4xx carries', () => {
        expect(parseApiMessage(verified, 400)).toBe(
            "You can't change username of verified space. Please contact support.",
        )
    })

    it('is exactly the shape `parseChannelFieldErrors` cannot see', () => {
        // Both run on the same body; this is why the screen showed the generic line.
        expect(parseChannelFieldErrors(verified)).toEqual({})
    })

    /** A 5xx body is where stack fragments live — same guard as `providerSignInErrorText`. */
    it('refuses a server error, whatever it says', () => {
        expect(parseApiMessage(verified, 500)).toBeNull()
        expect(parseApiMessage(verified, undefined)).toBeNull()
    })

    it('refuses anything that is not one short sentence', () => {
        expect(parseApiMessage({ message: 'x'.repeat(201) }, 400)).toBeNull()
        expect(parseApiMessage({ message: '   ' }, 400)).toBeNull()
        expect(parseApiMessage({ message: 42 }, 400)).toBeNull()
        expect(parseApiMessage(null, 400)).toBeNull()
    })
})

/**
 * The followed list's rows, and the two filters that decide whether a row can be *acted on*
 * rather than merely displayed.
 */
describe('normalizeFollowedChannels', () => {
    const ok = {
        id: 7,
        slug: 'ada',
        name: 'Ada',
        images: { thumb: 'https://cdn/a.png' },
        last_activity_at: 1_755_000_000,
        pin: true,
    }

    it('parses a row and normalises the id to a string', () => {
        const [row] = normalizeFollowedChannels([ok])
        expect(row?.id).toBe('7')
        expect(row?.slug).toBe('ada')
        expect(row?.pin).toBe(true)
        expect(row?.images.thumb).toBe('https://cdn/a.png')
    })

    /**
     * The slug is what every action on the row addresses — pin, unpin, mute, unfollow and the link
     * are all `.../{slug}/...`. A row without one is a name with four menu items that must fail.
     */
    it('drops a row with no slug, which nothing could act on', () => {
        expect(normalizeFollowedChannels([{ ...ok, slug: '' }])).toEqual([])
        expect(normalizeFollowedChannels([{ ...ok, slug: null }])).toEqual([])
    })

    /** One odd row must not become an empty list — the `.catch([])` trapdoor `categories` fell
     *  through. */
    it('keeps the usable rows beside an unusable one', () => {
        expect(normalizeFollowedChannels([ok, null, { ...ok, slug: 'grace' }])).toHaveLength(2)
    })

    it('answers an empty list for anything that is not an array', () => {
        expect(normalizeFollowedChannels(undefined)).toEqual([])
        expect(normalizeFollowedChannels({ results: [] })).toEqual([])
    })

    /** Epoch seconds are what this endpoint sends; the schema's shared normaliser turns them into
     *  something `new Date()` agrees with. */
    it('normalises the activity timestamp', () => {
        const [row] = normalizeFollowedChannels([ok])
        expect(Number.isNaN(new Date(row?.last_activity_at ?? '').getTime())).toBe(false)
    })
})

/**
 * The tri-state that the UI is not. Getting this backwards paints a mute glyph on every row, which
 * is what legacy ships — see the field's own note.
 */
describe('isFollowedChannelMuted', () => {
    const [base] = normalizeFollowedChannels([{ id: '1', slug: 'ada' }])

    it('is muted only when the flag is explicitly false', () => {
        const [muted] = normalizeFollowedChannels([
            { id: '1', slug: 'ada', notification_settings: { notification: false } },
        ])
        expect(muted && isFollowedChannelMuted(muted)).toBe(true)
    })

    it('is not muted when the block is absent — muting is opt-in', () => {
        expect(base && isFollowedChannelMuted(base)).toBe(false)
    })

    it('is not muted when the flag is true', () => {
        const [on] = normalizeFollowedChannels([
            { id: '1', slug: 'ada', notification_settings: { notification: true } },
        ])
        expect(on && isFollowedChannelMuted(on)).toBe(false)
    })
})

/** The Live now strip's rows — dropped when the card could be drawn but not navigated to. */
describe('normalizeFollowedLives', () => {
    const live = {
        code: 'abc123',
        title: 'Morning stream',
        start_at: 1_755_000_000,
        images: { banner: 'https://cdn/b.png' },
        channel: { slug: 'ada', name: 'Ada', images: { thumb: 'https://cdn/a.png' } },
    }

    it('parses a row with its nested channel', () => {
        const [row] = normalizeFollowedLives([live])
        expect(row?.code).toBe('abc123')
        expect(row?.channel?.slug).toBe('ada')
        expect(row?.images.banner).toBe('https://cdn/b.png')
    })

    /** No code, no `/@{slug}/event/{code}` — the card would be a banner that does nothing. */
    it('drops a row with no code', () => {
        expect(normalizeFollowedLives([{ ...live, code: null }])).toEqual([])
    })

    /** Nothing to attribute the stream to and no space to link the avatar at. */
    it('drops a row whose channel is missing or slugless', () => {
        expect(normalizeFollowedLives([{ ...live, channel: null }])).toEqual([])
        expect(normalizeFollowedLives([{ ...live, channel: { slug: '' } }])).toEqual([])
    })

    /**
     * The event fields have to survive the extend, or `liveAccess` reads `undefined` and every
     * gated stream renders as open.
     */
    it('keeps the gating fields the shared access rules read', () => {
        const [row] = normalizeFollowedLives([
            { ...live, price: '3.00', required_packages: ['pkg'], purchased: false },
        ])
        expect(row?.price).toBe('3.00')
        expect(row?.required_packages).toEqual(['pkg'])
        expect(row?.purchased).toBe(false)
    })
})

/**
 * The **structural contract** between a followed row and `features/mini-app`, which is the thing
 * that would break silently: `followedChannelSchema` is a `looseObject`, so the mini-app fields
 * survive the parse whether or not they are declared — they just arrive typed `unknown`, and a
 * missing declaration makes the structural match fail with nothing on screen to say why.
 *
 * So this asserts the whole path a real row takes: parsed by this feature, handed to the other
 * feature's own rule, and turned into a config the player would accept.
 */
describe('a followed row satisfies MiniAppChannelLike', () => {
    const parse = (fields: Record<string, unknown>) =>
        normalizeFollowedChannels([{ id: '1', slug: 'lin', name: 'Lin', ...fields }])[0]

    it('builds a config for a space that has an app', () => {
        const row = parse({
            has_mini_app: true,
            mini_app_url: 'https://example.com/app',
            mini_app_id: 'app-1',
            shareable_url: 'https://tevi.com/@lin',
            images: { thumb: 'https://cdn/a.png' },
        })
        expect(miniAppFromChannel(row, 'Mini app')).toMatchObject({
            id: 'app-1',
            name: 'Lin',
            url: 'https://example.com/app',
        })
    })

    /**
     * `has_mini_app` alone is not the question. It has been seen true with an empty `mini_app_url`,
     * and the row must draw no button for it — the flag with nothing behind it would open a blank
     * frame. The rule lives in `miniAppFromChannel`; this pins that the parsed row reaches it intact.
     */
    it('builds nothing from the flag alone', () => {
        expect(miniAppFromChannel(parse({ has_mini_app: true }), 'Mini app')).toBeNull()
        expect(
            miniAppFromChannel(parse({ has_mini_app: true, mini_app_url: '' }), 'Mini app'),
        ).toBeNull()
    })

    it('builds nothing for the ordinary space', () => {
        expect(miniAppFromChannel(parse({}), 'Mini app')).toBeNull()
    })
})
