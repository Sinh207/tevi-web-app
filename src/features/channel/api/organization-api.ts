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
