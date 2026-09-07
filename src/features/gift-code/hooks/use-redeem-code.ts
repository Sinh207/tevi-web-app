'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { balanceKeys } from '@features/balance'
import { useMyChannel } from '@features/channel'
import { forgetPremiumInfoCache, premiumKeys } from '@features/premium'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { giftCodeApi } from '../api/gift-code-api'
import type { RedeemOutcome } from '../api/types'
import { canRedeem, normalizeCode } from '../lib/gift-code'

/**
 * The one thing that can be said about the code itself. A **key**, not a sentence: a language switch
 * while it is on screen must re-render it, which a translated string held in state cannot do — the
 * same reasoning `signInErrorKey` carries in `features/auth`.
 *
 * A union of one, deliberately: it makes the call site's `t()` exhaustive, so a second reason (an
 * "already used" code, once B49 is answered) is a type error at the screen rather than a silently
 * untranslated line.
 */
export type RedeemErrorKey = 'giftcode_error_invalid'

/**
 * The redeem flow — the field, the press, and what the code turned out to be.
 *
 * ## Three states, and only one of them is an error
 *
 * | what happened | where it shows |
 * |---|---|
 * | a code was redeemed | `result`, which is what opens the result dialog |
 * | every service refused it | `errorKey` — one line under the field |
 * | nobody could say | the mutation's error toast, field untouched |
 *
 * The middle one resolves *successfully* out of `giftCodeApi.redeem` on purpose (see
 * `lib/redeem-sequence.ts`): a mistyped code is the most ordinary thing that happens on this screen
 * and it is not a failure, so it must not raise a toast, and the mutation's error path stays for
 * things that genuinely went wrong. Legacy collapses the last two into one sentence — *"The code
 * entered is not valid."* — which tells somebody holding a good gift card, during a billing
 * outage, that their card is worthless.
 *
 * `errorKey` is a **translation key**, never a backend sentence. Same rule as `signInErrorKey` in
 * `features/auth`: the two bodies behind this screen are undocumented and unlocalised, and a code
 * endpoint is exactly the place where a message could leak how far a guess got.
 *
 * ## A verdict belongs to the code it was about
 *
 * The rejection is stored **with the string it was passed** and rendered only while the field still
 * holds that string, rather than as a free-standing "there is an error" flag. Two things fall out of
 * that, and neither needs its own mechanism:
 *
 * - **Typing clears it.** The moment the field changes the sentence stops being about what is on
 *   screen, so it goes. Legacy keeps it until the next request, so the line sits under a code the
 *   reader has already fixed — and its submit button is disabled while it is showing, which means
 *   the fix cannot be submitted at all.
 * - **A verdict cannot land on the wrong code.** The field stays editable while the request is in
 *   flight (there is no reason to take it away for 300ms), so a reader who types `A`, presses, and
 *   keeps typing would otherwise be told that `AB` is invalid — a claim nothing has checked.
 *
 * Retyping the *same* rejected code shows the line again without a request, which is correct: that
 * string is known to be invalid, and the button stays pressable for anyone who wants to try it
 * anyway.
 *
 * ## The press is gated, not the route
 *
 * A guest can read this page — it explains what a gift code is for — and pressing raises the
 * sign-in dialog instead of navigating away. That is the app's rule everywhere (`CLAUDE.md`), and
 * `useRequireAuth` is where it is spelled out. Legacy's `redeemCode` silently returns for a signed
 * out visitor: the button is pressable, and nothing happens.
 *
 * ## After a redemption, the figures the app is already showing are wrong
 *
 * A Star gift moved the balance in the top bar; a Premium code moved `is_premium`, which decides
 * the badge beside the reader's own name and the end rail's upgrade banner. Both are **invalidated,
 * never patched**: the balance is `features/balance`'s to own and the channel is
 * `features/channel`'s, and writing a figure this screen guessed into either cache is how a number
 * ends up moving backwards when the real response lands. `other` refreshes both, because a
 * redemption this client could not itemise may well have moved either.
 */
