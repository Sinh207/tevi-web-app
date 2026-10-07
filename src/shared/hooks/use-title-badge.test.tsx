// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTitleBadge } from './use-title-badge'

function Probe({ count }: { count: number }) {
    useTitleBadge(count)
    return null
}

beforeEach(() => {
    document.head.innerHTML = '<title>Home · Tevi</title>'
})

describe('useTitleBadge', () => {
    it('prefixes the count, caps it at 99+, and clears it at zero', () => {
        const { rerender } = render(<Probe count={3} />)
        expect(document.title).toBe('(3) Home · Tevi')

        rerender(<Probe count={120} />)
        expect(document.title).toBe('(99+) Home · Tevi')

        rerender(<Probe count={0} />)
        expect(document.title).toBe('Home · Tevi')
    })

    /*
     * The reason for the observer: Next rewrites the title on every navigation, and a prefix written
     * once would be gone on the next page.
     */
    it('puts the prefix back when the route rewrites the title', async () => {
        render(<Probe count={2} />)
        document.title = 'Following · Tevi'
        await waitFor(() => expect(document.title).toBe('(2) Following · Tevi'))
    })

    it('leaves a title that merely starts with a bracket alone', () => {
        document.title = '(Beta) Studio · Tevi'
        render(<Probe count={0} />)
        expect(document.title).toBe('(Beta) Studio · Tevi')
    })

    it('restores the bare title when it unmounts', () => {
        const { unmount } = render(<Probe count={5} />)
        unmount()
        expect(document.title).toBe('Home · Tevi')
    })
})
