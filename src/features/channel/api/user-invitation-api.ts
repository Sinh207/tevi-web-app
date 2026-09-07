import { env } from '@shared/config/env'
import { ApiError } from '@shared/lib/api/errors'
import { ANON_SCOPE, invalidateETagCache } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import { z } from 'zod'

/**
 * The **manager** invitation — a network asking somebody to join it as staff, and the two answers
 * to it.
 *
 * ## It is not the invitation next door, and none of the four spellings may be normalised
 *
 * Legacy has two invitation screens, on two paths, against two endpoints, reading two different
 * query parameters:
 *
 * | screen | route | query parameter | endpoint |
 * |---|---|---|---|
 * | creator | `/invitation/verify` | `invite_token` | `v1/organization/invitations/{t}/` |
 * | **manager** | `/mcn-user-invitation/verify` | `token` | `v1/organization/user-invitations/{t}/` |
 *
 * Every one of those is baked into mail the backend has already sent, and unanswered invitations
 * are sitting in inboxes right now — so a same-origin cutover has to land each link on its own
 * screen. Redeem a creator's token against this endpoint and the answer is a 404, which this screen
 * renders as *the link has expired*: a live invitation reported dead, with nothing in the console to
 * say why. `invitation-api.ts` is the creator half and carries the same table from its side.
 *
 * ## Why this is a second file rather than a second half of that one
 *
 * The two endpoints are siblings and the temptation is one module. Against it: `invitation-api.ts`
 * is the *creator* contract — its schema carries `mcn_revenue_rate`, its constants carry a
 * **countdown**, and its `mcnInvitationKeys.all` is what its own hook wipes after a token is spent.
 * Sharing a module means sharing that vocabulary with a screen that has no revenue split and no
 * timer, and the first person to reach for the nearest schema gets the wrong one.
 *
 * The cost is the wire transforms below, which are this feature's fourth copy (`types.ts`,
 * `events-api.ts`, `organization-api.ts`, `invitation-api.ts`). That is the established shape here
 * rather than a slip — each domain file states the spellings *its* endpoint sends, and the trap the
 * copies exist for is pinned per file by a test. What must not drift is the `1e11` rule itself, and
 * it is written down in `api/types.ts` where the first copy lives.
 *
 * ## The payload is a **subset** of the creator's, and that is the design
 *
 * Legacy's manager screen reads exactly two things: `organization.name` and `created_at`. There is
 * no revenue rate — a manager is staff, not a party to a split — so nothing here declares one.
 * Declaring it "just in case" would invite a call site to print commercial terms this side of the
 * product does not have, which is the failure `invitationRates` was written to stop on the other
 * screen.
 *
 * ## The token is the whole authorisation, and it is in the URL
 *
 * No id, no body, no way to list invitations: the reader arrives from a mail with
 * `?token=…`, and that token is what the server matches. A bearer still goes with it — the token
 * identifies the *invitation*, the bearer identifies who is accepting it, and legacy gates both
 * calls on `isAuthenticated` before firing.
 *
 * Open contract questions: **B101**.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })

const USER_INVITATIONS_PATH = 'v1/organization/user-invitations'

/**
 * The two answers, as the wire spells them — `?action=accept|reject`, legacy's strings passed
 * straight through.
 *
 * Declared here rather than imported from the creator half. They are the same two words today and
 * they belong to two endpoints: a manager invitation gaining a third answer (`defer`, say) must not
 * silently widen what the creator screen offers, and a union shared between two contracts is a
 * union nobody can change.
 */
export const MCN_USER_INVITATION_ACTIONS = ['accept', 'reject'] as const
export type McnUserInvitationAction = (typeof MCN_USER_INVITATION_ACTIONS)[number]

/**
 * How long a link is good for — **72 hours**, and unlike the creator screen's constant this one is
 * only ever *printed*.
 *
 * Legacy states it as a flat sentence ("For security reasons, this invitation link will expire in 72
 * hours") with no timer, so nothing here computes a deadline and there is no clock that can be
 * wrong by the minute. The number is still the client's own (**B101**): it is handed to the sentence
 * as a value rather than baked into the English, so the copy stays translatable and a corrected
 * window is one constant.
 *
 * The server remains the authority either way — a `POST` after the real deadline is refused
 * whatever this says — so the exposure is a wrong *number*, never a wrong outcome.
 */
