'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { safeExternalUrl } from '@shared/lib/safe-url'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import {
    Menu,
    MenuContent,
    MenuItem,
    MenuItemIcon,
    MenuItemLabel,
    MenuTrigger,
} from '@shared/ui/menu'
import type { Program } from '../api/types'

/**
 * The ⋯ menu on the joined screen: open the mini app, copy the referral link, leave the program.
 *
 * ## Three items, not legacy's four
 *
 * Legacy's "Detail" entry navigates to the screen the menu is already on — it is hidden on that
 * screen by an `isJoined` check, which means the item exists only for the copy of this menu that
 * legacy also mounts in the promoting row. That second mount is gone (the row opens the screen
 * directly), so the entry has nothing left to do.
 *
 * ## Copy, not share
 *
 * Legacy opens its share sheet from here. This app's rule, stated in `channel-event-menu.tsx`, is
 * that invoking a share sheet from inside a menu means two overlays fighting over focus — and there
 * is a third overlay under both, since this menu is inside a dialog. So the link goes to the
 * clipboard and a toast confirms it. The share sheet itself is not ported; see
 * `docs/END_RAIL_OPEN_ITEMS.md`.
 *
 * ## Leave is destructive and last
 *
 * `tone="destructive"` and bottom of the list, after a separator — the DS's own ordering for an
 * action you cannot undo.
 */
export function ProgramOptionsMenu({
    program,
    onCopyLink,
    onLeave,
    canCopy,
    disabled,
}: {
    program: Program | null
    onCopyLink: () => void
    onLeave: () => void
    /** There is a referral link to copy. Absent right after a join that answered without one. */
    canCopy: boolean
    disabled: boolean
}) {
    const { t } = useTranslation()
    const appUrl = safeExternalUrl(program?.url)

    return (
        <Menu>
            <MenuTrigger
                render={
                    <Button
                        variant="ghost"
                        size="small"
                        iconOnly
                        aria-label={t('affiliate_options')}
                        disabled={disabled}
                    />
                }
            >
                <Icon name="more-horizontal" size={20} />
            </MenuTrigger>
            <MenuContent>
                {appUrl ? (
                    <MenuItem
                        render={<a href={appUrl} target="_blank" rel="noreferrer noopener" />}
                    >
                        <MenuItemIcon>
                            <Icon name="arrow-up-right-from-square" size={24} />
                        </MenuItemIcon>
                        <MenuItemLabel>{t('affiliate_menu_open')}</MenuItemLabel>
                    </MenuItem>
                ) : null}

                {canCopy ? (
                    <MenuItem onClick={onCopyLink}>
                        <MenuItemIcon>
                            {/* The sprite has no `copy` glyph — only `copyright` — so the DS's
                                stand-in for it is `pages`. */}
                            <Icon name="pages" size={24} />
                        </MenuItemIcon>
                        <MenuItemLabel>{t('affiliate_menu_copy_link')}</MenuItemLabel>
                    </MenuItem>
                ) : null}

                <MenuItem tone="destructive" onClick={onLeave}>
                    <MenuItemIcon>
                        <Icon name="logout" size={24} />
                    </MenuItemIcon>
                    <MenuItemLabel tone="destructive">{t('affiliate_leave_program')}</MenuItemLabel>
                </MenuItem>
            </MenuContent>
        </Menu>
    )
}
