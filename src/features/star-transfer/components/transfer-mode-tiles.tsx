'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'
import type { TeviIconName } from '@shared/ui/icon-names'

/**
 * **Features** — the two ways to send, as legacy's 2-up tiles.
 *
 * ## Tiles, not action rows
 *
 * They were briefly the DS `ActionRows` this app uses under a balance card, on the argument that
 * `/my-star`'s composition is the house style. Wrong reference: there is no comp for this screen, and
 * `web-app` is what it has to look like — a *"Features"* heading over two side-by-side tiles, icon above
 * label, centred. A reader of the mobile app finds the same two tiles in the same place.
 *
 * Legacy's numbers: padding **12**, radius **16**, a 1px border, a filled surface a shade off the panel,
 * the label at 14/500 centred. The two tiles share the row equally and grow with their content.
 *
 * ## The icons: a **filled disc** with a sprite glyph knocked out
 *
 * Legacy draws both as one 28px shape — a solid disc (a grey-to-black gradient) with the glyph cut out
 * of it: an outgoing arrow for one, a pair of opposed arrows for the other.
 *
 * The sprite has `arrow-up-right-circle`, whose *filled* weight is exactly legacy's first icon — but
 * there is **no `arrow-right-left-circle`**, so using it for one tile and a bare `arrow-right-left` for
 * the other is what made the pair look mismatched. So the disc is drawn by this component and both tiles
 * carry a bare glyph inside it. That is compositing, not substituting: the glyphs are the sprite's,
 * unchanged, and nothing here draws a path (`CLAUDE.md`'s rule).
 *
 * The disc is `--text-title` with the glyph in `--background`, so it inverts with the theme rather than
 * being a hard-coded black that disappears in Dark. Legacy fills its disc with a grey-to-black gradient;
 * one flat token is the version that survives a theme switch.
 */
export function TransferModeTiles({
    onSingle,
    onMulti,
}: {
    onSingle: () => void
    onMulti: () => void
}) {
    const { t } = useTranslation()

    return (
        <section aria-label={t('star_transfer_features')} className="flex flex-col gap-2.5">
            {/* 16/700, legacy's section heading — the same weight the Transaction history header
                below it uses, because in legacy they are the same heading. */}
            <h2 className="type-body-strong text-(--text-title)">{t('star_transfer_features')}</h2>
            <div className="flex gap-2">
                <ModeTile
                    testId="star-transfer-mode-single"
                    icon="arrow-up-right"
                    label={t('star_transfer_single')}
                    onClick={onSingle}
                />
                <ModeTile
                    testId="star-transfer-mode-multi"
                    icon="arrow-right-left"
                    label={t('star_transfer_multi')}
                    onClick={onMulti}
                />
            </div>
        </section>
    )
}

function ModeTile({
    icon,
    label,
    onClick,
    testId,
}: {
    icon: TeviIconName
    label: string
    onClick: () => void
    /** Two distinct tiles, so two distinct ids — nothing to disambiguate with a companion. */
    testId?: string
}) {
    return (
        <button
            type="button"
            data-testid={testId}
            onClick={onClick}
            className={
                'flex flex-1 flex-col items-center justify-center gap-2 rounded-xl p-3 ' +
                'border border-(--separator-default) bg-(--background-segment) ' +
                'transition-colors hover:border-(--input-border-hover) ' +
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)'
            }
        >
            {/* 28px disc, 16px glyph — legacy's proportions inside its own 28px icon. */}
            <span className="flex size-7 items-center justify-center rounded-full bg-(--text-title) text-(--background)">
                <Icon name={icon} size={16} />
            </span>
            <span className="type-dense-default text-center text-(--text-subtitle)">{label}</span>
        </button>
    )
}
