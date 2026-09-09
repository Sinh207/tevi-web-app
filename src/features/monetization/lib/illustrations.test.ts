import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import { DONATION_ART, MEMBERSHIP_ART, MONETIZATION_ART } from './illustrations'

/**
 * Both pieces are generated-but-committed (`pnpm art:cdn`). The fence that matters is the second
 * test: a revert to `${STATIC_DOMAIN}/web/web-app/monetization/…` renders identically and costs a
 * cross-origin fetch on a screen somebody is waiting on — `pnpm art:audit` catches the string, this
 * catches the file going missing under it.
 */
const ART = [
    ['banner', MONETIZATION_ART.banner.src],
    ['paid-interactions', MONETIZATION_ART.paidInteractions.src],
    ['membership-overview', MEMBERSHIP_ART.overview.src],
    ['membership-banner', MEMBERSHIP_ART.banner.src],
    ['crown', MEMBERSHIP_ART.crown.src],
    ['no-members', MEMBERSHIP_ART.noMembers.src],
    ['donation-intro', DONATION_ART.intro.src],
    ['no-supporters', DONATION_ART.noSupporters.src],
] as const

describe('monetization illustrations', () => {
    it.each(ART)('%s is committed, and is a WebP', (_name, src) => {
        const art = committedArt(src)
        expect(art.isDeclaredFormat).toBe(true)
        expect(art.bytes).toBeGreaterThan(512)
    })

    it.each(ART)('%s is served from our own origin', (_name, src) => {
        expect(committedArt(src).isLocal).toBe(true)
    })
})
