'use client'

import { ClampedText } from '@shared/components/clamped-text'
import { useTranslation } from '@shared/i18n/use-translation'
import { DESCRIPTION_MAX, truncateDescription } from '../lib/channel-format'

/**
 * The creator's bio: three lines, then "more".
 *
 * ## Why it is clamped
 *
 * A bio has no length limit worth relying on, and this block sits directly above the tab strip. An
 * un-clamped one pushes Posts off the first screen, which is the content people came for — so the
 * header grows to whatever the creator typed and the page reads as if it has no content.
 *
 * Legacy clamps it behind a `ReadMoreText`. An earlier version of this component deliberately did
 * *not*, on the grounds that a `line-clamp` with no way to expand hides content — which is right, and
 * is why this has the toggle rather than the clamp alone.
 *
 * ## The clamp itself is `shared/components/clamped-text.tsx`
 *
 * This file is the bio's copy and type; the measured overflow, the toggle and the reason the depth is
 * a literal are all there. It moved when the membership join dialog needed the same treatment for a
 * creator's tier pitch — a second `scrollHeight > clientHeight` observer with the same off-by-one
 * would have been the drift this codebase keeps warning about.
 */
export function ChannelDescription({ text }: { text: string }) {
    const { t } = useTranslation()

    return (
        <ClampedText
            testId="channel-description-expand"
            /*
             * At most `DESCRIPTION_MAX` characters on the profile, whatever the creator saved — see
             * `truncateDescription` for the cut (code points, and a word boundary when one is near).
             *
             * The clamp stays on top of it and is not redundant: the cap is how much bio the profile
             * shows, the clamp is how much of that shows before you ask — three lines on this column,
             * and fewer of the same characters on a phone, where the text runs longer.
             */
            text={truncateDescription(text, DESCRIPTION_MAX)}
            moreLabel={t('common_show_more')}
            lessLabel={t('common_show_less')}
            className="type-body-default text-(--text-title)"
        />
    )
}
