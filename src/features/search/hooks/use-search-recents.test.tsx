// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSearchRecents } from './use-search-recents'

/**
 * The one thing about this hook that only a render can state: **two mounted copies see the same
 * list.**
 *
 * That is not a hypothetical invariant. The search screen mounts this hook twice — `useChannelSearch`
 * to write a term when the reader commits one, `SearchView` to render the list — and the first
 * version of it mirrored `localStorage` into `useState`, so the two held independent copies. Pressing
 * Enter and then clearing the field showed a Recents list with the term you had just searched missing
 * from it, and every unit test of the storage module passed while it did. `useSyncExternalStore` is
 * the fix, and this is the assertion that would have caught the bug.
 *
 * The storage rules themselves — the cap, the case-folding, the per-account isolation — belong to
 * `shared/lib/search-recents.test.ts` and are not repeated here.
 */

const auth = vi.hoisted(() => ({ state: { activeId: 'acc-1' } }))
vi.mock('@features/auth', () => ({ useAuth: () => auth.state }))

/** Two independent mounts of the hook, exactly as the real screen has. */
function mountPair() {
    let writer!: ReturnType<typeof useSearchRecents>
    let reader!: ReturnType<typeof useSearchRecents>
    let readerRenders = 0

    function Writer() {
        writer = useSearchRecents()
        return null
    }
    function Reader() {
        reader = useSearchRecents()
        readerRenders += 1
        return null
    }
    const view = render(
        <>
            <Writer />
            <Reader />
        </>,
    )
    return {
        writer: () => writer,
        reader: () => reader,
        renders: () => readerRenders,
        rerender: () =>
            view.rerender(
                <>
                    <Writer />
                    <Reader />
                </>,
            ),
    }
}

beforeEach(() => {
    window.localStorage.clear()
    auth.state = { activeId: 'acc-1' }
})

describe('useSearchRecents', () => {
    it('shows a term written through another mounted copy of itself', () => {
        const h = mountPair()
        expect(h.reader().recents).toEqual([])

        act(() => h.writer().remember('ada'))
        expect(h.reader().recents).toEqual(['ada'])
    })

    it('propagates a removal and a clear the same way', () => {
        const h = mountPair()
        act(() => h.writer().remember('ada'))
        act(() => h.writer().remember('grace'))
        expect(h.reader().recents).toEqual(['grace', 'ada'])

        act(() => h.writer().forget('grace'))
        expect(h.reader().recents).toEqual(['ada'])

        act(() => h.writer().clear())
        expect(h.reader().recents).toEqual([])
    })

    /**
     * `getSnapshot` must return a referentially stable value or `useSyncExternalStore` re-renders
     * forever. The empty case is the one that would do it — a fresh `[]` per call — which is why
     * the store hands back a shared constant.
     */
    it('returns a stable snapshot across renders, empty or not', () => {
        const h = mountPair()
        const emptyFirst = h.reader().recents
        h.rerender()
        expect(h.reader().recents).toBe(emptyFirst)

        act(() => h.writer().remember('ada'))
        const listed = h.reader().recents
        h.rerender()
        expect(h.reader().recents).toBe(listed)
    })

    /** A switch needs no effect: the snapshot is keyed on the active account. */
    it('follows the active account without a cleanup pass', () => {
        const h = mountPair()
        act(() => h.writer().remember('ada'))

        auth.state = { activeId: 'acc-2' }
        h.rerender()
        expect(h.reader().recents).toEqual([])

        auth.state = { activeId: 'acc-1' }
        h.rerender()
        expect(h.reader().recents).toEqual(['ada'])
    })

    /**
     * `isReady` — the flag that lets a screen tell "no history" from "not read yet".
     *
     * The claim is a **pair**: it is `false` in the server's HTML, which is the frame in which the
     * old code painted the *Search creators* prompt at every reader, and `true` on a mounted
     * client even when the list it guards is empty. Only the second half is a normal render
     * assertion; the first needs `renderToString`, because "what the server sent" is exactly the
     * value `getServerSnapshot` decides and no client render can observe it.
     */
    it('is not ready in the server render and is ready once mounted, empty list or not', async () => {
        const { renderToString } = await import('react-dom/server')

        function Probe() {
            const { isReady, recents } = useSearchRecents()
            return <span>{`${isReady}:${recents.length}`}</span>
        }

        expect(renderToString(<Probe />)).toContain('false:0')

        const view = render(<Probe />)
        expect(view.container.textContent).toBe('true:0')
    })

    /** No account id yet is not an error, and it is not a placeholder bucket either. */
    it('is inert with no account', () => {
        auth.state = { activeId: null } as unknown as { activeId: string }
        const h = mountPair()
        act(() => h.writer().remember('ada'))
        expect(h.reader().recents).toEqual([])
        expect(window.localStorage.length).toBe(0)
    })
})
