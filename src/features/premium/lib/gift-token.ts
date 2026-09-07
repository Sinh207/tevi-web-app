import { GIFT_DURATION_DAYS, type GiftPlan } from './gift-plans'

/**
 * The `?gift_token=` round trip — **how a gift that settles on Stripe's page comes back to a
 * screen that can congratulate somebody by name.**
 *
 * ## Why a token exists at all
 *
 * A gift checkout is a **hosted redirect**: the browser leaves for Stripe and returns to
 * `/gift-premium` as a *fresh document*. Every piece of React state that knew who the gift was for
 * is gone, and the URL is the only thing that crossed. There is no "my last gift" endpoint to ask
 * (`docs/BACKEND_QUESTIONS.md`, B99), so legacy encodes the recipient into the success URL it hands
 * the gateway, and this is a port of that mechanism.
 *
 * ## ⚠ It is a **display** value and nothing else. Never authorise, price or grant on it
 *
 * The token is minted by this client, sent to a third party, and handed back by a navigation — so
 * it is exactly as trustworthy as anything else somebody can type into their own address bar. What
 * it can do is make *the person holding the URL* see a name that is not the one they gifted. What
 * it cannot do is move money: the charge already happened at Stripe against a `receiver_user_id`
 * the backend resolved, and nothing on the return path is asked to confirm it. Same posture as
 * `api/client-ip`'s country, and it is written down for the same reason.
 *
 * Three things follow from that, and each one is a rule this file enforces rather than a comment:
 *
 * 1. **No image URL travels in it.** Legacy carries `images.thumb` and hands it straight to an
 *    `<Image>`. In this app that is `next/image`, which *validates the host and throws* on one it
 *    does not know (`next.config.ts`) — so a crafted token would take the screen down in dev and
 *    400 out of the optimizer in production. The success panel draws initials instead.
 * 2. **The handle is pattern-checked**, so the one thing printed with an `@` in front of it cannot
 *    be an arbitrary sentence.
 * 3. **It expires.** Legacy writes a `timestamp` and never reads it, so a bookmarked success URL
 *    shows "Premium Delivered" forever — including to somebody who never bought anything. One day
 *    is generous for a redirect that normally takes a minute.
 *
 * ## The wire shape
 *
 * `btoa(encodeURIComponent(json))`, which is legacy's own encoding and is kept for a reason worth
 * stating: the cutover is big-bang, so a gift can be *started* on the legacy app and *return* to
 * this one. `decodeGiftToken` therefore also reads legacy's `{ channel_info, packages_info }`
 * payload — the one field it cannot recover from it is the duration, which is a server-written
 * English string there and a number here, so such a return shows the recipient and no plan name.
 */

/** One version of the payload this client writes. Bumped only if a field's meaning changes. */
const VERSION = 1

/**
 * How long a returned token is still news, in ms.
 *
 * A gateway round trip is seconds to minutes; a day is the generous end of "the reader got
 * distracted, paid on their phone, came back after lunch". Past it the screen opens on the picker,
 * which is the correct thing to show somebody arriving at `/gift-premium` with a stale bookmark.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Clock skew allowed in the *other* direction.
 *
 * A token minted a few seconds in the future is an ordinary machine whose clock is off, not an
 * attack — and `Date.now()` here and `Date.now()` before the redirect are the same clock anyway, so
 * this only ever matters when the two ends of the trip are different devices (paid on the phone,
 * returned on the desktop). Anything beyond it is discarded rather than shown as a fresh gift.
 */
const MAX_SKEW_MS = 5 * 60 * 1000

/** A handle: what the backend mints, and nothing else. Kept deliberately narrow — see rule 2. */
const SLUG_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/

/** Long enough for any display name the backend allows, short enough not to be a paragraph. */
const MAX_NAME_LENGTH = 64

/** What the success panel is told about the gift that just settled. */
export interface SentGift {
    /** The recipient's handle, without the leading `@`. Always present — it is the identity. */
    slug: string
    /** Their display name, or `null` to fall back to `@slug`. */
    name: string | null
    /** Which package, as a plan — `null` for a legacy token, which carries a name instead. */
    plan: GiftPlan | null
}

/** The payload this client writes. Field names are short because it travels in a URL. */
interface TokenPayload {
    v: number
    s: string
    n?: string
    d?: number
    t: number
}

/**
 * Mint the token for a checkout's success URL.
 *
 * `null` when the recipient has no usable handle, and the caller **must not charge** on a `null`:
 * a gift whose return cannot name anybody would land on a success screen that says "Premium
 * Delivered" to nobody. Legacy returns `null` here too and then goes on to bail out of the
 * checkout, which is the one piece of its error handling on this screen worth keeping verbatim.
 *
 * `days` is passed rather than the plan so the caller does not have to classify the package twice;
 * an unrecognised duration is simply omitted, and the returning screen names no plan.
 */
