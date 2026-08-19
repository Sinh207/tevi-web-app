'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { formatCount } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Dialog, DialogContent, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import type { JoinResult, Program } from '../api/types'
import { useAffiliateActions } from '../hooks/use-affiliate-actions'
import { useAffiliateData } from '../hooks/use-affiliate-data'
import type { AffiliateStep } from '../lib/steps'
import { ProgramDetailStep } from './program-detail-step'
import { ProgramJoinedStep } from './program-joined-step'
import { ProgramListStep } from './program-list-step'
import { ProgramOptionsMenu } from './program-options-menu'
import { SwitchConfirmDialog } from './switch-confirm-dialog'

/**
 * One id for the whole dialog, so a second press replaces the toast instead of stacking one on
 * another — the convention `copy-hex-button.tsx` sets. Shared by the copy confirmations and the
 * "you left the program" notice: they are the same corner of the screen and never both true.
 */
const TOAST_ID = 'affiliate'

/**
 * The affiliate programs dialog — legacy's `campaign/affiliatePrograms/modal`, as one dialog with
 * three screens.
 *
 * ## Desktop only, so there is no bottom sheet
 *
 * Legacy renders this through `ResponsiveModal`: a `Dialog` from 900px up, a full-height
 * `SwipeableDrawer` below. **The mobile branch is unreachable here** — the only thing that opens this
 * is the affiliate card in the end rail, and the rail needs a 1292px window. Building a sheet the
 * app has no primitive for, to serve a viewport that cannot reach the trigger, is work with no user
 * at the end of it. The day a mobile surface opens this, that sheet is the change.
 *
 * ## State lives here, in one component
 *
 * Legacy spreads it over a context, a provider and five hooks. The three screens share the selected
 * program, the join result and both confirmations — and `password-setup-flow.tsx` states the rule
 * this follows: *"splitting state that is threaded through every step across providers is how the two
 * ended up able to disagree."* So the step machine, the two confirm flags and the pending join all
 * sit here, and the screens are pure.
 *
 * ## Escape pops a step before it closes
 *
 * base-ui hands Escape and the backdrop to `onOpenChange`, which would otherwise throw away a
 * three-screen journey in one press. On `detail` and `joined` the first dismissal returns to the
 * list; on the list it closes. This is the same rule `AppSide` applies to the drawer's screens —
 * *"Escape unwinds one level, the way the back button does"* — reached through a different door
 * because this is a real dialog.
 *
 * ## The CTA is outside the scrolling area
 *
 * `detail` is a pitch with a decision at the end of it, so the button is a sticky footer rather than
 * the last thing in the scroll. Legacy does the same via `ResponsiveModal`'s `actionsEle`.
 */
