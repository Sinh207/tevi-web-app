import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'

/**
 * What is behind a paywall or inside a post, on the dark pill in a tile's corner: a stack of images,
 * a video, or written content.
 *
 * Legacy's three marks, as the DS glyphs that draw the same objects — `images` (two stacked frames),
 * `clapperboard-play` (a frame with a slatted top band and a play mark) and `book-open-text` (an open
 * book with lines). Until 2026-10-08 these were legacy's paths, because the sprite then offered only
 * `film-play` (a film strip) and `document` (a page): different objects, not different styles.
 *
 * Each branch is a **literal** `<Icon>`: the sprite subset is found by scanning source, and a name
 * picked from a table at runtime would ship without its `regular` weight.
 *
 * 12 is the collection and tile pills' size, which `IconSize` does not offer — the `size-3` class
 * overrides the attribute, the same escape every 14px glyph in this repo uses.
 */
export function LockMediaIcon({
    kind,
    size = 16,
}: {
    kind: 'images' | 'video' | 'text'
    size?: 12 | 16 | 32
}) {
    const box = size === 12 ? 16 : size
    const className = cn('flex-none', size === 12 && 'size-3')
    if (kind === 'images') return <Icon name="images" size={box} className={className} />
    if (kind === 'video') {
        return <Icon name="clapperboard-play" weight="regular" size={box} className={className} />
    }
    return <Icon name="book-open-text" size={box} className={className} />
}