export const USER_INVITATION_WINDOW_HOURS = 72

/**
 * A timestamp, as an ISO string or `null`.
 *
 * Epoch **milliseconds** is what this API actually sends for `created_at` elsewhere in this feature
 * (`Channel.created_at`, `mcnLeaveSchema`, the creator invitation) — declaring it as text made
 * `formatJoinedDate` return `''` for every channel that ever existed, silently, until the schema was
 * fixed. So all four spellings are accepted: a number in seconds or milliseconds, a numeric string,
 * or a date string. The `1e11` split is the rule `api/types.ts` writes down — a millisecond epoch
 * below it is 1973, a second epoch above it is the year 5138.
 */
const wireTimestamp = z
    .unknown()
    .transform(value => {
        if (typeof value === 'number') return new Date(value < 1e11 ? value * 1000 : value)
        if (typeof value !== 'string' || !value.trim()) return null
        const numeric = /^\d+$/.test(value.trim())
        const date = new Date(numeric ? Number(value.trim()) : value.trim())
        return Number.isNaN(date.getTime()) ? null : date
    })
    .transform(date => (date && !Number.isNaN(date.getTime()) ? date.toISOString() : null))
    .catch(null)

/** Present, non-blank text, else `null` — `''` is not a name, and the screen substitutes for one. */
const nullableText = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

/**
 * What the screen reads out of a manager invitation, and **nothing is required**.
 *
 * `looseObject`, every field nullable, never throwing. The reason is the same one the creator half
 * states and it is sharper than the usual leniency argument: the two things a reader presses are
 * Accept and Reject, and neither needs a single field of this. A payload that has dropped
 * `organization.name` should still let them answer the invitation; refusing to parse would show them
 * the expired-link wall for a link that is live.
 *
 * There is no OpenAPI document for `v1/organization/*` (`core/schema/` is signature-gated), so the
 * shape is legacy's own field access, read off `containers/mcnUserInvitation` — see **B101**.
 */
export const mcnUserInvitationSchema = z.looseObject({
    /** The network sending it. Its `name` is printed four times on this screen. */
    organization: z
        .looseObject({
            id: z.union([z.string(), z.number()]).transform(String).catch(''),
            name: nullableText,
        })
        .nullish()
        .catch(null)
        .transform(value => value ?? null),
    /** When it was sent — the tinted strip's date and time, and nothing else reads it. */
    created_at: wireTimestamp,
})

export type McnUserInvitation = z.infer<typeof mcnUserInvitationSchema>

function normalize(body: unknown): McnUserInvitation | null {
    if (!body || typeof body !== 'object') return null
    const parsed = mcnUserInvitationSchema.safeParse(body)
    return parsed.success ? parsed.data : null
}

/**
 * Forget the cached invitation body for one token — **after it has been answered**, and only then.
 *
 * The **B72** shape again. `removeQueries` looks sufficient and is not: the query layer forgets the
 * body, but the *ETag* layer does not, and its memory tier is **not opt-in** — every GET that came
 * back with an `ETag` is held for the life of the tab (`interceptors/etag.ts`). So the next read of
 * the same URL sends `If-None-Match`, and if the service's validator has not moved it answers `304`
 * and `apiClient` replays the stored body **as a 200**: a live-looking Accept button for a token the
 * reader has already spent.
 *
 * Only the memory tier can hold this body — the query passes no `cache: { persist: true }`, and must
 * not: the payload names an organization and the role it is offering one person, which on a shared
 * device is B72's own example. The eviction is symmetric anyway.
 *
 * **Await it before the refetch it precedes.** `invalidateETagCache` is async and `invalidateQueries`
 * starts its request synchronously, so evicting afterwards drops a record the request had already
 * read on its way out.
 */
