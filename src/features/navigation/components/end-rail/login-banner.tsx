'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { PromoCard } from '@shared/components/promo-card'
import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { RAIL_ART } from './illustrations'

/**
 * "Log in or sign up for Tevi" — the rail's card for a visitor with no account.
 * Legacy: `trending/banner/logInBanner`.
 *
 * `isAuthenticated` is already false for the app's anonymous session
 * (`auth-provider.tsx`: `currentUser?.id && !currentUser?.anonymous`), so this reads exactly
 * as legacy's does even though this app always holds *a* session.
 *
 * Legacy also re-checks `matchUpMd` here, on top of the layout already refusing to render
 * the rail below md, and on top of the two sibling banners doing the same. The breakpoint is
 * the rail's business and it is answered once, in `AppEndRail`.
 */
export function LoginBanner() {
    const { t } = useTranslation()
    const { isAuthenticated } = useAuth()
    /*
     * The auth store is deliberately not on the feature's barrel, so the dialog is opened the
     * way every other gated control in this shell opens it: `useRequireAuth` runs its callback
     * when there is an account and prompts when there is not. Here there is never an account —
     * the card unmounts the moment one exists — so the prompt is the whole behaviour, and the
     * callback is empty because pressing "Log in" has no destination beyond the dialog.
     */
    const promptSignIn = useRequireAuth()(() => {})

    if (isAuthenticated) return null

    return (
        <PromoCard
            title={t('rail_login_title')}
            body={t('rail_login_body')}
            art={RAIL_ART.login}
            action={
                <Button
                    data-testid="navigation-end-rail-sign-in"
                    variant="accent"
                    size="medium"
                    onClick={promptSignIn}
                >
                    {t('rail_login_cta')}
                </Button>
            }
        />
    )
}
