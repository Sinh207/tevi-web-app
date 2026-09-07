// @vitest-environment jsdom
import { ApiError } from '@shared/lib/api/errors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareContext } from '../lib/share-context'
import { useShareLink } from './use-share-link'

/**
 * What this hook promises, none of it visible from the sheet that calls it: **a press mints at most
 * one link**, a share that cannot name its content mints **one link for every row rather than one
 * per row**, and a link service that refuses still leaves the reader with something to share.
 *
 * All three are silent when broken. Double-minting produces a working link and a duplicated
 * `share_link_created_v2`, so the only symptom is a share count that reads twice as high as reality;
 * the fallback's absence produces a Copy button that copies an empty string. Legacy has hand-rolled
 * caches for the first two (two `useRef` maps and an effect to clear them) and no fallback at all.
 */

const createLink = vi.hoisted(() => vi.fn())
const createShortLink = vi.hoisted(() => vi.fn())
const success = vi.hoisted(() => vi.fn())
const error = vi.hoisted(() => vi.fn())

vi.mock('../api/share-link-api', async () => {
    const actual =
        await vi.importActual<typeof import('../api/share-link-api')>('../api/share-link-api')
    return { ...actual, shareLinkApi: { createLink, createShortLink } }
})

vi.mock('@features/auth', () => ({ useAuth: () => ({ activeId: 'acc-1' }) }))
vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('sonner', () => ({ toast: { success, error } }))

const URL_IN = 'https://tevi.com/@ada'
const CONTEXT: ShareContext = {
    contentType: 'space',
    contentId: '42',
    creatorId: 'ada',
    sourceScreen: 'space',
}

/** A tab `window.open` handed back, so the navigation can be read off it. */
function stubWindowOpen() {
    const tab = { opener: {} as unknown, location: { href: '' } }
    const open = vi.fn(() => tab as unknown as Window)
    vi.stubGlobal('open', open)
    return { tab, open }
}

function renderHook({ context }: { context?: ShareContext | null } = {}) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let api = {} as ReturnType<typeof useShareLink>
    function Probe() {
        api = useShareLink({ url: URL_IN, context, enabled: true })
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return { read: () => api }
}

beforeEach(() => {
    createLink.mockReset()
    createShortLink.mockReset()
    success.mockReset()
    error.mockReset()
    createLink.mockImplementation(({ channel }: { channel: string }) =>
        Promise.resolve({ url: `https://tv.link/${channel}`, shareId: channel }),
    )
    createShortLink.mockResolvedValue({ url: 'https://tv.link/plain', shareId: null })
    Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } })
})

describe('useShareLink — a content share', () => {
    it('mints the copy link as soon as the sheet opens, so the write can be synchronous', async () => {
        const { read } = renderHook({ context: CONTEXT })

        // Undefined while in flight: the sheet draws a skeleton rather than the long URL, so the
        // line does not change under the reader a beat after it appears.
        expect(read().shareUrl).toBeUndefined()
        await waitFor(() => expect(read().shareUrl).toBe('https://tv.link/copy_link'))
        expect(createLink).toHaveBeenCalledTimes(1)
        expect(createLink.mock.calls[0][0]).toMatchObject({
            url: URL_IN,
            channel: 'copy_link',
            context: CONTEXT,
            accountId: 'acc-1',
        })
    })

    it('mints once per channel, however often a row is pressed', async () => {
        const { read } = renderHook({ context: CONTEXT })
        await waitFor(() => expect(read().shareUrl).toBeDefined())
        const { tab } = stubWindowOpen()

        await act(async () => {
            await read().openChannel('telegram')
            await read().openChannel('telegram')
        })

        const channels = createLink.mock.calls.map(([args]) => args.channel)
        expect(channels).toEqual(['copy_link', 'telegram'])
        expect(tab.location.href).toContain(encodeURIComponent('https://tv.link/telegram'))
        // A share target that can reach `window.opener` can navigate this app's tab.
        expect(tab.opener).toBeNull()
    })

    it('mints a separate link per channel, which is what the analytics are for', async () => {
        const { read } = renderHook({ context: CONTEXT })
        await waitFor(() => expect(read().shareUrl).toBeDefined())
        stubWindowOpen()

        await act(async () => {
            await read().openChannel('telegram')
            await read().openChannel('x')
        })

        expect(createLink.mock.calls.map(([args]) => args.channel)).toEqual([
            'copy_link',
            'telegram',
            // The wire spelling, not the product name — nothing groups by `x`.
            'twitter',
        ])
    })
})

describe('useShareLink — no content context', () => {
    it('mints one plain link for every row, not one per row', async () => {
        const { read } = renderHook({ context: null })
        await waitFor(() => expect(read().shareUrl).toBe('https://tv.link/plain'))
        stubWindowOpen()

        await act(async () => {
            await read().openChannel('telegram')
            await read().openChannel('x')
            await read().copyLink()
        })

        expect(createLink).not.toHaveBeenCalled()
        expect(createShortLink).toHaveBeenCalledTimes(1)
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://tv.link/plain')
    })
})

describe('useShareLink — the link service will not answer', () => {
    it('falls back to the URL it was given rather than sharing nothing', async () => {
        createLink.mockRejectedValue(new ApiError({ message: 'boom', status: 500 }))
        const { read } = renderHook({ context: CONTEXT })

        await waitFor(() => expect(read().shareUrl).toBe(URL_IN))
        const { tab } = stubWindowOpen()
        await act(async () => {
            await read().openChannel('telegram')
            await read().copyLink()
        })

        expect(tab.location.href).toContain(encodeURIComponent(URL_IN))
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(URL_IN)
        expect(success).toHaveBeenCalledWith('share_link_copied', expect.anything())
    })

    it('falls back on a 2xx that carried no URL, which is a real answer and not an error', async () => {
        createLink.mockResolvedValue(null)
        const { read } = renderHook({ context: CONTEXT })
        await waitFor(() => expect(read().shareUrl).toBe(URL_IN))
    })
})

describe('useShareLink — the clipboard', () => {
    it('says so when the write is refused, and puts the link in the message', async () => {
        Object.assign(navigator, {
            clipboard: { writeText: vi.fn(() => Promise.reject(new Error('denied'))) },
        })
        const { read } = renderHook({ context: CONTEXT })
        await waitFor(() => expect(read().shareUrl).toBeDefined())

        await act(async () => {
            await read().copyLink()
        })

        expect(error).toHaveBeenCalledWith('share_link_copy_failed', expect.anything())
        expect(success).not.toHaveBeenCalled()
    })
})
