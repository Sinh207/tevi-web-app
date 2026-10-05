'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import {
    ListRow,
    ListRowAccessory,
    ListRowContent,
    ListRowLeading,
    ListRowRule,
    ListRowSubtitle,
    ListRowText,
    ListRowTitle,
    ListRowTrailing,
} from '@shared/ui/list'
import { Loader } from '@shared/ui/loader'
import { Skeleton } from '@shared/ui/skeleton'
import { Toggle } from '@shared/ui/toggle'
import Image from 'next/image'
import { useInboxTypes } from '../hooks/use-inbox-types'

/**
 * "Notification you want to see" — one switch per notification kind, with a Save.
 *
 * ## A dialog, where legacy has a dialog *and* a drawer
 *
 * Legacy renders `StyledDialog` above `md` and `StyledDrawer` (`anchor='bottom'`) below it, which
 * is the right pattern for a phone. This app has no ported bottom sheet: the DS draws one
 * (`preview/sheet.html`, `Sheet/_Overlay` 40:9676) and `shared/ui/dialog.tsx` uses only its scrim.
 * Reproducing a drag-to-dismiss sheet for one screen would mean inventing the interaction, so this
 * is the DS `Dialog` at every width, with `max-h` and a scrolling body so eleven switches fit a
 * short viewport. **When a Sheet is ported, this is a call site to revisit** — flagged rather than
 * silently settled for.
 *
 * ⚠ **A sheet exists now** — `shared/ui/sheet.tsx`, Base UI's `Drawer` behind this app's tokens,
 * wired to the post composer's popups through `ResponsiveDialog`. It is a **trailing-edge,
 * full-screen** panel (legacy's composer geometry); the DS's own `.tevi-bottom-sheet` is still
 * unreadable, so a *bottom* variant does not exist yet. This screen is deliberately not switched:
 * the composer was the agreed first cut, and moving anything else is a product call rather than a
 * refactor. Switching it is `ResponsiveDialog` plus the `className` already here.
 * ## Draft-then-Apply, and closing discards
 *
 * The endpoint takes the whole list in one `POST`, so a switch that wrote immediately would send
 * every row's state on every tap — see `useInboxTypes`, which owns that reasoning. Here the
 * consequence is only that **closing without applying discards**, which is what a reader expects
 * from a dialog with one commit button in it, and what legacy also does.
 *
 * Apply is disabled until something changed, so opening the sheet and closing it cannot cost a
 * request. There is no Cancel: the header's X is the way out, and a second button that only closes
 * would compete with the one thing the reader opened this for. Legacy's footer is one
 * full-width `Apply Filter` and nothing else.
 *
 * ## The copy in the rows is the **server's**, in one language
 *
 * `metadata.title` / `metadata.description` arrive as sentences, not keys. Legacy runs them through
 * a reverse lookup over the English bundle to find a translation key whose value matches
 * (`useHelper.handleKey`) — an O(bundle) scan per row that fails silently to the English string,
 * against keys (`push_notification_w2_*`) that do not exist in this repo at all. It is not ported.
 * The server's sentence is rendered as sent, and the gap is written down as **B79**: this client
 * sends no `Accept-Language` on any request, so the service cannot localise, and localising a
 * sentence in the browser needs the key beside it rather than a search for one.
 */
