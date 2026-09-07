'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { ChannelEmptyState } from './channel-empty-state'

/**
 * "This space could not be loaded" — with a retry.
 *
 * ## It was a DS `Alert`, and the shape was wrong for where it is used
 *
 * `Alert` is the DS's answer for error-plus-action and it is genuinely the right component for an
 * *alert*: a strip that appears **beside** content to say something about it. All three call sites
 * here are the opposite — `channel-view` when the page has no channel, and the Live and thread
 * panels when a tab has nothing to show. In every one of them the region is otherwise **empty**, so
 * a left-aligned strip with a small button reads as a notification bolted into a blank area.
 *
 * A failed region and an empty one are the same moment: there is nothing to render and the reader
 * needs a sentence and a way forward. So this is now `ChannelEmptyState` — centred, 32px mark, title,
 * body, action — which means a panel that cannot show content always looks like one kind of thing.
 * On the Live tab that matters twice over: "no events yet" and "could not load" sit in the same slot
 * and used to be two different designs.
 *
 * `tone="error"` is the only thing that separates them: the mark goes from muted to the error accent.
 * The layout does not move, which is the point — recognising *which* of the two you are looking at
 * should not require reading.
 *
 * ## Two kinds, and the distinction is for the reader, not the logs
 *
 * `unavailable` (a 5xx, a network failure, the server client's 10s timeout) is "try again" — the
 * request never got an answer. `restricted` (any other 4xx) is "this is not for you" — the request
 * was understood and refused, so a retry button would be an invitation to press it forever. Same
 * component, different glyph and copy, and no retry on the second.
 *
 * The glyphs carry that split before the copy does: an exclamation for something that went wrong, a
 * lock for something that is closed to you.
 */
export function ChannelError({
    kind,
    onRetry,
}: {
    kind: 'unavailable' | 'restricted'
    onRetry?: () => void
}) {
    const { t } = useTranslation()
    const unavailable = kind === 'unavailable'
    const canRetry = unavailable && Boolean(onRetry)

    return (
        <ChannelEmptyState
            /*
             * Only the failure is toned red. `restricted` is not a malfunction — the request was
             * understood and answered correctly — so a red lock would tell the reader something
             * broke when nothing did. Muted is the honest register for "this is closed to you", and
             * it also matches `channel-state-screens.tsx`, which says the same thing at full page.
             */
            tone={unavailable ? 'error' : 'default'}
            icon={unavailable ? 'exclamation-circle' : 'lock-simple'}
            /*
             * Separate titles, which the Alert layout hid. "This space could not be loaded" over
             * "You do not have access to this space" is two different explanations stacked — the
             * first is a failure, the second a refusal, and only one of them is true. Centring the
             * block put the title first and made the contradiction obvious.
             */
            title={unavailable ? t('channel_error_title') : t('channel_error_restricted_title')}
            body={unavailable ? t('channel_error_body') : t('channel_error_restricted_body')}
            action={
                canRetry ? (
                    /*
                     * `medium`, where the Alert's was `small`. It is the only control on the screen
                     * now rather than one tucked into a strip, and at 36 tall it clears WCAG 2.5.8
                     * with room the 28px `small` does not have.
                     */
                    <Button
                        data-testid="channel-retry"
                        variant="secondary"
                        size="medium"
                        onClick={onRetry}
                    >
                        <Icon name="arrow-rotate-right" size={18} />
                        {t('common_retry')}
                    </Button>
                ) : null
            }
        />
    )
}
