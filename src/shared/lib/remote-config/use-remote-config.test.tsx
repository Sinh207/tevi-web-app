// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemoteConfigSnapshot } from './client'
import {
    normalizeEventConfig,
    normalizeThirdPartyConfig,
    normalizeWebConfig,
    STORE_URLS,
    WEB_CONFIG_DEFAULTS,
} from './types'
import { useRemoteConfig, useWebConfig } from './use-remote-config'

/**
 * What this hook promises that no call site can see: **that there is no provider and it does not
 * need one.**
 *
 * The whole design rests on one claim — twenty unrelated components can each call `useWebConfig()`
 * and the app reads Firebase once. That is a property of the query key, so it is invisible in every
 * render tree and every type, and it is exactly the kind of thing a later refactor breaks by
 * "tidying up" the key into something derived. Hence the count assertion below.
 *
 * The other two are about what a consumer sees *before* the answer lands: a complete config rather
 * than a `null`, and `isKnown: false` so a screen that must not print a made-up price can wait.
 */

const fetchSnapshot = vi.hoisted(() => vi.fn())
vi.mock('./client', async () => {
    const actual = await vi.importActual<typeof import('./client')>('./client')
    return { ...actual, fetchRemoteConfigSnapshot: fetchSnapshot }
})

const REMOTE: RemoteConfigSnapshot = {
    web: normalizeWebConfig({
        download: { ios: { link: 'https://ios.test' }, android: { link: 'https://play.test' } },
        post: { create_post: { character_limit: 2000 } },
        report: { post: { is_active: true } },
    }),
    thirdParty: normalizeThirdPartyConfig({}),
    event: normalizeEventConfig({}),
    isRemote: true,
}

function mount(consumers = 1) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let api: ReturnType<typeof useRemoteConfig> | null = null

    function Probe() {
        api = useRemoteConfig()
        return null
    }
    /** A second, unrelated reader — the shorthand hook, as a real consumer would use it. */
    function OtherProbe() {
        useWebConfig()
        return null
    }

    const utils = render(
        <QueryClientProvider client={queryClient}>
            <Probe />
            {Array.from({ length: consumers - 1 }, (_, i) => `reader-${i}`).map(id => (
                <OtherProbe key={id} />
            ))}
        </QueryClientProvider>,
    )
    return { ...utils, read: () => api as ReturnType<typeof useRemoteConfig> }
}

beforeEach(() => {
    fetchSnapshot.mockReset().mockResolvedValue(REMOTE)
})

describe('useRemoteConfig', () => {
    it('hands out a complete config on the first render, before anything is fetched', () => {
        const h = mount()
        // Not null, not partial — a usable value, which is what removes the `?? 500` at the call
        // sites `types.ts` catalogues.
        expect(h.read().web).toEqual(WEB_CONFIG_DEFAULTS)
        expect(h.read().web.post.createPost.characterLimit).toBe(500)
        expect(h.read().web.download.ios.link).toBe(STORE_URLS.ios)
        // …but says so, so a screen showing a configured *price* can wait rather than print one.
        expect(h.read().isKnown).toBe(false)
        expect(h.read().isLoading).toBe(true)
    })

    it('swaps in the real values once the template lands', async () => {
        const h = mount()
        await waitFor(() => expect(h.read().isKnown).toBe(true))
        expect(h.read().web.post.createPost.characterLimit).toBe(2000)
        expect(h.read().web.download.ios.link).toBe('https://ios.test')
        expect(h.read().web.report.post.isActive).toBe(true)
        expect(h.read().isLoading).toBe(false)
    })

    /**
     * The claim that replaces the provider. Five readers, one read of Firebase — because they share
     * one query key and TanStack owns the deduplication.
     */
    it('reads Firebase once no matter how many consumers mount', async () => {
        const h = mount(5)
        await waitFor(() => expect(h.read().isKnown).toBe(true))
        expect(fetchSnapshot).toHaveBeenCalledTimes(1)
    })

    /**
     * `isRemote: false` is what the transport returns when Firebase is unreachable — throttled,
     * offline, blocked IndexedDB. The config still works; `isKnown` stays false so nothing prints a
     * figure it invented. It is deliberately **not** an error: see `client.ts`.
     */
    it('stays usable and honest when Firebase could not be read', async () => {
        fetchSnapshot.mockResolvedValue({ ...REMOTE, web: WEB_CONFIG_DEFAULTS, isRemote: false })
        const h = mount()
        await waitFor(() => expect(h.read().isLoading).toBe(false))
        expect(h.read().isKnown).toBe(false)
        expect(h.read().isError).toBe(false)
        expect(h.read().web.post.createPost.characterLimit).toBe(500)
    })

    it('re-reads the template on refresh', async () => {
        const h = mount()
        await waitFor(() => expect(h.read().isKnown).toBe(true))
        await h.read().refresh()
        await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2))
    })
})
