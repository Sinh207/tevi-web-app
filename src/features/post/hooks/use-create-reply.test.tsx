// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizePost, type Post } from '../api/types'
import type { ReplyDraft, ReplyDraftImage } from '../lib/reply-draft'

/**
 * Every call the hook can make, recorded **in one list**.
 *
 * The order of the three requests is the claim this file exists to pin — charge, then upload, then
 * write — and three separate spies could only say that each happened. `calls` is what lets the test
 * state that a channel which sells replies is never replied to for free.
 */
const calls: string[] = []

/** The body `createReply` is called with, as the test reads it back. */
type ReplyBody = { postId: string; text: string | null; images: { uri: string }[] }

const chargeInteraction = vi.fn((_charge: unknown, _accountId: string | null) => {
    calls.push('charge')
    return Promise.resolve({})
})
const createReply = vi.fn((body: ReplyBody, _accountId: string | null) => {
    calls.push('create')
    return Promise.resolve(normalizePost({ id: 'r1', text: body.text }))
})
vi.mock('../api/post-api', () => ({
    postApi: {
        chargeInteraction: (charge: unknown, accountId: string | null) =>
            chargeInteraction(charge, accountId),
        createReply: (body: ReplyBody, accountId: string | null) => createReply(body, accountId),
    },
    postKeys: { all: ['post'] },
    INSUFFICIENT_STARS_CODE: 'EC0001',
}))

const uploadImage = vi.fn((key: string, _file?: Blob) => {
    calls.push(`upload:${key}`)
    return Promise.resolve<string | null>(`https://cdn.invalid/${key}`)
})
vi.mock('@shared/lib/api/upload-api', () => ({
    uploadApi: { uploadImage: (key: string, file: Blob) => uploadImage(key, file) },
}))

/** The balance gate, stubbed as it behaves — see `use-post-reaction.test.tsx` for why. */
const balance = { affordable: true }
const offerStars = vi.fn()
vi.mock('@features/balance', () => ({
    balanceKeys: { all: ['balance'] },
    useRequireStars:
        () =>
        <A extends unknown[]>(_cost: number, cb: (...args: A) => void) =>
        (...args: A) => {
            if (!auth.isAuthenticated) {
                openLoginDialog()
                return
            }
            if (!balance.affordable) {
                offerStars()
                return
            }
            cb(...args)
        },
}))

const auth = { isAuthenticated: true, activeId: 'acc-1' as string | null }
const openLoginDialog = vi.fn()
vi.mock('@features/auth', () => ({
    useAuth: () => auth,
    useRequireAuth:
        () =>
        <A extends unknown[]>(cb: (...args: A) => void) =>
        (...args: A) => {
            if (!auth.isAuthenticated) {
                openLoginDialog()
                return
            }
            cb(...args)
        },
}))

const { useCreateReply } = await import('./use-create-reply')

function fixture(overrides: Record<string, unknown> = {}): Post {
    const parsed = normalizePost({ id: 'p1', ...overrides })
    if (!parsed) throw new Error('fixture did not parse')
    return parsed
}

const CHARGING = { id: 'ch-1', paid_interaction_enabled: true, paid_interaction_cost: 5 }

function image(id: string): ReplyDraftImage {
    return {
        id,
        file: new File(['x'], `${id}.png`, { type: 'image/png' }),
        previewUrl: `blob:${id}`,
        width: 640,
        height: 480,
    }
}

function draft(overrides: Partial<ReplyDraft> = {}): ReplyDraft {
    return { text: 'hello', images: [], ...overrides }
}

function mount(post: Post, cost: number | null = null) {
    const created = vi.fn()
    const out = { current: null as ReturnType<typeof useCreateReply> | null }
    function Probe() {
        out.current = useCreateReply(post, { cost, onCreated: created })
        return null
    }
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    render(
        <QueryClientProvider client={client}>
            <Probe />
        </QueryClientProvider>,
    )
    return { out, created }
}

beforeEach(() => {
    calls.length = 0
    vi.clearAllMocks()
    auth.isAuthenticated = true
    auth.activeId = 'acc-1'
    balance.affordable = true
})

describe('a free reply', () => {
    it('writes once, with the trimmed text and no images key', async () => {
        const { out, created } = mount(fixture())
        act(() => out.current?.submit(draft({ text: '  hello  ' })))

        await waitFor(() => expect(created).toHaveBeenCalled())
        expect(calls).toEqual(['create'])
        expect(createReply).toHaveBeenCalledWith(
            { postId: 'p1', text: 'hello', images: [] },
            'acc-1',
        )
        expect(chargeInteraction).not.toHaveBeenCalled()
    })

    it('reports no cost on its button', () => {
        const { out } = mount(fixture())
        expect(out.current?.cost).toBe(null)
    })
})

