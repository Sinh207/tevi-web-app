'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { EVENT_ART } from '../lib/illustrations'

/**
 * What a report card draws **instead of** the figure it exists to show — empty, or failed.
 *
 * ## One slot, two states, and keeping them apart is the whole point
 *
 * Legacy has this three times, as three `noData/index.js` files that differ only in whether the
 * string is translated — and it has **no error state at all**: a 500 from the billing service falls
 * into the same `<Nodata/>` branch as a broadcast that genuinely earned nothing. So a creator whose
 * request failed is told they made no money.
 *
 * This port reproduced that, which is worse here than in legacy because the same reasoning is
 * written down two files over: `useEvent` splits `notFound` from `isError` precisely so an outage is
 * not reported as "your link is broken". The report needed the same split and did not have it.
 *
 * ## Same layout, different tone — the repo's own idiom
 *
 * `ChannelError` sets it out: *"a failed region and an empty one are the same moment — there is
 * nothing to render and the reader needs a sentence and a way forward"*, so both use one layout and
 * only the mark and the copy move. Recognising which one you are looking at should not require
 * reading. The difference that matters is the **action**: an empty card has nothing to offer, a
 * failed one offers a retry.
 *
 * ## `empty` draws legacy's illustration; `error` draws a glyph
 *
 * The two states are not the same weight and should not look it. **Empty** is the *ordinary* state
 * of every scheduled broadcast — no bill, no analytics, nobody has bought anything yet — and it is
 * the state a creator will see most often, so it gets legacy's own 120px artwork
 * (`EVENT_ART.noData`, committed per `docs/STATIC_ASSETS.md`). **Error** is a malfunction: a glyph
 * in the error accent, which is the register `ChannelError` uses and which must not be dressed up
 * with an illustration that says "nothing here".
 *
 * ⚠ This shipped with a bar-chart glyph for `empty`, on the reasoning that an illustration *"would
 * be a new committed asset for a state that does not warrant one"*. That was the wrong call twice:
 * legacy draws the image here and the asset is 6 KB, so the byte argument the no-CDN rule is built
 * on does not apply — `pnpm art:audit` exists to stop a *remote* fetch, not to discourage art.
 */
export function EventCardState({
    kind,
    onRetry,
    className,
}: {
    /** `empty` — nothing to show yet. `error` — the request failed. Never the same thing. */
    kind: 'empty' | 'error'
    /** Offered on `error` only. Omit and the card states the failure without a way out. */
    onRetry?: () => void
    className?: string
}) {
    const { t } = useTranslation()
    const failed = kind === 'error'

    return (
        <div
            className={cn(
                'flex min-h-[96px] flex-col items-center justify-center gap-2 text-center',
                className,
            )}
        >
            {failed ? (
                /*
                 * ⚠ **No `weight` prop, and it must stay that way.** This was
                 * `weight={failed ? 'filled' : undefined}`, and `exclamation-circle--filled` is
                 * **not in the sprite**: `pnpm icons` builds the subset by scanning *literal*
                 * `name`/`weight` pairs in source, so a computed weight is invisible to it. Nothing
                 * catches that — `icon-names.ts` types the weight as available (it exists
                 * upstream), `pnpm typecheck` passes, `sprite.test.ts` passes, and the only symptom
                 * is a correctly-sized **empty box** where the mark should be. Caught in a
                 * screenshot.
                 *
                 * Outline is what `ChannelError` draws for this exact state, so the two failed
                 * regions in the app match.
                 */
                <Icon
                    name="exclamation-circle"
                    size={24}
                    className="text-(--accents-error-active)"
                />
            ) : (
                /*
                 * Legacy's own artwork, at legacy's own drawn size. Decorative: the line under it
                 * says the same thing in words, so an `alt` would have a screen reader announce the
                 * state twice — the mistake legacy makes with `alt='Tevi - img no data'`.
                 *
                 * `h-auto` beside the declared height, because the box is the *drawn* size rather
                 * than the file's and the ratio is what should govern if the two ever disagree.
                 */
                <Image
                    src={EVENT_ART.noData.src}
                    alt=""
                    aria-hidden
                    width={EVENT_ART.noData.width}
                    height={EVENT_ART.noData.height}
                    className="h-auto w-[120px]"
                />
            )}
            {/*
             * `--text-placeholder` for the absence of content; `--text-subtitle` for a sentence
             * about a failure, which is content. ⚠ **Not** the error accent: that ink is for a mark
             * at this size, not for prose — measured, it misses AA on a light ground
             * (`accent-inks-fail-aa-in-light`). The glyph above carries the colour.
             */}
            <p
                className={cn(
                    'type-dense-default',
                    failed ? 'text-(--text-subtitle)' : 'text-(--text-placeholder)',
                )}
            >
                {t(failed ? 'event_card_error' : 'event_no_data')}
            </p>
            {failed && onRetry && (
                <Button
                    data-testid="event-card-retry"
                    variant="secondary"
                    size="small"
                    onClick={onRetry}
                >
                    {t('common_retry')}
                </Button>
            )}
        </div>
    )
}
