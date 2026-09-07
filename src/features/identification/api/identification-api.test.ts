import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()

vi.mock('@shared/lib/api/model', () => ({
    createApiModel: () => ({ get, post, del: vi.fn(), put: vi.fn(), patch: vi.fn(), apiBase: '' }),
}))

const { identificationApi, identificationKeys } = await import('./identification-api')

beforeEach(() => {
    get.mockReset().mockResolvedValue({ results: [] })
    post.mockReset().mockResolvedValue({ sumsub_access_token: 'tok' })
})

describe('identificationKeys', () => {
    /**
     * Verification is a property of one account, and the switcher is two taps from every
     * screen — so an unscoped key would tell account B it is verified because account A is.
     */
    it('scopes the submissions key by account', () => {
        expect(identificationKeys.submissions('acc-1')).not.toEqual(
            identificationKeys.submissions('acc-2'),
        )
        expect(identificationKeys.submissions(null)).toEqual([
            'identification',
            'submissions',
            'anon',
        ])
    })
})

describe('identificationApi', () => {
    it('pins the account on the submissions request', async () => {
        await identificationApi.getSubmissions('acc-1')
        expect(get).toHaveBeenCalledWith(
            'v1/identification/submissions/',
            { page_size: 500 },
            { accountId: 'acc-1' },
        )
    })

    /*
     * The list is paginated and defaults to 50. `toIdentityState` reads an approval *anywhere*
     * in it, so a first-page-only read can only under-report — somebody whose approval had
     * scrolled off would be told to verify again. Pinned at the documented maximum because the
     * failure is silent: nothing throws, the screen just shows the intro.
     */
    it('asks for the whole list, not the default first page', async () => {
        await identificationApi.getSubmissions('acc-1')
        expect(get.mock.calls[0]?.[1]).toEqual({ page_size: 500 })
    })

    // No account, no config: `{ accountId: undefined }` would make the client's own
    // "act as this account" branch fire on a value it cannot use.
    it('sends no config when there is no account to pin', async () => {
        await identificationApi.getSubmissions(null)
        expect(get).toHaveBeenCalledWith(
            'v1/identification/submissions/',
            { page_size: 500 },
            undefined,
        )
    })

    /**
     * **The regression this file exists for.** Legacy's model is
     * `post(uri, params, data)` — query string first, body second — and this repo's is
     * `post(path, body, config)`. Mirroring legacy's call literally puts `level` in the
     * query string, where the backend does not look for it: the request succeeds, the
     * applicant is created at the wrong level (or none), and the failure only shows up as
     * a verification that never unlocks withdrawals.
     */
    it('sends `level` in the body, not the query string', async () => {
        await identificationApi.requestSumsubSession('LEVEL_2', 'acc-1')
        expect(post).toHaveBeenCalledWith(
            'v1/identification/sumsub/request/',
            { level: 'LEVEL_2' },
            { accountId: 'acc-1' },
        )
    })
})
