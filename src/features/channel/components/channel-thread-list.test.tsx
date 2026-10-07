// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Media grid keeps a space's whole media history in one list, and the claim worth pinning is
 * the one `bookmark-list.test.tsx` pins for posts: **tiles the reader is nowhere near are not
 * mounted**. Legacy's grid does the same (`useInView(24)`); without it a space with a long history
 * holds an image, an unlock flow and a set of pills per post ever fetched.
 *
 * The other half is that every **cell** stays: a cell is `aspect-square` in a three-column track,
 * so it keeps the grid's shape — and the reader's scroll position — with no tile inside it.
 *
 * The observer is driven by hand, as in `use-render-window.test.tsx`: jsdom ships none and does no
 * layout. The data hook and the tile are mocked; what is under test is the list's windowing.
 */

let observed: Element[] = []
let fire: (entries: { key: string; isIntersecting: boolean; height: number }[]) => void = () => {}

class FakeObserver {
    constructor(private readonly callback: IntersectionObserverCallback) {
        fire = updates => {
            this.callback(
                updates.map(
                    update =>
                        ({
                            target: elementFor(update.key),
                            isIntersecting: update.isIntersecting,
                            boundingClientRect: { height: update.height } as DOMRectReadOnly,
                        }) as unknown as IntersectionObserverEntry,
                ),
                this as unknown as IntersectionObserver,
            )
        }
    }
    observe(element: Element) {
        observed.push(element)
    }
    unobserve(element: Element) {
        observed = observed.filter(candidate => candidate !== element)
    }
    disconnect() {
        observed = []
    }
}

function elementFor(key: string): Element {
    const found = observed.find(element => element.getAttribute('data-window-key') === key)
    if (!found) throw new Error(`nothing observed for ${key}`)
    return found
}

const threads = { current: [] as { id: string }[] }

vi.mock('../hooks/use-channel-threads', () => ({
    useChannelThreads: () => ({
        threads: threads.current,
        isLoading: false,
        isError: false,
        isEmpty: threads.current.length === 0,
        refetch: () => {},
        fetchNextPage: () => {},
        hasNextPage: false,
        isFetchingNextPage: false,
    }),
}))
const pinned = { current: [] as { id: string }[] }

vi.mock('../hooks/use-pinned-threads', () => ({
    usePinnedThreads: () => ({ pinned: pinned.current, isLoading: false, refetch: () => {} }),
}))
vi.mock('./whats-new-bar', () => ({
    WhatsNewBar: ({ testId }: { testId?: string }) => <div data-testid={testId}>whats new</div>,
}))
vi.mock('../providers/my-channel-provider', () => ({ useMyChannel: () => ({ isPremium: false }) }))
vi.mock('@shared/hooks/use-in-view', () => ({ useInView: () => [() => {}, false] }))
vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@features/share', () => ({ ShareDialog: () => null, postShareContext: () => null }))
vi.mock('@features/post', () => ({
    PostCard: ({ testId }: { testId?: string }) => <article data-testid={testId}>post</article>,
    PostSlider: () => null,
    // Its own queries and its own tests (`use-collection-posts.test.tsx`); nothing to assert here.
    SpaceCollectionsRow: () => null,
    usePostSlider: () => ({ open: null, openAt: () => {}, goTo: () => {}, close: () => {} }),
    PostMediaTile: ({ post, testId }: { post: { id: string }; testId?: string }) => (
        <a data-testid={testId} data-card-id={post.id} href="#tile">
            tile
        </a>
    ),
}))

const { ChannelThreadList } = await import('./channel-thread-list')

const TOTAL = 90

function tiles() {
    return document.querySelectorAll('[data-testid="channel-media"]').length
}

function cells() {
    return document.querySelectorAll('[data-window-key]').length
}

