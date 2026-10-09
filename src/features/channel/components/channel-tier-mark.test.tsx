// @vitest-environment jsdom
import { VERIFIED_BADGE_TIER } from '@shared/components/verified-badge-size'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChannelTierMark } from './channel-tier-mark'

const IMAGE = 'https://static.stg.tevicdn.com/space-tier/tier-2.png'

/**
 * The space page's tier mark. The gate is `spaceTierBadge`'s and is tested there; what this file
 * pins is that the page actually *uses* it (tier 0 arrives with an image and must draw nothing),
 * that the mark is a control with a name of its own, and that it is sized off the same table as
 * every other tier mark — the drift this mark was added to stop.
 */
describe('ChannelTierMark', () => {
    it('draws nothing for tier 0, even with an image', () => {
        const { container } = render(
            <ChannelTierMark channel={{ slug: 'ada', space_tier: 0, space_tier_image: IMAGE }} />,
        )
        expect(container.innerHTML).toBe('')
    })

    it('is a named button, sized for a title-tier name', () => {
        render(
            <ChannelTierMark
                channel={{ slug: 'ada', space_tier: 2, space_tier_image: IMAGE }}
                testId="channel-tier-badge"
            />,
        )
        const button = screen.getByRole('button')
        expect(button.getAttribute('aria-haspopup')).toBe('dialog')
        expect(button.getAttribute('aria-label')).toBeTruthy()
        const img = button.querySelector('img')
        expect(img?.style.height).toBe(`${VERIFIED_BADGE_TIER.title}px`)
    })
})
