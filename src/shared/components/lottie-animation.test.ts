// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

/**
 * jsdom has no canvas 2D context, and `lottie-web` reaches for one while the module initialises —
 * so without this the import throws before it can be inspected. A stub is enough: nothing here
 * renders, the assertion is about the module's *shape*.
 */
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({
        fillStyle: '',
        fillRect() {},
        getImageData: () => ({ data: [] }),
    }),
})

/**
 * The import path is the whole test.
 *
 * `lottie-web/build/player/lottie_light` — the UMD entry — assigns `module.exports` **inside an
 * `&&` expression**, so a bundler finds no top-level CJS export, hands the dynamic import an empty
 * namespace, and `lottie.loadAnimation` is `undefined`. The only symptom was a blank box, because
 * the rejection was swallowed.
 *
 * This asserts the replacement is a real module with a real default. It is deliberately a test
 * about a dependency rather than about our code: our code was fine, the entry point was not, and
 * nothing else in the repo would notice if someone changed it back.
 */
describe('the lottie player entry point', () => {
    it('resolves to a module whose default exposes loadAnimation', async () => {
        const mod = await import('lottie-web/build/player/esm/lottie_light.min.js')
        expect(mod.default).toBeDefined()
        expect(typeof mod.default.loadAnimation).toBe('function')
    })
})
