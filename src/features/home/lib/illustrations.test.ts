import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import { HOME_ART } from './illustrations'

describe('home illustrations', () => {
    it('the Lives empty state is committed, in the format it claims, on our own origin', () => {
        const art = committedArt(HOME_ART.noLives.src)
        expect(art.isLocal).toBe(true)
        expect(art.isDeclaredFormat).toBe(true)
        expect(art.bytes).toBeGreaterThan(512)
    })

    it('the empty feed’s picture is committed too', () => {
        const art = committedArt(HOME_ART.lonely.src)
        expect(art.isLocal).toBe(true)
        expect(art.isDeclaredFormat).toBe(true)
        expect(art.bytes).toBeGreaterThan(512)
    })
})
