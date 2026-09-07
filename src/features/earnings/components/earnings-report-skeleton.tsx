import {
    ListLeading,
    ListRow,
    ListRowAccessory,
    ListRowContent,
    ListRowLeading,
    ListRowText,
    ListRowTitleRow,
    ListRowTrailing,
} from '@shared/ui/list'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * The report's loading shape — the day cards, with bars where the date and the total go.
 *
 * ## Built from the same DS parts the real row is, and that is not tidiness
 *
 * An earlier version hand-rolled the card (`flex items-center gap-3 p-4`) while
 * `EarningsDayRow` was built on `ListRow`. Measured in the browser, that put the skeleton at
 * **70px** against the real row's **50px** — so every load ended with the whole list jumping 20px
 * per row as the data arrived, which is precisely the `docs/DEFINITION_OF_DONE.md` §1 failure a
 * skeleton exists to prevent. Sharing the components makes the geometry match by *construction*:
 * a change to the DS port moves both, and there is no second set of paddings to keep in step.
 *
 * `blocked-accounts-skeleton.tsx` is built this way for the same reason and says so.
 *
 * Each bar sits inside the box the real content occupies rather than at the bar's own 12px —
 * `ListRowText`'s `py-3` and `ListRowTitleRow` already reserve the 24px line, so the bars simply
 * go where the words go. That is the point of reusing the parts.
 *
 * `count` is 5, matching legacy. A screenful of shimmer standing in for what may turn out to be a
 * creator's first week is a worse first impression than a short, honest wait.
 *
 * No hooks, so it renders on the server — which is what lets the route's `loading.tsx` use it.
 */
export function EarningsReportSkeleton({ count = 5 }: { count?: number }) {
    return (
        <div data-testid="earnings-loading" aria-busy="true" className="flex flex-col gap-3">
            {Array.from({ length: count }, (_, index) => `earnings-skeleton-${index}`).map(
                (key, index) => (
                    <div
                        key={key}
                        /* The same card the real row wears — see `EarningsDayRow` for why it
                           overrides the DS row's `--background-listing`. */
                        className="overflow-hidden rounded-[var(--radius-xl)] border border-(--separator-default) bg-(--background-surface)"
                    >
                        <ListRow rightAction>
                            <ListRowLeading>
                                {/* `ListLeading` is the 48px slot; the 32px tile inside it is what
                                    the bar stands in for, so the bar is 32 and not 36. */}
                                <ListLeading variant="rounded">
                                    <Skeleton
                                        w={32}
                                        h={32}
                                        delay={index * 160}
                                        className="rounded-[var(--spacing-2)]"
                                    />
                                </ListLeading>
                            </ListRowLeading>
                            <ListRowContent>
                                <ListRowAccessory rightAction>
                                    <ListRowText rightAction>
                                        <ListRowTitleRow>
                                            <Skeleton w={120} delay={index * 160} />
                                        </ListRowTitleRow>
                                    </ListRowText>
                                    <ListRowTrailing className="gap-2">
                                        <Skeleton w={80} delay={index * 160} />
                                        {/* The chevron's 20px box, so the cards do not resize
                                            sideways when the real glyph arrives. */}
                                        <Skeleton w={20} h={20} delay={index * 160} />
                                    </ListRowTrailing>
                                </ListRowAccessory>
                            </ListRowContent>
                        </ListRow>
                    </div>
                ),
            )}
        </div>
    )
}
