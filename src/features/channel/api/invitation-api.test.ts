import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The model is mocked the way `channel-api.test.ts` does it, so the **call shape** can be asserted
 * without a network. That is not decoration: the one defect this file exists to fence is that
 * `action` shipped as a query parameter instead of a body, and nothing above the axios call could
 * see it — the hook, the view and the schema are identical either way.
 */
const get = vi.fn()
const post = vi.fn()

vi.mock('@shared/lib/api/model', () => ({
    createApiModel: () => ({ get, post, del: vi.fn(), put: vi.fn(), patch: vi.fn(), apiBase: '' }),
}))

const { mcnInvitationApi, mcnInvitationKeys, mcnInvitationSchema } = await import(
    './invitation-api'
)

/**
 * The schema is `looseObject` with nothing required, and each of these cases is a payload shape the
 * screen has to survive rather than a hypothetical: the two things a creator presses are Agree and
 * Reject, and neither needs a single one of these fields. A schema that threw would show them the
 * expired-link wall for a link that is live.
 */
const parse = (body: unknown) => mcnInvitationSchema.parse(body)

describe('mcnInvitationSchema', () => {
    it('reads the shape legacy reads', () => {
        expect(
            parse({
                organization: { id: 42, name: 'Acme Network' },
                created_at: '2026-09-01T10:30:00Z',
                mcn_revenue_rate: 30,
            }),
        ).toMatchObject({
            organization: { id: '42', name: 'Acme Network' },
            created_at: '2026-09-01T10:30:00.000Z',
            mcn_revenue_rate: 30,
        })
    })

    /**
     * `mcn_revenue_rate` arrives as a **string** in legacy (`parseFloat(…)`), so both spellings have
     * to work — and a decimal one has to survive, since 47.5 is what makes the rounding in
     * `invitationRates` matter.
     */
    it('accepts the rate as a string, which is how legacy receives it', () => {
        expect(parse({ mcn_revenue_rate: '30' }).mcn_revenue_rate).toBe(30)
        expect(parse({ mcn_revenue_rate: '47.5' }).mcn_revenue_rate).toBe(47.5)
        expect(parse({ mcn_revenue_rate: '0' }).mcn_revenue_rate).toBe(0)
    })

    it('answers null for a rate it cannot use, never a number it made up', () => {
        expect(parse({ mcn_revenue_rate: null }).mcn_revenue_rate).toBeNull()
        expect(parse({ mcn_revenue_rate: 'thirty' }).mcn_revenue_rate).toBeNull()
        expect(parse({ mcn_revenue_rate: 140 }).mcn_revenue_rate).toBeNull()
        expect(parse({ mcn_revenue_rate: -5 }).mcn_revenue_rate).toBeNull()
    })

    /**
     * Epoch milliseconds is what this API actually sends for `created_at` elsewhere in this feature,
     * and declaring it as text is what made `formatJoinedDate` return `''` for every channel that
     * ever existed — silently. All four spellings are pinned here so that cannot recur.
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

    it('answers null for a timestamp it cannot read, never "Invalid Date"', () => {
        expect(parse({ created_at: 'nonsense' }).created_at).toBeNull()
        expect(parse({ created_at: '' }).created_at).toBeNull()
        expect(parse({ created_at: null }).created_at).toBeNull()
    })

    it('parses a body missing every field rather than throwing', () => {
        const empty = parse({})
        expect(empty.organization).toBeNull()
        expect(empty.created_at).toBeNull()
        expect(empty.mcn_revenue_rate).toBeNull()
    })

    it('treats a blank organization name as absent, so the caller can substitute', () => {
        expect(parse({ organization: { name: '   ' } }).organization?.name).toBeNull()
        expect(parse({ organization: null }).organization).toBeNull()
        expect(parse({ organization: 'Acme' }).organization).toBeNull()
    })

    it('keeps fields it does not know about', () => {
        expect(parse({ status: 'pending' })).toMatchObject({ status: 'pending' })
    })
})

describe('mcnInvitationKeys', () => {
    /**
     * Both halves are load-bearing. The token because two links in one inbox are two invitations;
     * the account because whether a link is redeemable is answered per bearer, so switching accounts
     * must re-ask rather than reuse the previous account's answer.
     */
    it('separates tokens and accounts', () => {
        expect(mcnInvitationKeys.detail('a', '1')).not.toEqual(mcnInvitationKeys.detail('b', '1'))
        expect(mcnInvitationKeys.detail('a', '1')).not.toEqual(mcnInvitationKeys.detail('a', '2'))
        expect(mcnInvitationKeys.detail('a', '1')).toEqual(mcnInvitationKeys.detail('a', '1'))
    })

    it('is reachable as a prefix, which is what a spent token is removed by', () => {
        expect(mcnInvitationKeys.detail('a', '1').slice(0, 1)).toEqual([...mcnInvitationKeys.all])
    })
})

describe('mcnInvitationApi.confirmInvitation — the wire shape', () => {
    beforeEach(() => {
        get.mockReset()
        post.mockReset()
    })

    /**
     * **`action` is the body, and this is the assertion that was missing when it shipped as a query
     * parameter.**
     *
     * Legacy's `ApiModel.post(path, {}, { action })` is `post(uri, params, data)` — arg 3 is the
     * query, arg 4 is the payload. Read as axios's own `post(url, body, config)` it inverts, and the
     * backend answers `{"errors":[{"input":"action","code":"required"}]}`: a field-shaped rejection
     * naming the field that *was* sent, from the wrong half of the request.
     */
    it.each(['accept', 'reject'] as const)(
        'sends %s as the body, not a query param',
        async action => {
            post.mockResolvedValue(undefined)
            await mcnInvitationApi.confirmInvitation('tok', action, 'acc-1')

            const [path, body, config] = post.mock.calls[0]
            expect(path).toBe('v1/organization/invitations/tok/')
            expect(body).toEqual({ action })
            // The inverted version put it here. Nothing may pass `params` at all.
            expect(config).not.toHaveProperty('params')
            // The bearer still travels, because the token identifies the invitation and not the account.
            expect(config).toEqual({ accountId: 'acc-1' })
        },
    )

    /** A token with a slash or a space in it must not escape its path segment. */
    it('encodes the token into the path', async () => {
        post.mockResolvedValue(undefined)
        await mcnInvitationApi.confirmInvitation('a/b c', 'accept', null)
        expect(post.mock.calls[0][0]).toBe('v1/organization/invitations/a%2Fb%20c/')
        // No account, so no config to pin one — never `{ accountId: null }`.
        expect(post.mock.calls[0][2]).toBeUndefined()
    })
})
