// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CDN_CAMERA_FALLBACK_LAG_MS, CDN_CAMERA_MAX_HOLD_MS, useCdnCamera } from './use-cdn-camera'

let shown: boolean

function Probe({ payload, picture }: { payload: boolean; picture: boolean | null }) {
    shown = useCdnCamera(payload, picture)
    return null
}

function wait(ms: number) {
    act(() => {
        vi.advanceTimersByTime(ms)
    })
}

describe('useCdnCamera', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => {
        cleanup()
        vi.useRealTimers()
    })

    it('keeps the video while the payload says off but the picture is still moving', () => {
        const { rerender } = render(<Probe payload picture />)
        rerender(<Probe payload={false} picture />)
        wait(5000)
        expect(shown).toBe(true)

        // The rendition catches up: the frames go still.
        rerender(<Probe payload={false} picture={false} />)
        expect(shown).toBe(false)
    })

    it('keeps the avatar while the payload says on but the picture is still dead', () => {
        const { rerender } = render(<Probe payload={false} picture={false} />)
        rerender(<Probe payload picture={false} />)
        wait(5000)
        expect(shown).toBe(false)

        rerender(<Probe payload picture />)
        expect(shown).toBe(true)
    })

    it('believes the payload once a disagreement outlives the backstop', () => {
        const { rerender } = render(<Probe payload picture />)
        // A live camera on a still wall reads as a still picture.
        rerender(<Probe payload={false} picture />)
        wait(CDN_CAMERA_MAX_HOLD_MS - 1)
        expect(shown).toBe(true)
        wait(1)
        expect(shown).toBe(false)
    })

    it('falls back to a fixed lag when the picture cannot be read', () => {
        const { rerender } = render(<Probe payload picture={null} />)
        rerender(<Probe payload={false} picture={null} />)
        wait(CDN_CAMERA_FALLBACK_LAG_MS - 1)
        expect(shown).toBe(true)
        wait(1)
        expect(shown).toBe(false)
    })

    it('does not flicker when a stall stills a picture the payload says is on', () => {
        const { rerender } = render(<Probe payload picture />)
        rerender(<Probe payload picture={false} />)
        wait(CDN_CAMERA_MAX_HOLD_MS * 2)
        expect(shown).toBe(true)
    })
})
