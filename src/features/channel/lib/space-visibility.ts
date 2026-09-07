import type { TranslationKey } from '@shared/i18n/settings'
import type { IconProps } from '@shared/ui/icon'
import type { ChannelPrivacy } from '../api/types'

/**
 * The three space-visibility choices, as data — `/settings/space-visibility`.
 *
 * Legacy builds this array inline inside the rendering component
 * (`containers/spaceVisibilitySettings/components/content`), which is why the same three
 * values are also spelled out again in its hook, again in the confirm-dialog switch, and a
 * fourth time in the drawer row that reports the current one. Here the list is the single
 * declaration and everything else derives from it, so the order, the copy and the
 * "does this need confirming" rule cannot disagree.
 *
 * It is a `lib/` module rather than a hook because none of it is stateful: it is the option
 * table plus two pure predicates, which is exactly the part worth having a test for.
 */
export interface SpaceVisibilityOption {
    value: ChannelPrivacy
    /** The 32px tile glyph. See `icon` in `LeftBarRow` for the same shape. */
    icon: IconProps
    /**
     * The tile paint.
     *
     * Green → amber → grey, which is the same escalation the copy describes: open, then
     * restricted, then off. Deliberately **not** Indigo for any of them — Indigo is this
     * screen's *selection* colour (the radio's fill), and a tile painted with it would read
     * as "this one is chosen" on whichever row happened to carry it.
     *
     * The tokens are written out rather than imported from `features/navigation`'s `TILE`
     * map: a feature may not reach into another feature's internals (`CLAUDE.md`), and the
     * drawer's tile palette is the drawer's. Same three tokens, no import.
     */
    tile: string
    titleKey: string
    bodyKey: string
    /** The consequence list under the body. Empty for `public`, which has none in Figma. */
    bulletKeys: readonly string[]
}

/**
 * Every value of the privacy enum has exactly one option here, in enum order — asserted by
 * `space-visibility.test.ts` against `CHANNEL_PRIVACY` rather than at runtime.
 *
 * It matters because the screen renders this table and nothing else, so a value the backend can
 * return that is missing from it would be un-selectable *and* invisible: the person's own space
 * would sit in a mode the settings screen does not admit exists.
 */
export const SPACE_VISIBILITY_OPTIONS: readonly SpaceVisibilityOption[] = [
    {
        value: 'public',
        icon: { name: 'globe', weight: 'filled' },
        tile: 'var(--accents-success-active)',
        titleKey: 'space_visibility_public_title',
        bodyKey: 'space_visibility_public_body',
        bulletKeys: [],
    },
    {
        value: 'protected',
        // "Protect your space" — a shield, not a padlock. The padlock is the *unpublished*
        // state below, where the space is shut rather than guarded.
        icon: { name: 'shield', weight: 'filled' },
        tile: 'var(--accents-warning-active)',
        titleKey: 'space_visibility_protected_title',
        bodyKey: 'space_visibility_protected_body',
        bulletKeys: ['space_visibility_protected_posts', 'space_visibility_protected_lives'],
    },
    {
        value: 'unpublished',
        // The sprite has no `eye-slash`, which would be the obvious glyph. `lock-simple` is
        // the nearest honest one and is already the drawer's Password tile; a hand-drawn
        // struck-through eye is not an option (`shared/ui/icon.tsx`). Worth a design pass.
        icon: { name: 'lock-simple', weight: 'filled' },
        tile: 'var(--zinc-500)',
        titleKey: 'space_visibility_unpublished_title',
        bodyKey: 'space_visibility_unpublished_body',
        bulletKeys: [
            'space_visibility_unpublished_search',
            'space_visibility_unpublished_info',
            'space_visibility_unpublished_content',
            'space_visibility_unpublished_follow',
            'space_visibility_unpublished_message',
            'space_visibility_unpublished_member',
            'space_visibility_unpublished_renew',
        ],
    },
] as const

/**
 * The sentence a confirm dialog shows before switching *to* `next`, or `null` when the
 * change needs no confirming.
 *
 * `public` is the one direction that applies immediately, and that is not an oversight in
 * legacy: every other transition **takes something away** — it hides posts and Live events,
 * or stops memberships auto-renewing — and it cannot be undone for 24 hours because the
 * backend rate-limits the transition. Opening a space back up removes nothing and is the
 * escape hatch from the other two, so putting a dialog in front of it would only make the
 * recoverable direction the slow one.
 *
 * Returning the **key** rather than a boolean is what keeps the two facts together: an
 * option that needs confirming is exactly an option that has a consequence worth spelling
 * out, so a future fourth value cannot be added to the confirm set without also being given
 * a sentence.
 */
export function spaceVisibilityConfirmKey(next: ChannelPrivacy): TranslationKey | null {
    switch (next) {
        case 'protected':
            return 'space_visibility_confirm_protected'
        case 'unpublished':
            return 'space_visibility_confirm_unpublished'
        case 'public':
            return null
    }
}

/**
 * Whether picking `next` is a change at all.
 *
 * `current` is `undefined` while the channel is still loading and `null` for an account that
 * has none, and **both must answer `false`**: a write in either state would either race the
 * value we have not read yet or act on a channel that does not exist. The screen also
 * disables the controls in those states, so this is the second of two gates rather than the
 * only one — the one that holds even if a keyboard or a stale click gets past the first.
 */
export function isSpaceVisibilityChange(
    current: ChannelPrivacy | null | undefined,
    next: ChannelPrivacy,
): boolean {
    if (!current) return false
    return current !== next
}
