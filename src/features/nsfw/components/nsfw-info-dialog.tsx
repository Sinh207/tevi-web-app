'use client'

import { useAuth } from '@features/auth'
import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

/**
 * Split, and loaded only for the owner.
 *
 * This dialog renders on **every** sensitive space, for every visitor, because the bio's NSFW row is
 * always there. The appeal screen is owner-only and most owners never open it, so a static import
 * would put its API model, its state machine and its illustration in the chunk that every reader of
 * a flagged space downloads to be told what four letters mean. Same reasoning as `MiniAppHost`'s
 * dynamic window: a visit that opens nothing should pay nothing.
 */
const loadAppealScreen = () => import('./nsfw-appeal-dialog')

type AppealScreen = Awaited<ReturnType<typeof loadAppealScreen>>['NsfwAppealScreen']

/**
 * "NSFW Space" — what the label in a space's bio actually means, on demand.
 *
 * ## It explains; it does not ask
 *
 * The gate (`NsfwGatePanel`) is the *question*, and it is a panel because it is the state of a page
 * somebody asked for. This is the opposite kind of thing: a reader tapped a four-letter acronym they
 * may not know, in the middle of a profile they were reading, and wants one paragraph back. That is
 * an interruption with an obvious end, which is exactly what a dialog is for — the same shape
 * `BalanceHelpButton` and `PayoutInfoDialog` already use for "what is this?".
 *
 * So the two must not be confused: opening this never satisfies a gate, and dismissing it reveals
 * nothing. A space that is *gated* still shows its NSFW row, and this still explains the word — the
 * label is the one line telling the reader why the rest is withheld.
 *
 * ## The mark is pink here and grey in the row, and that is deliberate
 *
 * In the bio the glyph is one item in a column of `--text-subtitle` meta rows (joined date, links) —
 * a fact about the space, at the weight of every other fact. Here it is the subject, so it carries
 * `--accents-nsfw`, the same hue the gate's hero mark uses. Same shape, two jobs; the reference
 * screens from the native app draw exactly that pair.
 *
 * ## Dismissal: the corner control, not a footer Close
 *
 * The native app puts a full-width **Close** at the bottom, because a bottom sheet has no corner to
 * put an ✕ in. On the web this is a card, and `docs/DESIGN_SYSTEM.md` §7 is explicit: a card
 * dismisses from its trailing edge. Adding the footer button *as well* would be two ways out of a
 * dialog with no other control — and every other explain-dialog in this app has exactly one.
 *
 * ## The owner gets one more thing: a way to argue
 *
 * With `canAppeal`, the same dialog grows a **Submit appeal** action, which is what the native app
 * shows the space's own creator. A reader is being *told* what the label means; the creator is being
 * told what it means **about their space**, and for them the useful next thing is the way out of it.
 * So it is one dialog with an extra control rather than two dialogs whose shared paragraph is free
 * to drift — and the control is `accent`, because for the owner it is now the thing the dialog is
 * for. Its label is the comps' **"Appeal NSFW Status"** — and it reads `nsfw_appeal_title`, the very
 * key the screen's own bar reads, rather than a second key holding the same words. The same four
 * words on the button and on the bar are how a reader knows the press landed where it said it would,
 * and two keys is exactly how that stops being true in the fourth locale somebody edits.
 */
