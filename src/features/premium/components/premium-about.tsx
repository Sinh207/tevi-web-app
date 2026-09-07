'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import Link from 'next/link'
import { Trans } from 'react-i18next'
import { PREMIUM_INSET, PREMIUM_PANEL } from '../lib/container'

/**
 * "About Tevi Premium" — three paragraphs of prose, and the legal line under them.
 *
 * ## Real elements, not `dangerouslySetInnerHTML`
 *
 * Legacy pushes all four strings through `dangerouslySetInnerHTML`, and the last one is built by
 * `String.replace`-ing the *English* phrase "Tevi Terms of Service" out of a translated sentence and
 * substituting an `<a>` — which silently does nothing in eight of nine locales, because those
 * sentences do not contain the English phrase. Here each locale wraps its own wording in `<0>`/`<1>`
 * and `Trans` fills the tags, so the links land where each language puts them. Same mechanism, and
 * the same reasoning, as `channel-state-screens.tsx`.
 *
 * That also takes an HTML sink off a page that renders no HTML: nothing here is markup any more.
 *
 * ## The monthly price is a **prop**, and it can be absent
 *
 * The third paragraph names a price ("all for just $X/month"), so it is only rendered once that
 * figure is known — a sentence with an empty figure in it is worse than one less paragraph, and it
 * is a **price**, so it must never appear as `undefined/month`. The other two are static and always
 * render.
 *
 * It is passed in rather than derived here because **the two screens that draw this panel derive it
 * from different catalogues**. `/premium` divides nothing: it prints the monthly *subscription's*
 * own price, straight off `v1/packages/`. `/gift-premium` has no monthly package to print — the gift
 * table is 90/180/365 — so legacy prints the yearly gift over twelve, and `giftMonthlyEquivalent`
 * is that arithmetic.
 *
 * Calling `usePremiumPlans()` in here, which is what this did, meant the gift screen fetched
 * `v1/packages/` — a catalogue it does not sell from and nothing else on it reads — purely to fill
 * one clause. Caught by tracing the screen's real requests.
 *
 * ## Two locales carry only one link, and that is data rather than a bug
 *
 * The `<0>`/`<1>` tags were placed by matching each locale's own phrase inside its own sentence.
 * `zh-CN`'s terms wording and `ar`'s differ from the standalone strings, so those two sentences carry
 * one link instead of two; `Trans` renders the unused component not at all. Legacy links neither.
 */
export function PremiumAbout({
    monthlyPrice,
}: {
    /** Already formatted by the caller's own price hook. `null` drops the third paragraph. */
    monthlyPrice: string | null
}) {
    const { t } = useTranslation()

    return (
        <section className={cn(PREMIUM_INSET, 'flex flex-col items-center gap-2')}>
            <h2 className="type-body-strong text-(--text-subtitle)">{t('premium_about_title')}</h2>

            <div
                data-testid="premium-about"
                className={cn(PREMIUM_PANEL, 'flex w-full flex-col gap-3')}
            >
                {/*
                 * `[&_b]:` on the paragraph rather than a class on the `<b>` handed to `Trans`: the
                 * emphasised run is *inside* a translated sentence, so the element is created by the
                 * translation and there is nowhere else to style it. `font-semibold` and
                 * `--text-title`, which is what makes an emphasised phrase read as emphasis on a
                 * `--text-body` paragraph.
                 */}
                <p className={PROSE}>
                    <Trans i18nKey="premium_about_p1" components={[<b key="0" />]} />
                </p>
                <p className={PROSE}>
                    {/*
                     * `spins: '5'` is legacy's hard-coded figure, and it stays hard-coded here for
                     * one reason: the number is *also* baked into the copy of the benefit it
                     * describes ("Get 5 more spins in Lucky wheel everyday", which comes from the
                     * API). Deriving it from the benefits payload would make two sentences on the
                     * same page disagree the day the backoffice changes one of them. It is a string
                     * rather than a number so no locale re-formats it as `5.0`.
                     */}
                    <Trans
                        i18nKey="premium_about_p2"
                        values={{ spins: '5' }}
                        components={[<b key="0" />]}
                    />
                </p>
                {monthlyPrice && (
                    <p className={PROSE}>{t('premium_about_p3', { price: monthlyPrice })}</p>
                )}
            </div>

            <p className="type-caption-meta text-center text-(--text-subtitle)">
                <Trans
                    i18nKey="premium_legal"
                    components={[
                        <Link
                            key="terms"
                            data-testid="premium-terms"
                            href="/terms/tevi-premium"
                            className="text-(--text-link) underline"
                        >
                            {/* `Trans` replaces these children with the tag's own contents. */}
                            terms
                        </Link>,
                        <Link
                            key="privacy"
                            data-testid="premium-privacy"
                            href="/privacy/tevi-premium"
                            className="text-(--text-link) underline"
                        >
                            privacy
                        </Link>,
                    ]}
                />
            </p>
        </section>
    )
}

/**
 * The prose paragraph, with its emphasis rule.
 *
 * A constant because three paragraphs share it and the `[&_b]:` part is the kind of thing that gets
 * copied to two of the three.
 */
const PROSE = 'type-dense-default text-(--text-body) [&_b]:font-semibold [&_b]:text-(--text-title)'
