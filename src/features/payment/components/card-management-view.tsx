'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { ChannelEmptyState } from '@features/channel'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import {
    Alert,
    AlertActions,
    AlertContent,
    AlertIcon,
    AlertSubtitle,
    AlertTitle,
} from '@shared/ui/alert'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useState } from 'react'
import type { SavedCard } from '../api/types'
import { useCardName } from '../hooks/use-card-name'
import { useSavedCards } from '../hooks/use-saved-cards'
import { parseCheckoutCallback, stripCallbackParams } from '../lib/checkout-callback'
import { CARD_MANAGEMENT_CONTAINER } from '../lib/container'
import { CARD_MANAGEMENT_ART } from '../lib/illustrations'
import { AddCardDialog } from './add-card-dialog'
import { CardManagementSkeleton } from './card-management-skeleton'
import { SavedCardList, SchemeStrip } from './saved-card-list'

/**
 * `/card-management` — everything below the page's back bar, arranged as the web app arranges it.
 *
 * ## The layout is legacy's, the tokens are the DS's
 *
 * `containers/cardManagement` puts each card in its own bordered box on the page background, under a
 * sticky "Payment methods" header, above a scheme strip and a PCI line. This screen is that screen:
 * same blocks, same order, same copy. What is *not* legacy's is every colour and type value — its
 * `#FFFFFF` / `#E0E0E0` / `#A3A3A3` literals are why its card screen stays white in dark mode.
 *
 * There is deliberately **no list panel** wrapping the rows. Two reasons, and the second one is
 * mechanical: separate boxes are what legacy draws, and a `position: sticky` header cannot live inside
 * a clipping (`overflow-hidden`) ancestor — it would stick to the bottom of the panel instead of to
 * the viewport, the trap `/my-membership`'s panel documents from the other side.
 *
 * ## Five states, and the signed-out one is not the empty one
 *
 * DoD §1's loading / error / empty / success, plus **signed out**. This app always keeps a session, so
 * having a `currentUser` says nothing about there being a real account — an anonymous visitor has no
 * saved cards and asking would be a 401 per visitor. The prompt gates the **action**
 * (`useRequireAuth` raises the login dialog) rather than redirecting, per DoD §3: the URL stays put,
 * and signing in leaves the reader on the screen they asked for. `isBootstrapping` shows the skeleton
 * rather than the prompt, or every signed-in reader is told to sign in for the length of the bootstrap.
 *
 * The **empty** state is legacy's two-block one: a notice that says there is no card and offers to add
 * one inline, then the illustrated block with the real button. It reads as two different sentences
 * because it is — the first is about *this account*, the second is about the feature.
 *
 * The **error** state is an `Alert` rather than a `Banner`: `Banner`'s Figma types are promotions, so
 * one delivering a failure is a marketing surface saying something went wrong. Legacy shows nothing at
 * all here — `getAllCards` calls `setAllCards(res)` *before* checking the status
 * (`docs/PAYMENT.md` §1.4 #1), so a failure leaves an axios response object in state and the next
 * `.map` throws.
 *
 * ## Three dialogs, and which one opens is decided here
 *
 * Set-as-default and delete are both confirmed, with legacy's own copy and its own "Yes, …" verbs.
 * The third is a **notice**: legacy refuses to delete the last card and explains why in a close-only
 * dialog (`noticeCannotBeRemoved`), while its *hook* also returns early on the same condition and says
 * nothing. Only the dialog is worth keeping — a rule the reader is told about is a rule; a silent
 * early return is a button that does nothing. Whether the backend enforces it too is **B66**.
 *
 * ## Coming back from 3DS
 *
 * A card whose bank demands authentication leaves the page and returns to `return_url` with
 * `setup_intent_client_secret` and `redirect_status` on it. Two things have to happen, and only two:
 *
 * - **The secret comes off the URL.** It is a bearer of the setup, it lands in browser history, and it
 *   gets pasted into support tickets. `stripCallbackParams` removes exactly the callback parameters
 *   and leaves anything the screen itself put there.
 * - **Nothing is announced from the URL.** `redirect_status` is a query parameter — attacker
 *   controllable, and it does not know what our backend recorded. The list is the verdict, and the page
 *   load that brought the reader back refetches it. Printing "Card added" off a URL is how a screen
 *   congratulates somebody on a card that is not there.
 */
