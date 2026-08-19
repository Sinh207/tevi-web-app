import { describe, expect, it } from 'vitest'
import { isSafeExternalUrl, safeExternalUrl } from './safe-url'

describe('safeExternalUrl', () => {
    it('passes ordinary http and https links through', () => {
        expect(safeExternalUrl('https://tevi.com/ada')).toBe('https://tevi.com/ada')
        expect(safeExternalUrl('http://example.org/x?y=1#z')).toBe('http://example.org/x?y=1#z')
    })

    /**
     * The reason this module exists: a `javascript:` bio link runs as the visitor, on our
     * origin, with their session — and CSP's `script-src` does not stop it, because
     * navigating to the URL is not loading a script.
     */
    it('refuses every scheme that can execute or inline a document', () => {
        for (const hostile of [
            'javascript:alert(1)',
            'JavaScript:alert(1)',
            '  javascript:alert(1)  ',
            'jAvAsCrIpT:fetch("/api/me")',
            'data:text/html,<script>alert(1)</script>',
            'vbscript:msgbox(1)',
            'file:///etc/passwd',
            'blob:https://tevi.com/abc',
        ]) {
            expect(safeExternalUrl(hostile), hostile).toBeNull()
        }
    })

    /** Creators type links without a scheme constantly; dropping them looks like a bug. */
    it('upgrades a bare host to https', () => {
        expect(safeExternalUrl('tevi.com/ada')).toBe('https://tevi.com/ada')
        expect(safeExternalUrl('www.example.org')).toBe('https://www.example.org/')
        // Protocol-relative — a host, not a scheme.
        expect(safeExternalUrl('//example.org/x')).toBe('https://example.org/x')
    })

    /** The upgrade runs before the protocol check, so it cannot smuggle a scheme back in. */
    it('does not let the https upgrade launder a hostile scheme', () => {
        expect(safeExternalUrl('https://javascript:alert(1)')).toBeNull()
    })

    it('rejects anything that is not a navigable URL', () => {
        for (const junk of [
            null,
            undefined,
            42,
            {},
            '',
            '   ',
            'https:',
            'https://',
            'not a url',
        ]) {
            expect(safeExternalUrl(junk), String(junk)).toBeNull()
        }
    })

    it('isSafeExternalUrl mirrors the decision', () => {
        expect(isSafeExternalUrl('https://tevi.com')).toBe(true)
        expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    })
})
