'use client'

import { FollowedLiveTile, useFollowedLives } from '@features/channel'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Skeleton } from '@shared/ui/skeleton'
import { HOME_LIVE_LIMIT } from './home-live-feed'

/** Tiles past this many arrive together — the stagger is for what the first screen shows. */
const STAGGERED = 4

/**
 * The live strip — the Lives tab, folded into the head of the Posts feed **below `sm`** (612).
 *
 * ## Why phones get a strip instead of a tab
 *
 * On a phone the tab row costs a sticky band under the global top bar and hides on-air streams
 * behind a press, when "who is live right now" is the most time-sensitive thing the feed has. So
 * below `sm` there is no tab row at all: this strip sits over the posts and the reader sees both at
 * once. From `sm` — a large phone in landscape, a tablet — there is room for the tab row and the
 * full card again (underline tabs to `md`, the Figma capsule from it), and this renders nothing
 * (`sm:hidden`).
 *
 * ## A scrolling row, not a carousel
 *
 * Several tiles, a peek of the next, no dots, no autoplay — `docs/DESIGN_SYSTEM.md` §10's
 * definition of a row, so it is native `overflow-x-auto` + `snap-x` and not `CardCarousel`: the
 * browser keeps momentum, overscroll containment (a sideways swipe must not become the back
 * gesture) and scrolling a focused tile into view. The edges are a `mask-image` on the scroller, as
 * that section prescribes, and 16px — the row's own inset — so the first tile starts unfaded.
 *
 * ## It is decoration over the feed, so it disappears rather than explains
 *
 * The same request as the tab (`HOME_LIVE_LIMIT`, so one query key serves the strip, the md+ tab and
 * the tab's red dot). Loading holds its height with two tiles; signed out, failed or nobody live, it
 * renders **nothing** — the posts below are the screen, and an error card above them would spend the
 * reader's attention on the one thing that is optional. This is `/following`'s rule for its own
 * strip, and the opposite of the md+ tab, where the list *is* the screen.
 */
export function HomeLiveStrip({ testId = 'home-live-strip' }: { testId?: string }) {
    const { t } = useTranslation()
    const { visible, isLoading } = useFollowedLives({
        limit: HOME_LIVE_LIMIT,
        collapsible: false,
    })

    if (!isLoading && visible.length === 0) return null

    return (
        <section
            data-testid={testId}
            /*
             * No visible heading — the Live flag on every banner already says what the row is, and
             * a "Live now" title spent a line of a phone screen saying it again. The landmark keeps
             * the name for assistive tech.
             */
            aria-label={t('following_live_now')}
            aria-busy={isLoading || undefined}
            // `mb-px`: the same 1px of page colour that separates the post bands below it.
            className="mb-px flex min-w-0 flex-col bg-(--background-surface) pt-1 pb-3 sm:hidden"
        >
            <ul
                className={cn(
                    /*
                     * `pt-2`: a scroller clips on **both** axes (`overflow-x: auto` turns
                     * `overflow-y: visible` into `auto`), and the avatar's live ring sits 4px
                     * outside the face with its glow beyond that — flush with the top of the row,
                     * the ring was cut off. The section's own top padding gives that space back.
                     */
                    'flex min-w-0 list-none gap-3 overflow-x-auto overscroll-x-contain px-4 pt-2 pb-1',
                    'snap-x snap-mandatory scroll-px-4',
                    '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                    // Symmetric, so it needs no RTL twin.
                    '[mask-image:linear-gradient(90deg,transparent,black_16px,black_calc(100%-16px),transparent)]',
                )}
            >
                {isLoading
                    ? [0, 1].map(index => (
                          <li
                              key={index}
                              className="flex w-[78%] max-w-[300px] flex-none flex-col gap-2"
                          >
                              <div className="flex items-center gap-2">
                                  <Skeleton className="size-9 rounded-full" />
                                  <div className="flex flex-1 flex-col gap-1">
                                      <Skeleton h={14} className="w-3/5 rounded-(--radius-sm)" />
                                      <Skeleton h={12} className="w-2/5 rounded-(--radius-sm)" />
                                  </div>
                                  <Skeleton h={24} className="w-[72px] rounded-full" />
                              </div>
                              <Skeleton className="aspect-video w-full rounded-(--radius-lg)" />
                              <Skeleton h={14} className="w-4/5 rounded-(--radius-sm)" />
                          </li>
                      ))
                    : visible.map((live, index) => (
                          <FollowedLiveTile
                              key={live.code}
                              live={live}
                              // One stream takes the row; two or more scroll, with a peek.
                              fill={visible.length === 1}
                              className={RISE}
                              style={index < STAGGERED ? riseDelay(index) : undefined}
                              testId={subTestId(testId, 'item')}
                          />
                      ))}
            </ul>
        </section>
    )
}
