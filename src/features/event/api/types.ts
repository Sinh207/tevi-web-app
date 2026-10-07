import { z } from 'zod'

/**
 * The DTO for **one live event, read by its code** — `v4/public/events/{code}/`.
 *
 * ## Why this is not `channelEventSchema`
 *
 * `features/channel` already parses events, from `v4/events/` (the creator's own list) and from
 * `channel.lives[]` (the projection that rides along with a space). Neither of those is this
 * payload: this one is the event's **whole** record and the only one that carries the fields the
 * page is built out of — `description`, `channel`, `product_id`, `age_restriction`, `ended_at`.
 *
 * Just as importantly it is the only door a **visitor** has. `v4/events/` answers for the bearer
 * and takes no slug, and `channel.lives[]` lists only what the space payload chose to include — so
 * an ended stream, or one the array omits, is unreachable through either. `public/` in the path is
 * the promise this schema is built on: no bearer is required, which is also what lets the page be
 * server-rendered for a crawler (see `event-server-api.ts`).
 *
 * ## The parsers below are duplicated on purpose
 *
 * `nullableText` / `nullableTimestamp` / `boolish` exist three times in this repo now, and the
 * reason is written up on `features/channel/api/events-api.ts`: **these are separate services and
 * neither is evidence for the other's wire format.** Sharing them would make one service's observed
 * quirk (epoch milliseconds as a JSON number, seen on `channels/{slug}/`) look like a fact about
 * all of them, and the day one of them starts sending ISO there would be nowhere to record it.
 * What must *not* be duplicated is the product rule on top — that is `@features/event/access`,
 * which is structural precisely so this schema and the channel's can both feed it.
 */

/** A string that is present and non-blank, else `null`. `''` is not a URL, a title or a price. */
const nullableText = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

