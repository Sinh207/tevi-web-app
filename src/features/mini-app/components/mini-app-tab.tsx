'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import type { MiniAppTab as Tab } from '../lib/tabs'
import { MiniAppMark } from './mini-app-mark'
import { MiniAppTabMenu } from './mini-app-tab-menu'

/**
 * One tab in the strip.
 *
 * Active: a filled pill with the app's mark, its name and a close glyph. Inactive: the mark alone,
 * same height. That is legacy's shape and a browser's, and it is what lets five tabs fit a
 * 360px-wide window — five full pills do not.
 *
 * ## The mark doubles as the ⋯ menu, and only on the active tab
 *
 * Hovering the active tab's mark reveals an ellipsis over it; pressing it opens the tab menu. That
 * is legacy's interaction and it is kept because the alternative is a *third* control in a 34px
 * pill. It is also a real button with its own label, so it is reachable by keyboard — the hover
 * overlay is decoration on top of something that works without a pointer.
 *
 * An inactive tab's mark is not a menu: the menu acts on "the app in front of you", and a menu for
 * an app you are not looking at would need a different set of answers to "reload what?".
 */
export function MiniAppTab({
    tab,
    isActive,
    onSelect,
    onClose,
}: {
    tab: Tab
    isActive: boolean
    onSelect: (id: string) => void
    onClose: (id: string) => void
}) {
    const { t } = useTranslation()

    return (
        <div
            data-no-drag
            className={cn(
                'flex h-[34px] flex-none items-center rounded-[10px] transition-colors',
                isActive
                    ? /*
                       * **`--background-elevated`, not `--background-surface`.** In *dark* mode
                       * `--background-surface` resolves to `--zinc-100`, which is exactly what the
                       * strip's `--background-subtle` resolves to as well — so the active tab was
                       * the same colour as the bar it sits in and the pill simply was not there.
                       * `--background-elevated` differs from the strip in both modes (#ffffff vs
                       * #f4f4f5, #222225 vs #18181b), which is also the honest token: the pill is
                       * raised above the bar.
                       */
                      'min-w-20 max-w-50 gap-1.5 bg-(--background-elevated) px-3 shadow-xs'
                    : 'w-[34px] justify-center hover:bg-(--background-disabled)',
            )}
        >
            {isActive ? (
                <MiniAppTabMenu tab={tab}>
                    <TabMark tab={tab} interactive />
                </MiniAppTabMenu>
            ) : (
                /*
                 * The whole inactive pill is the switch button — a 34px target, rather than the
                 * 20px mark inside it.
                 */
                <button
                    data-testid="mini-app-tab"
                    data-tab-id={tab.id}
                    type="button"
                    onClick={() => onSelect(tab.id)}
                    aria-label={tab.config.name}
                    /*
                     * A native tooltip, and not decoration: an inactive tab is its mark alone, and
                     * most apps have **no** mark — they fall back to the same `grid-category` glyph
                     * (see `TabMark`). Five identical pills are otherwise only distinguishable by
                     * guessing. The accessible name is already there; this is the pointer's copy of
                     * it.
                     */
                    title={tab.config.name}
                    className="flex size-full items-center justify-center rounded-[10px]"
                >
                    <TabMark tab={tab} />
                </button>
            )}

            {isActive && (
                <>
                    <span className="type-dense-strong min-w-0 flex-1 truncate text-(--text-title)">
                        {tab.config.name}
                    </span>
                    <button
                        data-testid="mini-app-tab-close"
                        data-tab-id={tab.id}
                        type="button"
                        onClick={() => onClose(tab.id)}
                        aria-label={t('miniapp_close_tab', { name: tab.config.name })}
                        className="flex-none rounded-full p-0.5 text-(--icon-secondary) opacity-60 transition-opacity hover:opacity-100"
                    >
                        <Icon name="xmark" size={16} className="size-3.5" />
                    </button>
                </>
            )}
        </div>
    )
}

/**
 * The app's 20px mark, plus the hover affordance that turns the active tab's into a menu trigger.
 *
 * The mark itself is `MiniAppMark`, shared with the launch splash — the icon-or-glyph decision and
 * the `unoptimized` reasoning live there. Only the overlay is the tab's.
 */
function TabMark({ tab, interactive = false }: { tab: Tab; interactive?: boolean }) {
    return (
        <span className="relative flex flex-none">
            <MiniAppMark config={tab.config} px={20} glyph={16} className="rounded-md" />
            {interactive && (
                <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition-opacity group-hover/mark:opacity-100 group-focus-visible/mark:opacity-100">
                    <Icon name="more-horizontal" size={16} className="size-4" />
                </span>
            )}
        </span>
    )
}