export function encodeGiftToken({
    slug,
    name,
    days,
}: {
    slug: string
    name?: string | null
    days?: number | null
}): string | null {
    const handle = slug.trim()
    if (!SLUG_PATTERN.test(handle)) return null

    const payload: TokenPayload = { v: VERSION, s: handle, t: Date.now() }
    const trimmedName = name?.trim()
    if (trimmedName) payload.n = trimmedName.slice(0, MAX_NAME_LENGTH)
    if (typeof days === 'number' && Number.isFinite(days) && days > 0) payload.d = Math.trunc(days)

    try {
        // `encodeURIComponent` first, because `btoa` throws on anything outside Latin-1 and a
        // display name is very often outside it. Legacy's encoding, kept — see the file's note.
        return btoa(encodeURIComponent(JSON.stringify(payload)))
    } catch {
        /*
         * Unreachable with the values above, and caught anyway: this runs one line before a charge
         * is created, and an exception here would surface as an unhandled error on the press rather
         * than as "we could not start that". The caller reads `null` as "do not charge".
         */
        return null
    }
}

/**
 * Read a token off the URL — or `null`, which the screen renders as "no gift just settled".
 *
 * Every rejection is silent and lands in the same place: the picker. There is nothing to tell the
 * reader about a malformed token, because the only person who can produce one is the person who
 * edited their own address bar.
 *
 * @param now injected so the expiry is testable without moving the host clock.
 */
export function decodeGiftToken(
    token: string | null | undefined,
    now = Date.now(),
): SentGift | null {
    if (!token) return null

    let parsed: unknown
    try {
        parsed = JSON.parse(decodeURIComponent(atob(repairBase64(token))))
    } catch {
        return null
    }
    if (!parsed || typeof parsed !== 'object') return null

    const modern = readModern(parsed as Record<string, unknown>, now)
    return modern ?? readLegacy(parsed as Record<string, unknown>, now)
}

/**
 * Undo the two ways a base64 token can be damaged **between here and here**.
 *
 * The token is written into `success_url` with `URLSearchParams.set`, which percent-encodes `+` as
 * `%2B`, and read back with `URLSearchParams.get`, which decodes it. That round trip is correct on
 * its own — but the URL passes through a payment gateway in the middle, and a gateway that decodes
 * and re-serialises a redirect target loosely turns `%2B` into a literal `+`, which the next parser
 * reads as a **space**. `atob` then throws and a real settled gift lands on the picker.
 *
 * A space can only have come from that: this encoder emits base64, which contains none. So a space
 * is restored to `+`, and the URL-safe alphabet (`-`/`_`) is accepted for the same reason — it costs
 * one `replace` and removes a class of failure that would only ever show up in production, on
 * somebody's real purchase, with nothing on screen to explain it.
 *
 * The **emitted** alphabet is deliberately left as standard base64: `btoa(encodeURIComponent(json))`
 * is legacy's encoding, and the cutover is big-bang, so a gift started on the legacy app has to come
 * back readable here. Repairing on the way in costs nothing; changing the way out would break that.
 */
function repairBase64(token: string): string {
    return token.replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/')
}

/** This client's own payload. */
function readModern(body: Record<string, unknown>, now: number): SentGift | null {
    if (body.v !== VERSION) return null
    if (!isFresh(body.t, now)) return null

    const slug = typeof body.s === 'string' ? body.s.trim() : ''
    if (!SLUG_PATTERN.test(slug)) return null

    return { slug, name: readName(body.n), plan: planOfDays(body.d) }
}

/**
 * Legacy's `{ channel_info: { name, slug, images }, packages_info: { name }, timestamp }`.
 *
 * `images` is read and **discarded** — see rule 1 in this file's note. `packages_info.name` is a
 * server-written English string ("3 Months"), which cannot be localised and must not be printed
 * beside eight other languages' worth of copy, so the plan comes back `null` and the success
 * sentence simply names the recipient.
 */
function readLegacy(body: Record<string, unknown>, now: number): SentGift | null {
    const channel = body.channel_info
    if (!channel || typeof channel !== 'object') return null
    // Legacy's own timestamp, when it wrote one. An absent `timestamp` is treated as fresh rather
    // than as expired: refusing a token this client did not mint, for a field it did not control,
    // would turn a real settled gift into a picker screen.
    if (body.timestamp !== undefined && !isFresh(body.timestamp, now)) return null

    const raw = (channel as Record<string, unknown>).slug
    const slug = typeof raw === 'string' ? raw.trim() : ''
    if (!SLUG_PATTERN.test(slug)) return null

    return { slug, name: readName((channel as Record<string, unknown>).name), plan: null }
}

/** A display name, capped, or `null`. Never a fallback to the handle — the caller decides that. */
function readName(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim().slice(0, MAX_NAME_LENGTH)
    return trimmed === '' ? null : trimmed
}

/** Inside the window, in both directions. A missing or unparsable stamp is not fresh. */
function isFresh(value: unknown, now: number): boolean {
    const stamp = typeof value === 'number' ? value : Number.NaN
    if (!Number.isFinite(stamp)) return false
    const age = now - stamp
    return age <= MAX_AGE_MS && age >= -MAX_SKEW_MS
}

/** A duration back to the plan it names, or `null` for one this screen has no word for. */
function planOfDays(value: unknown): GiftPlan | null {
    if (typeof value !== 'number') return null
    for (const [plan, days] of Object.entries(GIFT_DURATION_DAYS)) {
        if (days === value) return plan as GiftPlan
    }
    return null
}
