import { describe, expect, it } from 'vitest'
import { NO_UPLOAD_LIMITS } from './post-draft'
import { type BenefitDetailRow, uploadLimitsFromBenefits } from './upload-limits'

/** The real table's own numbers, from a captured `v1/benefits/` payload. */
const ROWS: BenefitDetailRow[] = [
    { slug: 'video-length', metadata: { free: 1.5, prem: 30 } },
    { slug: 'file-upload-size', metadata: { free: 500, prem: 5000 } },
    // A display-only row: "1080p 30fps" has no number behind it.
    { slug: 'video-quality', metadata: null },
]

describe('uploadLimitsFromBenefits', () => {
    /** Minutes on the wire, seconds everywhere the draft is checked. 1.5 minutes is 90 seconds. */
    it('converts the free column from minutes to seconds', () => {
        const limits = uploadLimitsFromBenefits(ROWS, { isPremium: false })
        expect(limits.videoDurationMax).toBe(90)
        expect(limits.videoSizeMaxMb).toBe(500)
    })

    it('reads the premium column for a Premium account', () => {
        const limits = uploadLimitsFromBenefits(ROWS, { isPremium: true })
        expect(limits.videoDurationMax).toBe(30 * 60)
        expect(limits.videoSizeMaxMb).toBe(5000)
    })

    /** The resolution ceiling is remote config's; the composer merges it in. */
    it('never claims a resolution ceiling', () => {
        expect(uploadLimitsFromBenefits(ROWS, { isPremium: true }).videoResolutionMax).toBe(null)
    })

    /**
     * An absent table means **no ceiling**, not a ceiling of zero — the same `if (LIMIT)` guard
     * legacy applies. Reading a missing number as `0` would refuse every upload.
     */
    it('refuses nothing when the table is missing or empty', () => {
        expect(uploadLimitsFromBenefits(undefined, { isPremium: false })).toEqual(NO_UPLOAD_LIMITS)
        expect(uploadLimitsFromBenefits([], { isPremium: false })).toEqual(NO_UPLOAD_LIMITS)
    })

    /**
     * "Unlimited" is a legitimate value the backoffice writes as a display string with nothing in
     * `metadata`. Reading that as a ceiling would be the inverse of what the row says.
     */
    it('treats a row with no numbers as no ceiling', () => {
        const limits = uploadLimitsFromBenefits([{ slug: 'video-length', metadata: null }], {
            isPremium: true,
        })
        expect(limits.videoDurationMax).toBe(null)
    })

    it('ignores a row it cannot name, and rows it does not know', () => {
        const limits = uploadLimitsFromBenefits(
            [
                { slug: null, metadata: { free: 1, prem: 1 } },
                { slug: 'something-new', metadata: { free: 1, prem: 1 } },
            ],
            { isPremium: false },
        )
        expect(limits).toEqual(NO_UPLOAD_LIMITS)
    })
})
