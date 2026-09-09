'use client'

import { useMyChannel } from '@features/channel'
import { ShareDialog } from '@features/share'
import {
    ActionMenu,
    ActionMenuAnchor,
    ActionMenuContent,
    ActionMenuItem,
} from '@shared/components/action-menu'
import { BarIconButton } from '@shared/components/bar-icon-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'
import type { MyPackage } from '../api/types'

/**
 * The `⋯` in the bar — Share, Membership settings, Delete membership.
 *
 * Legacy's three rows, its order and its two gates, on the DS menu rather than a MUI `Popover`.
 *
 * ## Editing is disabled while anybody is paying, and that is legacy's rule
 *
 * `disabled={activeCount > 0}` on the settings row. It is a **product** rule and not a UI one — a
 * tier's price is what existing members are charged, so changing it under them is a billing change
 * nobody consented to — which is why the count is a prop here rather than something this component
 * fetches. The reason is given as the row's accessible description, because a dimmed row with no
 * explanation is the thing readers file bugs about.
 *
 * ⚠ **The gate fails closed, which is why the count is nullable.** It read `activeCount === 0` over a
 * count that was `0` until the members list answered — so for the whole of that request, and forever
 * if it failed, the row was *open* on a billing change. `null` is "not known yet" and holds the row
 * shut; only a real `0` opens it. `features/permission` states the same rule for a grant: unknown ⇒
 * denied, and a failure is not a denial.
 *
 * ## Share needs a URL, and a tier may not have one
 *
 * `sharable_url` is legacy's spelling (one `e` short) and it is `null` when the payload omits it. A
 * Share row with nothing to share is disabled rather than hidden: hiding it would make the menu
 * change shape between two creators for a reason neither can see.
 *
 * ## Delete asks first, and the question is not rhetorical
 *
 * `ConfirmDialog` with `destructive`, because this ends every membership sold under the tier. The
 * confirm stays open and the button shows its own pending state while the write is in flight —
 * closing on press would leave a reader unsure whether it happened.
 */
export function MembershipActionsMenu({
    tier,
    activeCount,
    onEdit,
    onDelete,
    isDeleting,
}: {
    tier: MyPackage
    /** How many members are paying right now, or `null` while unknown — the gate on editing. */
    activeCount: number | null
    onEdit: () => void
    onDelete: () => Promise<void>
    isDeleting: boolean
}) {
    const { t } = useTranslation()
    const { myChannel } = useMyChannel()
    const [confirming, setConfirming] = useState(false)
    const [sharing, setSharing] = useState(false)

    const canEdit = activeCount === 0
    const shareUrl = tier.sharable_url

    return (
        <>
            <ActionMenu>
                {/*
                 * `ActionMenuAnchor`, the **unstyled** half of the primitive — not
                 * `ActionMenuTrigger`.
                 *
                 * The trigger brings its own `buttonVariants({ ghost, medium, iconOnly })` recipe,
                 * which merges over whatever it renders: wrapping `BarIconButton` in it produced a
                 * bare `⋯` floating in the bar with **no disc at all**, because the ghost variant
                 * paints nothing and its `size-9` fought the 40px box. The anchor stamps
                 * `aria-haspopup="menu"` and `aria-expanded` and paints nothing, so the control is
                 * the sub-page bar's own 40px disc on `--background-surface` — the same button the
                 * back arrow opposite it is. `create-rail-entry.tsx` makes this exact call for the
                 * same reason.
                 */}
                <ActionMenuAnchor
                    render={
                        <BarIconButton
                            data-testid="monetization-membership-menu"
                            name="more-horizontal"
                            label={t('monetization_membership_actions')}
                        />
                    }
                />
                <ActionMenuContent align="end">
                    <ActionMenuItem
                        data-testid="monetization-membership-share"
                        disabled={!shareUrl}
                        onClick={() => setSharing(true)}
                    >
                        {t('monetization_membership_share')}
                        <Icon name="share" size={20} />
                    </ActionMenuItem>

                    <ActionMenuItem
                        data-testid="monetization-membership-edit"
                        disabled={!canEdit}
                        aria-describedby={canEdit ? undefined : 'membership-edit-locked'}
                        onClick={onEdit}
                    >
                        {t('monetization_membership_settings')}
                        {canEdit ? null : (
                            <span id="membership-edit-locked" className="sr-only">
                                {t('monetization_membership_settings_locked')}
                            </span>
                        )}
                        <Icon name="gear" size={20} />
                    </ActionMenuItem>

                    <ActionMenuItem
                        data-testid="monetization-membership-delete"
                        tone="destructive"
                        onClick={() => setConfirming(true)}
                    >
                        {t('monetization_membership_delete')}
                        {/*
                         * `trash`, which is the app's delete glyph — `notification-row-menu`,
                         * `saved-card-row` and `multi-transfer-dialog` all draw it. This row was
                         * `bin`: the same idea, a different drawing, and the only one of its kind in
                         * the app. Two glyphs for one action is exactly what the DS sprite exists to
                         * prevent.
                         */}
                        <Icon name="trash" size={20} />
                    </ActionMenuItem>
                </ActionMenuContent>
            </ActionMenu>

            <ConfirmDialog
                testId="monetization-membership-delete-confirm"
                open={confirming}
                onOpenChange={open => {
                    // A write in flight owns the dialog — dismissing mid-delete leaves the reader
                    // with no idea whether it landed.
                    if (!isDeleting) setConfirming(open)
                }}
                title={t('monetization_membership_delete')}
                description={t('monetization_membership_delete_confirm')}
                confirmLabel={t('common_delete')}
                destructive
                pending={isDeleting}
                onConfirm={() => {
                    /*
                     * `.catch` is not optional: `remove` is a `mutateAsync`, so a refused delete
                     * **rejects**, and `void promise.then(...)` leaves that rejection unhandled — a
                     * console error, and a crash under any handler that treats one as fatal. The
                     * mutation already carries `meta.showErrorToast`, so the reader is told what
                     * happened; what this decides is only that the dialog stays open on a failure,
                     * which is right — it closed on success, so a closed dialog would read as done.
                     */
                    void onDelete()
                        .then(() => setConfirming(false))
                        .catch(() => undefined)
                }}
            />

            {shareUrl ? (
                <ShareDialog
                    open={sharing}
                    onOpenChange={setSharing}
                    url={shareUrl}
                    title={tier.name}
                    /*
                     * The owner's **own** space thumbnail, passed explicitly because
                     * `ShareDialog` declines legacy's implicit `myChannel` fallback (its
                     * `SharePreview` docstring says why: on a shared *post* that fallback
                     * previews the sharer's face instead of the content's). Here the sharer
                     * and the content's owner are the same account — this menu only ever
                     * renders on `/monetization/membership`, the creator's own dashboard — so
                     * the thumb is the right picture rather than a coincidence, and without it
                     * legacy's banner loses its image.
                     */
                    image={myChannel?.images.thumb}
                />
            ) : null}
        </>
    )
}
