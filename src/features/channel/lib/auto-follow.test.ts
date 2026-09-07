import { describe, expect, it } from 'vitest'
import { AUTO_FOLLOW_SECONDS, shouldCountDown } from './auto-follow'

const RUNNING = {
    isAuthenticated: true,
    autoFollow: true,
    isFollowed: false,
    skipped: false,
    isVisible: true,
}

describe('shouldCountDown', () => {
    it('runs when the account opted in and is looking at the page', () => {
        expect(shouldCountDown(RUNNING)).toBe(true)
    })

    it('stops for each thing that makes the countdown meaningless', () => {
        // A guest has no account to follow with — the bar is still shown, it just does not act.
        expect(shouldCountDown({ ...RUNNING, isAuthenticated: false })).toBe(false)
        // Off is the default, and off means the bar is a plain invitation.
        expect(shouldCountDown({ ...RUNNING, autoFollow: false })).toBe(false)
        // Nothing to count towards.
        expect(shouldCountDown({ ...RUNNING, isFollowed: true })).toBe(false)
        // "Skip" dismisses the automatic action.
        expect(shouldCountDown({ ...RUNNING, skipped: true })).toBe(false)
    })

    it('stops while the tab is in the background', () => {
        // Legacy has no such clause, so it follows a space that was opened and never looked at —
        // while the setting promises "once you have viewed it for N seconds".
        expect(shouldCountDown({ ...RUNNING, isVisible: false })).toBe(false)
    })

    it('keeps legacy’s duration', () => {
        expect(AUTO_FOLLOW_SECONDS).toBe(10)
    })
})