export function useRedeemCode() {
    const { t } = useTranslation()
    const { activeId } = useAuth()
    const requireAuth = useRequireAuth()
    const { refresh: refreshMyChannel } = useMyChannel()
    const queryClient = useQueryClient()

    /** The raw field value. Trimmed on the way out, never on the way in — see `normalizeCode`. */
    const [code, setCode] = useState('')
    /** A rejection, and the exact string it was about — see the note above on which is rendered. */
    const [verdict, setVerdict] = useState<{ code: string; key: RedeemErrorKey } | null>(null)
    const [result, setResult] = useState<RedeemOutcome | null>(null)

    const redeem = useMutation({
        /*
         * The code travels as the mutation's **variable**, not read out of state inside the
         * mutationFn: `onSuccess` gets it back untouched, which is what lets the verdict be filed
         * against the string that was actually sent.
         */
        /*
         * The account travels **in the variables**, beside the code, for the same reason the code
         * does: `onSuccess` gets both back untouched.
         *
         * Reading `activeId` inside `onSuccess` was wrong in a way that is easy to miss — TanStack
         * replaces a *pending* mutation's options on every re-render, so the callback that runs is
         * the newest closure. Redeem as A, switch to B while the request is in flight, and the gift
         * was credited to A while the cache invalidation, the channel refresh and the result dialog
         * all pointed at B: B's expiry printed for a code redeemed into A, and A's Premium standing
         * left stale.
         */
        mutationFn: ({ code: submitted, accountId }: { code: string; accountId: string | null }) =>
            giftCodeApi.redeem(submitted, accountId),
        onSuccess: (outcome, { code: submitted, accountId }) => {
            if (outcome.kind === 'invalid') {
                setVerdict({ code: submitted, key: 'giftcode_error_invalid' })
                return
            }
            /*
             * `balanceKeys.all`, not `refreshBalance()`: that helper invalidates whichever account is
             * active *now*, which is exactly the account this write did not touch. The prefix covers
             * every account's figure and both ledgers, which is the honest answer when the reader has
             * moved on.
             */
            if (outcome.kind === 'star' || outcome.kind === 'other') {
                void queryClient.invalidateQueries({ queryKey: balanceKeys.all })
            }
            if (outcome.kind === 'premium' || outcome.kind === 'other') {
                void refreshMyChannel()
                /*
                 * The grant is `features/premium`'s to hold, so its key is the one to invalidate —
                 * and the **stored validator goes first**. A redemption is exactly the moment
                 * `user/info/` is known to have changed behind an ETag that may not admit it: the
                 * refetch would carry `If-None-Match`, take a `304`, and replay the body from before
                 * the code was spent. Same trap as **B72**, and `forgetPremiumInfoCache` is where it
                 * is argued.
                 */
                void forgetPremiumInfoCache(accountId).then(() =>
                    queryClient.invalidateQueries({ queryKey: premiumKeys.info(accountId) }),
                )
            }
            setResult(outcome)
        },
        // A message, not a key — the toast is raised outside React, by `query-client.ts`.
        meta: { showErrorToast: t('giftcode_error_failed') },
    })

    const changeCode = useCallback((next: string) => setCode(next), [])

    const submit = requireAuth(() => {
        if (!canRedeem(code) || redeem.isPending) return
        redeem.mutate({ code: normalizeCode(code), accountId: activeId })
    })

    /**
     * Closing the result clears the field as well as the panel — legacy does the same, and it is
     * what "Redeem another code" means: the code that is showing has been spent, so leaving it in
     * the field only invites a second press that can now never succeed.
     */
    const closeResult = useCallback(() => {
        setResult(null)
        setCode('')
    }, [])

    return {
        code,
        changeCode,
        submit,
        canSubmit: canRedeem(code),
        isRedeeming: redeem.isPending,
        /** Only ever the verdict on what the field holds right now. */
        errorKey: verdict && verdict.code === normalizeCode(code) ? verdict.key : null,
        result,
        closeResult,
    }
}

export type RedeemFlow = ReturnType<typeof useRedeemCode>
