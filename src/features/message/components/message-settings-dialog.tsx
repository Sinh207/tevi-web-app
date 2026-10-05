'use client'

import { type MessagingSender, useMessagingSettings } from '@features/channel'
import { useOffersMembership } from '@features/membership'
import { ShareDialog } from '@features/share'
import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { PickerList } from '@shared/components/picker-list'
import { BASE_URL } from '@shared/config/env'
import { useTranslation } from '@shared/i18n/use-translation'
import { apiErrorText } from '@shared/lib/api/error-message'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { conversationPath } from '../routes'

/**
 * "Message settings" — legacy's `common/setting`, behind the gear in the list's title bar: who may
 * start a conversation with the reader, and the link that opens one with them.
 *
 * - **A radio group, not legacy's two switches.** Legacy draws two iOS switches that cannot both be
 *   on, which is a radio group drawn wrong — switching one off does nothing. `PickerList` is the
 *   app's one-of-many with a subtitle per row.
 * - **"Members" only for a creator with tiers**, as legacy's `subscriptionPackages.length > 0` —
 *   unless it is already the saved choice, in which case it stays visible so the dialog does not
 *   misreport the setting.
 * - **Saved on Save**, not on press, as legacy does: the choice changes who can reach the reader,
 *   and it should not land on a mis-tap. The API's own words win on a refusal (API_ERRORS.md).
 * - **The link** is `/@{slug}/messages` on this deployment's origin; Share hands it to the share
 *   sheet (closing this dialog first, so two modals are never stacked) and Copy copies it.
 */
export function MessageSettingsDialog({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const { t } = useTranslation()
    const settings = useMessagingSettings()
    const offersMembership = useOffersMembership(open ? settings.slug : null)
    const [draft, setDraft] = useState<MessagingSender>(settings.sender)
    const [sharing, setSharing] = useState(false)

    // Every opening starts from what is saved.
    useEffect(() => {
        if (open) setDraft(settings.sender)
    }, [open, settings.sender])

    const link = settings.slug
        ? new URL(conversationPath(settings.slug), BASE_URL).toString()
        : null
    const showsMembers = offersMembership === true || settings.sender === 'subscriber'

    const options = [
        {
            value: 'follower',
            label: t('message_settings_followers'),
            subtitle: t('message_settings_followers_body'),
        },
        ...(showsMembers
            ? [
                  {
                      value: 'subscriber',
                      label: t('message_settings_members'),
                      subtitle: t('message_settings_members_body'),
                  },
              ]
            : []),
    ]

    const save = async () => {
        const error = await settings.save(draft)
        if (error) {
            toast.error(apiErrorText(error) ?? t('message_settings_error'), {
                id: 'message-settings',
            })
            return
        }
        toast.success(t('message_settings_saved'), { id: 'message-settings' })
        onOpenChange(false)
    }

    const copy = () => {
        if (!link) return
        navigator.clipboard
            ?.writeText(link)
            .then(() => toast.success(t('message_copied'), { id: 'message-settings-copy' }))
            .catch(() => toast.error(t('message_copy_failed'), { id: 'message-settings-copy' }))
    }

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent data-testid="message-settings" className="sm:w-[420px]">
                    <DialogHeader>
                        <DialogTitle>{t('message_settings_title')}</DialogTitle>
                    </DialogHeader>

                    <div className="flex flex-col gap-2">
                        <span className="type-dense-strong text-(--text-title)">
                            {t('message_settings_allow_from')}
                        </span>
                        <PickerList
                            testId="message-settings-sender"
                            label={t('message_settings_allow_from')}
                            options={options}
                            value={draft}
                            onSelect={value => setDraft(value as MessagingSender)}
                        />
                    </div>

                    {link && (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="type-body-strong text-(--text-title)">
                                        {t('message_settings_link_title')}
                                    </span>
                                    <span className="type-dense-default text-(--text-body)">
                                        {t('message_settings_link_body')}
                                    </span>
                                </span>
                                <Button
                                    data-testid="message-settings-share"
                                    variant="ghost"
                                    size="large"
                                    iconOnly
                                    aria-label={t('message_settings_share')}
                                    onClick={() => {
                                        onOpenChange(false)
                                        setSharing(true)
                                    }}
                                >
                                    <Icon name="share" size={20} />
                                </Button>
                            </div>
                            <div className="flex items-center gap-2 rounded-(--radius-md) bg-(--background-surface) py-2 ps-3 pe-2">
                                <bdi className="min-w-0 flex-1 truncate type-dense-emphasis text-(--text-body)">
                                    {link.replace(/^https?:\/\//, '')}
                                </bdi>
                                <Button
                                    data-testid="message-settings-copy"
                                    variant="primary"
                                    size="small"
                                    onClick={copy}
                                >
                                    {t('message_copy')}
                                </Button>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            data-testid="message-settings-submit"
                            variant="primary"
                            size="large"
                            disabled={draft === settings.sender || settings.isSaving}
                            onClick={save}
                        >
                            {t('message_settings_save')}
                        </Button>
                    </DialogFooter>

                    <DialogCloseButton
                        data-testid="message-settings-close"
                        className="absolute end-2 top-2"
                    />
                </DialogContent>
            </Dialog>

            {link && (
                <ShareDialog
                    open={sharing}
                    onOpenChange={setSharing}
                    url={link}
                    title={t('message_settings_link_title')}
                />
            )}
        </>
    )
}
