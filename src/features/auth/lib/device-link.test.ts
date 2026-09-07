// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { browserName, deviceLinkQrText } from './device-link'

/**
 * The string the phone reads before it approves a session. Everything asserted here is a wire
 * contract with the mobile scanner or a sentence a person acts on — neither is ours to improve.
 */

type NavigatorOverrides = { userAgent?: string; userAgentData?: { brands: { brand: string }[] } }

function withNavigator(overrides: NavigatorOverrides) {
    for (const [key, value] of Object.entries(overrides)) {
        Object.defineProperty(navigator, key, { value, configurable: true })
    }
}

afterEach(() => {
    // `userAgentData` is not a jsdom property, so it has to be removed rather than reset.
    Object.defineProperty(navigator, 'userAgentData', { value: undefined, configurable: true })
})

/** Decode the half the scanner actually parses. */
function decode(text: string) {
    expect(text.startsWith('device-link:token:')).toBe(true)
    return JSON.parse(atob(text.slice('device-link:token:'.length)))
}

describe('the payload', () => {
    it("carries the three fields legacy sends, under legacy's spellings", () => {
        withNavigator({ userAgent: 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36' })
        expect(decode(deviceLinkQrText({ token: 'dl-1', ip: '203.0.113.4' }))).toEqual({
            browser_name: 'Chrome',
            ip: '203.0.113.4',
            token: 'dl-1',
        })
    })

    it('keeps the ip key when the origin could not say', () => {
        withNavigator({ userAgent: 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36' })
        expect(decode(deviceLinkQrText({ token: 'dl-1' })).ip).toBe('')
    })

    it('survives a browser name btoa cannot encode', () => {
        // `btoa` throws above Latin-1, and a throw loses the whole code rather than one character.
        withNavigator({ userAgentData: { brands: [{ brand: 'Brave — 版' }] } })
        expect(decode(deviceLinkQrText({ token: 'dl-1' })).browser_name).toBe('Brave  ')
    })
})

describe('naming the browser', () => {
    it('prefers the product over the engine, and drops the decoy brands', () => {
        withNavigator({
            userAgentData: {
                brands: [
                    { brand: 'Not_A Brand' },
                    { brand: 'Chromium' },
                    { brand: 'Google Chrome' },
                ],
            },
        })
        expect(browserName()).toBe('Chrome')
    })

    it.each([
        ['Mozilla/5.0 Chrome/120 Safari/537.36 Edg/120', 'Edge'],
        ['Mozilla/5.0 Chrome/120 Safari/537.36 OPR/106', 'Opera'],
        ['Mozilla/5.0 SamsungBrowser/23 Chrome/115 Safari/537.36', 'Samsung Internet'],
        ['Mozilla/5.0 Firefox/121.0', 'Firefox'],
        ['Mozilla/5.0 CriOS/120 Mobile/15E148 Safari/604.1', 'Chrome'],
        ['Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36', 'Chrome'],
        ['Mozilla/5.0 Version/17.2 Safari/605.1.15', 'Safari'],
    ])('reads %s as %s', (userAgent, expected) => {
        // Order is the whole trick: every one of these except Firefox and Safari also says
        // `Chrome`, and all of them say `Safari`.
        withNavigator({ userAgent })
        expect(browserName()).toBe(expected)
    })

    it('says Web rather than guessing', () => {
        withNavigator({ userAgent: 'curl/8.4.0' })
        expect(browserName()).toBe('Web')
    })
})
