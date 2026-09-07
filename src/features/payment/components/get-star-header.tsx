'use client'

import {
    accountAvatarUrl,
    accountDisplayName,
    accountUserId,
    useAuth,
    useRequireAuth,
} from '@features/auth'
import { useBalance } from '@features/balance'
import { useMyChannel } from '@features/channel'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import { GET_STAR_TRANSACTIONS_PATH } from '../routes'

/**
 * `/get-star`'s masthead — what is being bought, where the history is, and **who is being topped up**.
 *
 * ```
 *  Get Star                              ↺ View transaction history
 *  Stars will be sent directly to you
 *  ──────────────────────────────────────────────────────────────────
 *  (face)  Wondercat @wondercat                        ★ 8,734
 *          ID: 1107201702                        Current star balance
 * ```
 *
 * ## Why the account is on screen at all
 *
 * This is the one screen in the app where somebody spends real money into an account, and this app
 * holds **up to ten** of them (`shared/lib/api/token.ts`). Naming the one that is about to be credited
 * — face, handle and the numeric id, the same three the account drawer shows — is what makes a
 * top-up bought on the wrong account a mistake the reader can see *before* paying rather than after.
 * The id is there for the same reason support asks for it.
 *
 * ## The balance moved here, and the "balance after" preview went with it
 *
 * An earlier version put the balance in a `Card type="balance"` strip of its own and previewed what it
 * would become. The preview is dropped: it earned its place when a package could carry a bonus, and on
 * the live catalogue every `bonus_amount` is `0`, so it was printing *balance + the number already on
 * the tile*. What is left is the figure itself, captioned, next to the account it belongs to.
 *
 * ## Three states, because the page renders for everybody
 *
 * The account row is drawn only for a **real** account. A guest gets the heading and the history link
 * and nothing else — there is no balance, no handle and no id to print, and inventing a row of em
 * dashes for them would be a row about nothing. The prices below are public and the Pay button is
 * where the sign-in gate lives (`useGetStar`), so nothing here needs to gate anything.
 *
 * Inside the row, a balance that is not `isKnown` prints `—` rather than `0`: the account is real, the
 * figure is not in hand, and a fabricated zero on a screen about money is worse than an admitted
 * blank. Same rule `useBalance` states and `MyStarView` follows.
 */
