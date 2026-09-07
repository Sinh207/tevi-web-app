import { describe, expect, it } from 'vitest'
import { checkoutReturnUrl, checkoutReturnUrls } from './return-url'

describe('checkoutReturnUrl', () => {
    it('builds an absolute URL on the app own origin', () => {
        expect(checkoutReturnUrl('/@ada')).toBe('https://tevi.dev/@ada')
    })

    it('keeps the screen own parameters and drops the callback ones', () => {
        expect(
            checkoutReturnUrl(
                '/@ada',
                'tab=posts&payment_intent_client_secret=s&redirect_status=x',
            ),
        ).toBe('https://tevi.dev/@ada?tab=posts')
    })

    it('refuses to be pointed anywhere but this origin', () => {
        for (const path of ['//evil.example/x', 'https://evil.example/x', '/\\evil.example']) {
            expect(checkoutReturnUrl(path)).toBe('https://tevi.dev/')
        }
    })

    it('has no query when nothing survives the filter', () => {
        expect(checkoutReturnUrl('/premium', 'payment_intent_client_secret=s')).toBe(
            'https://tevi.dev/premium',
        )
    })
})

describe('checkoutReturnUrls', () => {
    it('sends the same URL for both outcomes — the verdict comes from the backend', () => {
        const { successUrl, failUrl } = checkoutReturnUrls('/my-star')
        expect(successUrl).toBe('https://tevi.dev/my-star')
        expect(failUrl).toBe(successUrl)
    })
})
