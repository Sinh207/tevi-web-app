import { NO_UPLOAD_LIMITS, type PostUploadLimits } from './post-draft'

/**
 * Turn the Premium benefit table into the two ceilings the composer enforces.
 *
 * ## The numbers are in `metadata`, and the units are not the ones the field is named for
 *
 * `enhanced-storage-upload` carries three rows; two of them matter here:
 *
 * | row | `metadata.free` / `.prem` | what it is |
 * |---|---|---|
 * | `video-length` | `1.5` / `30` | **minutes** — legacy multiplies by 60 |
 * | `file-upload-size` | `500` / `5000` | **megabytes** |
 *
 * The third (`video-quality`) is a display string with no number behind it, so the resolution
 * ceiling comes from remote config instead.
 *
 * ## Pure, and therefore testable without a Premium account
 *
 * The rows arrive as data, and the table itself (`v1/benefits/`) is **platform-wide** — the same
 * answer for every signed-in reader — so `isPremium` only picks which column of each row applies.
 * A reader without Premium is held to the `free` numbers rather than to nothing, which is better
 * than legacy manages: its ceilings come from the same table through a provider that is not always
 * populated, and every check is guarded by `if (LIMIT)`, so it enforces nothing when the rows are
 * absent.
 *
 * That guard is kept here as well — an absent table means no ceiling, not a ceiling of zero — but
 * it is now the rare path rather than the ordinary one.
 */

/**
 * One row of a benefit's comparison table, as much of it as this needs.
 *
 * `slug` is nullable because the wire schema catches an unreadable one to `null` — a row this
 * cannot name is one it cannot match, which is the correct outcome rather than a crash. Typed
 * structurally so `features/premium`'s own parsed row satisfies it without this feature naming that
 * type, which it may not.
 */
export interface BenefitDetailRow {
    slug: string | null
    metadata: { free?: number | null; prem?: number | null } | null
}

const VIDEO_LENGTH = 'video-length'
const FILE_SIZE = 'file-upload-size'

export function uploadLimitsFromBenefits(
    rows: BenefitDetailRow[] | null | undefined,
    { isPremium }: { isPremium: boolean },
): PostUploadLimits {
    if (!rows || rows.length === 0) return NO_UPLOAD_LIMITS

    const read = (slug: string): number | null => {
        const row = rows.find(candidate => candidate.slug === slug)
        const value = isPremium ? row?.metadata?.prem : row?.metadata?.free
        /*
         * A row with no number is not a ceiling of zero. "Unlimited" is a legitimate value the
         * backoffice writes as a display string with nothing in `metadata`, and reading that as
         * `0` would refuse every upload — the inverse of what the row says.
         */
        return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
    }

    const minutes = read(VIDEO_LENGTH)

    return {
        // Minutes on the wire, seconds everywhere the draft is checked.
        videoDurationMax: minutes === null ? null : Math.round(minutes * 60),
        videoSizeMaxMb: read(FILE_SIZE),
        /** Remote config's, and merged in by the composer — every reader can read that one. */
        videoResolutionMax: null,
    }
}
