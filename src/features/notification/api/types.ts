import { z } from 'zod'

/**
 * The notification inbox as this client understands it — `${W_API}/notification/v1/…`.
 *
 * ## Everything here is a **guess pinned by legacy's reads**, not a published contract
 *
 * There is no schema for this service. What is modelled below is exactly the set of fields
 * legacy's notification container touches (`containers/notification/**`), and nothing else. The
 * open questions — which id, which language the copy arrives in, whether `category` is a closed
 * set — are written down as **B79** in
 * [`docs/BACKEND_QUESTIONS.md`](../../../../docs/BACKEND_QUESTIONS.md) with what this code assumes
 * and what changes if the answer differs. Read those before "fixing" a field that looks odd.
 *
 * ## Why zod, and why every parse is per-field `.catch()`
 *
 * The same reasoning `features/channel/api/types.ts` sets out: parsing at the boundary is what
 * makes `read` a non-optional `boolean` instead of pushing `?? false` to every call site, and a
 * per-field default degrades one row's timestamp instead of taking the screen down because the
 * service nulled a field it had never nulled before. Unknown keys are **kept** (`looseObject`) —
 * this payload is the one in the app most likely to grow, since every new notification kind the
 * platform ships arrives through it.
 */

/** Ids arrive as either a string or a number depending on the service. Normalise to string. */
const id = z.union([z.string(), z.number()]).transform(String).catch('')

/**
 * A string that is present and non-blank, else `null`. `''` is not a title, a body or a URL.
 *
 * The seventh copy of this helper in the app — every feature's `api/types.ts` declares its own,
 * which is the convention here rather than an oversight. It stays local because promoting it means
 * touching seven features for a four-line function.
 */
const nullableText = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

/**
 * A moment in time as an ISO 8601 string, or `null` — accepting epoch seconds, epoch
 * milliseconds and anything `Date` parses.
 *
 * Same normalisation, and the same reason, as `channelSchema`'s `nullableTimestamp`: the channel
 * service answers `created_at` as **epoch milliseconds in a JSON number**, a plain string schema
 * discarded it, and a profile row silently never rendered. This service has not been checked, so
 * every form is accepted rather than one being assumed. The threshold between seconds and
 * milliseconds is unambiguous for any real date — a millisecond epoch under `1e11` is 1973.
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

/** Optional and absent both collapse to `null`, so a call site writes one check, never two. */
function nullable<T extends z.ZodType>(schema: T) {
    return schema
        .nullish()
        .transform(value => value ?? null)
        .catch(null)
}

/**
 * What a notification's press does — `content.payload`.
 *
 * Both fields are open strings and deliberately so. `clickable_url` is decided by whichever
 * service *sent* the notification, and `type` is that service's own discriminator: legacy names
 * five values across four categories (`common`, `transaction`, `mcn_invitation`, `money`, plus a
 * `default:` arm), which is evidence the set is open rather than closed. Modelling either as an
 * enum would turn a notification kind that ships after this client into a parse failure, when the
 * honest outcome is a row that renders and cannot be opened — see `lib/inbox-link.ts`.
 */
const inboxPayloadSchema = z.looseObject({
    clickable_url: nullableText,
    type: nullableText,
})

/**
 * One notification. `GET v1/inbox/messages/`.
 *
 * `id` is the value every action endpoint wants inside `message_ids`. Legacy keys its rows
 * `notification.id || notification.message_id` while sending only `notification.id` to
 * `read/`, `unread/` and `archive/` — so it renders rows whose actions cannot possibly work,
 * silently, and that fallback is the only evidence that the field is ever called `message_id`.
 * This schema reads **both** and prefers `id` (see `normalizeInboxMessages`), so a row either has
 * an id its actions can use or is dropped before it reaches the screen. **B79.**
 *
 * `icon` is an absolute URL the service chooses per notification kind — an avatar for a social
 * event, a glyph for a system one. It is *not* the sender's avatar and must not be treated as one:
 * there is no channel slug beside it to link to.
 */
const inboxMessageSchema = z.looseObject({
    id,
    message_id: nullableText,
    read: boolish,
    created_at: nullableTimestamp,
    icon: nullableText,
    /**
     * `creator_activity` | `post` | `money` | `system` are the four legacy branches on, and the
     * fifth branch it has is `default:`. Kept an open string for that reason — `INBOX_CATEGORY`
     * below names the four the link rule knows, and anything else takes the default arm.
     */
    category: nullableText,
    content: nullable(
        z.looseObject({
            title: nullableText,
            body: nullableText,
            payload: nullable(inboxPayloadSchema),
        }),
    ),
})