beforeEach(() => {
    vi.useFakeTimers()
    observed = []
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    threads.current = Array.from({ length: TOTAL }, (_, index) => ({ id: `m${index}` }))
    pinned.current = []
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('ChannelThreadList — media', () => {
    it('stands tiles down once it knows where the reader is, and keeps every cell', () => {
        render(<ChannelThreadList slug="ada" kind="media" isOwner={false} />)

        // Nothing measured yet, so nothing can be stood down.
        expect(tiles()).toBe(TOTAL)

        // Rows 15–17 on screen: tiles 45–53.
        act(() => {
            fire(
                threads.current.map((thread, index) => ({
                    key: thread.id,
                    isIntersecting: index >= 45 && index <= 53,
                    height: 120,
                })),
            )
        })
        act(() => {
            vi.advanceTimersByTime(200)
        })

        const mounted = [...document.querySelectorAll('[data-testid="channel-media"]')].map(
            element => Number(element.getAttribute('data-card-id')?.slice(1)),
        )
        /*
         * The visible run plus three rows either side, and nothing from the far ends. 36 and 62
         * are the claim about `MEDIA_WINDOW`: the hook's default overscan of four *tiles* is barely
         * a row, and would have stood both down.
         */
        expect(mounted).toContain(45)
        expect(mounted).toContain(53)
        expect(mounted).toContain(36)
        expect(mounted).toContain(62)
        expect(mounted).not.toContain(0)
        expect(mounted).not.toContain(TOTAL - 1)
        expect(tiles()).toBeLessThan(TOTAL / 2)

        // The grid is still ninety cells long; it is the tiles that went.
        expect(cells()).toBe(TOTAL)
    })
})

/**
 * The line between two posts, which is a **gap over a different colour** rather than a border —
 * home's arrangement and legacy's own (`gap: '1px'` over `#f4f4f4`).
 *
 * It is worth a test because its failure mode is invisible in the markup: get either half wrong and
 * the list still renders, still scrolls, still passes every other assertion — two posts simply run
 * together with no boundary, which is the bug this pins. That is exactly what shipped: the tab panel
 * paints `--background-surface`, so rows with no colour of their own were the same colour as what
 * was behind them.
 */
describe('ChannelThreadList — posts', () => {
    it('separates rows with a page-coloured strip showing through a 1px gap', () => {
        threads.current = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]
        render(<ChannelThreadList slug="ada" kind="posts" isOwner={false} />)

        const rows = [...document.querySelectorAll('[data-window-key]')]
        expect(rows).toHaveLength(3)
        // Each row is opaque, so the strip only shows where the rows are not.
        for (const row of rows) expect(row.className).toContain('bg-(--background-surface)')

        const strip = rows[0]?.parentElement
        expect(strip?.className).toContain('gap-px')
        // ⚠ The strip paints the page colour itself — there is nothing behind it that would.
        expect(strip?.className).toContain('bg-(--background)')
        /*
         * ⚠ And it reaches both edges. The panel around it is `CHANNEL_PADDING`, and a separator
         * that stops short of the edges reads as a notch in one card rather than as the boundary
         * between two — which is the second half of the same bug, and just as invisible in markup.
         */
        expect(strip?.className).toContain('-mx-3')
        expect(strip?.className).toContain('md:-mx-6')
    })
})

/**
 * The pinned post is fetched on its own (`pinned=1`) because the list asks for `pinned: 0` — and
 * before it was fetched at all, a pinned post simply vanished from its space. Legacy draws it above
 * the list under a *Pinned* heading; so must this, and it must not be windowed away with the rest.
 */
describe('ChannelThreadList — pinned', () => {
    it('draws the pinned post above the list, under its heading', () => {
        threads.current = [{ id: 'p1' }, { id: 'p2' }]
        pinned.current = [{ id: 'pin' }]
        render(<ChannelThreadList slug="ada" kind="posts" isOwner />)

        const heading = document.querySelector('[data-testid="channel-pinned-title"]')
        expect(heading?.textContent).toBe('post_pinned')

        const pinnedCard = document.querySelector('[data-testid="channel-pinned"]')
        const firstRow = document.querySelector('[data-window-key]')
        expect(pinnedCard).not.toBeNull()
        // Before the first ordinary row in document order.
        expect(
            pinnedCard && firstRow
                ? pinnedCard.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING
                : 0,
        ).toBeTruthy()
        // Outside the render window: one post, always mounted.
        expect(pinnedCard?.closest('[data-window-key]')).toBeNull()
    })

    it('is not an empty space when the pinned post is its only post', () => {
        threads.current = []
        pinned.current = [{ id: 'pin' }]
        render(<ChannelThreadList slug="ada" kind="posts" isOwner />)

        expect(document.querySelector('[data-testid="channel-pinned"]')).not.toBeNull()
    })

    it('is not drawn on the media tab', () => {
        pinned.current = [{ id: 'pin' }]
        render(<ChannelThreadList slug="ada" kind="media" isOwner={false} />)

        expect(document.querySelector('[data-testid="channel-pinned-title"]')).toBeNull()
    })
})

/**
 * Legacy's creator Posts tab heads with *What's new?* in every state — an empty space included,
 * which is where it matters — and a visitor never sees it.
 */
describe('ChannelThreadList — What’s new', () => {
    const bar = () => document.querySelector('[data-testid="channel-composer"]')

    it('heads the owner’s Posts tab, above the pinned post', () => {
        threads.current = [{ id: 'p1' }]
        pinned.current = [{ id: 'pin' }]
        render(<ChannelThreadList slug="ada" kind="posts" isOwner />)

        const pinnedCard = document.querySelector('[data-testid="channel-pinned"]')
        expect(bar()).not.toBeNull()
        expect(
            bar() && pinnedCard
                ? bar()!.compareDocumentPosition(pinnedCard) & Node.DOCUMENT_POSITION_FOLLOWING
                : 0,
        ).toBeTruthy()
    })

    it('stays on an empty space', () => {
        threads.current = []
        render(<ChannelThreadList slug="ada" kind="posts" isOwner />)
        expect(bar()).not.toBeNull()
    })

    it('is never drawn for a visitor, nor on the media tab', () => {
        render(<ChannelThreadList slug="ada" kind="posts" isOwner={false} />)
        expect(bar()).toBeNull()
        render(<ChannelThreadList slug="ada" kind="media" isOwner />)
        expect(bar()).toBeNull()
    })
})