export function CardManagementView() {
    const { t } = useTranslation()
    const { isBootstrapping } = useAuth()
    const cardName = useCardName()
    const requireAuth = useRequireAuth()
    const router = useRouter()
    const pathname = usePathname()

    const {
        cards,
        isLoading,
        isError,
        isEmpty,
        isSignedOut,
        refetch,
        isFull,
        pendingId,
        isMutating,
        setDefault,
        remove,
    } = useSavedCards()

    const [isAdding, setIsAdding] = useState(false)
    /**
     * The card each dialog is about, or `null` when it is closed.
     *
     * The **row object**, not its id: the copy names the card ("Delete Visa ···· 4242?"), and holding
     * an id would mean re-finding the row on every render — including the render right after the write
     * lands, where it is gone or changed.
     */
    const [pendingDelete, setPendingDelete] = useState<SavedCard | null>(null)
    const [pendingDefault, setPendingDefault] = useState<SavedCard | null>(null)
    const [isLastCardNotice, setIsLastCardNotice] = useState(false)

    /*
     * Runs once per mount, and does nothing on the overwhelmingly common ordinary page load —
     * `parseCheckoutCallback` answers `null` before anything is touched.
     *
     * `window.location.search` rather than `useSearchParams()`: that hook opts the whole route into
     * dynamic rendering (or demands a Suspense boundary) for a value only needed inside an effect, and
     * this page is otherwise statically renderable.
     */
    useEffect(() => {
        const callback = parseCheckoutCallback(window.location.search)
        if (callback?.kind !== 'card-setup') return
        const rest = stripCallbackParams(window.location.search)
        router.replace(rest ? `${pathname}?${rest}` : pathname)
    }, [pathname, router])

    return (
        <>
            <div className={`${CARD_MANAGEMENT_CONTAINER} flex flex-1 flex-col`}>
                {renderBody()}
            </div>

            <AddCardDialog
                open={isAdding}
                onOpenChange={setIsAdding}
                /*
                 * The screen's own path, from the router — not `window.location`, and not anything off
                 * a payload. `checkoutReturnUrl` puts this app's configured origin in front of it,
                 * which is what makes an open redirect impossible; see `lib/return-url.ts`.
                 */
                returnPath={pathname}
                /* Nothing for a first card to displace — see the prop's own doc. */
                showDefaultOption={cards.length > 0}
            />

            <ConfirmDialog
                testId="payment-card-set-default-confirm"
                open={pendingDefault !== null}
                onOpenChange={open => {
                    if (!open) setPendingDefault(null)
                }}
                title={t('payment_set_default_title')}
                description={t('payment_set_default_body')}
                confirmLabel={t('payment_set_default_confirm')}
                cancelLabel={t('common_close')}
                pending={isMutating}
                onConfirm={() => {
                    if (!pendingDefault) return
                    setDefault(pendingDefault)
                    setPendingDefault(null)
                }}
            />

            <ConfirmDialog
                testId="payment-card-delete-confirm"
                open={pendingDelete !== null}
                onOpenChange={open => {
                    if (!open) setPendingDelete(null)
                }}
                destructive
                title={t('payment_delete_card_title')}
                /*
                 * **The card is named here, and that is what `pendingDelete` holds a row for.**
                 * This file's note above says the copy names the card; until now it did not — the
                 * body was legacy's flat "This action will remove the card from your account", the
                 * same sentence whichever of ten rows was pressed.
                 *
                 * It mattered more the moment the kebab went: `saved-card-row.tsx` now puts delete on
                 * the row as a bare 40px trash, so ten rows carry ten identical targets and this
                 * dialog is the only place left that can say *which* card is about to go. A
                 * confirmation that cannot be checked against what you meant to press is a dialog you
                 * learn to dismiss.
                 *
                 * A deliberate divergence from legacy's copy — stated here rather than silently, per
                 * the rule that legacy is the spec. The title stays its.
                 */
                description={t('payment_delete_card_body', {
                    card: pendingDelete ? cardName(pendingDelete) : '',
                })}
                confirmLabel={t('payment_delete_card_confirm')}
                cancelLabel={t('common_close')}
                pending={isMutating}
                onConfirm={() => {
                    if (!pendingDelete) return
                    remove(pendingDelete)
                    setPendingDelete(null)
                }}
            />

            {/*
             * Close-only, so it is the DS Dialog rather than `ConfirmDialog`: there is nothing to
             * confirm. Legacy renders its confirm component with `hideConfirmButton`, which is the same
             * thing said less clearly.
             */}
            <Dialog open={isLastCardNotice} onOpenChange={setIsLastCardNotice}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('payment_card_last_title')}</DialogTitle>
                        <DialogDescription>{t('payment_card_last_body')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <DialogClose
                            render={
                                <Button
                                    data-testid="payment-cards-primary"
                                    variant="primary"
                                    size="large"
                                >
                                    {t('common_close')}
                                </Button>
                            }
                        />
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )

    /**
     * Which dialog a delete press opens.
     *
     * The last card cannot be removed, and the reader is *told* that instead of pressing a menu item
     * that quietly does nothing (legacy's hook, §1.4 #7). One place decides it, so the row does not
     * have to know the rule exists.
     */
    function askDelete(card: SavedCard) {
        if (cards.length <= 1) {
            setIsLastCardNotice(true)
            return
        }
        setPendingDelete(card)
    }

    /**
     * Everything under the bar.
     *
     * A function rather than early returns, because the dialogs above have to render in every state and
     * the branches are exclusive. It closes over the hook's values and calls no hooks itself, so it is
     * a code-organisation choice with no behaviour of its own — same shape as `MyMembershipView`.
     */
    function renderBody(): ReactNode {
        if (isBootstrapping || isLoading) return <CardManagementSkeleton />

        if (isSignedOut) {
            return (
                <Message>
                    <ChannelEmptyState
                        className={RISE}
                        icon="credit-card"
                        title={t('payment_cards_signed_out_title')}
                        body={t('payment_cards_signed_out_body')}
                        action={
                            /*
                             * The action *is* the gate: `useRequireAuth` opens the login dialog when
                             * there is no real account, and by the time it runs there is nothing left
                             * to do — the query un-gates itself and this branch stops rendering. Hence
                             * the empty callback.
                             */
                            <Button
                                data-testid="payment-cards-sign-in"
                                variant="primary"
                                size="large"
                                onClick={requireAuth(() => undefined)}
                            >
                                {t('auth_sign_in')}
                            </Button>
                        }
                    />
                </Message>
            )
        }

        if (isError) {
            return (
                <div className="p-4">
                    <Alert status="error">
                        <AlertIcon status="error" />
                        <AlertContent>
                            <AlertTitle>{t('payment_cards_error_title')}</AlertTitle>
                            <AlertSubtitle>{t('payment_cards_error_body')}</AlertSubtitle>
                            <AlertActions>
                                <Button
                                    data-testid="payment-cards-retry"
                                    variant="secondary"
                                    size="medium"
                                    onClick={() => refetch()}
                                >
                                    {t('common_retry')}
                                </Button>
                            </AlertActions>
                        </AlertContent>
                    </Alert>
                </div>
            )
        }

        if (isEmpty) return <EmptyState onAdd={() => setIsAdding(true)} />

        return (
            <SavedCardList
                cards={cards}
                pendingId={pendingId}
                isMutating={isMutating}
                isFull={isFull}
                onAdd={() => setIsAdding(true)}
                onSetDefault={setPendingDefault}
                onDelete={askDelete}
            />
        )
    }
}

