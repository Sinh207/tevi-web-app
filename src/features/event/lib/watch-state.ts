import { isPlatformRestricted, type LiveAccess, liveAccess } from '../access'
import type { EventDetail } from '../api/types'
import { isLive, isOffAir, isUpcoming } from './event-status'

/**
 * **What this reader can do about this stream, right now** — one decision, in one place.
 *
 * The event page is a details card plus one panel, and this union is what that panel renders. It
 * exists as a pure function because the alternative is what legacy has: eight booleans
 * (`isEnded`, `isGeoRestricted`, `isRestrictedPlatform`, `isAgeRestriction`, `isKickout`,
 * `isLocked`, `isExclusive`, `isAuthenticated`) read in a chain of early returns inside a component,
 * where the *order* is the behaviour and nothing states it.
 *
 * ## The order, and why each step is where it is
 *
 * 1. **`off-air`** — a stream that has stopped. First, because every refusal below it is about
 *    *playing* something, and there is nothing to play. Legacy checks `isEnded` first for the same
 *    reason; telling somebody a finished broadcast is unavailable on their platform is a non-answer.
 * 2. **`platform-restricted`** — `restricted_platforms` names the website. An absolute refusal, so
 *    it outranks both the schedule and the paywall: offering to sell access to something this client
 *    may not play would be taking money for nothing.
 * 3. **`upcoming`** — published or preparing. Above the paywall deliberately: legacy's own confirm
 *    handler refetches the event and **only proceeds when the status is `LIVE`**, so unlocking is
 *    already an on-air-only action there. It does that silently (the dialog closes and nothing
 *    happens, which is the bug); here it is simply not offered.
 * 4. **`locked`** — gated, and this reader is outside it. See `isLockedOut`.
 * 5. **`watchable`** — on air and this reader is in.
 *
 * ## What is deliberately **not** in this union
 *
 * `geo-restricted`, `kicked-out` and `banned`. All three are real states in legacy and none of them
 * is knowable here: geo comes back as code `E003` from the **preview** endpoint
 * (`v1/streaming-events/{code}/preview/`), and kickout and ban arrive as socket frames inside the
 * live session. This client calls neither, so a branch for them would be a screen nothing can raise
 * — which `CLAUDE.md` forbids for events and is the same argument. They land with the player;
 * `docs/EVENT.md` §3 holds the list.
 *
 * The **age gate** is also absent, and that one is not a gap: it is a wall over the whole page
 * rather than a state of the watch panel, because the banner and the description are the material
 * being gated. `EventScreen` raises it before this function is consulted.
 */
export type WatchState =
    /** Stopped. `status` is carried because "paused" and "cancelled" are not the same sentence. */
    | { kind: 'off-air'; status: 'ENDED' | 'CANCELLED' | 'PAUSED' }
    /** The website may not play this stream, whatever else is true of it. */
    | { kind: 'platform-restricted' }
    /** Not started yet. */
    | { kind: 'upcoming' }
    /**
     * Gated, and this reader is outside.
     *
     * `access` is the same descriptor the banner badge uses, so the panel's headline and the badge
     * over the art cannot disagree about which routes in exist. `canUnlock` is separate because a
     * price the reader can see is not the same thing as a purchase this client can make — see below.
     */
    | { kind: 'locked'; access: LiveAccess; requiresMembership: boolean; canUnlock: boolean }
    /** On air, and nothing is in the way. */
    | { kind: 'watchable' }
    /**
     * The payload's status was absent or a value this client does not know.
     *
     * Rendered as the app hand-off with **no claim about time** — not as "coming soon", which would
     * be a guess, and not as an error, because every other field on the page is fine. A status this
     * client has never seen is the backend adding one, and the honest response is to stop describing
     * the schedule rather than to describe it wrongly.
     */
    | { kind: 'unknown' }

/**
 * Is this reader **outside** the gate?
 *
 * ```
 * purchased                     → in.  They bought it.
 * required_packages non-empty   → the backend's `need_unlock_package` decides. It is the only
 *                                 party that knows which tiers this account holds.
 * otherwise                     → priced above zero and unbought ⇒ out.
 * ```
 *
 * ## Why this is not `liveAccess(event) !== null`
 *
 * `liveAccess` answers *"should this reader be invited to unlock?"*, and it deliberately keeps
 * saying **"Members only"** to somebody who already holds the membership — the badge over the art
 * describes the stream, and that stays true for every viewer. Reading it as lockedness would put a
 * paywall in front of a paying member. Its own doc records the card where exactly that happened.
 *
 * ## `need_unlock_package` is trusted for memberships and ignored for prices
 *
 * The field is named after packages and that is what it answers. For a priced-only stream the
 * question is simply whether this reader has bought it, and `purchased` is the field for that —
 * taking `need_unlock_package: false` as "in" there would open a paid stream to anyone whose payload
 * happens to omit the flag, which is the fail-**open** direction. Gates fail closed.
 */
export function isLockedOut(event: EventDetail): boolean {
    if (event.purchased) return false
    if (event.required_packages.length > 0) return event.need_unlock_package
    const price = event.price === null ? null : Number(event.price)
    return price !== null && Number.isFinite(price) && price > 0
}

/**
 * Can this client actually complete a Star purchase for this event?
 *
 * Both halves are required and each one has failed on a real payload:
 *
 * - **`product_id`** is what `POST billy/v1/ecom/purchase/` is given. Without it there is no request
 *   to make. Legacy renders the button anyway and posts `{ product_id: undefined }`.
 * - **a price above zero**, because a button reading *Purchase access only 0* is what legacy's
 *   missing-price payload produces (see `liveAccess`'s note on that bug).
 *
 * Fails **closed**: no product, no button, and the reader is shown the membership route or the app
 * hand-off instead of a control that cannot finish.
 */
export function canUnlockWithStars(event: EventDetail): boolean {
    if (!event.product_id) return false
    const price = event.price === null ? null : Number(event.price)
    return price !== null && Number.isFinite(price) && price > 0
}

export function watchState(event: EventDetail): WatchState {
    if (isOffAir(event.status)) {
        return { kind: 'off-air', status: event.status as 'ENDED' | 'CANCELLED' | 'PAUSED' }
    }
    if (isPlatformRestricted(event)) return { kind: 'platform-restricted' }
    if (isUpcoming(event.status)) return { kind: 'upcoming' }
    if (!isLive(event.status)) return { kind: 'unknown' }

    if (isLockedOut(event)) {
        /*
         * `liveAccess` cannot be null on this branch — `isLockedOut` was true, so the stream is
         * either priced or members-only and the reader is neither purchased nor a member. The
         * fallback is not dead code so much as a refusal to render a paywall with no label: if the
         * two ever disagree, "Members only" is the statement that is true of any gated stream.
         */
        const access: LiveAccess = liveAccess(event) ?? {
            key: 'channel_live_members_only',
            price: null,
        }
        return {
            kind: 'locked',
            access,
            requiresMembership: event.required_packages.length > 0,
            canUnlock: canUnlockWithStars(event),
        }
    }

    return { kind: 'watchable' }
}
