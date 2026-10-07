// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * The hairline between two posts, **inside a group** as well as between groups.
 *
 * The line is the page colour showing through a 1px gap, so whoever paints the surface decides where
 * it shows. With the surface on the group's wrapper, the gap between two posts of the same space was
 * the wrapper's own white, and those posts ran together while every other pair was separated —
 * invisible in the markup, which is why it is pinned here. Legacy's `PostsWrapper` has no fill.
 */

const post = (id: string) => ({ id })
const groups = [
    { channelId: 'a', createdAt: null, posts: [post('a1'), post('a2'), post('a3')] },
    { channelId: 'b', createdAt: null, posts: [post('b1')] },
]

vi.mock('../hooks/use-home-feed', () => ({
    useHomeFeed: () => ({
        groups,
        expanded: new Set<string>(['a1']),
        toggleGroup: () => {},
        hideChannel: () => {},
        isLoading: false,
        isError: false,
        isEmpty: false,
        isSignedOut: false,
        refetch: () => {},
        fetchNextPage: () => {},
        hasNextPage: false,
        isFetchingNextPage: false,
        needsMore: false,
    }),
}))
vi.mock('@features/channel', () => ({
    useMyChannel: () => ({ isPremium: false }),
    WhatsNewBar: () => null,
}))
vi.mock('@features/share', () => ({ ShareDialog: () => null, postShareContext: () => null }))
vi.mock('@shared/hooks/use-in-view', () => ({ useInView: () => [() => {}, false] }))
vi.mock('@features/post', () => ({
    PostCard: ({ post, className }: { post: { id: string }; className?: string }) => (
        <article data-card-id={post.id} className={className}>
            post
        </article>
    ),
    PostSlider: () => null,
    usePostSlider: () => ({
        open: null,
        slides: [],
        openAt: () => {},
        goTo: () => {},
        close: () => {},
    }),
}))

const { HomePostFeed } = await import('./home-post-feed')

describe('HomePostFeed — the line between posts', () => {
    it('lets the page colour through between two posts of one group, as between groups', () => {
        render(<HomePostFeed />)

        const cards = [...document.querySelectorAll('article')]
        expect(cards).toHaveLength(4)
        // Each card is opaque, so the gap is the only place the page shows.
        for (const card of cards) expect(card.className).toContain('bg-(--background-surface)')

        const group = cards[0]?.parentElement
        expect(group?.children).toHaveLength(3)
        expect(group?.className).toContain('gap-px')
        // ⚠ And the group itself paints nothing, or its gap is white.
        expect(group?.className).not.toContain('bg-(--background-surface)')
    })
})
