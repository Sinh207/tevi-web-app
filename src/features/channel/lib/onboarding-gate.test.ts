import { describe, expect, it } from 'vitest'
import { isOnboardingExemptPath, onboardingGate } from './onboarding-gate'

const CHANNEL = { slug: 'ada' }

/** A signed-in account whose channel has resolved. Each test perturbs one thing. */
const base = {
    isAuthenticated: true,
    myChannel: CHANNEL as { slug: string } | null | undefined,
    isLoading: false,
    isError: false,
    isExemptRoute: false,
}

describe('onboardingGate', () => {
    it('lets a signed-in account with a channel through', () => {
        expect(onboardingGate(base)).toBe('ready')
    })

    /** The product rule: a real account with no space cannot use the app. */
    it('demands a channel when the account demonstrably has none', () => {
        expect(onboardingGate({ ...base, myChannel: null })).toBe('needs-channel')
    })

    /**
     * The app always keeps a session, so most visitors are anonymous. Legacy gets this right only as
     * a side effect of `isAuthenticated` excluding anonymous; asking a browsing stranger to create a
     * space would be the worst possible regression here.
     */
    it('never asks an anonymous or signed-out visitor for a channel', () => {
        expect(onboardingGate({ ...base, isAuthenticated: false, myChannel: null })).toBe('open')
        expect(onboardingGate({ ...base, isAuthenticated: false, myChannel: undefined })).toBe(
            'open',
        )
    })

    /**
     * Legacy renders `null` here, blanking the whole app on every cold load for every user. Nothing
     * else in this codebase blocks the tree on a session request, so `'open'` is both better and
     * consistent.
     */
    it('renders the app while the answer is still unknown', () => {
        expect(onboardingGate({ ...base, myChannel: undefined, isLoading: true })).toBe('open')
        // Settled-but-undefined should not gate either — that is a disabled query, not an answer.
        expect(onboardingGate({ ...base, myChannel: undefined })).toBe('open')
    })

    /**
     * Legacy pushes to `/500` on any non-200/404, so one flaky endpoint takes the entire app down.
     * "We do not know" must never be read as "you have no channel".
     */
    it('does not gate on a failed lookup', () => {
        expect(onboardingGate({ ...base, myChannel: undefined, isError: true })).toBe('open')
        expect(onboardingGate({ ...base, myChannel: null, isError: true })).toBe('open')
    })

    /**
     * `/login` is how you become the account being checked, and `/app/*` is a WebView the native app
     * drives — replacing a legal-text screen in there with a create-space prompt would trap the user
     * somewhere they cannot navigate out of.
     */
    it('never interrupts an exempt route, even for an account with no channel', () => {
        expect(onboardingGate({ ...base, myChannel: null, isExemptRoute: true })).toBe('open')
    })
})

describe('isOnboardingExemptPath', () => {
    it('exempts the auth routes and the whole webview namespace', () => {
        for (const path of [
            '/login',
            '/login/email',
            '/signup',
            '/app',
            '/app/terms',
            '/app/privacy/tevi-premium',
        ]) {
            expect(isOnboardingExemptPath(path), path).toBe(true)
        }
    })

    it('does not exempt an ordinary page', () => {
        for (const path of ['/', '/@ada', '/my-space', '/brand-assets', '/privacy', '/terms']) {
            expect(isOnboardingExemptPath(path), path).toBe(false)
        }
    })

    /**
     * `/application` must not be swallowed by the `/app` check — a prefix test without the boundary
     * would exempt every route starting with those four letters.
     */
    it('matches on a path boundary, not a bare prefix', () => {
        expect(isOnboardingExemptPath('/application')).toBe(false)
        expect(isOnboardingExemptPath('/apps')).toBe(false)
        expect(isOnboardingExemptPath('/logins')).toBe(false)
    })
})
