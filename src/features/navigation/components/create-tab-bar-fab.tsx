'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { GetAppDialog } from '@shared/components/get-app-dialog'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@shared/ui/dialog'
import { ListRow } from '@shared/ui/list'
import { TabBarFab } from '@shared/ui/tab-bar'
import { useCreateAction } from '../hooks/use-create-action'
import { CreateOptionRow } from './create-option-row'

/**
 * The tab bar's FAB and the Create list it opens on a phone.
 *
 * ## A dialog, not a popover and not a sheet
 *
 * A 200px popover anchored to a control in the middle of a 56px bar is a desktop shape; legacy's
 * own mobile branch is a `Dialog` too. And there is **no bottom sheet in this app** — the DS draws
 * none and legacy's `ResponsiveModal` is deliberately not being ported — so a centred dialog is the
 * shape available, which two rows fit inside without a height cap.
 *
 * ⚠ **A sheet exists now** — `shared/ui/sheet.tsx`, Base UI's `Drawer` behind this app's tokens,
 * wired to the post composer's popups through `ResponsiveDialog`. It is a **trailing-edge,
 * full-screen** panel (legacy's composer geometry); the DS's own `.tevi-bottom-sheet` is still
 * unreadable, so a *bottom* variant does not exist yet. This screen is deliberately not switched:
 * the composer was the agreed first cut, and moving anything else is a product call rather than a
 * refactor. Switching it is `ResponsiveDialog` plus the `className` already here.
 * ## The rows are `List/Action`, on their own rounded surface
 *
 * The same `CreateOptionRow` the rail's popover puts inside its menu items, here inside a real
 * `ListRow` — so the two surfaces are one component seen twice. The container is the three classes
 * `ActionRows` uses for the same job (rounded, clipped, `--background-surface`), and not
 * `ActionRows` itself: that component's rows are one line with an `sr-only` reason, and these have
 * a second line and a visible badge. `CreateOptionRow` says why that difference is deliberate.
 *
 * `as="button"` with `disabled` for the row that has no action yet — the native attribute is what
 * takes it out of the tab order and stops the press; `ListRow`'s own doc notes the DS ships no
 * disabled *style*, so the paint is the caller's and lives in `CreateOptionRow`.
 *
 * ## The glyph is still the DS's video hexagon, and the label no longer claims to be
 *
 * `Tab Bar`'s FAB draws a video camera (Selected=Yes and No are pixel-identical, so nothing keys
 * off state). It now opens the same two-option list as the rail's `+`, so the accessible name is
 * **Create** — a control should be named for what it does — while the drawing stays the DS's until
 * design says otherwise. That mismatch is the one open question here; the `nav_video` key is left
 * in place for whichever way it is answered.
 */
export function CreateTabBarFab() {
    const { t } = useTranslation()
    const create = useCreateAction()

    return (
        <>
            <TabBarFab
                data-testid="navigation-tab-bar-create"
                aria-label={t('nav_create')}
                aria-haspopup="dialog"
                onClick={() => create.onOpenChange(true)}
            />

            <Dialog open={create.open} onOpenChange={create.onOpenChange}>
                <DialogContent data-testid="navigation-tab-bar-create-dialog" className="gap-4">
                    <DialogHeader>
                        <DialogTitle>{create.title}</DialogTitle>
                    </DialogHeader>

                    <div
                        data-testid="navigation-tab-bar-create-list"
                        className="flex flex-col overflow-hidden rounded-xl bg-(--background-surface)"
                    >
                        {create.options.map((option, index) => (
                            <ListRow
                                key={option.key}
                                as="button"
                                rightAction
                                disabled={!option.onSelect}
                                onClick={option.onSelect}
                                data-testid="navigation-tab-bar-create-list-row"
                                data-row-key={option.key}
                                className={cn(
                                    'group/create-row text-start',
                                    option.onSelect
                                        ? 'cursor-pointer hover:bg-(--button-ghost-bg-hover)'
                                        : 'cursor-not-allowed',
                                    RISE,
                                )}
                                /* Same 60ms stagger the popover uses — one gesture, two shells. */
                                style={riseDelay(index)}
                            >
                                <CreateOptionRow
                                    option={option}
                                    unavailableLabel={create.unavailableLabel}
                                    /* The DS rule sits inside the content column, so it stops short
                                       of the leading tile instead of running the full width. */
                                    showRule={index > 0}
                                    showChevron
                                />
                            </ListRow>
                        ))}
                    </div>

                    {/* Trailing edge, last in the DOM — the card rule in `docs/DESIGN_SYSTEM.md` §7,
                        and last so base-ui's initial focus lands on a row rather than on the way
                        out. */}
                    <DialogCloseButton
                        data-testid="navigation-tab-bar-create-dialog-close"
                        className="absolute end-2 top-2"
                    />
                </DialogContent>
            </Dialog>

            {/* Sequential, never stacked: the `event` row closes the list before this opens. */}
            <GetAppDialog {...create.appPrompt} testId="navigation-tab-bar-create-prompt" />
        </>
    )
}
