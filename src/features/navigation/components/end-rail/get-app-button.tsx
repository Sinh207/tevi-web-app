'use client'

import { GetAppDialog } from '@shared/components/get-app-dialog'
import { PhoneMark } from '@shared/components/phone-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { useState } from 'react'

/**
 * "Get App" in the end-rail pill.
 *
 * ## AppsFlyer is gone, and nothing reachable is lost
 *
 * Legacy branches on `react-device-detect`'s `isMobile`: on a phone it hands off to an AppsFlyer
 * OneLink (`useDynamicLink` → `useAppsFlyer` → PostHog wire params → remote config), on a desktop
 * it opens the QR dialog. **The rail is desktop-only** — it needs a 1292px window — so the phone
 * branch is unreachable code holding up a whole dependency chain. Dropping it removes AppsFlyer,
 * remote config and a UA sniff from this surface without changing any behaviour a user can reach.
 *
 * It also drops a bug: `redirectToApp()` silently no-ops until a PostHog-gated effect has populated
 * the link, so an early press on a slow connection does nothing at all.
 *
 * ## The mark
 *
 * Legacy's phone, copied verbatim into `PhoneMark` — a plain component rather than an `Icon`,
 * because the comps draw this path and the library's `mobile` is a different silhouette, and a
 * foreign path must not enter through a door that asserts Figma provenance. That file has the full
 * reasoning, including what to delete when design ships a real glyph.
 *
 * It replaced `qr-code`, which shipped here first while the missing glyph was being reported.
 */
export function GetAppButton() {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)

    return (
        <>
            {/*
             * `size-6` on the mark, and it has to be a class rather than a width attribute: every
             * Button size carries `[&_svg:not([class*='size-'])]:size-N`, so an unclassed 24 glyph
             * was being overridden down to 16 by the recipe. The escape hatch is the
             * `:not([class*='size-'])` in that selector — which is why the class is what wins.
             *
             * 24 is legacy's number for this mark. `size="medium"` (36 tall) gives it room;
             * `small` is 28 and would leave a 24 glyph nearly filling the control.
             */}
            <Button
                data-testid="navigation-end-rail-get-app"
                variant="ghost"
                size="medium"
                className="gap-1 px-1"
                onClick={() => setOpen(true)}
            >
                <PhoneMark className="size-6 flex-none" />
                <span className="type-body-strong">{t('rail_get_app')}</span>
            </Button>
            <GetAppDialog testId="navigation-get-app" open={open} onOpenChange={setOpen} />
        </>
    )
}
