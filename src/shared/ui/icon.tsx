import type { ComponentPropsWithoutRef } from 'react'
import type {
    TeviIconName,
    TeviIconNameDuotone,
    TeviIconNameDuotoneLine,
    TeviIconNameFilled,
    TeviIconNameLight,
} from './icon-names'
import { SPRITE_URL } from './sprite'

/**
 * Icon — the Tevi design system sprite (4627 glyphs, Zappicon).
 *
 * Glyphs paint with `currentColor`, so set the colour on the element:
 *   <Icon name="angle-left" size={20} className="text-icon-secondary" />
 *
 * Tevi uses 16 / 18 / 20 / 24px depending on the host component (plus 22 for the Tab
 * Bar FAB and 32 for the Left Bar's brand-mark slot). Figma did not draw every glyph in every weight —
 * `name` is typed per weight, so asking for one that does not exist is a type
 * error rather than an empty `<svg>`. If the glyph you want is missing, say so:
 * never substitute a different shape and never hand-draw a path.
 *
 * Duotone glyphs expose two custom properties, since a `<use>` clone sits in a
 * shadow tree no selector can reach: `--tevi-icon-tint` (tint-path opacity,
 * default 0.4) and `--tevi-icon-detail` (detail fill, default currentColor).
 * See `scripts/build-icon-sprite.mjs`; the Tab Bar sets both.
 *
 * `SPRITE_URL` points at the content-hashed subset built by
 * `scripts/build-icon-sprite.mjs`, not the 60 MB design-system sprite. The
 * script finds glyphs by scanning source, so a `name` assembled at runtime from
 * string fragments will not be bundled — add it to that script's KEEP list.
 */
/**
 * 16 / 18 / 20 / 24 are the component sizes. Two exceptions: 22 is the Tab Bar FAB
 * glyph, and 32 is the Left Bar's brand-mark slot, which is sized for an app icon
 * rather than a glyph.
 */
export type IconSize = 16 | 18 | 20 | 22 | 24 | 32

type IconBaseProps = Omit<ComponentPropsWithoutRef<'svg'>, 'name' | 'children'> & {
    size?: IconSize
    /** Give the glyph an accessible name; omit it and the icon is decorative. */
    title?: string
}

/**
 * A bare name gives the default weight; the rest are opt-in per glyph.
 *
 * Exported so a wrapper can forward the pair **without collapsing the union** — which is what keeps
 * "this glyph has no light weight" a type error rather than an empty box. Splitting it into separate
 * `name` and `weight` props, as `Pick<IconProps, …>` would, throws exactly that away.
 */
export type IconGlyphProps =
    | { weight?: undefined; name: TeviIconName }
    | { weight: 'filled'; name: TeviIconNameFilled }
    | { weight: 'light'; name: TeviIconNameLight }
    | { weight: 'duotone'; name: TeviIconNameDuotone }
    | { weight: 'duotone-line'; name: TeviIconNameDuotoneLine }

export type IconProps = IconBaseProps & IconGlyphProps

export function Icon({ name, size = 20, weight, title, ...props }: IconProps) {
    return (
        <svg
            width={size}
            height={size}
            role={title ? 'img' : undefined}
            aria-label={title}
            aria-hidden={title ? undefined : true}
            focusable="false"
            {...props}
        >
            <use href={`${SPRITE_URL}#${weight ? `${name}--${weight}` : name}`} />
        </svg>
    )
}
