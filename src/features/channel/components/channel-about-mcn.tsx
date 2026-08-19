'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'
import { useMcnLeave } from '../hooks/use-mcn-leave'
import { formatActivityDateTime } from '../lib/channel-format'
import { useMyChannel } from '../providers/my-channel-provider'
import { ChannelAboutCard } from './channel-about-card'

/**
 * The creator's MCN — **my space only**.
 *
 * ## It reads `my-channel`, not the channel on screen — and it had to
 *
 * This took the page's `Channel` as a prop and read `channel.mcn`, which looked right and rendered
 * **nothing, ever**: `GET /core/v3/channel/channels/{slug}/` does not carry an `mcn` field at all.
 * Confirmed against the live endpoint — it answers 44 keys and that is not one of them. Legacy has
 * always read it off `useMyChannelContext().myChannel`, i.e. from `my-channel/`, and the reason is
 * the same reason the block is owner-only: a revenue split is not public information about a space,
 * so it is not on the public endpoint.
 *
 * `MyChannelProvider` already holds that body app-wide, so this costs no request.
 *
 * It also means the prop was worse than useless: it made the component *look* like it worked off the
 * viewed channel, which is exactly the reading that would let someone "fix" it by rendering for
 * visitors too.
 *
 * ## Why the ownership check is not in this file
 *
 * It is, at the call site, and that is deliberate: a component that renders whatever it is handed is
 * easier to reason about than one that silently draws nothing under some conditions. But the rule
 * itself is not a preference, so it is written down in both places.
 *
 * `creator_rate` and `mcn_revenue_rate` are the **percentage split** between a creator and their
 * management network — the commercial terms of a contract. Legacy puts "Leave this MCN" beside them,
 * i.e. it is a management block for the person under the contract, not a fact about the space. An
 * earlier version of the About tab rendered this for everyone; that it read a field the public
 * endpoint never sends is the only reason nothing leaked.
 *
 * ## Layout is legacy's `CardHeader` + a two-column `Grid`
 *
 * A header row — 12/medium "Managed by MCN" over the network's name in 14/semibold, truncated — with a
 * full-bleed rule under it, then the two rates side by side, each a centred label-over-value column,
 * split by a vertical rule. Legacy sizes the grid 5.5 / 1 / 5.5 to make room for a `<Divider/>` in a
 * column of its own; `grid-cols-2` with `divide-x` puts the rule exactly on the boundary and needs no
 * spare column, which is the same picture with one fewer moving part.
 *
 * An earlier pass drew the rates as a `<dl>` of justified rows inside a tinted box. That is a
 * different component; this is the port.
 *
 * ## Read-only
 *
 * ## Leaving: a button, where legacy has a kebab menu
 *
 * Legacy puts "Leave this MCN" behind a `MoreVert` → `Menu` in the card header. This is the one
 * deliberate departure from its markup, and it is because **the menu has exactly one item**. A menu
 * with one item is a button wearing a costume: it costs a tap to discover, hides the only thing it
 * offers, and here it would additionally cost a DS primitive this app does not have — neither
 * `dropdown` nor `bottom-sheet` is ported, and hand-rolling an overlay is what
 * `docs/DEFINITION_OF_DONE.md` §10 forbids.
 *
 * So the item becomes a destructive text button in the header row. If a second item ever appears,
 * that is the moment to port the dropdown, not before.
 *
 * This whole block was deferred once on the grounds that it needed a primitive we lacked and wrote
 * to another microservice. Half of that expired: `shared/ui/confirm-dialog.tsx` now exists, and
 * `v3/organization/leave/` answers 401 rather than 404, so it is there. The other half was never a
 * blocker — a different microservice is a different base URL.
 */
