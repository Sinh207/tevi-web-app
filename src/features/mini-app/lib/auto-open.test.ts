import { describe, expect, it } from 'vitest'
import { autoOpenDecision } from './auto-open'

const base = { key: 'https://game.example/a', isAuthenticated: true, alreadyOpenedFor: null }

describe('autoOpenDecision', () => {
    it('opens the first time a signed-in reader enters a space with an app', () => {
        expect(autoOpenDecision(base)).toBe('open')
    })

    it('skips a space with no usable mini app — nearly every space', () => {
        expect(autoOpenDecision({ ...base, key: null })).toBe('skip')
    })

    it('skips a guest rather than raising the sign-in dialog on a page load', () => {
        // The Open button is still there to ask properly. See the doc on `isAuthenticated`.
        expect(autoOpenDecision({ ...base, isAuthenticated: false })).toBe('skip')
    })

    it('does not reopen an app it already opened — including after the reader closed it', () => {
        expect(autoOpenDecision({ ...base, alreadyOpenedFor: base.key })).toBe('skip')
    })

    it('opens the second app when the reader walks from one mini-app space to another', () => {
        /*
         * **The case legacy loses.** Its boolean ref is still `true` from the first space when the
         * open effect runs for the second, and the effect that resets it runs after — so the app
         * appears on the first mini-app space of a session and on no other.
         */
        expect(autoOpenDecision({ ...base, alreadyOpenedFor: 'https://game.example/other' })).toBe(
            'open',
        )
    })
})
