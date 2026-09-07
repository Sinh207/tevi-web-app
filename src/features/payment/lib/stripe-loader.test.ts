import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getStripe, setStripeLoader } from './stripe-loader'

/**
 * Two things, and the first one is a guard against a one-word regression.
 *
 * `@stripe/stripe-js` fetches `js.stripe.com` as a side effect of **being imported** — a microtask
 * after the module evaluates, before anyone calls `loadStripe`. This feature's provider is mounted
 * above every route, so that side effect reached every page: measured on a built `/privacy`, a static
 * legal page, four cross-origin requests to Stripe including `m.stripe.com/6`, their fraud-signal
 * beacon. `@stripe/stripe-js/pure` is Stripe's own entry point for exactly this and moves the fetch
 * to the first `loadStripe()` call.
 *
 * Nothing about that is visible from the call site: the API is identical, the tests pass either way,
 * and the difference only shows in a network log on a page nobody is paying on. So it is a source
 * scan — the same shape as the "no client module imports `resources.ts`" guard in `shared/i18n`.
 */
const SRC = join(process.cwd(), 'src')

function valueImportsOfStripeJs(dir: string): string[] {
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
    const found: string[] = []
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) {
            found.push(...valueImportsOfStripeJs(path))
            continue
        }
        if (!/\.tsx?$/.test(entry)) continue
        // This file names the import it forbids, twice.
        if (entry === 'stripe-loader.test.ts') continue
        const source = readFileSync(path, 'utf8')
        for (const line of source.split('\n')) {
            // `import type { … } from '@stripe/stripe-js'` is free — types are erased.
            if (!line.includes("from '@stripe/stripe-js'")) continue
            if (line.trimStart().startsWith('import type')) continue
            found.push(`${path.replace(SRC, 'src')}: ${line.trim()}`)
        }
    }
    return found
}

describe('stripe-loader', () => {
    it('is the only module allowed to import Stripe.js, and only via `/pure`', () => {
        expect(valueImportsOfStripeJs(SRC)).toEqual([])
    })

    it('memoises one instance per publishable key', async () => {
        const calls: string[] = []
        setStripeLoader(async key => {
            calls.push(key)
            return { id: key } as unknown as Awaited<ReturnType<typeof getStripe>>
        })

        const first = await getStripe('pk_a')
        const again = await getStripe('pk_a')
        const other = await getStripe('pk_b')

        // Legacy calls `loadStripe` in render, which remounts the card iframes and throws away
        // whatever had been typed into them. One promise per key is the whole fix.
        expect(first).toBe(again)
        expect(other).not.toBe(first)
        expect(calls).toEqual(['pk_a', 'pk_b'])
        setStripeLoader(null)
    })
})
