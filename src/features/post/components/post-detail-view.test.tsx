// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * A write in the thread has to refresh **two** queries, and the bug this pins is what happens when
 * it refreshes one.
 *
 * Posting a reply refetched the post *and* the list; deleting one refetched only the list. So the
 * row disappeared and the `reply_count` printed on the card above it did not move — the reader
 * watched a number stay wrong while looking straight at it. The write hooks do invalidate
 * `postKeys.all`, which is why this was easy to miss: invalidation marks a query stale, and the two
 * copies *already on screen* are exactly the ones that must not wait for a stale time.
 *
 * Nothing about this is visible in markup, which is why it is a test and not a comment: both
 * callbacks type-check, both render, and one of them is silently half a refresh.
 */

const refetchPost = vi.fn()
const refetchReplies = vi.fn()

/** Captures the `onChanged` the replies list is handed, so the test can fire it. */
const captured: { onChanged?: () => void; onReplied?: () => void } = {}

vi.mock('../hooks/use-post-detail', () => ({
    usePostDetail: () => ({
        post: { id: 'p1', deleted: false, reply_count: 2, channel: {}, images: [] },
        isLoading: false,
        isError: false,
        refetch: refetchPost,
        isMissing: false,
    }),
}))
vi.mock('../hooks/use-post-replies', () => ({
    usePostReplies: () => ({
        replies: [{ id: 'r1', text: 'a reply', images: [], deleted: false, owner: {} }],
        isLoading: false,
        isError: false,
        isEmpty: false,
        refetch: refetchReplies,
        fetchNextPage: () => {},
        hasNextPage: false,
        isFetchingNextPage: false,
    }),
}))
vi.mock('@shared/hooks/use-in-view', () => ({ useInView: () => [() => {}, false] }))
vi.mock('@features/share', () => ({ ShareDialog: () => null, postShareContext: () => null }))
vi.mock('./post-card', () => ({ PostCard: () => null, PostMediaBlock: () => null }))
vi.mock('./reply-composer', () => ({
    ReplyComposer: ({ onReplied }: { onReplied?: () => void }) => {
        captured.onReplied = onReplied
        return null
    },
}))
vi.mock('./reply-thread', () => ({
    ReplyThread: ({ onChanged }: { onChanged?: () => void }) => {
        captured.onChanged = onChanged
        return null
    },
}))

const { PostDetailView } = await import('./post-detail-view')

describe('PostDetailView — a write in the thread', () => {
    /**
     * ⚠ The **row's** callback is the one that was wrong, so it is the one asserted first. Pointing
     * this at `onReplied` instead would pass against the broken code: posting was always refetching
     * both, and deleting was the half that only refetched the list.
     */
    it('refetches the post as well as the list when a row is deleted', () => {
        render(<PostDetailView identifier="p1" serverPost={null} />)

        expect(captured.onChanged).toBeTypeOf('function')
        captured.onChanged?.()

        expect(refetchPost).toHaveBeenCalledTimes(1)
        expect(refetchReplies).toHaveBeenCalledTimes(1)
    })

    /** And the composer's, which must stay the same function rather than a second copy of it. */
    it('refetches both when a reply is posted', () => {
        render(<PostDetailView identifier="p1" serverPost={null} />)

        expect(captured.onReplied).toBe(captured.onChanged)
    })
})
