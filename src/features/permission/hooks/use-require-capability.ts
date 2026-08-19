'use client'

import { useRequireAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useCallback } from 'react'
import { toast } from 'sonner'
import type { Capability } from '../lib/capabilities'
import { usePermission } from '../providers/permission-provider'

/**
 * Guard an **action** behind a capability.
 *
 * ```tsx
 * const requireCapability = useRequireCapability()
 * <Button onClick={requireCapability('star-transfer', () => openTransfer())}>Transfer</Button>
 * ```
 *
 * ## Deliberately the same shape as `useRequireAuth` and `useRequireStars`
 *
 * A hook returning a wrapper that either runs the callback or diverts — the app's idiom for "this
 * action has a precondition" — and it composes with `requireAuth` for the same reason
 * `useRequireStars` does: a guest has no grants, so checking the grant first would tell somebody they
 * lack a permission when their actual problem is that they are not signed in. Sign-in first, grant
 * second.
 *
 * ## When to use this instead of `useCapability`
 *
 * `useCapability` gates a screen — a whole surface that should not be there. This gates a *press* on a
 * surface that legitimately is: a transfer button inside a wallet, a "settle" action in a list. The
 * distinction matters because the diverts differ. A screen shows a panel; a press must not navigate
 * the reader away from what they were doing (`docs/DEFINITION_OF_DONE.md` §3).
 *
 * And unlike a screen, a press has a third answer worth separating: **not known yet**. A refresh is
 * kicked off so a second press has a real answer, and the message says what is actually true rather
 * than accusing the reader of lacking a permission the client simply has not fetched.
 *
 * The denial branch is a toast today. It is the honest placeholder for the same reason
 * `useRequireStars`'s is: a capability the account does not have has no upgrade path to offer yet —
 * these grants come from the backoffice, not from a purchase. If one ever gains one (an "apply to
 * become an agency" flow), it replaces that single line and no call site moves.
 */
export function useRequireCapability() {
    const { t } = useTranslation()
    const { can, isKnown, refresh } = usePermission()
    const requireAuth = useRequireAuth()

    return useCallback(
        <A extends unknown[]>(capability: Capability, cb: (...args: A) => void) =>
            requireAuth((...args: A) => {
                if (can(capability)) {
                    cb(...args)
                    return
                }
                /*
                 * `can` already failed closed, so this branch is reached for both "denied" and "we do
                 * not know". Separating them here is the difference between a true sentence and a false
                 * accusation — and only one of the two is worth retrying.
                 */
                if (!isKnown) {
                    void refresh()
                    toast.error(t('permission_unknown_retry'))
                    return
                }
                toast.error(t('permission_not_allowed'))
            }),
        [requireAuth, can, isKnown, refresh, t],
    )
}