export function NotificationFilterDialog({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const { t } = useTranslation()
    const { types, isLoading, isError, isEmpty, refetch, isOn, toggle, isDirty, isSaving, save } =
        useInboxTypes({ open })

    /** Save closes on press, not on success — the mutation's own toast reports the outcome, and a
     *  dialog held open behind a spinner for a request that fails makes the reader confirm twice. */
    const onSave = () => {
        save()
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/*
             * Wider than the DS's 370 and taller-capped, because this is a *list* dialog rather
             * than the two-line confirmation the geometry is drawn for: eleven rows of a title, a
             * description and a switch do not fit 370px without every description wrapping to
             * four lines. `max-w-[calc(100vw-2rem)]` (the shell's own) still holds on a phone.
             *
             * `gap-5` is the shell's; `p-0` moves the padding into the three sections so the
             * scrolling body's edges are the dialog's and a row's hairline runs the full width.
             */}
            <DialogContent className="w-[420px] max-h-[min(90vh,640px)] gap-0 p-0">
                <DialogHeader className="items-start gap-1 px-6 pt-6 pb-4 text-start">
                    {/* `pe-8` so a long title wraps *before* it reaches the close, rather than
                        running under it — the X is absolutely positioned and takes no space in
                        flow, so nothing else reserves it. */}
                    <DialogTitle className="type-title-t2-semibold text-(--text-title) pe-8">
                        {t('notification_filter_title')}
                    </DialogTitle>
                    <DialogDescription className="type-dense-default text-(--text-subtitle)">
                        {t('notification_filter_body')}
                    </DialogDescription>
                </DialogHeader>

                {/* `min-h-0` is what makes the scroll happen: a flex child's default `min-height:
                    auto` refuses to shrink below its content, so without it the dialog grows past
                    its own `max-h` and the page scrolls instead of the list. */}
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {isLoading ? (
                        <ul aria-busy="true" className="list-none">
                            {Array.from({ length: 5 }, (_, index) => `type-skeleton-${index}`).map(
                                (key, index) => (
                                    <li key={key}>
                                        <ListRow
                                            data-testid="notification-filter-all"
                                            rightAction
                                            className="min-h-[72px]"
                                        >
                                            <ListRowLeading>
                                                <Skeleton
                                                    circle
                                                    w={24}
                                                    h={24}
                                                    delay={index * 160}
                                                />
                                            </ListRowLeading>
                                            <ListRowContent>
                                                {index > 0 && <ListRowRule />}
                                                <ListRowAccessory rightAction>
                                                    <ListRowText rightAction>
                                                        <div className="flex h-[24px] items-center">
                                                            <Skeleton w={140} delay={index * 160} />
                                                        </div>
                                                        <div className="flex h-[21px] items-center">
                                                            <Skeleton w="70%" delay={index * 160} />
                                                        </div>
                                                    </ListRowText>
                                                    <ListRowTrailing variant="toggle">
                                                        <Skeleton
                                                            w={44}
                                                            h={28}
                                                            delay={index * 160}
                                                        />
                                                    </ListRowTrailing>
                                                </ListRowAccessory>
                                            </ListRowContent>
                                        </ListRow>
                                    </li>
                                ),
                            )}
                        </ul>
                    ) : isError ? (
                        <div
                            className={cn(
                                'flex flex-col items-center gap-3 px-6 py-10 text-center',
                                RISE,
                            )}
                        >
                            <Icon
                                name="exclamation-diamond"
                                size={32}
                                className="flex-none text-(--accents-error-active)"
                            />
                            <p className="type-dense-default text-(--text-subtitle)">
                                {t('notification_filter_error')}
                            </p>
                            <Button
                                data-testid="notification-filter-retry"
                                variant="secondary"
                                size="medium"
                                onClick={refetch}
                            >
                                {t('common_retry')}
                            </Button>
                        </div>
                    ) : isEmpty ? (
                        /* A real state, not a failure: an account the backoffice has configured no
                           switchable types for gets an empty list, and saying so is better than an
                           empty scroll area that looks like a broken render. */
                        <p
                            className={cn(
                                'px-6 py-10 text-center type-dense-default text-(--text-subtitle)',
                                RISE,
                            )}
                        >
                            {t('notification_filter_empty')}
                        </p>
                    ) : (
                        <ul className="list-none">
                            {types.map((type, index) => {
                                const label = type.metadata?.title || type.name || ''
                                const description = type.metadata?.description
                                const checked = isOn(type.id)
                                return (
                                    <li key={type.id}>
                                        <ListRow
                                            data-testid="notification-filter-row"
                                            data-option-value={type.id}
                                            rightAction
                                        >
                                            <ListRowLeading>
                                                {type.icon_metadata ? (
                                                    /* Decorative: the label beside it says the
                                                       same thing.

                                                       `unoptimized` for the reason
                                                       `NotificationRow` spells out — the URL is the
                                                       notification service's, and a host missing
                                                       from `remotePatterns` is a runtime throw
                                                       rather than a broken image. Here it would
                                                       take the sheet down mid-configuration. */
                                                    <Image
                                                        src={type.icon_metadata}
                                                        alt=""
                                                        width={24}
                                                        height={24}
                                                        unoptimized
                                                        className="size-6 flex-none object-contain"
                                                    />
                                                ) : (
                                                    <Icon
                                                        name="bell"
                                                        size={20}
                                                        className="flex-none text-(--icon-secondary)"
                                                    />
                                                )}
                                            </ListRowLeading>
                                            <ListRowContent>
                                                {index > 0 && <ListRowRule />}
                                                <ListRowAccessory rightAction>
                                                    <ListRowText rightAction>
                                                        <ListRowTitle>{label}</ListRowTitle>
                                                        {description && (
                                                            <ListRowSubtitle>
                                                                {description}
                                                            </ListRowSubtitle>
                                                        )}
                                                    </ListRowText>
                                                    <ListRowTrailing variant="toggle">
                                                        <Toggle
                                                            data-testid="notification-filter-type"
                                                            data-option-value={type.id}
                                                            checked={checked}
                                                            onCheckedChange={() => toggle(type.id)}
                                                            /*
                                                             * The switch's own name, because the
                                                             * visible label is a sibling node and
                                                             * not a `<label for>` — the DS row puts
                                                             * the text in its own column. Without
                                                             * this the control announces as an
                                                             * unnamed switch.
                                                             */
                                                            aria-label={label}
                                                            disabled={isSaving}
                                                        />
                                                    </ListRowTrailing>
                                                </ListRowAccessory>
                                            </ListRowContent>
                                        </ListRow>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>

                {/*
                 * **One** button, full width — legacy's shape, and the Cancel/Save pair that was
                 * here before was mine rather than the design's
                 * (`notification-filter-apply-btn`, `Apply Filter`, `width: 100%`).
                 *
                 * Cancel earned its place only as long as Apply could be disabled with no other way
                 * out. The close in the header is that way out, and it is also legacy's
                 * (`notification-filter-close-btn`) — so the footer holds the one thing the reader
                 * came here to do and nothing that competes with it. `layout="stacked"` is what
                 * makes a lone button fill the axis: `DialogFooter`'s own note records that
                 * `fullWidth` on a flex child does the wrong thing here.
                 */}
                <DialogFooter layout="stacked" className="px-6 pt-4 pb-6">
                    <Button
                        data-testid="notification-filter-save"
                        variant="accent"
                        size="large"
                        /* Nothing changed means nothing to send — and an Apply that writes back
                           exactly what is already stored reads as working while doing nothing.
                           Safe to disable now that the header carries the close: legacy disables
                           it on the same condition, for the same reason, beside the same X. */
                        disabled={!isDirty || isSaving}
                        onClick={onSave}
                    >
                        {isSaving && <Loader className="size-[18px]" />}
                        {t('notification_filter_apply')}
                    </Button>
                </DialogFooter>

                {/*
                 * The way out, and the reason the footer can hold a single disabled button.
                 *
                 * Legacy puts its X *leading* with the title centred — the mobile-drawer
                 * arrangement. This header is left-aligned (a two-line description reads far better
                 * ranged left than centred), so this is a **card** and the X goes trailing, which is
                 * where every card's close in this app sits. `DialogCloseButton`, not a fifth copy of
                 * the same disc — the 32px one this used to draw was a miss under a thumb.
                 *
                 * `end-2`/`top-2`: logical, so it mirrors under RTL without a variant, and the inset
                 * that leaves the 40px target's glyph where the 32px one's was.
                 */}
                <DialogCloseButton
                    data-testid="notification-filter-close"
                    className="absolute end-2 top-2"
                />
            </DialogContent>
        </Dialog>
    )
}
