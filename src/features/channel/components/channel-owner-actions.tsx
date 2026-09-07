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
 */
export function ChannelOwnerActions({ channel }: { channel: Channel }) {
    const { t } = useTranslation()

    return (
        /*
         * `flex-wrap`, and each button keeps its own content width (`min-w-fit`) while still
         * sharing the line when both fit (`flex-1`).
         *
         * The first fix was `min-w-0` + a truncating label, which stopped the overflow and produced
         * "Custom pr…" / "Earnings r…" on a 390 phone — a row of two controls neither of which says
         * what it does. Wrapping is the better trade: at 390 the pair needs 394px of a 366px slot,
         * so the second drops to its own line at full width and both labels stay whole. From 430 up
         * they fit side by side again, with no breakpoint deciding it — the content does.
         */
        <div className="flex min-w-0 flex-wrap items-center gap-2">
            {/*
             * `render` rather than wrapping the `Button` in a `Link`: this button is 48 tall and a
             * wrapper would leave the anchor sized to its text, so the top and bottom of the
             * control would not be clickable.
             */}
            {/*
             * Without `min-w-fit` and the wrap above, this row **scrolled the page sideways**.
             * Measured at 390: each label wants ~196px, so the pair plus the gap came to 400 in a
             * 366px slot and the second button ended 16px past the card's edge.
             *
             * `flex-1` alone does not fix it — a flex item's `min-width` is `auto`, so it refuses to
             * shrink below its content, and `Button` is `whitespace-nowrap` (the DS's rule: every
             * label node in Figma is one line with truncation disabled). Nowrap is kept and the row
             * wraps instead.
             *
             * `truncate` stays as a backstop for the case wrapping cannot save — a locale whose
             * label is wider than the whole column — where an ellipsis beats another page-wide
             * scrollbar.
             */}
            <Button
                data-testid="channel-owner-edit"
                variant="secondary"
                size="large"
                className="min-w-fit flex-1"
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
                className="min-w-fit flex-1 text-(--text-success)"
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
