import type { StarPackage } from '../api/types'

/**
 * Choosing a package, and what a tile says about it.
 *
 * Pure, because the interesting decision — *which* package to pre-select when the sheet was opened by
 * a price the reader could not afford — is arithmetic over a list, and it is the difference between
 * the sheet doing the reader's work and making them do it.
 */

/**
 * Star the reader actually receives: the package plus its bonus.
 *
 * The **bonus counts**, and that is the whole reason this is a function. Selecting against `amount`
 * alone would offer somebody a bigger package than they need — a 900 + 100 bonus package covers a
 * 1,000 Star shortfall, and telling them to buy the 2,000 one instead is the sheet overcharging them
 * out of carelessness. A negative bonus is treated as none: the field is `numeric` off the wire and
 * nothing guarantees its sign.
 */
export function packageStars(pkg: StarPackage): number {
    return pkg.amount + Math.max(0, pkg.bonus_amount)
}

/**
 * The package to start on when the sheet is opened to close a gap.
 *
 * The **smallest one that covers the shortfall** — the cheapest way out of the situation the reader is
 * in. When nothing covers it (they are 50,000 Star short of a big gift), the **largest** is the
 * closest thing to an answer, and it is a better starting point than the cheapest: they will be
 * buying more than one, and starting at the top says so.
 *
 * `null` only for an empty catalogue. `shortfall <= 0` means the sheet was opened deliberately rather
 * than by a failed press, and then there is nothing to solve for — the caller's own default (the
 * "most popular" tile) is the honest starting point, so this answers `null` too.
 */
export function pickPackageForShortfall(
    packages: readonly StarPackage[],
    shortfall: number,
): StarPackage | null {
    if (packages.length === 0 || !Number.isFinite(shortfall) || shortfall <= 0) return null

    const covering = packages.filter(pkg => packageStars(pkg) >= shortfall)
    if (covering.length > 0) {
        return covering.reduce((best, pkg) => (packageStars(pkg) < packageStars(best) ? pkg : best))
    }
    return packages.reduce((best, pkg) => (packageStars(pkg) > packageStars(best) ? pkg : best))
}

/**
 * The tile to badge when the payload names none — the **first** one, whatever it is.
 *
 * Legacy hard-codes `index === 0`, on the reading that the backoffice's ordering *is* the
 * recommendation. It is the fallback here rather than the rule, because the payload turned out to say
 * so outright — see below.
 */
export const MOST_POPULAR_INDEX = 0

/**
 * The `labels` entry the backoffice tags the recommended package with.
 *
 * Matched case- and space-insensitively, and it is the **only** thing read out of that array. The
 * badge's own words stay ours (`payment_most_popular`): the payload's are English, this app ships in
 * nine languages, and a backoffice string is not a translation.
 */
const RECOMMENDED_LABEL = 'most popular'

/**
 * Which tile carries the badge.
 *
 * ⚠ This used to be the constant above, unconditionally — and against the real catalogue that badged
 * the **wrong** package: the payload tags `500 stars` with `labels: ["Most popular"]` and the grid
 * drew the badge on `300 stars`, because that row happens to be first. A recommendation the backoffice
 * did not make, printed on a page where the number under it is a price.
 *
 * `MOST_POPULAR_INDEX` remains the answer when no row is tagged, so a catalogue without labels reads
 * exactly as it did before. Only the first tagged row wins: two badges are two recommendations.
 *
 * ⚠ The field is **not stable between requests** — the same anonymous visitor gets `labels` on one
 * load of `/get-star` and none on the next, which moves the badge from the 500 tile to the 300 one.
 * That is **B86**, and the fallback below is what stops the unlabelled response from having no badge
 * at all. Read that question before removing it.
 */
export function recommendedIndex(packages: readonly StarPackage[]): number {
    const tagged = packages.findIndex(
        pkg =>
            /*
             * `Array.isArray` even though the schema guarantees one. `StarPackage` is a `looseObject`
             * DTO, and the things that build one without going through the parser are exactly the
             * things that would crash here: `/dev/get-star`'s fixtures and every test that casts an
             * object literal `as StarPackage`. A recommendation badge is not worth a TypeError.
             */
            Array.isArray(pkg.labels) &&
            pkg.labels.some(label => label.trim().toLowerCase() === RECOMMENDED_LABEL),
    )
    return tagged >= 0 ? tagged : MOST_POPULAR_INDEX
}

/** The default tile when no shortfall points at one: the recommended package, else the first. */
export function defaultPackage(packages: readonly StarPackage[]): StarPackage | null {
    return packages[recommendedIndex(packages)] ?? packages[0] ?? null
}
