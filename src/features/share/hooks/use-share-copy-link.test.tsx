// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareContext } from '../lib/share-context'
import { useShareCopyLink } from './use-share-copy-link'
import { useShareLink } from './use-share-link'

const createLink = vi.hoisted(() => vi.fn())
const createShortLink = vi.hoisted(() => vi.fn())

vi.mock('../api/share-link-api', async () => {
    const actual =
        await vi.importActual<typeof import('../api/share-link-api')>('../api/share-link-api')
    return { ...actual, shareLinkApi: { createLink, createShortLink } }
})
vi.mock('@features/auth', () => ({ useAuth: () => ({ activeId: 'acc-1' }) }))
vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const URL_IN = 'https://tevi.com/@ada/event/e1'
const LIVE: ShareContext = {
    contentType: 'live',
    contentId: 'e1',
    creatorId: 'ada',
    sourceScreen: 'live',
}

let copy: ReturnType<typeof useShareCopyLink>

function Panel({ url, sheetToo = false }: { url: string | null; sheetToo?: boolean }) {
    copy = useShareCopyLink({ url, context: LIVE, enabled: url !== null })
    return sheetToo ? <Sheet /> : null
}
function Sheet() {
    useShareLink({ url: URL_IN, context: LIVE, enabled: true })
    return null
}

function mount(props: { url: string | null; sheetToo?: boolean }) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={queryClient}>
            <Panel {...props} />
        </QueryClientProvider>,
    )
}

describe('useShareCopyLink', () => {
    beforeEach(() => {
        createLink
            .mockReset()
            .mockResolvedValue({ url: 'https://tevi.com/ada/s/abc', shareId: 'abc' })
        createShortLink.mockReset()
    })

    it('mints the copy link through the link service once the control has a URL', async () => {
        mount({ url: URL_IN })
        await waitFor(() => expect(copy.url).toBe('https://tevi.com/ada/s/abc'))
        expect(createLink).toHaveBeenCalledTimes(1)
        expect(createLink.mock.calls[0][0]).toMatchObject({
            url: URL_IN,
            channel: 'copy_link',
            context: LIVE,
        })
    })

    it('mints nothing before the control opens', () => {
        mount({ url: null })
        expect(copy.url).toBeNull()
        expect(createLink).not.toHaveBeenCalled()
    })

    /* The point of reading the sheet's own query: one content, one mint, whichever surface asks. */
    it('shares one mint with the share sheet for the same content', async () => {
        mount({ url: URL_IN, sheetToo: true })
        await waitFor(() => expect(copy.url).toBe('https://tevi.com/ada/s/abc'))
        expect(createLink).toHaveBeenCalledTimes(1)
    })

    it('falls back to the plain URL when the link service refuses', async () => {
        createLink.mockRejectedValue(new Error('down'))
        mount({ url: URL_IN })
        await waitFor(() => expect(copy.url).toBe(URL_IN))
    })
})
