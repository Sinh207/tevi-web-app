'use client'

import { ShareDialog, spaceShareContext } from '@features/share'
import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'
import type { DonationTarget } from '../api/types'
import { useDonateFlow } from '../hooks/use-donate-flow'
import { hasStarPrice } from '../lib/donation-amount'
import { DonateDialogs } from './donate-dialogs'
import { DonationArt } from './donation-art'

/**
 * The About tab's "Support {creator}" block — legacy's `viewer/.../about/directDonate`.
 *
 * **Visitors only**, and the About tab enforces that at the call site, the same way it does for the
 * two owner-only blocks: a component that renders whatever it is handed is easier to reason about
 * than one that silently draws nothing under conditions written inside it.
 *
 * ## No card chrome of its own
 *
 * The bordered card is `ChannelAboutCard`, and it stays in `features/channel` — this renders the
 * contents. That is not tidiness: `features/channel` imports this feature's barrel, so importing its
 * barrel back would be a cycle between two features, and duplicating the card's four classes here is
 * exactly the drift this codebase has already been bitten by three times (a globe glyph in three
 * spellings, a copy row in two). The tab already has to know whether this block exists — it counts
 * the blocks for its own empty state — so it is the natural owner of the wrapper.
 *
 * ## The share button opens the sheet, and used to be a copy control
 *
 * It wrote `target.shareUrl` to the clipboard and turned its glyph into a tick for two seconds —
 * the app's copy idiom, and the right thing while there was no sheet to open. `features/share`'s
 * dialog is what legacy opens from this surface (`containers/monetization/donation/settingsMenu`),
 * so the press opens it and **Copy link survives inside it** as one of the seven channels. The tick,
 * the timer and its unmount cleanup went with the gesture.
 *
 * The context is the **space**, from `target.id` and `target.slug` — `spaceShareContext` answers
 * `null` when a target was assembled without an id (a post, a message), which routes the share
 * through `v1/shorten/` instead of losing it. That is the same nullable contract the cash tab reads
 * `id` for, one field over.
 *
 * ## The same flow as the action row, and one request between them
 *
 * `useDonateFlow` here and in `donate-button.tsx` resolve onto one `useDirectDonate` query, so
 * mounting both costs nothing extra. The two hold **independent** dialog state, which is correct
 * rather than merely acceptable: only one of them can be pressed, so only one stack can be open.
 * The deep link is deliberately not handled here — see the note in `donate-button.tsx`.
 */
export function DonateSupportCard({ target }: { target: DonationTarget }) {
    const { t } = useTranslation()
    const flow = useDonateFlow(target)
    const { offer } = flow
    const [shareOpen, setShareOpen] = useState(false)

    if (!offer || !hasStarPrice(offer)) return null

    /**
     * Legacy shows the count only when the creator opted in **and** it is above zero — a card
     * announcing "×0 received" advertises that nobody has donated, on the creator's own page.
     */
    const showsCount = offer.display_supporter_count && offer.donation_count > 0

    return (
        <div className="flex min-w-0 flex-col gap-3 p-3">
            <h3 className="type-body-strong min-w-0 text-(--text-title)">
                {t('donation_support_title', {
                    name: target.name ?? t('donation_creator_fallback'),
                })}
            </h3>

            <div className="flex items-center gap-2">
                {/*
                 * `accent` here and `secondary` in the action row, and the difference is deliberate:
                 * this card exists for one purpose and the button *is* the card, while the row's
                 * button sits beside Follow and must not compete with it.
                 *
                 * `size="large"` — 48, the app's action-button height, the same as the space's own
                 * action row and every dialog footer. It was `medium` (36), which made the one
                 * control this card exists for the smallest button on the screen.
                 */}
                <Button
                    data-testid="donation-support-donate"
                    variant="accent"
                    size="large"
                    className="min-w-0 flex-1"
                    onClick={flow.open}
                >
                    <DonationArt icon={offer.icon} size={20} className="flex-none" />
                    <span className="truncate">
                        {offer.button_text ?? t('donation_action_donate')}
                    </span>
                </Button>
                {target.shareUrl && (
                    <Button
                        data-testid="donation-share"
                        variant="secondary"
                        size="large"
                        iconOnly
                        aria-label={t('donation_share')}
                        onClick={() => setShareOpen(true)}
                    >
                        <Icon name="share" size={20} />
                    </Button>
                )}
            </div>

            {showsCount && (
                <p className="flex items-center gap-1 text-(--text-title)">
                    <DonationArt icon={offer.icon} size={24} className="flex-none" />
                    <span className="type-body-strong">
                        {/*
                         * Plural keys with `{{count, number}}`, the same shape
                         * `data_storage_items_one/other` uses — the grouping separator is the
                         * reader's, and the nine locales do not agree on how to pluralise this.
                         */}
                        {t('donation_received', { count: offer.donation_count })}
                    </span>
                </p>
            )}

            <DonateDialogs flow={flow} target={target} />

            {target.shareUrl && (
                <ShareDialog
                    open={shareOpen}
                    onOpenChange={setShareOpen}
                    url={target.shareUrl}
                    title={target.name}
                    image={target.avatarUrl}
                    context={spaceShareContext({ id: target.id, slug: target.slug })}
                />
            )}
        </div>
    )
}
