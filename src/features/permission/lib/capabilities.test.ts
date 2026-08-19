import { describe, expect, it } from 'vitest'
import { normalizeChannelPermission } from '../api/types'
import { allows, capabilityState, rawGrant } from './capabilities'

/**
 * The two rules this feature exists to state exactly once, and one ordering that encodes a legacy bug:
 *
 * - **gates fail closed** — no grants, no access;
 * - **a failure is not a denial** — the same all-false payload means "ordinary creator" *and*
 *   "the request 502'd", so the four-state answer must separate them;
 * - **loading outranks error outranks the grant check.** Get that order wrong and every network blip
 *   becomes a permanent "Access denied", which is precisely what `containers/starTransfer` does.
 */

const agency = normalizeChannelPermission({
    transfer_star: { allowed: true },
    fiat_agency: { is_active: true, name: 'A', payout_method: [] },
})
const creator = normalizeChannelPermission({})

describe('allows', () => {
    it('reads each capability from its own grant', () => {
        expect(allows(agency, 'star-transfer')).toBe(true)
        expect(allows(agency, 'payout-agency')).toBe(true)
        expect(allows(creator, 'star-transfer')).toBe(false)
        expect(allows(creator, 'payout-agency')).toBe(false)
    })

    /*
     * The direction is the point: hiding a feature from somebody who has it produces a support ticket,
     * while showing a money-moving surface to somebody who does not produces requests the backend
     * refuses and a failure they cannot explain.
     */
    it('fails closed when the grants are unknown', () => {
        expect(allows(null, 'star-transfer')).toBe(false)
        expect(allows(null, 'payout-agency')).toBe(false)
    })

    it('gates each capability independently', () => {
        const transferOnly = normalizeChannelPermission({ transfer_star: { allowed: true } })
        expect(allows(transferOnly, 'star-transfer')).toBe(true)
        expect(allows(transferOnly, 'payout-agency')).toBe(false)
    })
})

describe('rawGrant', () => {
    it('reads an unnamed grant by feature and flag', () => {
        const p = normalizeChannelPermission({
            new_thing: { allowed: true },
            other_thing: { is_active: true },
        })
        expect(rawGrant(p, 'new_thing')).toBe(true)
        expect(rawGrant(p, 'other_thing', 'is_active')).toBe(true)
        // Right feature, wrong flag: no.
        expect(rawGrant(p, 'other_thing')).toBe(false)
        expect(rawGrant(p, 'missing')).toBe(false)
    })

    it('is as strict about yes as the schema is', () => {
        const p = normalizeChannelPermission({ new_thing: { allowed: 'false' } })
        expect(rawGrant(p, 'new_thing')).toBe(false)
    })
})

describe('capabilityState', () => {
    const base = { capability: 'payout-agency', isAuthenticated: true } as const

    it('is allowed or denied once the grants are known', () => {
        expect(
            capabilityState({ ...base, permission: agency, isLoading: false, isError: false }),
        ).toBe('allowed')
        expect(
            capabilityState({ ...base, permission: creator, isLoading: false, isError: false }),
        ).toBe('denied')
    })

    it('is loading before an answer, whatever else is true', () => {
        expect(
            capabilityState({ ...base, permission: null, isLoading: true, isError: false }),
        ).toBe('loading')
        // A refetch after a failure is a loading state — a retry button over an in-flight request is a
        // no-op.
        expect(
            capabilityState({ ...base, permission: agency, isLoading: true, isError: true }),
        ).toBe('loading')
    })

    /*
     * The bug this type exists for. Legacy asks "is it allowed" first, so an agency whose request hit a
     * 502 is told they do not have access to a feature they do have access to — with no retry, because
     * the screen believes the answer.
     */
    /*
     * The other half of the ordering: an answer in hand outranks a failed refetch. A screen the reader
     * is already using must not collapse into a retry panel because a background revalidation blipped —
     * grants change monthly, so the cached answer is almost certainly still true.
     */
    it('keeps answering from the grants it holds when a refetch fails', () => {
        expect(
            capabilityState({ ...base, permission: agency, isLoading: false, isError: true }),
        ).toBe('allowed')
        expect(
            capabilityState({ ...base, permission: creator, isLoading: false, isError: true }),
        ).toBe('denied')
    })

    it('is an error, not a denial, when the request failed', () => {
        expect(
            capabilityState({ ...base, permission: null, isLoading: false, isError: true }),
        ).toBe('error')
    })

    /*
     * No answer, no error, and not reported as loading either — the request has not settled. A caller
     * whose `isLoading` lags by a render (the tick after `enabled` flips true, before TanStack marks the
     * query as fetching) must show a skeleton for that frame, not flash a retry panel at somebody whose
     * grants are on their way. This is why `isError` is a parameter rather than inferred from a null
     * `permission`.
     */
    it('is loading, not an error, when nothing has settled yet', () => {
        expect(
            capabilityState({ ...base, permission: null, isLoading: false, isError: false }),
        ).toBe('loading')
    })

    /*
     * A guest is denied rather than errored: nothing was requested for them, so there is nothing to
     * retry — what they are missing is a session, and a screen shows that with a sign-in prompt.
     */
    it('is a denial for a guest, with no retry offered', () => {
        expect(
            capabilityState({
                ...base,
                isAuthenticated: false,
                permission: null,
                isLoading: false,
                isError: false,
            }),
        ).toBe('denied')
    })

    /* Bootstrapping is folded into `isLoading` by the provider, and it outranks the guest branch. */
    it('is loading while the session bootstraps, not denied', () => {
        expect(
            capabilityState({
                ...base,
                isAuthenticated: false,
                permission: null,
                isLoading: true,
                isError: false,
            }),
        ).toBe('loading')
    })
})
