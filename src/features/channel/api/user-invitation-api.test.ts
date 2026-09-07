import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The model is mocked the way `channel-api.test.ts` does it, so the **call shape** can be asserted
 * without a network — which is what the last describe below needs: `action` shipped as a query
 * parameter instead of a body, and nothing above the axios call could see it.
 */
const get = vi.fn()
const post = vi.fn()

vi.mock('@shared/lib/api/model', () => ({
    createApiModel: () => ({ get, post, del: vi.fn(), put: vi.fn(), patch: vi.fn(), apiBase: '' }),
}))

const {
    mcnUserInvitationApi,
    mcnUserInvitationKeys,
    mcnUserInvitationSchema,
    USER_INVITATION_WINDOW_HOURS,
} = await import('./user-invitation-api')

/**
 * The schema is `looseObject` with nothing required, and each of these cases is a payload shape the
 * screen has to survive rather than a hypothetical: the two things a reader presses are Accept and
 * Reject, and neither needs a single one of these fields. A schema that threw would show them the
 * expired-link wall for a link that is live.
 */
const parse = (body: unknown) => mcnUserInvitationSchema.parse(body)

describe('mcnUserInvitationSchema', () => {
    it('reads the shape legacy reads', () => {
        expect(
            parse({
                organization: { id: 42, name: 'Acme Network' },
                created_at: '2026-09-01T10:30:00Z',
            }),
        ).toMatchObject({
            organization: { id: '42', name: 'Acme Network' },
            created_at: '2026-09-01T10:30:00.000Z',
        })
    })

    /**
     * Epoch milliseconds is what this API actually sends for `created_at` elsewhere in this feature,
     * and declaring it as text is what made `formatJoinedDate` return `''` for every channel that
     * ever existed — silently. All four spellings are pinned here so that cannot recur in this copy
     * of the transform.
     */
    it('reads a timestamp in all four spellings the API uses', () => {
        const ms = Date.UTC(2026, 8, 1, 10, 30)
        expect(parse({ created_at: ms }).created_at).toBe('2026-09-01T10:30:00.000Z')
        expect(parse({ created_at: String(ms) }).created_at).toBe('2026-09-01T10:30:00.000Z')
        expect(parse({ created_at: Math.floor(ms / 1000) }).created_at).toBe(
            '2026-09-01T10:30:00.000Z',
        )
        expect(parse({ created_at: '2026-09-01T10:30:00Z' }).created_at).toBe(
            '2026-09-01T10:30:00.000Z',
        )
    })

    /**
     * `null`, never the words "Invalid Date" — which is what legacy's `fDate`/`fTime` pair prints on
     * this exact strip. The view drops the `<time>` entirely for a `null`.
     */
    it('answers null for a timestamp it cannot read', () => {
        expect(parse({ created_at: null }).created_at).toBeNull()
        expect(parse({ created_at: '' }).created_at).toBeNull()
        expect(parse({ created_at: 'yesterday' }).created_at).toBeNull()
        expect(parse({}).created_at).toBeNull()
    })

    it('parses a body missing every field rather than throwing', () => {
        expect(() => parse({})).not.toThrow()
        expect(parse({}).organization).toBeNull()
    })

    /** `''` is not a name — the screen substitutes a generic one, and cannot tell blank from absent. */
    it('treats a blank organization name as absent, so the caller can substitute', () => {
        expect(parse({ organization: { name: '   ' } }).organization?.name).toBeNull()
        expect(parse({ organization: null }).organization).toBeNull()
    })

    it('keeps fields it does not know about', () => {
        expect(parse({ role: 'manager' })).toMatchObject({ role: 'manager' })
    })

    /**
     * **No revenue rate, and that is the assertion.** A manager is staff, not a party to a split, so
     * nothing on this screen may print one. If the payload starts carrying `mcn_revenue_rate` the
     * schema keeps it (`looseObject`) but never *names* it, which is what stops a call site reaching
     * for it as if this screen had a rate block — the failure `invitationRates` documents on the
     * creator side, where a missing rate rendered "Creator Rate 100% / MCN Rate 0%".
     */
    it('does not declare a revenue rate', () => {
        expect('mcn_revenue_rate' in mcnUserInvitationSchema.shape).toBe(false)
    })
})

describe('mcnUserInvitationKeys', () => {
    it('separates tokens and accounts', () => {
        expect(mcnUserInvitationKeys.detail('a', 'u1')).not.toEqual(
            mcnUserInvitationKeys.detail('b', 'u1'),
        )
        expect(mcnUserInvitationKeys.detail('a', 'u1')).not.toEqual(
            mcnUserInvitationKeys.detail('a', 'u2'),
        )
    })

    it('is reachable as a prefix, which is what a spent token is removed by', () => {
        expect(mcnUserInvitationKeys.detail('a', 'u1').slice(0, 1)).toEqual([
            ...mcnUserInvitationKeys.all,
        ])
    })

    /**
     * **Its own root, not the creator invitation's.** The creator hook fires
     * `removeQueries({ queryKey: mcnInvitationKeys.all })` after a token is spent; a shared prefix
     * would make that also drop a manager invitation the same reader is holding in another tab.
     */
    it('does not share a prefix with the creator invitation', () => {
        expect(mcnUserInvitationKeys.all[0]).not.toBe('mcn-invitation')
    })
})

/**
 * The window is *printed*, never counted down (B101) — so what is worth pinning is that it is stated
 * once, as a number the sentence interpolates, rather than baked into nine translations.
 */
describe('USER_INVITATION_WINDOW_HOURS', () => {
    it('is legacy’s 72 hours', () => {
        expect(USER_INVITATION_WINDOW_HOURS).toBe(72)
    })
})

describe('mcnUserInvitationApi.confirmInvitation — the wire shape', () => {
    beforeEach(() => {
        get.mockReset()
        post.mockReset()
    })

    /**
     * **`action` is the body.** Legacy's `ApiModel.post(path, {}, { action })` is
     * `post(uri, params, data)` — arg 3 is the query, arg 4 is the payload. Read as axios's own
     * `post(url, body, config)` it inverts, which is how this shipped first; the backend answers
     * `{"errors":[{"input":"action","code":"required"}]}`, naming the field that *was* sent.
     *
     * The creator invitation had the identical defect from the identical misreading — see
     * `invitation-api.test.ts`, which pins the same thing on `organization/invitations/`.
     */
    it.each(['accept', 'reject'] as const)(
        'sends %s as the body, not a query param',
        async action => {
            post.mockResolvedValue(undefined)
            await mcnUserInvitationApi.confirmInvitation('tok', action, 'acc-1')

            const [path, body, config] = post.mock.calls[0]
            expect(path).toBe('v1/organization/user-invitations/tok/')
            expect(body).toEqual({ action })
            // The inverted version put it here. Nothing may pass `params` at all.
            expect(config).not.toHaveProperty('params')
            expect(config).toEqual({ accountId: 'acc-1' })
        },
    )
})
