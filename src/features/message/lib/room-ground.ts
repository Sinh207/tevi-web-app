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

/**
 * The room's scrollbar, over that ground — legacy's (`messageList`): thin, no track, a translucent
 * thumb (`--scrollbar-message-thread`) that darkens a step while the pointer is over the thread.
 *
 * Two mechanisms because two engines: `scrollbar-width` / `scrollbar-color` for Chrome and Firefox
 * (Chrome then ignores the `::-webkit-` rules), the pseudo-elements for Safari, which has not
 * shipped the standard pair. The standard one cannot style a hovered *thumb*, so the step is on the
 * scroller's hover instead — the pointer is over the thread whenever it is over its scrollbar.
 */
export const THREAD_SCROLLBAR = [
    '[scrollbar-width:thin] [scrollbar-color:var(--scrollbar-message-thread)_transparent]',
    'hover:[scrollbar-color:var(--scrollbar-message-thread-hover)_transparent]',
    '[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent',
    '[&::-webkit-scrollbar-thumb]:rounded-(--radius-fill) [&::-webkit-scrollbar-thumb]:bg-(--scrollbar-message-thread)',
    '[&::-webkit-scrollbar-thumb:hover]:bg-(--scrollbar-message-thread-hover)',
].join(' ')
