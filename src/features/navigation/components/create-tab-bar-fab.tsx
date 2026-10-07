'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { GetAppDialog } from '@shared/components/get-app-dialog'
import { LIVE_GRADIENT } from '@shared/components/live-ring'
import { useTranslation } from '@shared/i18n/use-translation'
import { POP, RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Badge } from '@shared/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { type CreateOption, useCreateAction } from '../hooks/use-create-action'

/**
 * The tab bar's "+" and the Create dialog it opens on a phone.
 *
 * ## A dialog, not a popover and not a sheet
 *
 * A 200px popover anchored to a control in the middle of a bar is a desktop shape; legacy's own
 * mobile branch is a `Dialog` too. And there is **no bottom sheet in this app** — the DS draws none
 * and legacy's `ResponsiveModal` is deliberately not being ported.
 *
 * ⚠ **A sheet exists now** — `shared/ui/sheet.tsx`, Base UI's `Drawer` behind this app's tokens,
 * wired to the post composer's popups through `ResponsiveDialog`. It is a **trailing-edge,
 * full-screen** panel (legacy's composer geometry); the DS's own `.tevi-bottom-sheet` is still
 * unreadable, so a *bottom* variant does not exist yet. Moving this screen onto one is a product
 * call rather than a refactor.
 *
 * ## …but it opens *from the button*
 *
 * The dialog is `DialogContent` re-anchored, not a new primitive: it sits just above the floating
 * tab bar instead of mid-screen, the bar's own 12px from each edge, and grows out of the bottom
 * (`origin-bottom`, rising 12px as it scales in) — so it reads as the "+" opening rather than as a
 * modal arriving from nowhere. Everything else is the DS dialog's: the overlay, the focus trap, the
 * dismiss button, the height cap. `TAB_BAR_ANCHOR` is the tab bar's reserve from `TabBarShell`,
 * written out because a portal does not inherit the `--tab-bar-reserve` that wrapper sets.
 *
 * ## Two cards, not two list rows
 *
 * Two options are a choice, not a list — so they are side by side, each a large target with a
 * gradient tile, the label and the hint. The rail's popover keeps `CreateOptionRow`: a menu under a
 * pointer is the right shape there. The event card carries an **App** tag, because its press opens
 * a "get the app" prompt rather than a flow, and the reader should know that before choosing it.
 *
 * Cards rise in turn after the dialog (`RISE`, 60ms apart) and their tiles pop as they land
 * (`POP`); press scales a card to 0.97. A card with no action (`onSelect` absent) is a real
 * disabled `<button>` — out of the tab order, unpressable — with the *Coming soon* badge.
 *
 * ## A "+", not the DS's video hexagon
 *
 * `Tab Bar`'s FAB draws a video camera, and on the web that promised the one thing the button
 * cannot do: a live is created in the app, and the event card only says so. What the web *can*
 * create here is a post. So the centre of the floating bar is a round accent "+", 44px inside the
 * 64px pill — the largest target that still leaves the pill's edge visible around it.
 *
 * It is lit rather than flat: a soft highlight from the top-leading corner and a quiet glow in its
 * own colour beneath it instead of a grey shadow, so it reads as the one primary action on the bar.
 * A 14px-radius squircle with a 2px `plus--filled` glyph — the **same tile as the desktop rail's**
 * `+` (`CreateRailEntry`), so the create action is one object in both shells. While the dialog is
 * open the glyph turns 45° into a ×, which is what the button now does.
 */

/**
 * The floating tab bar's reserve — `TabBarShell`'s `--tab-bar-reserve` (64 pill + 12 air + the lift
 * off the bottom edge). Kept in step by hand: the dialog is portalled, so it cannot read the
 * variable from the wrapper that sets it.
 */
const TAB_BAR_ANCHOR = 'calc(76px + max(12px, calc(env(safe-area-inset-bottom) + 4px)))'

/** One gradient per option — the event's is the live mark's own, so "go live" looks like live. */
const TILE_GRADIENT: Record<CreateOption['key'], string> = {
    post: 'linear-gradient(135deg, var(--accents-indigo-active), var(--button-accent-bg))',
    event: LIVE_GRADIENT,
}

/** The app's arrival curve (`shared/lib/motion.ts`). */
const EASE = 'duration-240 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none'