export function GetStarHeader() {
    const { t, currentLanguage } = useTranslation()
    const { currentUser, isAuthenticated } = useAuth()
    const requireAuth = useRequireAuth()
    const { myChannel } = useMyChannel()
    const { star, isKnown } = useBalance()

    /*
     * `display_name`, then the slug, then a named fallback — never blank. The slug arrives with
     * `my-channel/`, which resolves after `/me`, so the handle is simply not drawn until it is:
     * the same order `MenuProfileCard` settled on, for the same reason.
     */
    const name = accountDisplayName(currentUser) ?? myChannel?.slug ?? t('auth_switcher_unnamed')
    const id = accountUserId(currentUser)

    return (
        <section
            aria-labelledby="get-star-heading"
            /*
             * `overflow-clip`, never `overflow-hidden`: the two clip identically and respect the
             * radius identically, but `hidden` makes the box a scroll container — which is what took
             * the sticky total bar's ancestor chain out from under it once already (`ledger.tsx`).
             */
            className="flex flex-none flex-col overflow-clip rounded-xl bg-(--background-surface) shadow-[inset_0_0_0_1px_var(--button-secondary-border)]"
        >
            <div className="flex items-start justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-col">
                    <h2
                        id="get-star-heading"
                        className="type-title-t2-semibold m-0 text-(--text-title)"
                    >
                        {t('payment_get_star_title')}
                    </h2>
                    <p className="type-dense-default m-0 text-(--text-subtitle)">
                        {t('payment_get_star_note')}
                    </p>
                </div>

                {/*
                 * ## Only for an account, and it is not a gate — there is nothing behind it
                 *
                 * A visitor with no account has no purchases, so the link would lead to a page whose
                 * only content is the sign-in prompt they can already see one row below. Legacy hides
                 * it on the same condition (`BtnTransaction` renders inside `isAuthenticated &&`).
                 * This is not the "gate the action, never the route" case: nothing is being withheld,
                 * the destination simply has nothing in it for them.
                 *
                 * ## A real link, to this feature's own history — not to `/my-star`
                 *
                 * It pointed at `/my-star` for a while and that was the wrong list: `/my-star` is
                 * billy's **balance movements**, and a top-up that failed or is still pending never
                 * reaches it — which is precisely the row somebody opens a history for.
                 *
                 * A `<Link>` rather than a control that opens a dialog, so middle-click, "open in new
                 * tab" and copy-link all work, and so the list has an address somebody can send to
                 * support with a transaction id in it. The page handles a guest itself
                 * (`TransactionHistoryView`), so nothing is gated here: gate the action, never the
                 * route.
                 *
                 * Below `sm` the label is dropped and the glyph carries it, with the label moved to
                 * `aria-label`: at 390px the sentence is wider than the heading beside it and pushes
                 * the title into a two-line wrap. `flex-none` so it never shrinks the heading instead
                 * of itself.
                 *
                 * ## Purple through `--text-brand`, never a hex and never `--button-accent-bg`
                 *
                 * The DS's default for a link is `--text-link` (blue); purple is the divergence
                 * `/my-wallet`'s **View all** already makes, through this token. It matters *which*
                 * purple: the Primary ramp mirrors around 500, so `--primary-500` / the accent-button
                 * token is `#501bc0` in **both** modes — measured at **1.91:1** on the dark surface,
                 * i.e. unreadable. `--text-brand` is the one that inverts (500 → 600), giving 9.3:1
                 * in Light and 3.6:1 in Dark.
                 */}
                {isAuthenticated && (
                    <Link
                        data-testid="payment-get-star-history-link"
                        href={GET_STAR_TRANSACTIONS_PATH}
                        aria-label={t('payment_view_transaction_history')}
                        className="type-dense-strong -m-2 flex flex-none items-center gap-2 rounded-lg p-2 text-(--text-brand) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                    >
                        <Icon name="arrow-rotate-left" size={16} />
                        <span className="hidden sm:inline">
                            {t('payment_view_transaction_history')}
                        </span>
                    </Link>
                )}
            </div>

            <span aria-hidden className="h-px flex-none bg-(--separator-default)" />

            {/*
             * ## A guest gets the row too — with the way to fill it
             *
             * The row was hidden for them at first, on the argument that there is no balance, handle
             * or id to print. That left the masthead a heading and a sentence, and the only thing on
             * the screen saying an account matters was a caption under the Pay button at the very
             * bottom. The design puts a **Log in** control in the row instead, which is right: this
             * row's job is to name who is being credited, and "nobody yet" is an answer that has an
             * action attached to it.
             *
             * `auth_sign_in` — the app's own word, not the comp's *Log in*. Two words for one action
             * in one app is worse than matching a mock exactly, and every other prompt in here says
             * Sign in.
             *
             * `requireAuth(() => undefined)` is the idiom `MyStarView` and `CardManagementView` use:
             * the gate *is* the action, and by the time a callback could run this branch has
             * unmounted — there is nothing left to do.
             */}
            {!isAuthenticated && (
                <div className="flex items-center p-4">
                    <Button
                        data-testid="payment-get-star-sign-in"
                        variant="secondary"
                        size="large"
                        onClick={requireAuth(() => undefined)}
                    >
                        {/*
                         * The comp draws an **outline** person; this is solid, and the difference is
                         * the sprite's, not a substitution. `user-simple-alt` is one of the 65 bare
                         * ids that are `<use>` aliases onto `--filled` (CLAUDE.md records the set),
                         * there is no `user-simple-alt--regular` in the upstream file, and `Icon`
                         * exposes no `regular` weight at all — so the DS ships no outline person.
                         * Same glyph, only weight it has; pulling one from upstream Zappicon is
                         * reserved for a screen that cannot work without it, and a login button is
                         * not that.
                         */}
                        <Icon name="user-simple-alt" size={20} />
                        {t('auth_sign_in')}
                    </Button>
                </div>
            )}

            {isAuthenticated && (
                <>
                    {/*
                     * ## One row at every width — the balance never drops below the identity
                     *
                     * It stacked below `sm` for a while, back when the handle carried a
                     * `max-w-[45%]` cap and the display name was the thing that elided
                     * ("Wo… @wondercat"). Stacking treated the symptom; the cap was the cause, and
                     * removing it fixed the row without changing its shape.
                     *
                     * So the rule is the same one at every size: the identity is `flex-auto min-w-0`
                     * and the balance sits beside it, i.e. **100% − the other side**. `flex-auto`
                     * and not `flex-1`: both grow, but only `flex-auto` keeps a content
                     * flex-basis — and the basis is what decides who yields when there is *not*
                     * enough. With `flex-1` (basis 0) this side absorbed the whole shortfall alone,
                     * so the balance never gave way and its caption cost the name its last pixels.
                     */}
                    <div className="flex items-center gap-3 p-4">
                        <div className="flex min-w-0 flex-auto items-center gap-3">
                            {/*
                             * `avatarVideo={null}`: an animated avatar is resolved by a
                             * `features/navigation` hook this feature may not reach into, and a still
                             * face is the honest version of the same thing rather than a wrong one.
                             */}
                            <AnimatedAvatar
                                thumb={accountAvatarUrl(currentUser)}
                                avatarVideo={null}
                                isPremium={false}
                                alt=""
                                size="large"
                            />

                            <div className="flex min-w-0 flex-1 flex-col">
                                {/*
                                 * `items-baseline` so the 16px handle sits on the name's baseline rather
                                 * than centred against it, and `min-w-0` on both the row and the name —
                                 * every part of this is `nowrap` by default, so a long display name would
                                 * push the handle out of the row instead of ellipsing itself.
                                 */}
                                <span className="flex min-w-0 items-baseline gap-1 overflow-hidden">
                                    {/*
                                     * `shrink-0`: the name **never** gives way. Shrink *factors*
                                     * were tried first — 1 against the handle's 999 — and they did
                                     * not hold: at 390 both halves still elided, because flex weights
                                     * shrinkage by factor × basis and a `truncate` item's basis is
                                     * not what it looks like. A factor is a preference; this is the
                                     * rule, and the rule is that the name is the identity while the
                                     * handle only confirms it.
                                     *
                                     * What makes that safe is the `overflow-hidden` on the row above:
                                     * a 40-character display name pushes the handle to nothing and is
                                     * then clipped **by the row**, so it can never spill out of the
                                     * card. Without that, `shrink-0` would be an overflow waiting for
                                     * a long name.
                                     */}
                                    <span className="type-subheading-strong shrink-0 truncate text-(--text-title)">
                                        {name}
                                    </span>
                                    {/*
                                     * **This** is the half that gives way, and it is the only one:
                                     * the name above is `shrink-0`. The handle confirms an identity
                                     * the name has already stated, so it is the right thing to
                                     * ellipse when the row is tight.
                                     *
                                     * It once carried a `max-w-[45%]` cap, which truncated
                                     * `@sinhpham` next to 300px of empty row — a width invented to
                                     * solve a problem at one screen size, wrong at every other. No
                                     * width here: it shrinks because there is nothing left, not
                                     * because a number said so.
                                     */}
                                    {myChannel?.slug && (
                                        <span className="type-dense-default min-w-0 shrink-[999] truncate text-(--text-subtitle)">
                                            @{myChannel.slug}
                                        </span>
                                    )}
                                </span>
                                {/* The drawer's own key — the same sentence about the same number, and a
                                third copy of the string is a third thing to translate. */}
                                <span className="type-dense-default truncate text-(--text-subtitle)">
                                    {t('menu_profile_id', { id: id ?? '—' })}
                                </span>
                            </div>
                        </div>

                        {/*
                         * ## The caption may wrap; the figure never shrinks
                         *
                         * `flex-none` here made the **caption** set this column's width — 116px, for
                         * a label on a figure whose own row is 90. At 390 that took 26px the name
                         * needed and elided "Wondercat" for the sake of a word.
                         *
                         * So the column shrinks (`min-w-0`, no `flex-none`) and the *figure's* row is
                         * what refuses to (`flex-none whitespace-nowrap`): under pressure the caption
                         * wraps to two lines and the number is untouched, which is the correct order
                         * of sacrifice on a screen about money. With room, nothing shrinks and it
                         * renders exactly as the comp draws it — one line, one row.
                         */}
                        <div className="flex min-w-0 flex-col items-end">
                            <span className="flex flex-none items-center gap-2 whitespace-nowrap">
                                <StarMark size={28} />
                                <span className="type-title-t2-semibold text-(--text-title) tabular-nums">
                                    {isKnown ? formatStarAmount(star, currentLanguage) : '—'}
                                </span>
                            </span>
                            <span className="type-caption-meta text-end text-(--text-subtitle)">
                                {t('payment_current_star_balance')}
                            </span>
                        </div>
                    </div>
                </>
            )}
        </section>
    )
}
