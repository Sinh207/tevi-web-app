import { env } from '@shared/config/env'
import { ApiError } from '@shared/lib/api/errors'
import { ANON_SCOPE, invalidateETagCache } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import { z } from 'zod'

/**
 * Joining an MCN — the invitation a network sends a creator, and the two answers to it.
 *
 * ## Why this is beside `organization-api.ts` rather than inside it
 *
 * That file's own docstring says where this goes: *"when the rest of the organization surface lands
 * — invitations, member management — it belongs beside this, not inside the channel model."* Same
 * service (`${W_API}/core`, `v1/organization/*`), different lifecycle: `leave/` is about an
 * agreement that already exists and is keyed on nothing but the account, this is about one that does
 * not yet exist and is keyed on a **token from an email**.
 *
 * ## The token is the whole authorisation, and it is in the URL
 *
 * There is no id, no body and no way to list invitations: the creator arrives at
 * `/invitation/verify?invite_token=…` from a mail the network sent, and that token is what the
 * server matches against. So a mistyped or replayed token is a 404, which is why `getInvitation`
 * treats one as **data** rather than an error — an expired link is the ordinary failure here, not an
 * outage, and the screen has a wall for it.
 *
 * A bearer still goes with it (`accountId`), and legacy gates both calls on `isAuthenticated` before
 * firing. The token identifies the *invitation*; the bearer identifies who is accepting it.
 *
 * ## The action is a **body field**, not a query parameter
 *
 * `POST v1/organization/invitations/{token}/` with `{ "action": "accept" | "reject" }`.
 *
 * ⚠ **This shipped backwards once, so the argument order is worth stating.** Legacy calls
 * `ApiModel.post(path, {}, { action })` and its signature is
 * `post(uri, params, data, headers)` — arg 3 is the **query string**, arg 4 is the **body**
 * (`api.js`'s `request()` maps them straight onto axios's `params` and `data`). So the `{}` is an
 * empty query and `{ action }` is the payload. Read left-to-right as `post(url, body, config)` — the
 * shape `createApiModel` and axios both use — it inverts, and the request goes out as
 * `?action=accept` with no body at all.
 *
 * That failure is **not** subtle at the network but is invisible in review: the backend answers
 * `{"errors":[{"input":"action","code":"required"}],"message":"This field is required."}`, i.e. a
 * field-shaped rejection naming the field that *was* sent — just in the wrong half of the request.
 * `createApiModel`'s own `post(path, body, config)` is the axios order, so the body is arg 2 here.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })

const INVITATIONS_PATH = 'v1/organization/invitations'

/** The two answers, as the wire spells them. Legacy passes these strings straight through. */
export const MCN_INVITATION_ACTIONS = ['accept', 'reject'] as const
export type McnInvitationAction = (typeof MCN_INVITATION_ACTIONS)[number]

/**
 * How long a link is good for — **72 hours**, and it is the client's own number.
 *
 * The payload carries `created_at` and no expiry, so legacy computes the deadline as
 * `created_at + 72h` and prints the remainder on the Agree button. Nothing on the wire confirms it,
 * which is **B100**: if the backend's window is not 72 hours, this screen counts down to the wrong
 * moment and a creator watches a live timer lie to them. The server is still the authority — a
 * `POST` after the real deadline is refused whatever this constant says — so the risk is a wrong
 * *number*, never a wrong outcome.
 */
export const INVITATION_WINDOW_MS = 72 * 60 * 60 * 1000

/**
 * A timestamp, as an ISO string or `null`.
 *
 * Epoch **milliseconds** is what this API actually sends for `created_at` elsewhere in this feature
 * (`Channel.created_at`, and `mcnLeaveSchema` carries the same transform) — declaring it as text
 * made `formatJoinedDate` return `''` for every channel that ever existed, silently, until the
 * schema was fixed. So all four spellings are accepted: a number in seconds or milliseconds, a
 * numeric string, or a date string.
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

/** Present, non-blank text, else `null` — `''` is not a name. */
const nullableText = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

/**
 * A percentage the screen prints as a figure, or `null` when it cannot be read.
 *
 * `mcn_revenue_rate` arrives as a **string** in legacy (`parseFloat(userInvitation?.mcn_revenue_rate)`),
 * so both spellings are accepted. `null` rather than `0` for an unreadable value, and that is the
 * load-bearing part: legacy's `parseFloat(undefined) || 0` renders **"Creator Rate 100% / MCN Rate
 * 0%"** for a payload whose rate is missing — a made-up commercial term, shown as fact, on the
 * screen where somebody agrees to it. Out-of-range values are rejected for the same reason: a rate
 * of 140 would print a creator share of −40%.
 */
const wireRate = z
    .unknown()
    .transform(value => {
        const parsed = typeof value === 'string' ? Number.parseFloat(value) : value
        if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return null
        return parsed < 0 || parsed > 100 ? null : parsed
    })
    .catch(null)

