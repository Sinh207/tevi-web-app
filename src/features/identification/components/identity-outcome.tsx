'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { IDENTIFICATION_PANEL } from '../lib/container'
import { IDENTITY_ART } from '../lib/illustrations'
import { RISE, riseDelay } from '../lib/motion'

/**
 * The two end states: submitted and waiting, or verified.
 *
 * One component rather than two, because they differ only in artwork and copy — the same
 * reason the DS's Alert has a `status` prop instead of five components. Legacy models it
 * the same way (`identityStatus` with an `isVerified` flag).
 *
 * "Back to home" is legacy's only action here and stays the only one. There is deliberately
 * no "check again" button: the pending state is resolved by a human at Sumsub, minutes to
 * hours later, and a button that refetches an answer that cannot have changed yet is an
 * invitation to sit on this screen pressing it. The copy says how the person will be told.
 */
export function IdentityOutcome({ state }: { state: 'pending' | 'verified' }) {
    const { t } = useTranslation()
    const router = useRouter()
    const verified = state === 'verified'
    const art = verified ? IDENTITY_ART.verified : IDENTITY_ART.pending

    return (
        <div
            className={cn(
                'flex flex-col items-center gap-4 px-3 pt-3 pb-6 md:px-6 md:pt-6 md:pb-10',
                // Centred in the panel rather than parked at its top: this screen is a
                // statement, and a filled panel with everything pressed against the ceiling
                // reads as content that failed to load the rest of itself.
                'justify-center',
                IDENTIFICATION_PANEL,
            )}
        >
            <Image
                alt=""
                src={art.src}
                width={art.width}
                height={art.height}
                priority
                className={cn('h-auto w-full max-w-[300px]', RISE)}
            />
            {/*
             * Art, then words, then the way out — 60ms apart, in that order, because that is
             * the order they are read in. It also gives the screen a beat before the button
             * lands, which is worth more here than anywhere else on the flow: this is the one
             * moment the person is being told the outcome of something they spent five minutes
             * on, and everything arriving at once reads as a page load rather than an answer.
             */}
            <div className={cn('flex flex-col gap-2 text-center', RISE)} style={riseDelay(1)}>
                <h2 className="type-title-t1-bold text-(--text-title)">
                    {verified
                        ? t('identification_verified_title')
                        : t('identification_pending_title')}
                </h2>
                <p className="type-dense-default text-(--text-subtitle)">
                    {verified
                        ? t('identification_verified_description')
                        : t('identification_pending_description')}
                </p>
            </div>
            {/*
             * Hug-content, not `fullWidth` as legacy has it.
             *
             * A 612px-wide button under two centred lines of text reads as a banner rather than
             * a button, and on this screen there is nothing to line it up with — the intro's CTA
             * is full width because it fills a bar, and there is no bar here. Hug is also the
             * DS's own answer: Figma draws Button as WIDTH_AND_HEIGHT at every size, and the
             * label never wraps, so a longer translation widens it instead of stacking.
             *
             * `min-w` keeps it from shrinking to a chip on the shortest locales (Chinese
             * "返回首页" is four glyphs); 200 is the DS's `large` height × 4, which is the ratio
             * the DS's own wide buttons sit at.
             */}
            <Button
                data-testid="identification-back-to-home"
                id="identification-back-to-home-btn"
                size="large"
                className={cn('mt-2 min-w-[200px] active:not-disabled:scale-[0.99]', RISE)}
                style={riseDelay(2)}
                onClick={() => router.push('/')}
            >
                {t('common_back_home')}
            </Button>
        </div>
    )
}
