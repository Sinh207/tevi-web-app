'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Alert, AlertContent, AlertIcon, AlertTitle } from '@shared/ui/alert'
import { formatExactCount } from '../lib/channel-format'
import { FOLLOWING_LIMIT, FOLLOWING_WARN_AT } from '../lib/following-page'

/**
 * "You follow more than 900 spaces. You can follow up to 1,000."
 *
 * ## A notice, not a gate
 *
 * The Follow button is on the *channel* page, so this screen cannot refuse anything, and a
 * client-side cap would only hide the backend's own error. Both numbers are the backend's rule and
 * live in `following-page.ts` — read from there rather than written into the sentence, so the copy
 * and the threshold that triggers it cannot drift apart.
 *
 * `formatExactCount` and not the raw number: it is `1,000` in English and `1.000` in German, and a
 * limit printed with the wrong separator reads as a different limit.
 *
 * ## Its own component so it can be *seen*
 *
 * It was inline in `FollowingView`, which made it unreachable: the only way to render it was an
 * account following 901 spaces. That is the same reason `BlockedAccountRow` and `FollowRequestRow`
 * are exported — a state nobody can reach is a state nobody has checked, and this one is a sentence
 * with two interpolated numbers in nine languages.
 *
 * ## Why it repaints the DS `Alert`'s surface
 *
 * Legacy draws MUI's **outlined** warning alert with `icon={false}`. The DS ships no outlined alert
 * — `Alert`'s surface is `--background-surface` behind a neutral 0.5px ring for *every* status, and
 * only the glyph carries the colour (`alert.tsx` says why the ring is an inset shadow). Inside this
 * screen's card that surface is the **same colour as what is under it**, so a notice about a
 * thousand-space ceiling arrived as an unmarked strip of card — the DS's assumption is a floating
 * alert, and this one is inline.
 *
 * So the tint and the edge come from the call site, in the app's existing formula for a status
 * surface: fill from the accent's `-bg-active` step, edge from the accent itself at 30% (see the
 * note in `shared/ui/toaster.tsx`, which colours all four toasts this way). That keeps it the DS
 * component with the DS geometry — nothing here moves a padding or invents a variant — and it reads
 * as the same statement the warning toast makes. `--shadow-md` goes with it: it lifted the alert
 * off the page, and this one sits *in* a panel.
 *
 * ⚠ The text stays `--text-body`, not `--text-warning`. The accent inks are for marks and figures;
 * at sentence length they fail AA against their own tint in Light.
 *
 * The glyph is kept, unlike legacy: the DS pairs one with every status but `follow`, and a warning
 * with no mark reads as a caption.
 */
export function FollowingLimitNotice() {
    const { t, currentLanguage } = useTranslation()

    return (
        /* `mini` is the DS's tighter Alert — this is a notice above a list, not a dialog. */
        <Alert
            status="warning"
            type="mini"
            className={cn(
                'bg-(--accents-warning-bg-active)',
                // The ring replaces the DS's neutral one rather than joining it, and drops
                // `--shadow-md` with it. 1px, not the DS's 0.5px: at 30% alpha a half-pixel edge
                // is what Chromium rounds away at 1× and the reason the notice went unseen.
                'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accents-warning-active)_30%,transparent)]',
            )}
        >
            <AlertIcon status="warning" type="mini" />
            <AlertContent>
                <AlertTitle type="mini">
                    {t('following_limit_warning', {
                        warn: formatExactCount(FOLLOWING_WARN_AT, currentLanguage),
                        limit: formatExactCount(FOLLOWING_LIMIT, currentLanguage),
                    })}
                </AlertTitle>
            </AlertContent>
        </Alert>
    )
}
