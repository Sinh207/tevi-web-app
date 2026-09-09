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
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'
import type { DonationSetting } from '../api/donation-types'

/**
 * The `⋯` in the bar — Share and Donation settings.
 *
 * Legacy's two rows, in legacy's order, on the DS menu rather than a MUI `Popover`.
 *
 * ## Two rows and not three: there is no Delete, on purpose
 *
 * `DELETE setting/` exists on the wire, legacy's model declares it and `useDonation` wraps it as
 * `handleDeleteSetting` — and **nothing calls it**. Not ported, because *Activate Donation* in the
 * setup form is already the off switch, and an irreversible second one is a product decision nobody
 * has made. `donation-api.ts` carries the full note; this is the surface it would appear on, so it
 * is written here too.
 *
 * ## Share needs a URL, and an offer may not have one
 *
 * `sharable_url` is the wire's spelling, one `e` short, and it is `null` when the payload omits it.
 * The row is **disabled** rather than hidden, for the reason `MembershipActionsMenu` gives about the
 * identical field: hiding it would make the menu change shape between two creators for a reason
 * neither can see. Legacy renders `<Share shareUrl={undefined}>` and opens a sheet that copies
 * nothing.
 *
 * ## No gate on the settings row
 *
 * Unlike membership — where editing is shut while anybody is paying, because a tier's price is what
 * existing members are charged — a donation is a **one-off**. Changing the price of a coffee cannot
 * re-charge anyone who already bought one, so there is nothing to protect and legacy gates nothing
 * either.
 */
export function DonationActionsMenu({
    setting,
    onEdit,
}: {
    setting: DonationSetting
    onEdit: () => void
}) {
    const { t } = useTranslation()
    const { myChannel } = useMyChannel()
    const [sharing, setSharing] = useState(false)

    const shareUrl = setting.sharable_url

    return (
        <>
            <ActionMenu>
                {/*
                 * `ActionMenuAnchor`, the **unstyled** half — not `ActionMenuTrigger`, whose own
                 * ghost recipe merges over whatever it renders and leaves a bare `⋯` floating in the
                 * bar with no disc. `MembershipActionsMenu` carries the post-mortem.
                 */}
                <ActionMenuAnchor
                    render={
                        <BarIconButton
                            data-testid="monetization-donation-menu"
                            name="more-horizontal"
                            label={t('monetization_donation_actions')}
                        />
                    }
                />
                <ActionMenuContent align="end">
                    <ActionMenuItem
                        data-testid="monetization-donation-share"
                        disabled={!shareUrl}
                        onClick={() => setSharing(true)}
                    >
                        {t('monetization_donation_share')}
                        <Icon name="share" size={20} />
                    </ActionMenuItem>

                    <ActionMenuItem data-testid="monetization-donation-edit" onClick={onEdit}>
                        {t('monetization_donation_settings')}
                        <Icon name="gear" size={20} />
                    </ActionMenuItem>
                </ActionMenuContent>
            </ActionMenu>

            {shareUrl ? (
                <ShareDialog
                    open={sharing}
                    onOpenChange={setSharing}
                    url={shareUrl}
                    title={setting.name}
                    /* The owner's own thumbnail — see `MembershipActionsMenu` for why this is
                       passed here rather than left to a fallback inside `ShareDialog`. */
                    image={myChannel?.images.thumb}
                />
            ) : null}
        </>
    )
}
