'use client'

import { GET_STAR_PATH } from '@features/payment/routes'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarCompact } from '@shared/lib/money'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { AppBarStarIcon } from '@shared/ui/app-bar'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import { useBalanceDisplay } from '../hooks/use-balance-display'
import { useBalance } from '../providers/balance-provider'
import { StarChangeFlash } from './star-change-flash'

/**
 * The Star balance as a pill that links to `/get-star` — the shell's top bar's, and (below `md`, right
 * after the back button) the bars of the two reading surfaces product asked for on 2026-10-07: the
 * channel page and a post (`PageBackBar starBalance`). Not settings, wallet or legal screens. It moved
 * here from `AppTopBar` so the places cannot drift: `features/balance` owns the figure, the
 * formatting and the flash, and each bar only places it.
 *
 * ## The geometry is the top bar's, unchanged
 *
 * **A 44px target holding a 32px pill.** Bar controls are a glyph in a target with no disc at rest,
 * so a filled pill as tall as the target stood twice the height of every glyph beside it. The visible
 * chip is 32 and sits centred in the 44 the other controls press in, so the bar reads as one row and
 * the press target does not shrink. The `+` is a brand-tinted disc rather than the DS's solid black
 * one: it is the affordance, not the figure. The figure is tabular so a balance that changes does not
 * shift the pill's width digit by digit.
 *
 * One link, to `/get-star`: the `+` is not a second control but the thing that says what pressing the
 * pill does, which is why it is `aria-hidden` and why `/my-star` keeps its own drawer row.
 *
 * ## The paint is five custom properties, so a bar over artwork can repaint it
 *
 * `--star-pill-bg`, `-edge`, `-ink`, `-plus-bg`, `-plus-ink`, defaulted on the wrapper and readable by
 * a caller's `className`. Properties rather than a `tone` prop because the channel bar needs a dark
 * plate over its cover **below `sm` only** (`ChannelTopBar`): a prop cannot carry a breakpoint, a class
 * can.
 *
 * ## The figure
 *
 * Exact up to six digits, abbreviated from a million (`1.2M`, in the reader's notation) — the pill fits
 * `120,018` at 360px and a seventh digit pushed the search button off the top bar. `—` while unknown,
 * which is `useBalanceDisplay`'s decision: a `0` on the shell's most prominent figure would tell a
 * creator with 40,000 Star that they have none, for the length of a fetch.
 *
 * `StarChangeFlash` is the anchor's **sibling**, in a `relative` wrapper scoped to the pill: it centres
 * itself in its positioning context, and it carries a `role="status"` sentence that inside an anchor
 * would become the link's content.
 *
 * `testId` is the caller's — `features/balance` authors no scope for a pill that lives in other
 * features' bars. The count's is derived from it (`-label-data`).
 */
export function StarBalancePill({ testId, className }: { testId?: string; className?: string }) {
    const { t, currentLanguage } = useTranslation()
    const display = useBalanceDisplay()
    const { star: starCount, isKnown } = useBalance()
    const star = isKnown ? formatStarCompact(starCount, currentLanguage) : display.star

    return (
        <span
            className={cn(
                'relative flex flex-none items-center',
                '[--star-pill-bg:var(--background-topbar-action)] [--star-pill-edge:var(--button-topbar-border)]',
                '[--star-pill-ink:var(--text-title)] [--star-pill-plus-bg:color-mix(in_oklab,var(--text-brand)_14%,transparent)] [--star-pill-plus-ink:var(--text-brand)]',
                className,
            )}
        >
            <Link
                data-testid={testId}
                href={GET_STAR_PATH}
                aria-label={t('balance_action_get_star')}
                className={cn(
                    'group flex h-11 flex-none items-center rounded-full',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                )}
            >
                <span
                    className={cn(
                        'flex h-8 items-center gap-1 rounded-full ps-1.5 pe-1',
                        'bg-(--star-pill-bg) shadow-[inset_0_0_0_1px_var(--star-pill-edge)] backdrop-blur-sm',
                        'transition-[scale] duration-150 group-active:scale-95 motion-reduce:transition-none',
                    )}
                >
                    <AppBarStarIcon size={20} />
                    <span
                        data-testid={subTestId(testId, 'label-data')}
                        className="type-dense-strong text-(--star-pill-ink) tabular-nums"
                    >
                        {star}
                    </span>
                    <span
                        aria-hidden
                        className="flex size-6 items-center justify-center rounded-full bg-(--star-pill-plus-bg) text-(--star-pill-plus-ink)"
                    >
                        <Icon name="plus" size={16} />
                    </span>
                </span>
            </Link>

            <StarChangeFlash />
        </span>
    )
}
