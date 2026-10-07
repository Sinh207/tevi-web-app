'use client'

import { BarIconButton } from '@shared/components/bar-icon-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import {
    AppBar,
    AppBarButton,
    AppBarButtonFrame,
    AppBarButtonLabel,
    AppBarCluster,
    AppBarTitle,
    AppBarTitleText,
} from '@shared/ui/app-bar'
import { useRouter } from 'next/navigation'
import { CHANNEL_SETTINGS_CONTAINER } from '../../lib/container'

/**
 * The edit-profile bar: back · title · **Save**.
 *
 * ## Why this is not `PageBackBar`
 *
 * It is the same arrangement, and the first version of this screen did use it. Then Save moved
 * into the bar, which means the bar needs the form's state — so it has to be rendered by the
 * client component that owns that state rather than by the server page. That import,
 * `features/channel` → `@features/navigation`, closes a **cycle**: `features/navigation`'s
 * `menu-active.ts` already imports `@features/channel` for the two settings paths its drawer rows
 * point at. ESM resolves the cycle by handing one side `undefined`, and the symptom was two
 * unrelated tests failing — `isViewActive` stopped matching Privacy and security, because
 * `SPACE_VISIBILITY_PATH` was `undefined` at module-init time. Nothing in this screen looked
 * wrong; a menu row two features away stopped highlighting.
 *
 * So the bar is composed here from `shared/` parts, which import no features and cannot cycle.
 * That is also what `channel-top-bar.tsx` does, a few files away, for the same reason — this
 * feature already owns one bar built this way.
 *
 * The one thing that must **not** be re-invented is the back button: `BarIconButton` is the shared
 * control, and its own doc records what happened the last time a bar reproduced it from memory
 * (different component, different box, different glyph weight). Everything else here is `AppBar`
 * and its clusters, verbatim.
 *
 * ## Geometry notes, inherited from `PageBackBar`
 *
 * `md:px-0` before `className`: `AppBar`'s own `px-4` is drawn for a phone where the bar spans the
 * screen. From md the column is centred and capped, so that 16px would measure from the column's
 * edge instead — and the back button would sit inset from content that is not.
 *
 * The title is absolutely centred (the DS default) with a `max-w` reserve, so a long name
 * truncates instead of sliding under either cluster.
 */
export function ProfileTopBar({
    /** The end cluster's action. `null` while the form is not on screen. */
    saveLabel,
    canSave,
    onSave,
}: {
    saveLabel?: string
    canSave?: boolean
    onSave?: () => void
}) {
    const { t } = useTranslation()
    const router = useRouter()

    return (
        <AppBar className={cn('md:px-0', CHANNEL_SETTINGS_CONTAINER, 'max-md:px-0')}>
            <AppBarCluster className="min-w-0">
                <BarIconButton
                    data-testid="channel-profile-back"
                    name="angle-left"
                    weight="filled"
                    mirrored
                    label={t('common_back')}
                    onClick={() => {
                        // `history.length` is the only signal for "the app opened this URL
                        // directly" (a shared link, a push notification), where `back()` would
                        // leave the site. Read in the handler because it is meaningless in SSR.
                        if (window.history.length > 1) router.back()
                        else router.push('/')
                    }}
                />
            </AppBarCluster>

            <AppBarTitle className="max-w-[calc(100%-180px)]">
                <AppBarTitleText as="h1" className="max-w-full truncate">
                    {t('profile_title')}
                </AppBarTitleText>
            </AppBarTitle>

            {/*
             * Save as **text**: no fill, no ring, just the word in the accent colour.
             *
             * ## Where a fill-less bar action comes from in the DS
             *
             * Figma's bar buttons are pills — every type paints `--background-topbar-action` and a
             * `--button-topbar-border` hairline. The **one** exception in the file is
             * `Theme=Overlay` + `Type=Text Primary`, which explicitly clears both
             * (`--background-topbar-action: unset; --button-topbar-border: unset`) and leaves an
             * accent label on its own. That is the DS's own recipe for a text action; it is scoped
             * to the on-media theme only because that is the only screen Figma drew one on.
             *
             * So this is that treatment on the light bar: `text-secondary`'s box and padding —
             * `px-2 py-1`, 44 tall, which keeps the hit target at Apple's minimum even though the
             * ink is a word — with the fill and ring cleared and the label on `--button-accent-bg`.
             * Clearing `--topbar-bg` is how the DS removes that paint (`--background-topbar-action: unset`),
             * and it is what `BUTTON_OVERLAY_RESET` does in our port — reached here through
             * `className` rather than `theme="overlay"`, whose *other* half (white glyphs pinned to
             * Dark) would be wrong on this bar. Note the variable, not a `bg-*` class: `bg-none`
             * sets `background-image`, and the fill is a `background-color` — that mistake was
             * sitting in the port and this is where it surfaced.
             *
             * ## The two states this adds, both marked
             *
             * Figma draws **no** hover and **no** disabled state for any bar action. A filled pill
             * survives that; bare text does not — with no surface to react, a hover-less label
             * reads as a caption rather than a control, and a disabled one reads as broken. So:
             * `--button-accent-bg-hover` on hover and `--text-disabled` when there is nothing to
             * save, both the DS's own tokens for their state, applied where Figma left a gap.
             * `BarIconButton` makes the same call in the same words ("the hover and press states
             * are additions — Figma has no interaction layer").
             */}
            {/*
             * ## Below md only
             *
             * From md the same action is a footer under the form (`edit-profile-view.tsx`), and
             * only one of the two is ever on screen. The split is not symmetry for its own sake:
             * on a phone the bar is where the platform puts a screen's primary action and a bottom
             * bar would fight the tab bar and the home indicator, while on a desktop window the
             * eye finishes at the *bottom* of a form and Save sitting 500px away in the top corner
             * is a journey back for every save.
             *
             * `md:hidden` rather than a `useMobile()` branch: `display: none` takes the element out
             * of the accessibility tree too, so exactly one Save is announced at any width — and it
             * is decided by CSS, so there is no hydration flash and no breakpoint state to keep.
             */}
            {saveLabel ? (
                <AppBarCluster className="min-w-0 md:hidden">
                    <AppBarButton
                        data-testid="channel-profile-save-bar"
                        type="text-secondary"
                        disabled={!canSave}
                        onClick={onSave}
                        className={cn(
                            '[--topbar-bg:transparent] shadow-none [--topbar-label:var(--button-accent-bg)]',
                            'hover:[--topbar-label:var(--button-accent-bg-hover)]',
                            'disabled:[--topbar-label:var(--text-disabled)]',
                        )}
                    >
                        <AppBarButtonFrame>
                            <AppBarButtonLabel className="type-dense-strong">
                                {saveLabel}
                            </AppBarButtonLabel>
                        </AppBarButtonFrame>
                    </AppBarButton>
                </AppBarCluster>
            ) : null}
        </AppBar>
    )
}
