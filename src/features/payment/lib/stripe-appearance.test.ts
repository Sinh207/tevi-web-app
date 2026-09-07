// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { stripeAppearance } from './stripe-appearance'

/** jsdom resolves a custom property only on the node that declares it. */
function root(tokens: Record<string, string>): HTMLElement {
    const node = document.createElement('div')
    for (const [name, value] of Object.entries(tokens)) node.style.setProperty(name, value)
    document.body.append(node)
    return node
}

afterEach(() => {
    document.body.innerHTML = ''
})

describe('stripeAppearance', () => {
    it('hands Elements the resolved token values, because an iframe cannot read our variables', () => {
        const appearance = stripeAppearance({
            isDark: false,
            root: root({
                '--background-surface': '#ffffff',
                '--text-title': '#09090b',
                '--button-accent-bg': '#501bc0',
                '--text-error': '#ff3636',
            }),
        })

        expect(appearance.variables).toMatchObject({
            colorBackground: '#ffffff',
            colorText: '#09090b',
            colorPrimary: '#501bc0',
            colorDanger: '#ff3636',
        })
        expect(appearance.rules?.['.Input:focus']).toEqual({
            border: '1px solid #501bc0',
            boxShadow: 'none',
        })
    })

    it('switches Stripe own theme too — variables alone leave a light dropdown in a dark field', () => {
        expect(stripeAppearance({ isDark: true, root: null }).theme).toBe('night')
        expect(stripeAppearance({ isDark: false, root: null }).theme).toBe('stripe')
    })

    it('falls back per mode, never to one set of greys', () => {
        const light = stripeAppearance({ isDark: false, root: null }).variables
        const dark = stripeAppearance({ isDark: true, root: null }).variables

        expect(light?.colorBackground).not.toBe(dark?.colorBackground)
        expect(light?.colorText).not.toBe(dark?.colorText)
    })

    it('never passes an empty value through from a token that is not declared', () => {
        const appearance = stripeAppearance({ isDark: false, root: root({}) })
        for (const value of Object.values(appearance.variables ?? {})) {
            expect(value).not.toBe('')
        }
    })
})
