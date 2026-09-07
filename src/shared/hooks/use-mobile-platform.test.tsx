// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMobilePlatform } from './use-mobile-platform'

/**
 * The answer decides **which store listing opens**, so the two cases worth pinning are the one that
 * must not fire on the server and the one every naive sniff gets wrong.
 */
function probe(userAgent: string, maxTouchPoints = 0) {
    vi.stubGlobal('navigator', { userAgent, maxTouchPoints })
    const seen: (string | null)[] = []
    function Probe() {
        seen.push(useMobilePlatform())
        return null
    }
    render(<Probe />)
    return seen
}

afterEach(() => vi.unstubAllGlobals())

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

describe('useMobilePlatform', () => {
    it('answers null first, so the server and the hydrated tree agree', () => {
        expect(probe(IPHONE)[0]).toBeNull()
    })

    it('recognises iPhone and Android', () => {
        expect(probe(IPHONE).at(-1)).toBe('ios')
        expect(probe(ANDROID).at(-1)).toBe('android')
    })

    it('recognises an iPad, which claims to be a Mac', () => {
        // Since iPadOS 13 the UA says `Macintosh`; touch points are what tell them apart. A `/iPad/`
        // test quietly stopped matching iPads years ago.
        expect(probe(MAC, 5).at(-1)).toBe('ios')
    })

    it('leaves a desktop alone', () => {
        expect(probe(MAC).at(-1)).toBeNull()
        expect(probe('Mozilla/5.0 (Windows NT 10.0; Win64; x64)').at(-1)).toBeNull()
    })
})