/**
 * What the screen reads out of an invitation, and **nothing is required**.
 *
 * `looseObject`, every field nullable, never throwing — the rule this feature's other schemas
 * follow. The reason is sharper here than usual: the two things a creator presses are Agree and
 * Reject, and neither needs a single field of this to work. A payload that has dropped
 * `organization.name` should still let them answer the invitation; refusing to parse would show
 * them the expired-link wall for a link that is live.
 *
 * There is no OpenAPI document for `v1/organization/*` (`core/schema/` is signature-gated), so this
 * shape is legacy's own field access, read off `containers/invitation` — see **B100** for what is
 * still guessed.
 */
export const mcnInvitationSchema = z.looseObject({
    /** The network sending it. Its `name` is printed six times on this screen. */
    organization: z
        .looseObject({
            id: z.union([z.string(), z.number()]).transform(String).catch(''),
            name: nullableText,
        })
        .nullish()
        .catch(null)
        .transform(value => value ?? null),
    /** When it was sent — the "From" strip's date, and where the 72-hour window is measured from. */
    created_at: wireTimestamp,
    /** The network's cut, 0–100. The creator's is the remainder; see `invitationRates`. */
    mcn_revenue_rate: wireRate,
})

export type McnInvitation = z.infer<typeof mcnInvitationSchema>

function normalize(body: unknown): McnInvitation | null {
    if (!body || typeof body !== 'object') return null
    const parsed = mcnInvitationSchema.safeParse(body)
    return parsed.success ? parsed.data : null
}

/**
 * Forget the cached invitation body for one token — **after it has been answered**, and only then.
 *
 * The **B72** shape, on a fourth endpoint. `removeQueries` looked sufficient and is not: the query
 * layer forgets the body, but the *ETag* layer does not, and its memory tier is **not opt-in** — every
 * GET that came back with an `ETag` is held for the life of the tab (`interceptors/etag.ts`). So the
 * next read of the same URL sends `If-None-Match`, and if the service's validator has not moved it
 * answers `304` and `apiClient` replays the stored body **as a 200**. The reader is then looking at a
 * live-looking Agree button for a token they have already spent.
 *
 * Whether the validator moves after a redemption is the service's business and not something this
 * client can see, which is exactly why it is guarded rather than reasoned about: the same assumption
 * was made on `my-channel/`, `premium-info/` and `my-subscriptions/` and was wrong on all three.
 *
 * Only the memory tier can hold this body — the query passes no `cache: { persist: true }`, and it
 * must not (the payload names an organization and the terms it is offering one person; on a shared
 * device that is B72's own example). The eviction is symmetric anyway.
 *
 * **Await it before the refetch it precedes.** `invalidateETagCache` is async and
 * `invalidateQueries` starts its request synchronously, so evicting afterwards drops a record the
 * request had already read on its way out.
 */
export function forgetInvitationCache(token: string, accountId: string | null) {
    return invalidateETagCache(
        accountId ?? ANON_SCOPE,
        `${api.apiBase}/${INVITATIONS_PATH}/${encodeURIComponent(token)}/`,
    )
}

export const mcnInvitationKeys = {
    all: ['mcn-invitation'] as const,
    /**
     * Keyed on the **token and the account**, both.
     *
     * The token because that is the subject — two links in one inbox are two invitations. The
     * account because whether a link is still redeemable is answered per bearer: switching accounts
     * mid-visit must re-ask rather than show the previous account's answer, and the ETag cache is
     * scoped the same way for the same reason.
     */
    detail: (token: string, accountId: string | null) =>
        [...mcnInvitationKeys.all, token, accountId] as const,
}

export const mcnInvitationApi = {
    /**
     * The invitation behind a token, or `null` when there is nothing to show.
     *
     * **404 and 410 are data, not errors** — the same rule `getMyChannel` and `getLeave` follow, and
     * the common case here rather than an edge: a link that has expired, been answered already, or
     * been retyped wrong is what this screen's wall exists for. `410 Gone` is included because it is
     * the status a "this token was already spent" answer would most plausibly carry, and reading it
     * as an outage would offer a Retry button that can only fail (**B100**).
     *
     * Everything else **rethrows**, deliberately. Legacy's `catch` swallows every failure into
     * `setUserInvitation(null)`, so a 500 tells a creator with a valid link that it has expired —
     * a statement about their invitation rather than about the app's ignorance — and there is no
     * retry, because nothing knows a request failed.
     */
    async getInvitation(token: string, accountId: string | null): Promise<McnInvitation | null> {
        try {
            return normalize(
                await api.get(
                    `${INVITATIONS_PATH}/${encodeURIComponent(token)}/`,
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
     * Answer it. Resolves on success and rejects with an `ApiError` otherwise — nothing in the body
     * is read, because the only thing the caller does next is navigate away.
     *
     * **No `retry: true`.** The axios layer replays non-idempotent methods only when asked, and this
     * must not be one: a 502 can arrive *after* the write landed, and a replayed `accept` against a
     * spent token 4xxs — which would report a failure for a partnership that was in fact created.
     */
    async confirmInvitation(
        token: string,
        action: McnInvitationAction,
        accountId: string | null,
    ): Promise<void> {
        // `action` is the **body**, and the docstring above says why that is not obvious.
        await api.post(
            `${INVITATIONS_PATH}/${encodeURIComponent(token)}/`,
            { action },
            accountId ? { accountId } : undefined,
        )
    },
}