/** Ids arrive as a string or a number depending on the service. Absence stays absent. */
const nullableId = z
    .unknown()
    .transform(value => {
        if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

/**
 * A moment in time, normalised to an ISO 8601 string — or `null`.
 *
 * Epoch milliseconds *and* seconds are both accepted, discriminated at `1e11`: a millisecond epoch
 * below it is 1973 and a second epoch above it is the year 5138, so the threshold is unambiguous
 * for any real date. Callers put the value into `<time dateTime={…}>` and `new Date(…)`, and a raw
 * `'1700000000000'` is `Invalid Date` in both — one normalisation here means neither the formatter
 * nor the markup has to know what the wire looked like.
 */
const nullableTimestamp = z
    .unknown()
    .transform(value => {
        const raw =
            typeof value === 'number'
                ? value
                : typeof value === 'string' && /^\d+$/.test(value.trim())
                  ? Number(value.trim())
                  : null

        if (raw !== null) {
            if (!Number.isFinite(raw) || raw <= 0) return null
            const date = new Date(raw < 1e11 ? raw * 1000 : raw)
            return Number.isNaN(date.getTime()) ? null : date.toISOString()
        }

        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        if (trimmed === '') return null
        return Number.isNaN(new Date(trimmed).getTime()) ? null : trimmed
    })
    .catch(null)

const boolish = z.coerce.boolean().catch(false)

/**
 * A flag that is **on unless the payload says otherwise** — the inverse default, and the only
 * field on this schema that needs it.
 *
 * ⚠ It cannot be written `z.coerce.boolean().catch(true)`, which is what this was first. `catch`
 * only fires on a parse **error**, and coercion never errors: `Boolean(undefined)` is `false` and
 * succeeds, so the default was unreachable and an absent `allow_chat` silenced the room. Caught
 * by the chat's own tests, whose fixtures do not send the field — which is exactly the payload
 * shape the default exists for.
 */
const boolishDefaultTrue = z
    .unknown()
    .transform(v => (v === undefined || v === null ? true : Boolean(v)))
    .catch(true)

/** Optional and absent both mean `null` — never `undefined`, which JSON drops on the RSC wire. */
const nullable = <T extends z.ZodType>(schema: T) =>
    z
        .unknown()
        .transform(value => {
            const parsed = schema.safeParse(value)
            return parsed.success ? (parsed.data as z.output<T>) : null
        })
        .catch(null)

/** A list of strings, keeping what parses and dropping only what does not. */
const stringList = z
    .unknown()
    .transform(v => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []))
    .catch([])

/**
 * ⚠ **Rows may be ids *or* objects, and dropping the objects silently opens the stream.**
 *
 * The identical trap `channelEventSchema` records, and it has to be defended twice because the two
 * schemas are separate: a payload carrying `[{ id: '…' }]` filtered to `[]`, and
 * `liveAccess` then read a members-only stream as an **open** one and drew no badge — a paid
 * broadcast advertised as free, with nothing throwing. Only the **length** is ever read, which is
 * why being generous here is free and being strict is expensive.
 */
const packageIdList = z
    .unknown()
    .transform(v =>
        Array.isArray(v)
            ? v
                  .map(row => {
                      if (typeof row === 'string') return row.trim() || null
                      if (row && typeof row === 'object') {
                          const candidate =
                              (row as { id?: unknown; package_id?: unknown }).id ??
                              (row as { package_id?: unknown }).package_id
                          if (typeof candidate === 'string') return candidate.trim() || null
                          if (typeof candidate === 'number') return String(candidate)
                      }
                      return null
                  })
                  .filter((id): id is string => id !== null)
            : [],
    )
    .catch([])

/**
 * The six statuses an event can be in. `PUBLISHED` is the one that does not survive translation —
 * to a reader it is *Coming soon*, because publishing is what schedules it.
 */
export const EVENT_STATUSES = [
    'LIVE',
    'PUBLISHED',
    'PREPARING',
    'PAUSED',
    'ENDED',
    'CANCELLED',
] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

/**
 * The space hosting the event, as this payload sends it.
 *
 * Deliberately a small projection and **not** `channelSchema`: that models the 44-key profile
 * response, and declaring it here would leave three dozen fields defaulting to `false` on an object
 * the endpoint never claimed to send. What is here is what the host card and the metadata read.
 */
export const eventChannelSchema = z.looseObject({
    id: nullableId,
    /**
     * The **account** that owns the space, where the payload sends one.
     *
     * ⚠ **Not the ownership check**, and it used to be. `useEventOwnership` compared this against
     * `/me`'s `id` *before* legacy's real rule, on the strength of B11 — which answers that question
     * for `v3/channel/channels/{slug}/`, the profile response, and says nothing about this nested
     * projection. Nobody had checked whether the field is here at all. A rule that matches when it
     * should not returns `'host'`, and a false host reads somebody else's revenue.
     *
     * Kept parsed because legacy does read it on this payload — for **blocking a user**
     * (`blockUser(channel?.owner_id)`), which is the only thing it is known to be good for here, and
     * the surface that needs it lands with the live room. Whether it is reliably present is part of
     * **B114**.
     */
    owner_id: nullableId,
    /** Never carries the leading `@`. Without it the host card cannot link anywhere. */
    slug: z.string().catch(''),
    name: nullableText,
    images: nullable(z.looseObject({ thumb: nullableText, cover: nullableText })).transform(
        v => v ?? { thumb: null, cover: null },
    ),
    verified_tick_badge: nullable(z.object({ image: nullableText })),
    /**
     * The space is flagged sensitive.
     *
     * Read by `generateMetadata` only (through `mayDescribeEventForCrawler`), where it turns the
     * page `noindex, nofollow` and withholds the title, banner and structured data — legacy does the
     * same, and it is the one thing this flag genuinely protects. It does **not** raise a wall here:
     * that is `ChannelNsfwGate`'s job on the space's own page, and an event has its own, narrower
     * gate in `age_restriction` below.
     */
    is_nsfw: boolish,
    is_premium: boolish,
    /**
     * The creator's promoted app — the studio's 85×85 ad tile (`EventStudioAd`), legacy's
     * `affiliateBanner`. **Not in the published schema** (`LightChannel` stops short of it), and read
     * anyway because legacy reads `event.channel.promote` and a real broadcast shows the tile. Typed
     * rather than left to `looseObject` so the three fields are vetted at the one place they enter.
     */
    promote: nullable(
        z.looseObject({
            referral_url: nullableText,
            app_icon_url: nullableText,
            app_name: nullableText,
        }),
    ).catch(null),
})

export type EventChannel = z.infer<typeof eventChannelSchema>

export const eventDetailSchema = z.looseObject({
    /**
     * The event's own id, where the payload sends one.
     *
     * Not what any URL is built from — that is `code` — and read in exactly one place: the share
     * sheet's attribution (`liveShareContext`), where `POST v1/links` wants a `content_id`. Which of
     * the two that field expects for a live is **B115**: legacy has `live` in the enum and has never
     * built a context for it, so there is no shipped behaviour to copy. `null` is ordinary and the
     * builder falls back to `code`.
     */
    id: nullableId,
    /** The share/deep-link identifier — the `{code}` in `/@{slug}/event/{code}`. */
    code: nullableText,
    title: nullableText,
    /** Creator-typed, plain text, and frequently empty. Rendered as text, never as HTML. */
    description: nullableText,
    /** Upper-cased here so no call site has to remember that the wire is not consistent. */
    status: z
        .unknown()
        .transform(v => (typeof v === 'string' ? v.trim().toUpperCase() : null))
        .catch(null),
    /** The **scheduled** time. Always present on a published event. */
    start_at: nullableTimestamp,
    /** When it actually went on air — `null` until it does. */
    started_at: nullableTimestamp,
    /**
     * When it came off air.
     *
     * Load-bearing beyond display: legacy keeps the live *layout* for five minutes after this, which
     * is how a viewer who was watching sees the "broadcast has ended" panel rather than being
     * dumped onto a details page. `isRecentlyEnded` in `lib/event-state.ts` owns that window.
     */
    ended_at: nullableTimestamp,
    created_at: nullableTimestamp,
    updated_at: nullableTimestamp,
    /**
     * What it costs to unlock, as a **decimal string** (`"3.00"`), in `price_currency` (`TVS`).
     *
     * Left a string: it is money, and `Number("3.00")` is a lossy step to take in a schema when only
     * the formatter needs it. `null` means the payload said nothing, which is **not** the same as
     * free — `@features/event/access` is where that distinction is enforced, and where legacy's
     * conflation of the two is written up.
     */
    price: nullableText,
    price_currency: nullableText,
    /**
     * What `POST billy/v1/ecom/purchase/` is given to unlock this event.
     *
     * `null` is the case that decides the UI: **no product, no unlock button.** Legacy passes
     * `event?.product_id` straight into the purchase call and would post `{ product_id: undefined }`
     * — a request that cannot succeed, made from a button that looked like it would. Failing closed
     * here means a payload that omits it shows the reader the price and no false promise.
     */
    product_id: nullableId,
    /** Memberships that unlock this stream. Non-empty ⇒ members-only, whatever `price` says. */
    required_packages: packageIdList,
    /** The backend's own answer to "is this reader locked out". */
    need_unlock_package: boolish,
    /** This reader has already paid for it. */
    purchased: boolish,
    /** Platforms this stream may **not** be watched on — `["Website"]` on a real payload. */
    restricted_platforms: stringList,
    /**
     * The creator marked this stream 18+.
     *
     * A real gate, unlike the channel's `is_nsfw`: the banner and the description are shown *after*
     * the reader confirms, and the confirmation is remembered per account per event
     * (`shared/lib/age-consent.ts`). Legacy asks the same question and keeps the answer in
     * `` `${userId}_age_restricted_confirmed_list` `` — one unregistered key per account, and
     * literally `undefined_age_restricted_confirmed_list` for a visitor who is not signed in, which
     * is a bucket every guest on the device inherits.
     */
    age_restriction: boolish,
    /**
     * The creator charges **1 Star per chat message** in this broadcast.
     *
     * Read by the studio's composer, and it is the only field on this payload that decides whether
     * a control *costs money*. `boolish` fails to `false`, which is the right direction: a missing
     * flag means a free chat, and the alternative is refusing to let somebody type because a field
     * was absent. The charge itself is client-side — see `unlockApi.purchaseChatMessage` and
     * **B118**.
     */
    /**
     * ⚠ **The creator can switch chat off entirely**, and without this the composer stays enabled.
     *
     * Legacy gates its input on `isAllowChat`; this port had no such field, so a broadcast with
     * chat disabled still offered a working box that the server then refused — the reader types,
     * presses send, and gets a generic failure for something that was never going to work.
     *
     * ⚠ Defaults to **`true`**, unlike every other `boolish` on this payload. Chat being *on* is
     * the overwhelming default and the flag is recent; failing closed here would silence every
     * room served by an older payload. The cost of the two directions is asymmetric — a wrongly
     * open box gets one refused message, a wrongly closed one silences a whole broadcast.
     */
    allow_chat: boolishDefaultTrue,
    paid_chat: boolish,
    /**
     * The creator has switched on **paid interactions** for this broadcast.
     *
     * The master switch for the sustained fee: without it no rule in `DEFAULT_EVENT_CONFIG`
     * charges anybody, whatever the console says. `boolish` fails to `false` — the direction that
     * does not bill somebody because a field was missing.
     */
    paid_interactions: boolish,
    /**
     * Who the broadcast is for, as the console spells it.
     *
     * Not an enum, and not normalised: the only thing that reads it is the sustained fee's
     * `enable_with_event_visibility` list, which is *also* console-authored — so the two are
     * compared as the strings both sides were given. Turning it into a union here would mean
     * this client deciding a value is invalid when the two configs agree it is not.
     */
    visibility: nullableText,
    /** The canonical share URL — `https://tevi.com/@{slug}/event/{code}/`. */
    shareable_url: nullableText,
    /** The short form — `https://tevi.com/e/{code}/`. Both are app-associated domains. */
    public_url: nullableText,
    images: nullable(z.looseObject({ banner: nullableText })).transform(v => v ?? { banner: null }),
    /**
     * **The account that is broadcasting** — a bare integer user id, not the space.
     *
     * One thing reads it and it is the one that cannot do without it: a gift's **default
     * recipient**. Legacy sends `recipient_id: recipient?.id || event?.host`, so on a solo
     * broadcast — which is most of them — the host id *is* the whole of who gets paid. Absent, the
     * gift tray has nobody to send to and says so rather than posting a gift into the void.
     *
     * ⚠ **Not the ownership check** and not `channel.owner_id` either; see that field's note. This
     * is who is on camera, which on a multi-host stream is one of several people.
     */
    host: nullableId,
    /**
     * The creator switched **gifts** off for this broadcast.
     *
     * ⚠ A deliberate divergence: legacy does not read this field at all, so its tray is offered on
     * every stream whatever the console says. Both this and `gift_effect` are on
     * `PublicEventSerializerV4` and both are ignored there — honouring them is a change, which is
     * why it is stated here and asked as **B119**.
     *
     * Defaults to **`true`**, the same asymmetry `allow_chat` documents: an older payload that
     * omits the field must not silence a revenue surface, while a creator who explicitly switched
     * gifts off should be obeyed.
     */
    allowed_donation: boolishDefaultTrue,
    /**
     * The creator switched the **gift animation** off — the full-stage effect, not the tray.
     *
     * Read by nothing today, for the reason `docs/EVENT.md` gives: the SVGA player is not ported,
     * so there is no animation for the flag to suppress. Parsed now so that the day it lands the
     * gate is already on the payload rather than being discovered afterwards.
     */
    gift_effect: boolishDefaultTrue,
    /**
     * The space hosting it. `null` is a payload this page cannot render — see `normalizeEvent`.
     */
    channel: nullable(eventChannelSchema),
})

export type EventDetail = z.infer<typeof eventDetailSchema>

/**
 * Parse one event, or `null`.
 *
 * ## Two fields are required, and the rest of the payload is not evidence
 *
 * `code` and `channel.slug`. Without the code there is no share URL, no purchase and no identity;
 * without the slug the host card links nowhere and the canonical URL cannot be built — and both are
 * things the *page's own address* already asserted, so a body missing either is a body that does not
 * describe the event that was asked for.
 *
 * Everything else fails soft, which is the point of the `.catch`es above: a stream with no banner,
 * no description and no price is an ordinary stream, not a broken response. `null` here means "this
 * is not an event", and the caller turns it into a 404; it must never mean "one field was odd".
 */
export function normalizeEvent(body: unknown): EventDetail | null {
    const parsed = eventDetailSchema.safeParse(body)
    if (!parsed.success) return null
    const event = parsed.data
    if (!event.code || !event.channel?.slug) return null
    return event
}