/**
 * Legacy's `NoCards`, block for block.
 *
 * The first block is a **notice**, not a heading with a picture: "you have no card, please *add a new
 * card*", with the offer inline in the sentence. The second is the feature's own empty state —
 * illustration, name, one line about what a card is for, and the button. Keeping both is what makes
 * this screen legacy's screen; collapsing them into one illustrated state (which is what this file did
 * before) reads fine and is a different design.
 *
 * "Top-up Star to your wallet" is legacy's own heading for the notice, and it is the reason the notice
 * exists: the reason to add a card here is to buy Star.
 */
function EmptyState({ onAdd }: { onAdd: () => void }) {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col gap-4 px-4 py-3 md:gap-6">
            <section className="flex flex-col gap-3">
                <h2 className="type-body-strong m-0 text-(--text-subtitle)">
                    {t('payment_topup_title')}
                </h2>
                {/* 16px, the radius every other box on a page background in this app uses — see
                    `saved-card-row.tsx`. This tile was the one left at legacy's 8. */}
                <div className="flex items-start gap-2 rounded-(--radius-xl) bg-(--background-surface) p-4 shadow-xs">
                    <Icon
                        name="exclamation-triangle"
                        size={24}
                        className="flex-none text-(--text-title)"
                    />
                    <p className="type-dense-default m-0 text-(--text-title)">
                        {t('payment_no_card_notice')} {/*
                         * A real `<button>` inside the sentence, not legacy's clickable `<label>` —
                         * which is focusable by nothing and announced as a label for a field that does
                         * not exist. `--button-accent-bg` is where legacy's `#501BC0` maps; `--text-link`
                         * would be the indigo accent, which is a different token for a different
                         * purpose.
                         */}
                        <button
                            data-testid="payment-card-add"
                            type="button"
                            onClick={onAdd}
                            className="type-dense-default cursor-pointer border-0 bg-transparent p-0 text-(--button-accent-bg) underline-offset-2 outline-none hover:underline focus-visible:rounded-(--radius-sm) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                        >
                            {t('payment_no_card_notice_action')}
                        </button>
                    </p>
                </div>
            </section>

            <section className="flex flex-col gap-3">
                <h2 className="type-body-strong m-0 text-(--text-title)">
                    {t('payment_payment_methods')}
                </h2>
                <div
                    className={`${RISE} mx-auto flex w-full max-w-[400px] flex-col gap-4 px-3 py-4`}
                >
                    <Image
                        src={CARD_MANAGEMENT_ART.empty.src}
                        alt=""
                        width={CARD_MANAGEMENT_ART.empty.width}
                        height={CARD_MANAGEMENT_ART.empty.height}
                        priority
                        className="mx-auto h-auto w-full max-w-[227px]"
                    />
                    <div className="flex flex-col">
                        <p className="type-body-strong m-0 text-center text-(--text-title)">
                            {t('payment_cards_empty_title')}
                        </p>
                        <p className="type-body-default m-0 text-center text-(--text-title)">
                            {t('payment_cards_empty_body')}
                        </p>
                    </div>
                    {/* `accent` — on this state, adding a card is the only thing to do. */}
                    <Button
                        data-testid="payment-card-add-empty"
                        variant="accent"
                        size="large"
                        onClick={onAdd}
                    >
                        {t('payment_add_card')}
                    </Button>
                </div>
            </section>

            <SchemeStrip />
        </div>
    )
}

/**
 * The box a message state sits in: centred, with a floor under it.
 *
 * `min-h-[360px]` is the number `/my-membership` uses for the same job — it keeps a message from being
 * a 90px sliver at the top of a tall page, and costs nothing on the states that are taller.
 */
function Message({ children }: { children: ReactNode }) {
    return <div className="flex min-h-[360px] flex-col justify-center">{children}</div>
}
