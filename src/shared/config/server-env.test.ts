import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The server reads public content from the **in-cluster services by default** — legacy's three
 * hosts, with no configuration — and from the public gateway only on a machine that says it is
 * outside the cluster. The opposite default is what let two of three models point at the wrong
 * service unnoticed: nothing was set, so nothing internal was ever called.
 */
async function load(vars: Record<string, string | undefined>) {
    vi.resetModules()
    for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value as string)
    return import('./server-env')
}

beforeEach(() => {
    for (const name of [
        'INTERNAL_CHANNEL_API',
        'INTERNAL_POST_API',
        'INTERNAL_LIVESTREAM_API',
        'SERVER_API_VIA_GATEWAY',
    ]) {
        vi.stubEnv(name, undefined as unknown as string)
    }
})

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('internalApiBase', () => {
    it('is legacy’s host for each service when nothing is set', async () => {
        const { internalApiBase } = await load({})
        expect(internalApiBase('channel')).toBe('http://tevi-channel/tevi-channel')
        expect(internalApiBase('post')).toBe('http://tevi-post/tevi-post')
        expect(internalApiBase('livestream')).toBe('http://tevi-livestream/live')
    })

    it('takes an override per service', async () => {
        const { internalApiBase } = await load({ INTERNAL_POST_API: 'http://post.test/x' })
        expect(internalApiBase('post')).toBe('http://post.test/x')
        expect(internalApiBase('channel')).toBe('http://tevi-channel/tevi-channel')
    })

    it('is null outside the cluster, so the caller reads the gateway', async () => {
        const { internalApiBase } = await load({ SERVER_API_VIA_GATEWAY: '1' })
        expect(internalApiBase('channel')).toBeNull()
        expect(internalApiBase('post')).toBeNull()
        expect(internalApiBase('livestream')).toBeNull()
    })
})