export function forgetUserInvitationCache(token: string, accountId: string | null) {
    return invalidateETagCache(
        accountId ?? ANON_SCOPE,
        `${api.apiBase}/${USER_INVITATIONS_PATH}/${encodeURIComponent(token)}/`,
    )
}

export const mcnUserInvitationKeys = {
    all: ['mcn-user-invitation'] as const,
    /**
     * Keyed on the token **and** the account, under its own root.
     *
     * The token because that is the subject — two links in one inbox are two invitations. The
     * account because whether a link is still redeemable is answered per bearer: switching accounts
     * mid-visit must re-ask rather than show the previous account's answer, and the ETag scope
     * agrees. The separate root is what keeps the creator hook's
     * `removeQueries({ queryKey: mcnInvitationKeys.all })` from also dropping a manager invitation
     * the same reader is holding in another tab — two prefixes, two lifecycles.
     */
    detail: (token: string, accountId: string | null) =>
        [...mcnUserInvitationKeys.all, token, accountId] as const,
}

export const mcnUserInvitationApi = {
    /**
     * The invitation behind a token, or `null` when there is nothing to show.
     *
     * **404 and 410 are data, not errors** — the same rule `getMyChannel` and `getLeave` follow, and
     * the common case here rather than an edge: a link that has expired, been answered already, or
     * been retyped wrong is what this screen's wall exists for. `410 Gone` is included because it is
     * the status a "this token was already spent" answer would most plausibly carry, and reading it
     * as an outage would offer a Retry button that can only fail (**B101**).
     *
     * Everything else **rethrows**, deliberately. Legacy's `catch` swallows every failure into
     * `setUserInvitation(null)`, so a 500 tells somebody holding a live link that it has expired — a
     * statement about their invitation rather than about the app's ignorance — and there is no retry,
     * because nothing knows a request failed.
     */
    async getInvitation(
        token: string,
        accountId: string | null,
    ): Promise<McnUserInvitation | null> {
        try {
            return normalize(
                await api.get(
                    `${USER_INVITATIONS_PATH}/${encodeURIComponent(token)}/`,
                    undefined,
                    accountId ? { accountId } : undefined,
                ),
            )
        } catch (error) {
            if (error instanceof ApiError && (error.status === 404 || error.status === 410)) {
                return null
            }
            throw error
        }
    },

    /**
     * Answer it — `POST …/{token}/` with `{ "action": "accept" | "reject" }` as the **body**.
     *
     * ⚠ **This shipped as a query parameter first, and the reasoning for that was wrong.** Legacy
     * calls `ApiModel.post(path, {}, { action })`, and its signature is
     * `post(uri, params, data, headers)` — arg 3 is the **query string**, arg 4 is the **body**
     * (`api.js`'s `request()` maps them straight onto axios's `params` and `data`). So the `{}` is an
     * empty query and `{ action }` is the payload. Read left-to-right as `post(url, body, config)` —
     * which is what `createApiModel` and axios use — it inverts.
     *
     * The backend answers the inverted version with
     * `{"errors":[{"input":"action","code":"required"}],"message":"This field is required."}`: a
     * field-shaped rejection naming the field that *was* sent, just in the wrong half of the request.
     * `createApiModel`'s `post(path, body, config)` is the axios order, so the body is arg 2 here.
     *
     * Resolves on success and rejects with an `ApiError` otherwise — nothing in the body is read,
     * because the only thing the caller does next is navigate away.
     *
     * **No `retry: true`.** The axios layer replays non-idempotent methods only when asked, and this
     * must not be one: a 502 can arrive *after* the write landed, and a replayed `accept` against a
     * spent token 4xxs — which would report a failure for a management role that was in fact
     * granted.
     */
    async confirmInvitation(
        token: string,
        action: McnUserInvitationAction,
        accountId: string | null,
    ): Promise<void> {
        // `action` is the **body**, and the docstring above says why that is not obvious.
        await api.post(
            `${USER_INVITATIONS_PATH}/${encodeURIComponent(token)}/`,
            { action },
            accountId ? { accountId } : undefined,
        )
    },
}
