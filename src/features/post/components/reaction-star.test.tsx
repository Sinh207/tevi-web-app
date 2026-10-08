// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * The reaction star is **the sprite's glyph**, so it follows the theme — the Lottie file's own star
 * layers were baked `#1B1B1B` and disappeared on a dark page. What is pinned here is the split: the
 * glyph at rest, the file only for the burst, and the burst with its star layers left out.
 */

const lottie = vi.fn()
vi.mock('@shared/components/lottie-animation', () => ({
    LottieAnimation: (props: Record<string, unknown>) => {
        lottie(props)
        return <span data-lottie="" />
    },
}))
let mayAnimate = true
vi.mock('@shared/hooks/use-may-animate', () => ({ useMayAnimate: () => mayAnimate }))

const { ReactionStar, REACTED_FRAME } = await import('./reaction-star')

const href = () => document.querySelector('use')?.getAttribute('href') ?? ''

describe('ReactionStar', () => {
    it('draws the sprite’s outline star at rest, and no animation', () => {
        render(<ReactionStar reacted={false} burstKey={0} onBurstEnd={() => {}} size="post" />)
        expect(href()).toMatch(/#star$/)
        // The action row's ink, like comment, send, bookmark and share beside it.
        expect(document.querySelector('svg')?.getAttribute('class')).toContain('--icon-secondary')
        expect(document.querySelector('[data-lottie]')).toBeNull()
    })

    it('draws the filled star once reacted', () => {
        render(<ReactionStar reacted burstKey={0} onBurstEnd={() => {}} size="post" />)
        expect(href()).toMatch(/#star--filled$/)
    })

    it('plays the burst once on a reacting press, without the file’s own star layers', () => {
        lottie.mockClear()
        mayAnimate = true
        render(<ReactionStar reacted burstKey={1} onBurstEnd={() => {}} size="post" />)
        expect(lottie).toHaveBeenCalledTimes(1)
        expect(lottie.mock.calls[0][0]).toMatchObject({
            once: [0, REACTED_FRAME],
            hideLayers: ['Unselect.png', 'Select'],
        })
    })

    it('skips the burst for a reader who asked for less motion', () => {
        lottie.mockClear()
        mayAnimate = false
        render(<ReactionStar reacted burstKey={1} onBurstEnd={() => {}} size="post" />)
        expect(lottie).not.toHaveBeenCalled()
        expect(href()).toMatch(/#star--filled$/)
    })
})
