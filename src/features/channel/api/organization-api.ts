import { env } from '@shared/config/env'
import { ApiError } from '@shared/lib/api/errors'
import { createApiModel } from '@shared/lib/api/model'
import { z } from 'zod'

/**
 * Leaving an MCN — three calls on one URL.
 *
 * ## Why this is its own file and not part of `channel-api.ts`
 *
 * `v3/organization/*` is the **organization service**, not the channel service; the two only share a
 * gateway. Legacy keeps them apart too (`@models/organization`). The one thing here that touches a
 * channel is the MCN card, which is the exception rather than the reason to merge them: when the
 * rest of the organization surface lands — invitations, member management — it belongs beside this,
 * not inside the channel model.
 *
 * ## One URL, three verbs, and that is the whole state machine
 *
 * `GET` asks whether a departure is already scheduled, `POST` schedules one, `DELETE` calls it off.
 * There is no id and no body: the account is the subject, so the server already knows who is
 * leaving what.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })

/** Present, non-blank text, else `null` — `''` is not a URL, a slug or a name. */
const nullableSpaceText = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

const LEAVE_PATH = 'v3/organization/leave/'

export const organizationKeys = {
    all: ['organization'] as const,
    /**
     * Account-scoped, like every other key in this feature. A pending departure belongs to one
     * account, and switching accounts must not show the other's countdown.
     */
    leave: (accountId: string | null) => [...organizationKeys.all, 'leave', accountId] as const,
}

/**
 * When a departure is scheduled. `expected_departure_at` is the end of the cancellation window —
 * legacy renders it as `h:mm a - MMM d, yyyy` beside a "Cancel" action.
 *
 * Parsed per-field and never throwing, for the reason the channel schema gives: a banner that
 * cannot render its date should still tell the creator they are leaving.
 */
export const mcnLeaveSchema = z.looseObject({
    expected_departure_at: z
        .unknown()
        .transform(value => {
            if (typeof value === 'number') return new Date(value < 1e11 ? value * 1000 : value)
            if (typeof value !== 'string' || !value.trim()) return null
            const numeric = /^\d+$/.test(value.trim())
            const date = new Date(numeric ? Number(value.trim()) : value.trim())
            return Number.isNaN(date.getTime()) ? null : date
        })
        .transform(date => (date && !Number.isNaN(date.getTime()) ? date.toISOString() : null))
        .catch(null),
})

export type McnLeave = z.infer<typeof mcnLeaveSchema>

function normalizeLeave(body: unknown): McnLeave | null {
    if (!body || typeof body !== 'object') return null
    const parsed = mcnLeaveSchema.safeParse(body)
    return parsed.success ? parsed.data : null
}

export const organizationApi = {
    /**
     * `null` means "no departure scheduled", which is the ordinary state — so a 404 is **data, not
     * an error**, exactly as `getMyChannel` treats its own 404. Anything else rethrows: a 500 here
     * must not read as "you are not leaving", because the card would then offer to schedule a
     * second departure.
     */
    async getLeave(accountId: string | null): Promise<McnLeave | null> {
        try {
            return normalizeLeave(
                await api.get(LEAVE_PATH, undefined, accountId ? { accountId } : undefined),
            )
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) return null
            throw error
        }
    },

    /** Schedules the departure and returns the window it opened. */
    async confirmLeave(accountId: string | null): Promise<McnLeave | null> {
        return normalizeLeave(
            await api.post(LEAVE_PATH, undefined, accountId ? { accountId } : undefined),
        )
    },

    /** Calls it off. Answers `204`, so there is nothing to normalise. */
    async cancelLeave(accountId: string | null): Promise<void> {
        await api.del(LEAVE_PATH, undefined, accountId ? { accountId } : undefined)
    },
}

