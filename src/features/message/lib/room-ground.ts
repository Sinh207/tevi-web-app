import type { CSSProperties } from 'react'
import { MESSAGE_ART } from './illustrations'

/**
 * Legacy's chat ground (`common/chat/index.js`): the doodle pattern over a lavender sweep, under
 * everything but the header — the header paints its own surface, the composer is transparent over
 * it, as legacy's footer is.
 *
 * Legacy draws the full 2548px image at `cover`. That image is one 849px tile three times, so here
 * the tile is fitted to the room's height and repeated sideways — the same picture at a tenth of
 * the bytes. Centred, as legacy's is, so the pattern does not start flush against the list.
 */
export const ROOM_GROUND: CSSProperties = {
    backgroundImage: `url(${MESSAGE_ART.threadPattern.src}), var(--gradient-message-thread)`,
    backgroundSize: 'auto 100%, cover',
    backgroundRepeat: 'repeat-x, no-repeat',
    backgroundPosition: 'center, center',
}
