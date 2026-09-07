'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@shared/ui/dialog'
import Image from 'next/image'
import Link from 'next/link'

/**
 * "What does this blue tick mean?" — the panel behind `VerifiedBadge`.
 *
 * One dialog for the whole app, because the answer is the same wherever the mark is drawn: the
 * space's identity was confirmed by Tevi. It lives in `shared/` rather than in `features/channel`
 * for the reason the badge does — four features render a tick (channel, search, membership and the
 * navigation drawer) and none of them may import another.
 *
 * ## The art is the badge's own, not a glyph
 *
 * `image` is required and non-null: the API can hand back **bespoke art per programme**
 * (`verified_tick_badge.image`), so the mark in the dialog has to be the mark the reader just
 * pressed, or the dialog is explaining a different badge from the one on screen. That is also why
 * there is no sprite fallback — the sprite has no `badge-check--filled`, and drawing *some* tick
 * next to "this account is verified" would be asserting verification the payload never claimed.
 *
 * ## Dismiss: the corner glyph, not a footer button
 *
 * There is no decision in this dialog — pressing anything here means "I have read it" — so the
 * dismiss is `DialogCloseButton` at the trailing edge, on one row with the title. That is the rule
 * (`docs/DESIGN_SYSTEM.md` §7, and `DialogCloseButton`'s own docstring) and `PayoutFeeHelp` is the
 * shape it takes. The native app's sheet ends in a full-width **Close**; a sheet that fills the
 * width of a phone can afford one, a 370px card cannot — it would be taller than a third of the
 * dialog and heavier than the two sentences it serves.
 *
 * ## The title is ranged left
 *
 * `DialogHeader` centres, which is right for the DS's "are you sure?" shell — one short line over a
 * button pair. Here the title heads a row of explanatory copy that is itself left-ranged, and a
 * centred heading over left-ranged body reads as two blocks rather than one. It is also sharing its
 * row with the close glyph, which a centred title cannot do without looking off-centre.
 */
export function VerifiedBadgeDialog({
    open,
    onOpenChange,
    image,
    learnMoreHref,
    testId,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** `verified_tick_badge.image` — the same art the badge draws. */
    image: string
    /**
     * Where **Learn more** goes, from the caller: `shared/` may not know a feature's routes.
     * Omitted, the sentence simply ends — a link with nowhere to go is worse than no link.
     */
    learnMoreHref?: string
    /**
     * **The badge's own id**, not a second literal — every id here is derived from it exactly one
     * level deep (`-panel`, `-title`, `-close`), which is as deep as `testid-catalog.test.ts`
     * resolves a spec's `getByTestId`. A prop spelled `dialogTestId` would be worse than useless:
     * neither `check-testids.mjs` nor the catalog builder matches that spelling, so the literal
     * would be in the source, absent from `testids/`, and nobody would find out.
     */
    testId?: string
}) {
    const { t } = useTranslation()

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* `gap-3`, not the shell's `gap-5`: the title and the sentence under it are one block
                — the DS gap is drawn for a title *stack* over a separate button row, which this
                dialog no longer has. */}
            <DialogContent className="gap-3" data-testid={subTestId(testId, 'panel')}>
                {/* Title and dismiss on one row. `-me-2 -mt-2` pulls the 40px target into the
                    dialog's own `p-6`, so the glyph sits in the corner rather than 8px inside it. */}
                <div className="flex items-start justify-between gap-3">
                    <DialogTitle className="pt-2" data-testid={subTestId(testId, 'title')}>
                        {/*
                         * **The type is on a child, and it has to be.** `DialogTitle` hard-codes
                         * `type-body-strong` (16/600) and `cn` is plain `tailwind-merge`, which knows
                         * nothing about this app's hand-written `.type-*` classes — so passing
                         * `type-title-t2-semibold` up there leaves *both* classes on the element and
                         * the later definition in `globals.css` wins. Measured, not guessed: the
                         * title rendered at 16px with the 20px class sitting on it doing nothing.
                         * (Six other dialogs in this repo carry the same dead override.) On a child
                         * the class is the only one there, so the title is the 20px the design asks
                         * for and no `font-size` is written by hand.
                         */}
                        <span className="type-title-t2-semibold">
                            {t('channel_verified_dialog_title')}
                        </span>
                    </DialogTitle>
                    <DialogCloseButton
                        onClose={() => onOpenChange(false)}
                        className="-me-2 -mt-2"
                        data-testid={subTestId(testId, 'close')}
                    />
                </div>

                <div className="flex items-start gap-3">
                    {/* Decorative here, and only here: the sentence beside it says the same thing in
                        words, so an `alt` would have it announced twice. The badge that opened this
                        dialog is the one carrying the name. */}
                    <Image
                        src={image}
                        alt=""
                        width={24}
                        height={24}
                        className="mt-0.5 flex-none"
                        style={{ width: 24, height: 24 }}
                    />
                    <div className="flex min-w-0 flex-col gap-1">
                        <p className="type-body-strong m-0 text-(--text-title)">
                            {t('channel_verified_dialog_heading')}
                        </p>
                        <DialogDescription className="text-start">
                            {t('channel_verified_dialog_body')}{' '}
                            {learnMoreHref && (
                                <Link
                                    href={learnMoreHref}
                                    /* Closing on the way out: the destination is a *page*, and a
                                       dialog left open behind a navigation is still mounted, still
                                       trapping focus, and still there when the reader comes back. */
                                    onClick={() => onOpenChange(false)}
                                    className="rounded-(--radius-sm) type-link-dense text-(--text-link) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                                >
                                    {t('channel_verified_learn_more')}
                                </Link>
                            )}
                        </DialogDescription>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
