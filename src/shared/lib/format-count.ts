/**
 * Rendering a tally — the compact figure, and the exact one behind it.
 *
 * ## Why these are shared and the rest of `channel-format.ts` is not
 *
 * They started in `features/channel/lib/channel-format.ts`, for the space header's stat block, and
 * they move here on the same three-tier reasoning `shared/lib/money.ts` writes down: several
 * features render figures, none of them owns the arithmetic, and putting it in any one would make
 * the others depend on it for something that is not its business. `features/post` is the second
 * caller (reaction and reply counts on every card) and it may not import `features/channel` — the
 * dependency between those two runs channel → post.
 *
 * What stays behind in `channel-format.ts` is everything that knows a *product* fact:
 * `formatIncomeUsd` knows the figure is always USD, `truncateDescription` knows the description's
 * limit, `formatRelativeTime` is the space header's own idea of how to say "2 days ago". Those are
 * not formatting primitives.
 *
 * ## The bug this replaces
 *
 * Legacy renders both counts on one post action bar with **two different formatters** —
 * `formatNumberCompact` (`Intl`) for reactions and a hand-rolled `formatSocialNumber` (`"1.2k"`) for
 * replies. Two magnitudes side by side, styled differently, and the hand-rolled one is simply wrong
 * in six of the nine locales: `1.2k` is not how `vi`, `zh-TW`, `ko` or `ar` write it. One formatter,
 * through `Intl`, is also why the stats need no plural translation keys — a compact count sits above
 * an unpluralised noun, so Arabic's six forms never come up.
 */

/**
 * `1.2K`, `241K`, `1.4M` — locale-aware, because compact notation is not universal (`1.2K` is
 * `1,2 mil` in Portuguese and `1.2万` in Japanese, and `Intl` knows that; a hand-rolled
 * `n / 1000 + 'K'` does not).
 *
 * Guards, each for a real payload: a count below 1000 stays exact (a creator with 999 followers
 * should see 999, not `1K`); a negative or non-finite value floors to `0` rather than rendering
 * `NaN` or `-5`.
 */
export function formatCompactCount(value: number | null | undefined, locale = 'en'): string {
    const count = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
    try {
        return new Intl.NumberFormat(locale, {
            notation: 'compact',
            maximumFractionDigits: 1,
        }).format(count)
    } catch {
        // An unrecognised locale tag must not take the header down.
        return new Intl.NumberFormat('en', {
            notation: 'compact',
            maximumFractionDigits: 1,
        }).format(count)
    }
}

/** The exact count, for the `title`/`aria-label` behind the compact one — `241K` is lossy. */
export function formatExactCount(value: number | null | undefined, locale = 'en'): string {
    const count = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
    try {
        return new Intl.NumberFormat(locale).format(count)
    } catch {
        return new Intl.NumberFormat('en').format(count)
    }
}
