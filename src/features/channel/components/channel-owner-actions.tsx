'use client'

/*
 * `@features/earnings/routes`, **not** `@features/earnings`. The main barrel pulls in the report
 * view, which imports this feature's barrel, which loads this file — a cycle between two barrels
 * that ESM resolves by handing one side a half-initialised module. That file is import-free for
 * exactly this reason; see its doc.
 */
import { earningsReportPath } from '@features/earnings/routes'
import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import type { Channel } from '../api/types'
import { useOwnerDeepLink } from '../hooks/use-owner-deep-link'
import { CUSTOM_PROFILE_PATH } from '../lib/routes'

/**
 * The owner's action row — the one row the design system actually draws.
 *
 * `preview/space.html`, verbatim: two `data-variant="secondary" data-size="large"` buttons carrying
 * `pen-line` + "Custom profile" and `dollar-circle` + "Earning report". `size="large"` is 48 tall,
 * which is also legacy's height, so nothing needs reconciling here.
 *
 * ## Both are links now
 *
 * **Custom profile** goes to `/settings/custom-profile` — the route that replaced legacy's drawer.
 * **Earning report** goes to `/@{slug}/earnings-report`, legacy's URL unchanged.
 *
 * Both spent time disabled while their screens did not exist, and the reasoning is kept because it
 * is the rule the next one of these follows: a button that navigates to a 404 is worse than one
 * that is visibly not ready — and a button that is silently inert is worse than both, because the
 * reader keeps pressing it.
 *
 * `channel.slug` rather than `myChannel.slug`, and they are the same value here: this row only
 * renders for the owner (`useChannelOwnership`), so the channel on screen *is* theirs. Using the
 * one already in props avoids a second source of truth for the address in the link — and the
 * report screen compares the two again on arrival anyway, because the endpoint ignores the slug
 * entirely (`features/earnings/api/earnings-api.ts`).
 *
 * ## It also answers the space's deep links, for the owner
 *
 * `/@ada/direct-donation` and `/@ada/membership` open a dialog for a visitor and mean something else
 * entirely for the creator, who cannot buy from themselves — `useOwnerDeepLink` sends them to the
 * screen that manages the thing instead. It lives on this row for the reason that hook sets out at
 * length: this component *is* the set of readers the redirect is right for, so every wall that hides
 * the row withholds it for free.
 */
export function ChannelOwnerActions({ channel }: { channel: Channel }) {
    const { t } = useTranslation()
    useOwnerDeepLink()

    return (
        /*
         * **One row, always** (product call, 2026-10-07) — it used to `flex-wrap`, which on a phone
         * stacked the pair into two full-width 48px bars and doubled the header's action block.
         *
         * What makes one row fit without truncating is three things, measured in a browser across
         * all nine locales: each button is sized to its **own** label (`flex-auto`, grow from a
         * content basis) rather than half the row, so a short "Custom profile" lends its slack to a
         * long "Báo cáo thu nhập" / "Laporan Pendapatan"; the horizontal padding drops from the DS's
         * 24 to 10; and below `sm` the label is **14/500** — the DS's own `medium` button type —
         * instead of large's 16. The height stays 48. With all three the widest pair (`id`) fits a
         * 360 phone; at 16px it truncated even at 390. `min-w-0` + `truncate` remain the backstop
         * for anything narrower — an ellipsis beats a second row or a page that scrolls sideways.
         *
         * Not `grid-cols-2`: equal halves give each label 127px at 390, which truncates Vietnamese,
         * the content-sized split does not.
         */
        <div className="flex min-w-0 items-center gap-2">
            {/*
             * `render` rather than wrapping the `Button` in a `Link`: this button is 48 tall and a
             * wrapper would leave the anchor sized to its text, so the top and bottom of the
             * control would not be clickable.
             */}
            <Button
                data-testid="channel-owner-edit"
                variant="secondary"
                size="large"
                className="min-w-0 flex-auto px-2.5 text-sm sm:text-base"
                render={<Link href={CUSTOM_PROFILE_PATH} />}
            >
                <Icon name="pen-line" weight="filled" size={20} />
                <span className="truncate">{t('channel_action_custom_profile')}</span>
            </Button>
            {/*
             * ## The green is legacy's, not the design system's — and it is deliberate
             *
             * `preview/space.html` draws **both** buttons as plain `data-variant="secondary"`:
             * same fill, same text colour, no accent anywhere on the row (checked — the file
             * contains no green at all). Legacy disagrees and always has: `btnEarningsReport`
             * ships `color: '#008D1F'`, so the glyph and the label are green while Custom profile
             * beside it is not.
             *
             * Legacy wins here because the difference carries meaning rather than decoration —
             * this is the one control on a creator's own space that leads to money, and the
             * colour is what separates it from the button that edits a bio. Kept as a documented
             * divergence rather than a silent one: if the DS ever draws this row with an accent,
             * this line should follow it.
             *
             * **`--text-success`, not `#008D1F`.** Semantic tokens only — the raw hex is a single
             * value that cannot move between Light and Dark, and a deep green on a dark secondary
             * fill is where it would fail. The token is the DS's own success ramp and flips with
             * the theme. `Icon` paints with `currentColor`, so colouring the button colours both.
             */}
            <Button
                data-testid="channel-owner-share"
                variant="secondary"
                size="large"
                className="min-w-0 flex-auto px-2.5 text-sm sm:text-base text-(--text-success)"
                render={<Link href={earningsReportPath(channel.slug)} />}
            >
                <Icon name="dollar-circle" weight="filled" size={20} />
                <span className="truncate">{t('channel_action_earnings_report')}</span>
            </Button>

            {/*
             * The publish call-to-action for an unpublished space is deliberately **not** a third
             * button here. It is a banner under this row (`channel-publish-banner.tsx`), which is
             * where legacy puts it and where it can carry the sentence explaining what publishing
             * does — a button squeezed between two 48px links cannot. This row used to carry an
             * `sr-only` "Unpublished" instead, back when the banner did not exist; the banner now
             * announces that as visible text, so keeping it would read the word twice.
             */}
        </div>
    )
}