export function CreateTabBarFab() {
    const { t } = useTranslation()
    const create = useCreateAction()

    return (
        <>
            <div className="flex justify-center">
                <button
                    type="button"
                    data-testid="navigation-tab-bar-create"
                    aria-label={t('nav_create')}
                    aria-haspopup="dialog"
                    aria-expanded={create.open}
                    onClick={() => create.onOpenChange(true)}
                    className={cn(
                        'relative flex size-11 items-center justify-center overflow-hidden rounded-[14px] bg-(--button-accent-bg) text-(--white) outline-none',
                        'shadow-[0_4px_12px_-4px_color-mix(in_srgb,var(--button-accent-bg)_45%,transparent),inset_0_1px_0_color-mix(in_srgb,var(--white)_28%,transparent)]',
                        'transition-[scale,filter] duration-150 hover:brightness-110 active:scale-90 motion-reduce:transition-none',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                    )}
                >
                    {/* The highlight — light falling from the top-leading corner. */}
                    <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_30%_10%,color-mix(in_srgb,var(--white)_32%,transparent),transparent_60%)]"
                    />
                    <span
                        aria-hidden
                        className={cn(
                            'relative flex transition-[rotate]',
                            EASE,
                            create.open && 'rotate-45',
                        )}
                    >
                        <Icon name="plus" weight="filled" size={22} />
                    </span>
                </button>
            </div>

            <Dialog open={create.open} onOpenChange={create.onOpenChange}>
                <DialogContent
                    data-testid="navigation-tab-bar-create-dialog"
                    style={{ bottom: TAB_BAR_ANCHOR }}
                    className={cn(
                        'top-auto w-[calc(100vw-24px)] max-w-[420px] translate-y-0 gap-4 p-4 pt-5',
                        'max-h-[calc(100dvh-180px)] origin-bottom rounded-3xl',
                        'transition-[opacity,scale,translate]',
                        EASE,
                        'data-[starting-style]:translate-y-3 data-[ending-style]:translate-y-3',
                    )}
                >
                    <DialogHeader>
                        <DialogTitle>{create.title}</DialogTitle>
                    </DialogHeader>

                    <div
                        data-testid="navigation-tab-bar-create-list"
                        className="grid grid-cols-2 gap-3"
                    >
                        {create.options.map((option, index) => (
                            <CreateCard
                                key={option.key}
                                option={option}
                                index={index}
                                appLabel={t('nav_create_event_badge')}
                                unavailableLabel={create.unavailableLabel}
                            />
                        ))}
                    </div>

                    {/* Trailing edge, last in the DOM — the card rule in `docs/DESIGN_SYSTEM.md` §7,
                        and last so base-ui's initial focus lands on a card rather than on the way
                        out. */}
                    <DialogCloseButton
                        data-testid="navigation-tab-bar-create-dialog-close"
                        className="absolute end-2 top-2"
                    />
                </DialogContent>
            </Dialog>

            {/* Sequential, never stacked: the event card closes the dialog before this opens. */}
            <GetAppDialog {...create.appPrompt} testId="navigation-tab-bar-create-prompt" />
        </>
    )
}

function CreateCard({
    option,
    index,
    appLabel,
    unavailableLabel,
}: {
    option: CreateOption
    index: number
    appLabel: string
    unavailableLabel: string
}) {
    const available = Boolean(option.onSelect)

    return (
        <button
            type="button"
            data-testid="navigation-tab-bar-create-list-row"
            data-row-key={option.key}
            disabled={!available}
            onClick={option.onSelect}
            // After the dialog's own entrance: the first card lands one step behind it.
            style={riseDelay(index + 1)}
            className={cn(
                'group/card relative flex min-w-0 flex-col items-start gap-3 rounded-2xl bg-(--background-surface) p-4 text-start outline-none',
                'shadow-[inset_0_0_0_1px_var(--separator-default)]',
                'transition-[scale,box-shadow] duration-150 motion-reduce:transition-none',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                available
                    ? 'cursor-pointer hover:shadow-[inset_0_0_0_1px_var(--separator-strong),var(--elevation-md)] active:scale-[0.97]'
                    : 'cursor-not-allowed',
                RISE,
            )}
        >
            <span
                aria-hidden
                style={{ backgroundImage: TILE_GRADIENT[option.key], ...riseDelay(index + 2) }}
                className={cn(
                    'flex size-12 items-center justify-center rounded-xl text-(--white) shadow-md',
                    'transition-[scale] duration-150 motion-reduce:transition-none',
                    available ? 'group-hover/card:scale-105' : 'opacity-40 grayscale',
                    POP,
                )}
            >
                <Icon name={option.icon} size={24} />
            </span>

            <span className="flex min-w-0 flex-col gap-0.5">
                <span
                    className={cn(
                        'type-body-strong',
                        available ? 'text-(--text-title)' : 'text-(--text-subtitle)',
                    )}
                >
                    {option.label}
                </span>
                <span className="type-caption-meta text-(--text-subtitle)">{option.hint}</span>
            </span>

            {option.key === 'event' && available && (
                <Badge size="small" status="default" className="absolute end-3 top-3">
                    {appLabel}
                </Badge>
            )}
            {!available && (
                <Badge size="small" status="outline" className="absolute end-3 top-3">
                    {unavailableLabel}
                </Badge>
            )}
        </button>
    )
}
