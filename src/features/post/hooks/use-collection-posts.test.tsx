// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    type CollectionOwnership,
    type UseCollectionResult,
    useCollection,
} from './use-collection-posts'
import { useSpaceCollections } from './use-space-collections'

/**
 * Which **endpoint** a collection is read through — the claim these tests exist to pin.
 *
 * `v1/posts/collections/…` is account-scoped: it answers with the bearer's own collections, so
 * asking it for somebody else's is at best a 404 and at worst the reader's own collection shown
 * under another space's name. The public half (`v3/channel/channels/{slug}/post-collections/…`) is
 * the only one that can answer for a visitor. Nothing on screen tells the two apart, so a test is
 * the only place the choice can be seen.
 */
const { api } = vi.hoisted(() => {
    const page = { results: [], count: 0, next: null }
    const api = {
        getCollection: vi.fn((_id: string, _account?: string | null) =>
            Promise.resolve({ id: 'c1', name: 'Mine', post_count: 0 }),
        ),
        getCollectionPosts: vi.fn((_args: { collectionId: string }) => Promise.resolve(page)),
        getSpaceCollection: vi.fn((_slug: string, _id: string, _account?: string | null) =>
            Promise.resolve({ id: 'c1', name: 'Theirs', post_count: 0 }),
        ),
        getSpaceCollectionPosts: vi.fn((_args: { slug: string; collectionId: string }) =>
            Promise.resolve(page),
        ),
        getCollections: vi.fn((_args: { page: number }) =>
            Promise.resolve({
                results: [{ id: 'c1', name: 'Mine', post_count: 1 }],
                hasMore: false,
            }),
        ),
        getSpaceCollections: vi.fn((_args: { slug: string }) =>
            Promise.resolve({
                results: [{ id: 'c2', name: 'Theirs', post_count: 2 }],
                hasMore: false,
            }),
        ),
    }
    return { api }
})

vi.mock('../api/post-api', async importOriginal => {
    const actual = await importOriginal<typeof import('../api/post-api')>()
    return { ...actual, postApi: api }
})

const auth = vi.hoisted(() => ({ isAuthenticated: true, activeId: 'acc-1' as string | null }))
vi.mock('@features/auth', () => ({ useAuth: () => auth }))

function mount(ui: React.ReactNode) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

let result: UseCollectionResult | null = null
function DetailProbe({ ownership }: { ownership: CollectionOwnership }) {
    result = useCollection('c1', { slug: 'ada', ownership })
    return null
}

let rows: { id: string }[] = []
function RowProbe({ isOwner }: { isOwner: boolean }) {
    rows = useSpaceCollections({ slug: 'ada', isOwner }).collections
    return null
}

beforeEach(() => {
    for (const spy of Object.values(api)) spy.mockClear()
    auth.isAuthenticated = true
    result = null
    rows = []
})

describe('useCollection', () => {
    it("reads the owner's collection through the account-scoped endpoint", async () => {
        mount(<DetailProbe ownership="owner" />)
        await waitFor(() => expect(result?.collection?.name).toBe('Mine'))
        expect(api.getCollectionPosts).toHaveBeenCalledOnce()
        expect(api.getSpaceCollection).not.toHaveBeenCalled()
        expect(api.getSpaceCollectionPosts).not.toHaveBeenCalled()
    })

    it("reads somebody else's collection through their space", async () => {
        mount(<DetailProbe ownership="viewer" />)
        await waitFor(() => expect(result?.collection?.name).toBe('Theirs'))
        expect(api.getSpaceCollection).toHaveBeenCalledWith('ada', 'c1', 'acc-1', expect.anything())
        expect(api.getSpaceCollectionPosts.mock.calls[0]?.[0]).toMatchObject({
            slug: 'ada',
            collectionId: 'c1',
        })
        expect(api.getCollection).not.toHaveBeenCalled()
        expect(api.getCollectionPosts).not.toHaveBeenCalled()
    })

    it('asks nothing while ownership is unknown, and says it is loading', async () => {
        mount(<DetailProbe ownership="unknown" />)
        // Let any request that was going to start, start.
        await new Promise(resolve => setTimeout(resolve, 20))
        for (const spy of Object.values(api)) expect(spy).not.toHaveBeenCalled()
        expect(result?.isLoading).toBe(true)
        // Not empty: "nothing filed" would be a claim about a collection nobody has read.
        expect(result?.isMissing).toBe(false)
    })

    it('asks nothing without an account', async () => {
        auth.isAuthenticated = false
        mount(<DetailProbe ownership="viewer" />)
        await new Promise(resolve => setTimeout(resolve, 20))
        for (const spy of Object.values(api)) expect(spy).not.toHaveBeenCalled()
        expect(result?.isSignedOut).toBe(true)
    })
})

describe('useSpaceCollections', () => {
    it("gives the owner their own list — the one the composer's picker reads", async () => {
        mount(<RowProbe isOwner />)
        await waitFor(() => expect(rows.map(row => row.id)).toEqual(['c1']))
        expect(api.getSpaceCollections).not.toHaveBeenCalled()
    })

    it("gives a visitor the space's public list", async () => {
        mount(<RowProbe isOwner={false} />)
        await waitFor(() => expect(rows.map(row => row.id)).toEqual(['c2']))
        expect(api.getSpaceCollections.mock.calls[0]?.[0]).toMatchObject({ slug: 'ada' })
        expect(api.getCollections).not.toHaveBeenCalled()
    })
})
