'use client'

import { BarIconButton } from '@shared/components/bar-icon-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { useRouter } from 'next/navigation'
import { TWO_FA_CONTAINER } from '../../lib/container'

/**
 * The screen's back bar — **one control, and it means "up one step" while there is one.**
 *
 * The comps draw exactly one back affordance for the whole feature: the round button at the top of
 * the page, left of the centred title. There is no second control inside the card on any of the
 * eleven screens. So Back has to do double duty — step back through the flow first, and leave the
 * route only when there is nothing left to step back to. That is the arrangement `PageBackBar`'s
 * `onBack` prop exists for, and `/star-transfer` is its precedent: one URL, several screens, and a
 * back button that walks them.
 *
 * ## Why this is not `PageBackBar` itself
 *
 * `PageBackBar` lives in `features/navigation`, and **`features/navigation` imports
 * `features/auth`** (`app-navbar`, `app-tab-bar`, the drawer's Privacy and Security screen). Reaching
 * the other way would close a barrel cycle — which ESM resolves by handing one side a
 * half-initialised module, so it is not a build error but an `undefined is not a function` at render
 * time (`CLAUDE.md` states the rule at `menu-rows.ts`).
 *
 * So the bar is re-composed here **from the same `shared/` parts `PageBackBar` is made of** —
 * `AppBar`, `AppBarCluster`, `AppBarTitle` and `BarIconButton` — which is what keeps the two from
 * drifting: the 40px disc, the filled mirrored glyph and the bar's 60px box are all the shared
 * components' own, not numbers copied out of that file. What is *not* shared is the ~20 lines of
 * composition, and that is the price of the boundary.
 *
 * Two behaviours are `PageBackBar`'s and deliberately reproduced: the absolutely-centred title with
 * a `max-w` reserve so a long one truncates instead of sliding under the button, and the
 * `history.length` fallback — a page opened directly from a link or a push notification has nothing
 * to go back to, so `router.back()` would leave the site.
 */
export function TwoFaBackBar({
    title,
    /** Step back inside the screen. `undefined` at the root, where Back leaves the route. */
    onBack,
    /** A request is in flight — the step it would leave is not finished with. */
    disabled,
}: {
    title: string
    onBack?: () => void
    disabled?: boolean
}) {
    const { t } = useTranslation()
    const router = useRouter()

    return (
        /* No hairline, and an opaque ground: this is a short panel on `--background`, not a long
           document where a rule marks where the chrome ends — and the opaque fill is what keeps
           content from showing through as it scrolls under. `/settings/password` makes the same
           call, and `md:px-0` is the other half of `PageSurface`'s note: from md the panel has a
           visible border, and the eye measures the bar against *that*, so any padding here pulls
           the button inside the card's outline. */
        <div className="sticky top-0 z-20 bg-(--background)">
            <AppBar className={cn(TWO_FA_CONTAINER, 'md:px-0')}>
                <AppBarCluster className="min-w-0">
                    <BarIconButton
                        data-testid="auth-two-fa-back"
                        name="angle-left"
                        weight="filled"
                        mirrored
                        label={t('common_back')}
                        disabled={disabled}
                        onClick={() => {
                            if (onBack) {
                                onBack()
                                return
                            }
                            if (window.history.length > 1) router.back()
                            else router.push('/')
                        }}
                    />
                </AppBarCluster>
                <AppBarTitle className="max-w-[calc(100%-160px)]">
                    <AppBarTitleText as="h1" className="max-w-full truncate">
                        {title}
                    </AppBarTitleText>
                </AppBarTitle>
            </AppBar>
        </div>
    )
}
