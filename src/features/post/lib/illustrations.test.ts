import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import { COLLECTION_ART } from './illustrations'

/**
 * Generated-but-committed (`pnpm art:cdn collection-empty`). A missing file is invisible to the
 * build and the typecheck — `next/image` 404s at request time and the empty state renders as a gap
 * above its title.
 */
const ART = Object.entries(COLLECTION_ART)

describe('collection art', () => {
    it.each(ART)('%s is committed, in the format its path declares', (_name, art) => {
        const file = committedArt(art.src)
        expect(file.isDeclaredFormat).toBe(true)
        expect(file.bytes).toBeGreaterThan(512)
    })

    it.each(ART)('%s is served from our own origin', (_name, art) => {
        expect(committedArt(art.src).isLocal).toBe(true)
    })
})