export function ChannelAboutMcn() {
    const { t, currentLanguage } = useTranslation()
    const { myChannel } = useMyChannel()
    const mcn = myChannel?.mcn ?? null
    const isMember = Boolean(mcn) && !mcn?.is_owner
    const { leave, confirmLeave, cancelLeave, isConfirming, isCancelling } = useMcnLeave({
        enabled: isMember,
    })
    const [asking, setAsking] = useState<'leave' | 'cancel' | null>(null)

    // `is_owner` means this creator *runs* the network. Legacy hides the card entirely then, and it
    // is right to: the split shown here is the one this space is paid under, which is not a term the
    // operator negotiates with themselves. The call site checks the same thing so the tab's
    // empty-state agrees with what actually renders.
    if (!mcn || mcn.is_owner) return null

    return (
        <ChannelAboutCard>
            <div className="flex min-w-0 items-center justify-between gap-3 border-b border-(--separator-default) p-3">
                <div className="min-w-0">
                    <p className="type-caption-label text-(--text-subtitle)">
                        {t('channel_about_mcn')}
                    </p>
                    <p className="type-dense-strong min-w-0 truncate text-(--text-title)">
                        {mcn.name}
                    </p>
                </div>
                {/*
                 * Hidden once a departure is scheduled — legacy drops its kebab then too. There is
                 * nothing to offer: you cannot leave twice, and the way out is the banner's Cancel.
                 */}
                {leave === null && (
                    <Button
                        variant="ghost"
                        size="small"
                        className="-me-2 flex-none text-(--text-error)"
                        onClick={() => setAsking('leave')}
                    >
                        {t('channel_mcn_leave')}
                    </Button>
                )}
            </div>

            {leave && (
                /*
                 * The pending-departure banner. Legacy tints it with a hard-coded purple pair
                 * (`#f9f7fd` on `#dcd1f2`); the DS token for "something is happening that you should
                 * know about, and it is not an error" is the indigo accent, which is the same colour
                 * intent and flips with the theme where the literals could not.
                 */
                <div className="min-w-0 border-b border-(--separator-default) p-3">
                    <div className="flex min-w-0 items-center justify-between gap-2 rounded-(--radius-md) bg-(--background-segment) px-3 py-2.5">
                        <p className="type-caption-label flex min-w-0 items-center gap-2 text-(--accents-indigo-active)">
                            <Icon
                                name="exclamation-diamond"
                                weight="filled"
                                size={20}
                                className="flex-none"
                                aria-hidden="true"
                            />
                            <span className="min-w-0 truncate">
                                {t('channel_mcn_leaving_at', {
                                    date: formatActivityDateTime(
                                        leave.expected_departure_at,
                                        currentLanguage,
                                    ),
                                })}
                            </span>
                        </p>
                        <Button
                            variant="ghost"
                            size="small"
                            className="-me-2 flex-none"
                            onClick={() => setAsking('cancel')}
                        >
                            {t('channel_mcn_cancel')}
                        </Button>
                    </div>
                </div>
            )}
            {/*
             * `!== null` rather than a falsiness check: a 0% split is a real contract term, and
             * `!mcn.creator_rate` would hide it — legacy's `|| 0` cannot tell the two apart and
             * prints 0 for a missing rate. The schema nulls what is absent, so the two are
             * distinguishable here, which is the whole reason it does that.
             *
             * Both columns are always in the DOM when either rate exists, so the divider stays on
             * the centre line and a card with one rate is not a lone number hugging the leading
             * edge.
             */}
            <dl className="grid grid-cols-2 divide-x divide-(--separator-default)">
                <Rate label={t('channel_about_mcn_creator_rate')} rate={mcn.creator_rate} />
                <Rate label={t('channel_about_mcn_rate')} rate={mcn.mcn_revenue_rate} />
            </dl>

            {/*
             * Both confirmations state the consequence rather than asking "are you sure": leaving
             * notifies the network and opens a fixed window, and cancelling closes it. The 48 is
             * legacy's, interpolated rather than written into the sentence so the number can change
             * without retranslating nine locales.
             */}
            <ConfirmDialog
                open={asking === 'leave'}
                onOpenChange={open => setAsking(open ? 'leave' : null)}
                title={t('channel_mcn_leave')}
                description={t('channel_mcn_leave_description', { hours: 48 })}
                confirmLabel={t('channel_mcn_leave_confirm')}
                onConfirm={() => confirmLeave()}
                pending={isConfirming}
                destructive
            />
            <ConfirmDialog
                open={asking === 'cancel'}
                onOpenChange={open => setAsking(open ? 'cancel' : null)}
                title={t('channel_mcn_cancel_title')}
                description={t('channel_mcn_cancel_description')}
                // Generic labels on purpose: this dialog asks "call the departure off?", so its
                // buttons are a plain yes/no. `common_close` is legacy's `mcn_w2_close`, verbatim.
                confirmLabel={t('common_confirm')}
                cancelLabel={t('common_close')}
                onConfirm={() => cancelLeave()}
                pending={isCancelling}
            />
        </ChannelAboutCard>
    )
}

function Rate({ label, rate }: { label: string; rate: number | null }) {
    const { t } = useTranslation()

    // An em dash, not legacy's `|| 0`: a rate the backend did not send is not a 0% split, and this
    // card is the one place a creator reads their contract terms off a screen.
    const value: string = rate === null ? '—' : t('channel_about_percent', { rate })

    return (
        <div className="flex min-w-0 flex-col items-center justify-center gap-2 p-3">
            <dt className="type-caption-meta text-center text-(--text-subtitle)">{label}</dt>
            <dd className="type-dense-strong text-(--text-title)">{value}</dd>
        </div>
    )
}