export function AffiliateDialog({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const { t } = useTranslation()

    const [step, setStep] = useState<AffiliateStep>('list')
    const [selected, setSelected] = useState<Program | null>(null)
    const [joinResult, setJoinResult] = useState<JoinResult | null>(null)
    /**
     * The switch confirmation, as **two** pieces of state rather than one nullable value.
     *
     * `switching` is the pair it is asking about and `switchOpen` is whether it is showing, and they
     * are separate because the dialog does not disappear when it closes — base-ui plays a 200ms exit.
     * Reading `from` and `to` live off `currentCampaign` and `selected` instead means that for the
     * whole of that exit the sentence rewrites itself: the join invalidates the campaign, the refetch
     * lands, and "Joining B will stop your A promotion" becomes "…will stop your B promotion" **while
     * the dialog is still on screen**. `space-visibility-view.tsx` documents the same trap.
     *
     * Copied, not looked up — the same reason `AccountSwitcherDialog` copies the name of the account
     * it is asking about.
     */
    const [switching, setSwitching] = useState<{ from: Program | null; to: Program } | null>(null)
    const [switchOpen, setSwitchOpen] = useState(false)
    const [leaveOpen, setLeaveOpen] = useState(false)

    const data = useAffiliateData(open)
    const { currentCampaign, stats, isLoadingStats, promotingId } = data

    /**
     * Opening the switch confirmation sets **both** pieces of its state, in one place.
     *
     * They have to move together — `switching` is what the sentence reads from and `switchOpen` is
     * whether it shows — and setting them at the call site is one setter away from a confirm that
     * opens with no programs in it. (Which is exactly what happened once: the two lines were written
     * separately and only one of them landed. Nothing failed to compile, nothing failed a test; the
     * dialog simply asked "Joining will stop your promotion.")
     */
    const openSwitchConfirm = useCallback((from: Program | null, to: Program) => {
        setSwitching({ from, to })
        setSwitchOpen(true)
    }, [])

    const reset = useCallback(() => {
        setStep('list')
        setSelected(null)
        setJoinResult(null)
        setSwitchOpen(false)
        setSwitching(null)
        setLeaveOpen(false)
    }, [])

    const { join, leave, isJoining, isLeaving } = useAffiliateActions({
        promotingId,
        onJoined: result => {
            setJoinResult(result)
            setSelected(result.program)
            setSwitchOpen(false)
            setStep('joined')
        },
        onLeft: () => {
            setLeaveOpen(false)
            toast.success(t('affiliate_left'), { id: TOAST_ID })
            reset()
        },
    })

    const isBusy = isJoining || isLeaving

    /**
     * The program each screen is about.
     *
     * `joinResult.program` first, then the campaign the server reports, then whatever was pressed.
     * The order matters on the joined screen: straight after a join the campaign query is still
     * refetching, so the server's answer is a beat behind what the user just did.
     */
    const joinedProgram = joinResult?.program ?? currentCampaign?.program ?? selected
    const referralUrl = joinResult?.referralUrl ?? currentCampaign?.referral_url ?? null

    /** Joining `selected` would replace a different program that is already running. */
    const isSwitching = promotingId !== null && promotingId !== selected?.id

    const dismiss = useCallback(
        (next: boolean) => {
            if (next) return
            // One level at a time — see the note above.
            if (step === 'list') {
                onOpenChange(false)
                reset()
            } else {
                setStep('list')
            }
        },
        [step, onOpenChange, reset],
    )

    const copyLink = useCallback(async () => {
        if (!referralUrl) return
        try {
            await navigator.clipboard.writeText(referralUrl)
            toast.success(t('affiliate_link_copied'), { id: TOAST_ID })
        } catch {
            /*
             * Required, not defensive: `navigator.clipboard` is absent on insecure origins and can
             * be refused by permissions policy. The URL goes in the message so it can still be
             * selected by hand.
             */
            toast.error(t('affiliate_link_copy_failed', { url: referralUrl }), { id: TOAST_ID })
        }
    }, [referralUrl, t])

    const promoters = selected?.promoter_count ?? null

    return (
        <>
            <Dialog open={open} onOpenChange={dismiss}>
                {/*
                 * `p-0` / `gap-0` and a wider frame than the DS's 370: this is a panel, not a
                 * message. `overflow-hidden` is load-bearing — the screens are full-bleed and would
                 * otherwise draw square corners over the dialog's rounded ones (the recipe
                 * `AccountSwitcherDialog` established).
                 */}
                <DialogContent className="w-[402px] gap-0 overflow-hidden p-0">
                    <header className="relative flex h-12 flex-none items-center justify-between px-4">
                        {step === 'list' ? (
                            <Button variant="ghost" size="small" onClick={() => dismiss(false)}>
                                {t('common_cancel')}
                            </Button>
                        ) : (
                            <Button
                                variant="ghost"
                                size="small"
                                iconOnly
                                aria-label={t('common_back')}
                                onClick={() => setStep('list')}
                            >
                                <Icon name="arrow-left" size={20} className="rtl:-scale-x-100" />
                            </Button>
                        )}

                        {/* Centred independently of the two actions, so an odd-width action on one
                            side does not shift the title off centre. */}
                        <DialogTitle className="pointer-events-none absolute inset-x-0 text-center">
                            {step === 'list'
                                ? t('affiliate_title')
                                : t('affiliate_program_details')}
                        </DialogTitle>

                        {step === 'joined' ? (
                            <ProgramOptionsMenu
                                program={joinedProgram}
                                onCopyLink={copyLink}
                                onLeave={() => setLeaveOpen(true)}
                                canCopy={Boolean(referralUrl)}
                                disabled={isBusy}
                            />
                        ) : (
                            // Keeps the title's centre honest when there is no trailing control.
                            <span aria-hidden className="w-7" />
                        )}
                    </header>

                    <div className="max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain bg-(--background-subtle)">
                        {step === 'detail' && selected ? (
                            <ProgramDetailStep program={selected} isSwitching={isSwitching} />
                        ) : step === 'joined' ? (
                            <ProgramJoinedStep
                                program={joinedProgram}
                                referralUrl={referralUrl}
                                stats={stats}
                                isLoadingStats={isLoadingStats}
                                onCopyLink={copyLink}
                                onLeave={() => setLeaveOpen(true)}
                                isLeaving={isLeaving}
                            />
                        ) : (
                            <ProgramListStep
                                data={data}
                                isBusy={isBusy}
                                onPick={program => {
                                    setSelected(program)
                                    setStep('detail')
                                }}
                                onOpenPromoted={() => {
                                    setSelected(currentCampaign?.program ?? null)
                                    setStep('joined')
                                }}
                            />
                        )}
                    </div>

                    {step === 'detail' && selected ? (
                        <footer className="flex flex-none flex-col items-center gap-2 border-t border-t-(--separator-default) bg-(--background-surface) p-4">
                            <Button
                                variant="accent"
                                size="large"
                                fullWidth
                                disabled={isBusy}
                                onClick={() =>
                                    isSwitching
                                        ? openSwitchConfirm(
                                              currentCampaign?.program ?? null,
                                              selected,
                                          )
                                        : join(selected)
                                }
                            >
                                {isSwitching ? t('affiliate_switch_now') : t('affiliate_join_now')}
                            </Button>
                            {promoters !== null && promoters > 0 ? (
                                <p className="type-caption-meta text-center text-(--text-subtitle)">
                                    {/*
                                     * `promoters`, not `count`. **`count` is i18next's reserved
                                     * option for pluralisation** — passing it makes the lookup go
                                     * hunting for `affiliate_promoters_joined_one` / `_other`, and
                                     * it runs `Intl.PluralRules` over the value. It renders today
                                     * only because no plural forms exist yet; the day a translator
                                     * adds one, the English string stops being used. The value is
                                     * also already compacted to `1.5k`, so it is a string and not a
                                     * number a plural rule could read.
                                     */}
                                    {t('affiliate_promoters_joined', {
                                        promoters: formatCount(promoters),
                                    })}
                                </p>
                            ) : null}
                        </footer>
                    ) : null}
                </DialogContent>
            </Dialog>

            {/*
             * Siblings of the dialog, not children: both portal to the top of the document, so the
             * confirm stacks over the panel and nothing closes the one underneath. The recipe is
             * `AccountSwitcherDialog`'s.
             */}
            <SwitchConfirmDialog
                open={switchOpen}
                onOpenChange={next => !next && setSwitchOpen(false)}
                from={switching?.from ?? null}
                to={switching?.to ?? null}
                onConfirm={() => switching && join(switching.to)}
                pending={isJoining}
            />

            <ConfirmDialog
                open={leaveOpen}
                onOpenChange={next => !next && setLeaveOpen(false)}
                title={t('affiliate_leave_title')}
                description={t('affiliate_leave_body')}
                confirmLabel={t('common_confirm')}
                onConfirm={leave}
                pending={isLeaving}
                destructive
            />
        </>
    )
}
