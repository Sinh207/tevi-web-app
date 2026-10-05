// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Post } from '../api/types'
import type { UseBookmarksResult } from '../hooks/use-bookmarks'

/**
 * `/bookmarks` renders the same expensive row a feed does, and the claim worth pinning is that it
 * **stops rendering the ones nobody is looking at**.
 *
 * A bookmark list is where a reader accumulates rows deliberately and over years, so "it renders"
 * and "it renders four hundred `PostCard`s" look identical until the tab is unusable. Neither a
 * screenshot nor a type can tell them apart.
 *
 * ## ⚠ What the first version of this file got wrong, and it is worth keeping
 *
 * It asserted ten cards straight after `render`, on the reading that `useRenderWindow`'s
 * `minimum: 10` caps the render. It does not. `heightFor` answers `null` for a row that has
 * **never been measured**, and `null` means *render it* — so before the observer has reported
 * anything, every fetched row is drawn. The window is what trims the list afterwards, not what
 * bounds its first paint. (That is fine in the product: a page is twelve rows, not four hundred.)
 *
 * So the observer is driven by hand below, exactly as `use-render-window.test.tsx` drives it: jsdom
 * ships none and does no layout, so visibility and height are both fed in. That is the honest
 * version of the claim — *once the reader is somewhere, the rows they are not at stand down*.
 *
 * The hook is mocked rather than the network: what is under test is the list's own behaviour, and a
 * query client, an auth provider and a Firebase bootstrap would all have to be stood up to reach
 * the same assertion by a longer road.
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

const state: { current: UseBookmarksResult } = {
    current: {
        posts: [],
        total: 0,
        isLoading: false,
        isError: false,
        isEmpty: false,
        isSignedOut: false,
        refetch: () => {},
        hasNextPage: false,
        isFetchingNextPage: false,
        loadMore: () => {},
        clearAll: () => {},
        isClearing: false,
    },
}

vi.mock('../hooks/use-bookmarks', () => ({ useBookmarks: () => state.current }))

/* The card is the expensive thing being counted; what it draws is `post-card.tsx`'s business. */
vi.mock('./post-card', () => ({
    PostCard: ({ post, testId }: { post: Post; testId?: string }) => (
        <article data-testid={testId} data-card-id={post.id} />
    ),
}))

vi.mock('@features/share', () => ({
    ShareDialog: () => null,
    postShareContext: () => null,
}))

const { BookmarkList } = await import('./bookmark-list')

function post(id: string): Post {
    return { id, text: `post ${id}` } as unknown as Post
}

function setState(next: Partial<UseBookmarksResult>) {
    state.current = { ...state.current, ...next }
}

function cards() {
    return document.querySelectorAll('[data-testid="post-bookmarks-item"]').length
}

function wrappers() {
    return document.querySelectorAll('[data-window-key]').length
}

/** Drain the hook's settle debounce. */
function settle() {
    act(() => {
        vi.advanceTimersByTime(200)
    })
}

beforeEach(() => {
    vi.useFakeTimers()
    observed = []
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    setState({
        posts: [],
        isLoading: false,
        isError: false,
        isEmpty: false,
        isSignedOut: false,
        hasNextPage: false,
        isFetchingNextPage: false,
    })
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('BookmarkList', () => {
    /**
     * ⚠ The requirement: a long list does not keep a card mounted for every row. Thirty bookmarks,
     * three of them on screen — what is left is a handful (the visible run plus `overscan`), not
     * thirty.
     *
     * Every row keeps its **wrapper**, which is what holds the list's height and therefore the
     * reader's scroll position. `use-render-window.ts` explains why a row is stood down only after
     * it has been measured: one that collapsed to nothing while above the viewport would drag the
     * page out from under them.
     */
    it('stands rows down once it knows where the reader is', () => {
        setState({ posts: Array.from({ length: 30 }, (_, index) => post(`p${index}`)) })
        render(<BookmarkList />)

        // Nothing measured yet, so nothing can be stood down — see this file's header.
        expect(cards()).toBe(30)

        act(() => {
            fire(
                Array.from({ length: 30 }, (_, index) => ({
                    key: `p${index}`,
                    isIntersecting: index >= 10 && index <= 12,
                    height: 400,
                })),
            )
        })
        settle()

        expect(cards()).toBeLessThan(15)
        expect(cards()).toBeGreaterThan(0)
        // The list is still thirty rows long; it is the cards that went.
        expect(wrappers()).toBe(30)
    })

    /** A list shorter than the window is drawn whole — the floor is not padding. */
    it('draws a short list in full', () => {
        setState({ posts: [post('a'), post('b'), post('c')] })
        render(<BookmarkList />)
        expect(cards()).toBe(3)
    })

    /**
     * The three states that are not a list, in the order the component checks them. Signed-out wins
     * over loading: a guest's query never runs, so `isLoading` would otherwise strand them on a
     * skeleton that resolves to nothing.
     */
    it.each([
        [{ isSignedOut: true, isLoading: true }, 'bookmarks_signed_out'],
        [{ isError: true }, 'bookmarks_error'],
        [{ isEmpty: true }, 'bookmarks_empty'],
    ])('shows a notice for %o', (flags, key) => {
        setState(flags)
        render(<BookmarkList />)
        // No i18n instance in this environment, so `t` answers with the key — which is the assertion.
        expect(screen.getByTestId('post-bookmarks-message').textContent).toContain(key)
    })

    it('draws a skeleton while the first page is in flight', () => {
        setState({ isLoading: true })
        render(<BookmarkList />)
        expect(screen.getByTestId('post-bookmarks-list').getAttribute('aria-busy')).toBe('true')
        expect(cards()).toBe(0)
    })

    /**
     * A guest with no way in is shown a sentence and no button — the prompt raises a dialog the
     * route cannot open for itself, so without the handler there would be nothing to press.
     */
    it('offers sign-in only when the host can open it', () => {
        setState({ isSignedOut: true })
        const { unmount } = render(<BookmarkList />)
        expect(screen.queryByTestId('post-bookmarks-retry')).toBeNull()
        unmount()

        render(<BookmarkList onSignIn={() => {}} />)
        expect(screen.queryByTestId('post-bookmarks-retry')).not.toBeNull()
    })
})