/**
 * A notification, after parsing — with the id resolved and never empty.
 *
 * `id` is a plain `string` rather than `string | null` because a row without one is dropped
 * rather than rendered; see `normalizeInboxMessages`.
 */
export type InboxMessage = z.infer<typeof inboxMessageSchema> & { id: string }

/**
 * The four categories the press rule distinguishes. **Not a closed set** — see the field's note
 * above and `resolveInboxTarget`, which has a default arm for everything else.
 */
export const INBOX_CATEGORY = {
    creatorActivity: 'creator_activity',
    post: 'post',
    money: 'money',
    system: 'system',
} as const

/**
 * `content.payload.type` values the press rule distinguishes **inside** the `money` category.
 *
 * `transaction` is the one that cannot be opened on the web at all: the receipt screen it points
 * at is native-only, and legacy answers it with "Please download app to view transaction detail".
 * `common` carries an ordinary `clickable_url` and behaves like any other row.
 */
export const INBOX_MONEY_TYPE = {
    transaction: 'transaction',
    common: 'common',
    money: 'money',
} as const

/** `mcn_invitation` is a `system` notification whose destination exists only in the app. */
export const INBOX_SYSTEM_TYPE = { mcnInvitation: 'mcn_invitation' } as const

/**
 * One switch on the "Notification you want to see" sheet — `GET v1/inbox-types/`.
 *
 * The service names the state **`turn_on`** on the way out and **`active`** on the way in
 * (`POST v1/inbox-setting/` takes `[{ id, active }]`). That asymmetry is legacy's, verified
 * against both call sites, and it is not something to normalise away here: the two spellings are
 * two different messages, and a schema that renamed the read would hide the fact that the write
 * has to be spelled the other way. `toInboxSettings` is the one place the translation happens.
 *
 * `metadata.title` / `metadata.description` are **server copy in one language** — the same
 * problem the messages themselves have (**B79**). `icon_metadata` is an absolute image URL.
 */
const inboxTypeSchema = z.looseObject({
    id,
    name: nullableText,
    turn_on: boolish,
    icon_metadata: nullableText,
    metadata: nullable(
        z.looseObject({
            title: nullableText,
            description: nullableText,
        }),
    ),
})

/** An inbox type, after parsing — `id` non-empty, for the same reason a message's is. */
export type InboxType = z.infer<typeof inboxTypeSchema> & { id: string }

/** What `POST v1/inbox-setting/` takes: the id, and the state under its *other* name. */
export interface InboxSetting {
    id: string
    active: boolean
}

/**
 * Parse a page of notifications, dropping only what cannot be acted on.
 *
 * Two rows are dropped rather than rendered:
 *
 * - one that fails the schema outright, which after all the `.catch()`es above means it was not
 *   an object at all;
 * - one with **no usable id**, because every control on the row (mark as read, delete) posts that
 *   id and a row whose buttons 400 is worse than a row that is not there.
 *
 * Anything else renders. A notification with no title and no body is *kept* — it is still a dated
 * entry in a list the reader may want to clear — and the row draws what it has.
 */
export function normalizeInboxMessages(input: unknown): InboxMessage[] {
    if (!Array.isArray(input)) return []
    const rows: InboxMessage[] = []
    for (const raw of input) {
        const parsed = inboxMessageSchema.safeParse(raw)
        if (!parsed.success) continue
        // `id` first, `message_id` only as the fallback legacy's row key implies exists.
        const resolved = parsed.data.id || parsed.data.message_id
        if (!resolved) continue
        rows.push({ ...parsed.data, id: resolved })
    }
    return rows
}

/** Parse the inbox-type list. Same two drops, same reasons. */
export function normalizeInboxTypes(input: unknown): InboxType[] {
    if (!Array.isArray(input)) return []
    const rows: InboxType[] = []
    for (const raw of input) {
        const parsed = inboxTypeSchema.safeParse(raw)
        if (!parsed.success || !parsed.data.id) continue
        rows.push({ ...parsed.data, id: parsed.data.id })
    }
    return rows
}

/** The read state as the **write** endpoint spells it. See `inboxTypeSchema`'s note. */
export function toInboxSettings(types: readonly InboxType[]): InboxSetting[] {
    return types.map(type => ({ id: type.id, active: type.turn_on }))
}

/** The row's heading, or `null` when the service sent none. */
export function inboxTitle(message: InboxMessage): string | null {
    return message.content?.title ?? null
}

/** The row's sentence, or `null`. */
export function inboxBody(message: InboxMessage): string | null {
    return message.content?.body ?? null
}