describe('a reply on a channel that charges', () => {
    /**
     * The claim the whole hook is built around: the Star leaves **before** the reply is written.
     * Reversed or parallelised, a space that sells interactions is replied to for free, and nothing
     * on either side surfaces it.
     */
    it('charges first, then writes', async () => {
        const { out, created } = mount(fixture({ channel: CHARGING }), 5)
        act(() => out.current?.submit(draft()))

        await waitFor(() => expect(created).toHaveBeenCalled())
        expect(calls).toEqual(['charge', 'create'])
        expect(chargeInteraction).toHaveBeenCalledWith(
            { product: 'comment', channelId: 'ch-1', cost: 5 },
            'acc-1',
        )
    })

    it('does not write when the charge fails', async () => {
        chargeInteraction.mockImplementationOnce(() => {
            calls.push('charge')
            return Promise.reject(new Error('refused'))
        })
        const { out, created } = mount(fixture({ channel: CHARGING }), 5)
        act(() => out.current?.submit(draft()))

        await waitFor(() => expect(out.current?.isPending).toBe(false))
        expect(calls).toEqual(['charge'])
        expect(createReply).not.toHaveBeenCalled()
        expect(created).not.toHaveBeenCalled()
    })

    /**
     * A reader who cannot afford it sends **nothing** — not the charge and not the reply. The gate
     * is the press, not the response.
     */
    it('sends nothing at all when the reader is short of Star', async () => {
        balance.affordable = false
        const { out } = mount(fixture({ channel: CHARGING }), 5)
        act(() => out.current?.submit(draft()))

        expect(offerStars).toHaveBeenCalled()
        expect(calls).toEqual([])
    })

    /**
     * A price with nobody to credit cannot be charged — and replying *free* instead is the exact
     * hole the ordering above closes, so the press does nothing.
     */
    it('refuses to send when the payload prices a reply but names no channel', async () => {
        const { out } = mount(fixture({ channel: null }), 5)
        act(() => out.current?.submit(draft()))

        expect(calls).toEqual([])
        expect(out.current?.cost).toBe(null)
    })
})

describe('a guest', () => {
    it('is asked to sign in, and nothing is sent', () => {
        auth.isAuthenticated = false
        const { out } = mount(fixture())
        act(() => out.current?.submit(draft()))

        expect(openLoginDialog).toHaveBeenCalled()
        expect(calls).toEqual([])
    })
})

describe('images', () => {
    it('uploads each one under its own indexed key, then writes their URLs', async () => {
        const { out, created } = mount(fixture())
        act(() => out.current?.submit(draft({ images: [image('a'), image('b')] })))

        await waitFor(() => expect(created).toHaveBeenCalled())

        const keys = calls.filter(call => call.startsWith('upload:'))
        expect(keys).toHaveLength(2)
        // Ten pictures picked in one gesture share a millisecond; the index is what keeps them from
        // writing to one object (`upload-key.ts`).
        expect(new Set(keys).size).toBe(2)
        expect(calls.at(-1)).toBe('create')

        const body = createReply.mock.calls[0]?.[0]
        expect(body?.images).toEqual([
            { uri: expect.stringContaining('acc-1'), w: 640, h: 480 },
            { uri: expect.stringContaining('acc-1'), w: 640, h: 480 },
        ])
    })

    /**
     * One picture failing must not take the words with it — legacy toasts and continues, and losing
     * the whole reply over a flaky upload is the worse outcome.
     */
    it('drops a picture whose upload failed and still writes the reply', async () => {
        uploadImage.mockImplementationOnce(() => Promise.reject(new Error('gcs down')))
        const { out, created } = mount(fixture())
        act(() => out.current?.submit(draft({ text: 'words', images: [image('a'), image('b')] })))

        await waitFor(() => expect(created).toHaveBeenCalled())
        const body = createReply.mock.calls[0]?.[0]
        expect(body?.text).toBe('words')
        expect(body?.images).toHaveLength(1)
    })

    /** Nothing uploaded and nothing typed is not a reply, so no empty row is written. */
    it('writes nothing when an images-only draft loses every upload', async () => {
        uploadImage.mockImplementation(() => Promise.reject(new Error('gcs down')))
        const { out, created } = mount(fixture())
        act(() => out.current?.submit(draft({ text: '', images: [image('a')] })))

        await waitFor(() => expect(out.current?.isPending).toBe(false))
        expect(createReply).not.toHaveBeenCalled()
        expect(created).not.toHaveBeenCalled()
        uploadImage.mockImplementation((key: string) => {
            calls.push(`upload:${key}`)
            return Promise.resolve<string | null>(`https://cdn.invalid/${key}`)
        })
    })
})

describe('the account', () => {
    /**
     * Pinned at the press. The switcher is two taps from this screen, and a reply that resolves
     * after a switch must still belong to the account that wrote it.
     */
    it('is the one that was active when the press happened', async () => {
        const { out, created } = mount(fixture({ channel: CHARGING }), 5)
        act(() => out.current?.submit(draft()))
        auth.activeId = 'acc-2'

        await waitFor(() => expect(created).toHaveBeenCalled())
        expect(chargeInteraction.mock.calls[0]?.[1]).toBe('acc-1')
        expect(createReply.mock.calls[0]?.[1]).toBe('acc-1')
    })
})
