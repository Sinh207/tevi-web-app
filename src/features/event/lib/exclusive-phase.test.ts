import { describe, expect, it } from 'vitest'
import { type ExclusivePreviewInput, exclusivePhase } from './exclusive-phase'

const idle: ExclusivePreviewInput = {
    isLoading: false,
    isPlaying: false,
    isComplete: false,
    isExhausted: false,
    isRefused: false,
}

type Args = Parameters<typeof exclusivePhase>[0]

const phase = (
    over: Partial<Omit<Args, 'preview'>> & { preview?: Partial<ExclusivePreviewInput> } = {},
) =>
    exclusivePhase({
        state: 'locked',
        isGuest: false,
        isResolving: false,
        isKickedOut: false,
        ...over,
        preview: { ...idle, ...over.preview },
    })

describe('exclusivePhase', () => {
    it('does not apply to a reader who can watch, or to another refusal', () => {
        expect(phase({ state: 'watchable', preview: { isPlaying: true } })).toBeNull()
        expect(phase({ state: 'off-air' })).toBeNull()
        // A signed-in reader on a free stream simply watches.
        expect(phase({ state: 'watchable' })).toBeNull()
        expect(phase({ isKickedOut: true })).toBeNull()
    })

    /** Legacy's `!isAuthenticated → LivePreview`: a guest previews any live stream, free or not. */
    it('applies to a guest on a free stream as well as a gated one', () => {
        expect(phase({ state: 'watchable', isGuest: true, preview: { isPlaying: true } })).toBe(
            'preview',
        )
        expect(phase({ state: 'locked', isGuest: true, preview: { isPlaying: true } })).toBe(
            'preview',
        )
    })

    /** Asking under the anonymous session of somebody about to be restored spends their look. */
    it('waits while the session is still being established', () => {
        expect(phase({ isResolving: true, preview: { isPlaying: false } })).toBe('loading')
    })

    it('walks loading → preview → closed as the sample runs', () => {
        expect(phase({ preview: { isLoading: true } })).toBe('loading')
        expect(phase({ preview: { isPlaying: true } })).toBe('preview')
        expect(phase({ preview: { isComplete: true } })).toBe('closed')
    })

    /** No preview for somebody who was just watching — closed even over a sample in flight. */
    it('closes at once on a mid-watch lock', () => {
        expect(phase({ isLockedByRoom: true, preview: { isPlaying: true } })).toBe('closed')
        expect(phase({ isLockedByRoom: true, preview: { isLoading: true } })).toBe('closed')
    })

    it('closes when the device has had its three looks', () => {
        expect(phase({ preview: { isExhausted: true } })).toBe('closed')
    })

    it('closes when the backend refuses the preview', () => {
        expect(phase({ preview: { isRefused: true } })).toBe('closed')
    })

    /** A refused or failed request is not "still loading" — no spinner that never resolves. */
    it('closes when the preview came back without a stream', () => {
        expect(phase()).toBe('closed')
    })
})
