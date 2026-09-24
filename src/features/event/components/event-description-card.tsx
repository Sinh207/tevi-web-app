'use client'

import { ClampedText } from '@shared/components/clamped-text'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { EVENT_CARD, EVENT_PADDING } from '../lib/container'

/**
 * **Description** — what the creator wrote about the broadcast.
 *
 * Legacy's card: a titled header over a hairline, then the text. Renders nothing at all when the
 * field is empty, which is the common case and not a state worth a heading over blank space.
 *
 * ## Text, never HTML
 *
 * Legacy's *exclusive panel* renders the same field through `dangerouslySetInnerHTML` — because that
 * panel interpolates a `<label>` into a translated sentence and reuses one component for both. The
 * consequence is that a creator-typed description is injected as markup, on a page that is
 * server-rendered and public. It is not reproduced: this prints the string, and the panel that needs
 * emphasis composes elements instead of a string (`event-watch-panel.tsx`).
 *
 * The CSP is the second line rather than the first — `script-src` is nonce-gated with no `https:`
 * fallback (`shared/config/csp.ts`), so an injected `<script>` would not execute — but a paragraph
 * is not the place to lean on it.
 *
 * ## Clamped, with a way to see the rest
 *
 * Legacy prints the whole field. A description is creator-typed and occasionally very long, and this
 * card sits between the host and nothing — a thousand-word description would push the page's footer
 * off the bottom of a phone with no indication there was an end. `ClampedText` is the app's own
 * control for that and measures whether the clamp is even needed, so a two-line description gets no
 * *more* button.
 */
export function EventDescriptionCard({ description }: { description: string | null }) {
    const { t } = useTranslation()
    if (!description) return null

    return (
        <section className={cn('flex min-w-0 flex-col overflow-clip', EVENT_CARD)}>
            <h2
                className={cn(
                    'type-dense-strong text-(--text-title)',
                    EVENT_PADDING,
                    'py-3 md:py-3',
                )}
            >
                {t('event_description')}
            </h2>
            <hr className="border-(--separator-default)" />
            <div className={cn('min-w-0', EVENT_PADDING)}>
                <ClampedText
                    text={description}
                    lines={3}
                    moreLabel={t('common_show_more')}
                    lessLabel={t('common_show_less')}
                    testId="event-description-toggle"
                    className="type-dense-default whitespace-pre-line text-(--text-subtitle)"
                />
            </div>
        </section>
    )
}
