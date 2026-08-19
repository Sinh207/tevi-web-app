// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRemoteConfigSnapshot } from './client'
import { STORE_URLS } from './types'

/**
 * The transport, which is where every claim in this module's design actually lives — and none of
 * them are visible in a type or a render tree:
 *
 * - **one** network read for all three parameters,
 * - `fetchConfig` and `activate` called **separately**, so a throttled or offline load still runs
 *   on the last real template instead of dropping to code defaults,
 * - and *nothing* it can be handed makes it reject.
 *
 * The first two are one `fetchAndActivate` away from being silently undone by somebody tidying up
 * — the call is right there in the Firebase docs and it looks like the obvious simplification. The
 * throttle test below is what fails when they try it.
 */

const sdk = vi.hoisted(() => ({
    isSupported: vi.fn(),
    getRemoteConfig: vi.fn(),
    fetchConfig: vi.fn(),
    activate: vi.fn(),
    getValue: vi.fn(),
    /** The template `getValue` reads from. `undefined` for a parameter the console has not defined. */
    template: {} as Record<string, string | undefined>,
    settings: {} as Record<string, number>,
}))

vi.mock('firebase/remote-config', () => ({
    isSupported: sdk.isSupported,
    getRemoteConfig: sdk.getRemoteConfig,
    fetchConfig: sdk.fetchConfig,
    activate: sdk.activate,
    getValue: sdk.getValue,
}))
vi.mock('@shared/lib/firebase', () => ({ getFirebaseApp: vi.fn().mockResolvedValue({}) }))

beforeEach(() => {
    sdk.template = {}
    sdk.settings = {}
    sdk.isSupported.mockReset().mockResolvedValue(true)
    sdk.fetchConfig.mockReset().mockResolvedValue(undefined)
    sdk.activate.mockReset().mockResolvedValue(true)
    sdk.getRemoteConfig.mockReset().mockReturnValue({ settings: sdk.settings })
    sdk.getValue.mockReset().mockImplementation((_rc: unknown, name: string) => {
        const raw = sdk.template[name]
        return {
            asString: () => raw ?? '',
            // Exactly how the SDK behaves: a parameter absent from the template is `'static'`.
            getSource: () => (raw === undefined ? 'static' : 'remote'),
        }
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('fetchRemoteConfigSnapshot', () => {
    it('reads the whole template in one network call', async () => {
        sdk.template = {
            WEB_CONFIG: JSON.stringify({ direct_message: { limit_characters: 900 } }),
            THIRD_PARTY_CONFIG: JSON.stringify({ data_dog: { paid_users: {} } }),
            DEFAULT_EVENT_CONFIG: JSON.stringify({
                charge_star_in_live: { viewer: { default_country: { enable: true } } },
            }),
        }

        const snapshot = await fetchRemoteConfigSnapshot()

        // One fetch, three parameters. Legacy fires the same payload up to three times because
        // each of its getters calls `fetchAndActivate` itself.
        expect(sdk.fetchConfig).toHaveBeenCalledTimes(1)
        expect(snapshot.web.directMessage.limitCharacters).toBe(900)
        expect(snapshot.thirdParty.dataDog.paidUsers).not.toBeNull()
        expect(snapshot.event.chargeStarInLive.viewer.defaultCountry?.enable).toBe(true)
        expect(snapshot.isRemote).toBe(true)
    })

    /**
     * The reason the two calls are not `fetchAndActivate`.
     *
     * Remote Config throttles clients server-side, so a reader who reloads a few times in a minute
     * gets a rejected fetch — routine, not exceptional. The SDK still holds the last template it
     * fetched, and `activate` promotes it. Collapsing these two calls means that reader silently
     * runs on code defaults instead, which for a kill switch means it turns back on.
     */
    it('still activates the cached template when the fetch is throttled', async () => {
        sdk.fetchConfig.mockRejectedValue(new Error('FetchThrottledException'))
        sdk.template = { WEB_CONFIG: JSON.stringify({ report: { post: { is_active: true } } }) }

        const snapshot = await fetchRemoteConfigSnapshot()

        expect(sdk.activate).toHaveBeenCalledTimes(1)
        expect(snapshot.web.report.post.isActive).toBe(true)
        expect(snapshot.isRemote).toBe(true)
    })

    it('applies the fetch interval and timeout settings before fetching', async () => {
        await fetchRemoteConfigSnapshot()
        expect(sdk.settings.fetchTimeoutMillis).toBe(10_000)
        expect(sdk.settings.minimumFetchIntervalMillis).toBeTypeOf('number')
    })

    /** A console typo must cost that one parameter its values, not take the page down. */
    it('falls back for a parameter holding invalid JSON, keeping the others', async () => {
        sdk.template = {
            WEB_CONFIG: '{ "direct_message": { "limit_characters": 900 }, }',
            DEFAULT_EVENT_CONFIG: JSON.stringify({
                charge_star_in_live: { viewer: { default_country: { enable: true } } },
            }),
        }

        const snapshot = await fetchRemoteConfigSnapshot()

        expect(snapshot.web.directMessage.limitCharacters).toBe(500)
        expect(snapshot.event.chargeStarInLive.viewer.defaultCountry?.enable).toBe(true)
    })

    it('treats an empty parameter as absent', async () => {
        sdk.template = { WEB_CONFIG: '   ' }
        const snapshot = await fetchRemoteConfigSnapshot()
        expect(snapshot.web.download.ios.link).toBe(STORE_URLS.ios)
    })

    /**
     * `isRemote` is a transport signal: it says the template was read, not that a given parameter
     * was defined. Pinned because `use-remote-config.ts` documents exactly this boundary, and a
     * consumer that misreads it prints an unconfigured price.
     */
    it('reports isRemote from the template, not from any one parameter being defined', async () => {
        sdk.template = { WEB_CONFIG: JSON.stringify({}) }
        const snapshot = await fetchRemoteConfigSnapshot()
        expect(snapshot.isRemote).toBe(true)
        // …while the parameter nobody defined is simply its defaults.
        expect(snapshot.event.chargeStarInLive.viewer.defaultCountry).toBeNull()
    })

    it('returns defaults, without touching the SDK, where Remote Config is unsupported', async () => {
        sdk.isSupported.mockResolvedValue(false)
        const snapshot = await fetchRemoteConfigSnapshot()
        expect(sdk.getRemoteConfig).not.toHaveBeenCalled()
        expect(snapshot.isRemote).toBe(false)
        expect(snapshot.web.directMessage.limitCharacters).toBe(500)
    })

    /** Never rejects: a config read failing is not something a screen should have to handle. */
    it('resolves to defaults when the SDK itself throws', async () => {
        sdk.getRemoteConfig.mockImplementation(() => {
            throw new Error('no indexeddb')
        })
        await expect(fetchRemoteConfigSnapshot()).resolves.toMatchObject({ isRemote: false })
    })

    it('resolves to defaults when activate throws', async () => {
        sdk.activate.mockRejectedValue(new Error('blocked'))
        await expect(fetchRemoteConfigSnapshot()).resolves.toMatchObject({ isRemote: false })
    })

    /** No IndexedDB on the server, and nothing should be prefetching this there. */
    it('returns defaults on the server without importing the SDK', async () => {
        vi.stubGlobal('window', undefined)
        const snapshot = await fetchRemoteConfigSnapshot()
        vi.unstubAllGlobals()
        expect(sdk.isSupported).not.toHaveBeenCalled()
        expect(snapshot.isRemote).toBe(false)
    })
})
