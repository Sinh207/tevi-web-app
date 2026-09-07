/**
 * May a drag start from this pointerdown?
 *
 * Its own file with its own test because **it is the fix for a bug that had no visible cause**: the
 * ⋯ menu opened, its rows highlighted on hover, and clicking one did nothing at all.
 *
 * ## What actually happened
 *
 * The tab strip is the window's drag surface, so it carries `onPointerDown`. The tab's ⋯ menu is
 * rendered *by* a component inside that strip, but base-ui **portals** the popup to `document.body`.
 * React's event system delegates from the root and propagates along the **React tree**, not the DOM
 * tree — so a pointerdown on a menu row, which is nowhere near the strip in the document, still
 * runs the strip's `onPointerDown`.
 *
 * The strip then called `setPointerCapture` on itself. Every subsequent pointer event for that
 * gesture was redirected to the strip, so the `pointerup` and the `click` never reached the row:
 * base-ui never registered a selection (the menu did not even close) and the row's `onClick` never
 * fired. Verified from an event trace — `pointerdown@menuitem`, then
 * `gotpointercapture@<the strip>`.
 *
 * ## The rule
 *
 * A drag may only start from a pointerdown that **actually happened on the drag surface**, in the
 * document. `contains` is that question, and it is the general answer rather than a list: any
 * portalled UI a tab ever renders — a dialog, a tooltip, a select — would otherwise reintroduce
 * this, and each one would look like a different bug.
 *
 * The second half is the ordinary one: interactive children are not drag handles. Without it,
 * pressing a tab and moving two pixels drags the window instead of switching tabs. `[data-no-drag]`
 * lets a non-button region opt out too — the window controls' wrapper uses it.
 */
export function canStartDragFrom(target: EventTarget | null, surface: Element | null): boolean {
    if (!surface) return false
    if (!(target instanceof Element)) return false
    // Portalled: the React tree says this is a child, the document says otherwise. The document wins.
    if (!surface.contains(target)) return false
    return target.closest('button, a, input, [data-no-drag]') === null
}
