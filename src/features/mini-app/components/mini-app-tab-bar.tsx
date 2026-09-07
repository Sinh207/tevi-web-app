'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { MAX_TABS, type MiniAppTab as Tab } from '../lib/tabs'
import { getTabHandlers } from '../store/mini-app-store'
import { MiniAppTab } from './mini-app-tab'

/**
 * The strip above the frames: the app's own chrome, the tabs, `+`, and the window controls.
 *
 * It is also the **drag surface** — `dragHandlers` is spread on the root — which is why every
 * interactive thing in it is a `button` or carries `data-no-drag`: `useWindowDrag` refuses to start
 * a drag from either, so a press on a tab switches tabs and a press on the background moves the
 * window.
 *
 * ## Two groups of controls that look alike and are not
 *
 * The **leading** pair (back, close) belongs to the *mini app*: it appears only because the app
 * asked for it (`showBackButton` / `showCloseButton`), and pressing it sends a message into the app.
 * The **trailing** trio (minimise, maximise, close) belongs to the *window* and is the host's.
 * Legacy draws them in the same strip too, and the separation is worth stating because the close
 * glyphs mean different things: the leading one asks the app to close itself, the trailing one
 * closes the player outright.
 */
export function MiniAppTabBar({
    tabs,
    activeTabId,
    isFullScreen,
    canResizeWindow,
    onSelect,
    onCloseTab,
    onAddTab,
    onMinimize,
    onToggleMaximize,
    onCloseAll,
    dragHandlers,
}: {
    tabs: Tab[]
    activeTabId: string | null
    isFullScreen: boolean
    /** Desktop only: below `md` the window *is* the screen, so minimise/maximise are meaningless. */
    canResizeWindow: boolean
    onSelect: (id: string) => void
    onCloseTab: (id: string) => void
    onAddTab: () => void
    onMinimize: () => void
    onToggleMaximize: () => void
    onCloseAll: () => void
    dragHandlers: React.HTMLAttributes<HTMLElement>
}) {
    const { t } = useTranslation()
    const active = tabs.find(tab => tab.id === activeTabId) ?? null
    const handlers = () => getTabHandlers(activeTabId)

    return (
        <div
            className={cn(
                'flex flex-none items-center gap-1 py-1.5',
                /*
                 * **A hairline under the strip, and it is not decoration.** In light mode the strip
                 * is `--background-subtle` (#f4f4f5) and the frame behind it is
                 * `--background-listing` (#ffffff) — four values apart — so a mini app that paints
                 * itself white (most of them) leaves no visible boundary at all and the host's
                 * chrome reads as part of the app's own page. The rounded top corners below are not
                 * enough: at full-screen width they are two 12px arcs at the ends of a 2000px edge.
                 */
                'border-(--separator-default) border-b',
                /*
                 * A touch more breathing room when the strip spans the whole viewport: 8px reads as
                 * a control jammed into the corner of the screen, where in a 420px floating window
                 * it is the right inset.
                 */
                isFullScreen ? 'px-3' : 'px-2',
                /*
                 * `touch-none` alongside the grab cursor: the strip is a drag surface held with
                 * `setPointerCapture`, and without it a touch drag on a tablet wide enough to get
                 * the floating window (≥ `md`) pans the page behind instead of moving the window.
                 * Taps are unaffected — this only takes the panning and pinch gestures.
                 */
                canResizeWindow && 'cursor-grab touch-none active:cursor-grabbing',
            )}
            {...dragHandlers}
        >
            {(active?.showBackButton || active?.showCloseButton) && (
                <div data-no-drag className="flex flex-none items-center gap-0.5">
                    {active.showBackButton && (
                        <ChromeButton
                            testId="mini-app-back"
                            label={t('common_back')}
                            icon="angle-left"
                            onClick={() => handlers().back()}
                        />
                    )}
                    {active.showCloseButton && (
                        <ChromeButton
                            testId="mini-app-close"
                            label={t('common_close')}
                            icon="xmark"
                            onClick={() => handlers().close()}
                        />
                    )}
                </div>
            )}

            {/*
             * `overflow-hidden`, not a scroller. Five tabs fit the narrowest window this feature
             * allows (300px: four 34px marks, one pill, `+`), so there is nothing to scroll to —
             * and a horizontal scroller inside a drag surface is two gestures competing for the
             * same pointer.
             */}
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                {tabs.map(tab => (
                    <MiniAppTab
                        key={tab.id}
                        tab={tab}
                        isActive={tab.id === activeTabId}
                        onSelect={onSelect}
                        onClose={onCloseTab}
                    />
                ))}
                {tabs.length < MAX_TABS && (
                    <ChromeButton
                        testId="mini-app-add-tab"
                        label={t('miniapp_open_center')}
                        icon="plus"
                        onClick={onAddTab}
                    />
                )}
            </div>

            <div data-no-drag className="flex flex-none items-center gap-0.5">
                {canResizeWindow && (
                    <>
                        <ChromeButton
                            testId="mini-app-minimize"
                            label={t('miniapp_minimize')}
                            icon="minus"
                            onClick={onMinimize}
                        />
                        <ChromeButton
                            testId="mini-app-maximize"
                            label={isFullScreen ? t('miniapp_restore') : t('miniapp_maximize')}
                            icon={isFullScreen ? 'arrows-compress' : 'arrows-expand'}
                            onClick={onToggleMaximize}
                        />
                    </>
                )}
                <ChromeButton
                    testId="mini-app-close-all"
                    label={t('miniapp_close_player')}
                    icon="xmark"
                    onClick={onCloseAll}
                    tone="destructive"
                />
            </div>
        </div>
    )
}

/**
 * A 24px icon-only control in the strip.
 *
 * Not the DS `Button`: its smallest size is 28×28 with padding built for a label beside the glyph,
 * and a row of six of those does not fit a 300px strip. The player is not a design-system surface
 * (see `mini-app-window.tsx`), so this is stated as a local primitive rather than smuggled in as a
 * `Button` variant that Figma does not have.
 */
function ChromeButton({
    label,
    icon,
    onClick,
    tone,
    testId,
}: {
    label: string
    icon: 'angle-left' | 'xmark' | 'plus' | 'minus' | 'arrows-expand' | 'arrows-compress'
    onClick: () => void
    tone?: 'destructive'
    /**
     * Passed rather than spread: the prop list here is closed, so a `data-testid` handed to this
     * would be dropped silently. Every chrome control needs a name — the player's whole window is
     * driven from this row. See docs/TEST_IDS.md.
     */
    testId?: string
}) {
    return (
        <button
            type="button"
            data-testid={testId}
            onClick={onClick}
            aria-label={label}
            title={label}
            className={cn(
                /*
                 * Full-strength `--icon-secondary` rather than a 60%-opacity version of it. That
                 * token is already the muted one, and dimming it again put Close — the control a
                 * reader reaches for most — at roughly 3:1 against the strip. Hover promotes the
                 * colour instead, which is the same affordance without starting below legible.
                 */
                'flex size-6 flex-none items-center justify-center rounded-md text-(--icon-secondary)',
                'transition-colors',
                tone === 'destructive'
                    ? 'hover:bg-(--accents-error-bg-active) hover:text-(--text-error)'
                    : 'hover:bg-(--background-disabled) hover:text-(--text-title)',
            )}
        >
            <Icon name={icon} size={16} className="size-4" />
        </button>
    )
}
