/**
 * The earnings feature's **addresses**, and nothing else.
 *
 * ## A second barrel, and it is a hard constraint rather than tidiness
 *
 * `features/channel`'s owner action row links to this feature's page, and this feature's view
 * reaches back into `features/channel` for `useMyChannel` and `ChannelEmptyState`. Routed through
 * the main `index.ts`, those two facts form a **module cycle between the barrels**: channel →
 * earnings/index → earnings-report-view → channel/index → channel-owner-actions → earnings/index.
 * ESM tolerates cycles by handing out a half-initialised module, so the failure is not a build
 * error — it is a `undefined is not a function` at render time, on whichever side of the cycle
 * happened to be evaluated second, which changes with bundler and import order.
 *
 * This file has **no imports at all**, so a consumer of a path pays for a path. `features/channel`
 * imports `@features/earnings/routes`, never `@features/earnings`.
 *
 * Same shape, and the same reason, as `features/channel`'s split into `index.ts` and `server.ts`:
 * a barrel is a dependency, and sometimes the only fix is a smaller one.
 */

/** `/@ada/earnings-report`. The slug is passed **without** its `@`, as `parseChannelSlug` returns it. */
export function earningsReportPath(slug: string): string {
    return `/@${encodeURIComponent(slug)}/earnings-report`
}

/**
 * `/@ada/earnings-report/1739923200` — the report with one day already open.
 *
 * **Seconds**, because that is what legacy's segment is and what the mobile apps send. The row's
 * own `date` is milliseconds; the conversion lives here and in `matchesEarningsDateParam`, and
 * nowhere else.
 */
export function earningsReportDayPath(slug: string, dateMs: number): string {
    return `${earningsReportPath(slug)}/${Math.floor(dateMs / 1000)}`
}