/**
 * ---------------------------------------------------------------------------------------------
 * The network's own profile — a **different service** on the same gateway
 * ---------------------------------------------------------------------------------------------
 *
 * `my-channel/`'s `mcn` block carries the commercial terms (name, the two rates, `joined_at`) and
 * nothing a reader could look at: no logo, no slug, no way to write to the network. Those live on
 * the *organization* record, behind `${W_API}/business`, which is where legacy fetches them for the
 * `/mcn-partnership` screen (`@models/businessOrganization`).
 *
 * Its own model rather than a second path on `api` above, because `/business` is a different base:
 * `createApiModel` takes one, and pretending otherwise by writing `../business/…` into a path would
 * be a URL that happens to resolve rather than a service this client knows it is calling. Both
 * origins are `W_API`, so both get the bearer, the device id and the `?verify=` signature —
 * `origins.ts` matches the origin, and `/business` is a path on it.
 */
const businessApi = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/business` })

/**
 * What the screen actually uses out of that record, and **nothing is required**.
 *
 * `looseObject` with every field nullable, so a body that has dropped a key still parses: this call
 * is decoration on a screen whose substance came from `my-channel/`, and a network with no logo must
 * not take the revenue split off screen. The shape is legacy's own mapping, field for field
 * (`mcnPartnership/hook`) — it is the only description of this endpoint that exists, there being no
 * OpenAPI document under `/business` (checked: `schema/` 404s).
 *
 * ⚠ `message_url` is the **contact** address, not a website. Legacy maps it to `contact_url` and
 * falls back to `website`, a field it never populates from this endpoint — so the fallback is dead
 * code there and is not reproduced here. **B98** asks what `message_url` actually points at (a Tevi
 * thread? an arbitrary URL?), which decides whether the link may stay `target="_blank"`.
 */
export const mcnSpaceSchema = z.looseObject({
    id: z.union([z.string(), z.number()]).transform(String).catch(''),
    /** The network's channel slug — `/@{slug}`, which is where the card's press goes. */
    slug: nullableSpaceText,
    description: nullableSpaceText,
    images: z
        .looseObject({ thumb: nullableSpaceText, cover: nullableSpaceText })
        .catch({ thumb: null, cover: null }),
    /** Where "Contact <name>" sends the reader. Absent for a network that has published none. */
    message_url: nullableSpaceText,
    verified_tick_badge: z
        .looseObject({ image: nullableSpaceText })
        .nullish()
        .catch(null)
        .transform(value => value ?? null),
})

export type McnSpace = z.infer<typeof mcnSpaceSchema>

export const mcnSpaceKeys = {
    all: ['mcn-space'] as const,
    /**
     * Keyed by the **organization id only** — not by account. This is a public-facing record about
     * a company, identical for everyone who can see it, so two accounts in the same network share
     * one cache entry. `organizationKeys.leave` is account-scoped for the opposite reason: a
     * pending departure is one account's.
     */
    detail: (id: string) => [...mcnSpaceKeys.all, id] as const,
}

/**
 * The network's profile, or `null` when there is nothing to show.
 *
 * **A 404 is data, not an error** — the same rule `getMyChannel` and `getLeave` follow: an
 * organization record that is gone (or an id this account may not read) is an ordinary answer, and
 * the card renders with initials and no contact link.
 *
 * Everything else **rethrows**, and that is a deliberate correction of the first version of this
 * function, which swallowed every failure into `null`. Swallowing looked safe — the screen's
 * substance comes from `my-channel/`, so this query's state is never the page's state — and it cost
 * two things that are not worth a line of code: TanStack Query cannot retry an error it is never
 * shown, so a 500 froze the logo and the contact link out for the full `staleTime` even after the
 * service came back; and a failure invisible in the devtools is a failure nobody debugs.
 *
 * The screen is unaffected either way. `useMcnPartnership` reads `query.data`, which is `undefined`
 * on an error — its "not known" state, which renders exactly as `null` does.
 */
export const mcnSpaceApi = {
    async getSpace(id: string, accountId: string | null): Promise<McnSpace | null> {
        try {
            const body = await businessApi.get(
                `v1/organization/media-space/${encodeURIComponent(id)}/`,
                undefined,
                accountId ? { accountId } : undefined,
            )
            if (!body || typeof body !== 'object') return null
            const parsed = mcnSpaceSchema.safeParse(body)
            return parsed.success ? parsed.data : null
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) return null
            throw error
        }
    },
}