export function NsfwInfoDialog({
    open,
    onOpenChange,
    /**
     * The reader owns this space, so the appeal is theirs to make. Every call behind the button is a
     * `my-channel` one, so this is not decoration a visitor could merely be spared — pressed by
     * anybody else it would act on *their* space, not this one.
     */
    canAppeal = false,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    canAppeal?: boolean
}) {
    const { t } = useTranslation()
    const { activeId } = useAuth()
    const queryClient = useQueryClient()
    const [step, setStep] = useState<'info' | 'appeal'>('info')
    /**
     * The press is in flight: the chunk is downloading and `nsfw-appeal/latest/` is being read.
     *
     * **The wait belongs on the button, not on a screen.** Opening straight away means rendering
     * something before knowing whether this owner is going to a delete queue or to "Appeal
     * submitted!" — and every way of doing that is a lie or a blank. Holding here instead leaves the
     * reader on the paragraph they were already reading, with the control they pressed saying it is
     * working, and the next screen arrives fully formed.
     *
     * Written up as a rule, with the alternatives that were tried and the `next/dynamic` trap:
     * [`docs/DEFINITION_OF_DONE.md` §1](../../../../docs/DEFINITION_OF_DONE.md#a-press-that-decides-which-screen-comes-next-waits-on-the-button).
     */
    const [isEntering, setIsEntering] = useState(false)
    /**
     * The screen component itself, held once its chunk has landed.
     *
     * **Hand-rolled rather than `next/dynamic`, and the difference is measurable.** `dynamic`
     * re-resolves its own promise through `React.lazy`, so even with the module already in the cache
     * it renders `null` for a tick — measured in this dev server, ~160ms of a **2px-tall popup**
     * under a full scrim. Awaiting the import ourselves and keeping the component in state makes the
     * render synchronous: the step only switches once there is something to switch to.
     *
     * The split is unaffected — `import()` is what the bundler splits on, not the wrapper.
     */
    const [Screen, setScreen] = useState<AppealScreen | null>(null)
    /** The dialog can be dismissed mid-flight; a press that lands after that must not open it. */
    const isMounted = useRef(true)
    useEffect(() => {
        isMounted.current = true
        return () => {
            isMounted.current = false
        }
    }, [])

    /**
     * **Fetch the chunk while they read, not when they press.**
     *
     * `next/dynamic` renders nothing until its module lands, so a press used to swap the card for an
     * *empty popup* for ~150ms — the scrim up, the box blank — before the screen appeared. Kicking
     * the import off when an owner opens this dialog spends that time on the paragraph they are
     * already reading, and the module cache makes the second `import()` free. A visitor never runs
     * it, which is the whole reason the chunk is split.
     *
     * Deliberately not awaited and deliberately un-cancelled: the worst case is a small chunk
     * fetched for an owner who then closes the dialog, which is what a prefetch is.
     */
    useEffect(() => {
        if (!open || !canAppeal) return
        let live = true
        void loadAppealScreen().then(m => {
            if (live) setScreen(() => m.NsfwAppealScreen)
        })
        return () => {
            live = false
        }
    }, [open, canAppeal])

    useEffect(() => {
        if (!open) setIsEntering(false)
    }, [open])

    /**
     * Back to the explanation whenever the popup closes — but only once it is fully gone, so the
     * content does not visibly swap back during the 200ms exit.
     */
    useEffect(() => {
        if (open) return
        const id = setTimeout(() => setStep('info'), 250)
        return () => clearTimeout(id)
    }, [open])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/*
             * **One shell for both steps**, which is the whole fix for a glitch this had: the appeal
             * used to be its own `<Dialog>`, so pressing the CTA closed one popup and opened another.
             * Measured, that left a **~150ms window with nothing on screen** — no popup, no scrim,
             * the space showing through — because base-ui runs a 200ms exit here while the appeal's
             * chunk had only just started downloading. Overlapping the two instead was worse: two
             * scrims and two dialogs' text fading through each other.
             *
             * They are one flow, so they are one dialog and the *content* changes — the arrangement
             * `StarPurchaseDialog` already uses for its three steps. No handover, no second scrim,
             * and `Escape` means one thing.
             *
             * The shell therefore carries no padding: each step supplies its own, because a card and
             * a screen do not want the same. Width and the height cap are shared so the popup does
             * not jump position as the content swaps.
             */}
            <DialogContent
                data-testid={step === 'appeal' ? 'nsfw-appeal-dialog' : 'nsfw-info-dialog'}
                className={cn(
                    'max-h-[min(88vh,720px)] w-[420px] gap-0 overflow-hidden p-0',
                    // The appeal step's own ground: its instruction card sits on it, and its two
                    // other faces paint their own surface over it. See `NsfwAppealScreen`.
                    step === 'appeal' && 'bg-(--background)',
                )}
            >
                {step === 'appeal' && canAppeal && Screen ? (
                    <Screen active={open} onClose={() => onOpenChange(false)} />
                ) : (
                    <div className="flex min-w-0 flex-col gap-3 p-6">
                        <div className="flex items-start justify-between gap-3">
                            <DialogTitle className="type-body-strong pt-2 text-(--text-title)">
                                {t('channel_nsfw_info_title')}
                            </DialogTitle>
                            <DialogCloseButton
                                onClose={() => onOpenChange(false)}
                                className="-me-2 -mt-2"
                            />
                        </div>

                        <div className="flex min-w-0 flex-col gap-1">
                            <p className="type-dense-strong m-0 flex min-w-0 items-start gap-2 text-(--text-title)">
                                {/* `mt-px` rather than a centred row: the sentence wraps to two lines
                                    on a phone, and a centred mark would then float beside the middle
                                    of the paragraph instead of sitting on its first line. */}
                                <Icon
                                    name="nsfw"
                                    weight="filled"
                                    size={20}
                                    className="mt-px flex-none text-(--accents-nsfw)"
                                    aria-hidden="true"
                                />
                                <span className="min-w-0">{t('channel_nsfw_info_meaning')}</span>
                            </p>
                            {/* Indented to the text above it — 20px glyph + the row's 8px gap — so
                                the two read as one block rather than as two unrelated paragraphs.
                                Logical, so RTL indents from the other side. */}
                            <p className="type-dense-default m-0 ps-7 text-(--text-body)">
                                {t('channel_nsfw_info_body')}
                            </p>
                        </div>

                        {canAppeal && (
                            <Button
                                data-testid="nsfw-info-appeal"
                                variant="accent"
                                size="large"
                                fullWidth
                                disabled={isEntering}
                                aria-busy={isEntering}
                                onClick={async () => {
                                    setIsEntering(true)
                                    /*
                                     * The chunk first, then the query it exports — the read cannot
                                     * start before the module that owns it has landed, and the CTA
                                     * has to cover both anyway. Awaiting them here is why the next
                                     * paint is the finished screen rather than a placeholder for
                                     * either. The chunk is usually already in the module cache: the
                                     * effect above starts fetching it the moment an owner opens this
                                     * dialog, so what the press normally waits on is just the query.
                                     */
                                    const mod = await loadAppealScreen()
                                    await mod.prefetchAppealEntry(queryClient, activeId)
                                    if (!isMounted.current) return
                                    setScreen(() => mod.NsfwAppealScreen)
                                    setIsEntering(false)
                                    setStep('appeal')
                                }}
                            >
                                {isEntering ? (
                                    <Loader label={t('nsfw_appeal_title')} />
                                ) : (
                                    t('nsfw_appeal_title')
                                )}
                            </Button>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
