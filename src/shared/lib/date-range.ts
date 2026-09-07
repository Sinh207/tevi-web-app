/**
 * The two rules behind the range picker, as functions — because each of them has already been wrong
 * once, in a way the screen did not make obvious.
 *
 * They live here rather than inside `shared/components/date-range-dialog.tsx` so they can be stated
 * in a test instead of clicked through in a browser. The component keeps the state; this decides what
 * the state becomes.
 */

/** A selection as it is being made: `to` is missing while the reader is still choosing. */
export interface PickedRange {
    from?: Date
    to?: Date
}

/**
 * A selection with a start — what a press always leaves behind.
 *
 * `from` is required so this is assignable to `react-day-picker`'s own `DateRange`, whose `from` is
 * non-optional. Returning the looser `PickedRange` typed fine here and failed at the `selected` prop,
 * which is the sort of mismatch a shared helper should absorb rather than push at its caller.
 */
export interface StartedRange {
    from: Date
    to?: Date
}

/**
 * What the range becomes when a day is pressed.
 *
 * **The first press sets the start, the second closes the range**, and a press on an
 * already-complete range starts a new one rather than nudging an edge. Pressing *before* the start
 * closes the range backwards, so a reader who works right-to-left still gets an ordered range.
 *
 * ## Why this is ours and not `react-day-picker`'s
 *
 * RDP's range mode computes its own answer and hands it to `onSelect`. Two of its behaviours are
 * wrong for this control, and both were live bugs:
 *
 * 1. Handed a **complete** selection it treats the next press as *extend or shrink* — so a picker
 *    opened on 21 Jan – 19 Feb answered a press on 5 Feb by moving the **end**, which is not what
 *    anybody means by pressing a day in a date picker.
 * 2. The dialog feeds it a hover **preview** as `selected`, which looks complete while only one end
 *    is really set — so its second press came back as `{ from: pressed, to: pressed }`, silently
 *    dropping the start the reader had just chosen.
 *
 * Deciding it here makes the interaction independent of what RDP infers from the paint.
 */
export function nextRangeAfterPress(current: PickedRange | undefined, pressed: Date): StartedRange {
    const start = current?.from
    // Nothing chosen, or a finished range: this press is a new start.
    if (!start || current?.to) return { from: pressed, to: undefined }
    return pressed < start ? { from: pressed, to: start } : { from: start, to: pressed }
}

/**
 * How many days a range covers, **inclusive** — 21 Jan to 19 Feb is 30, not 29. `null` until both
 * ends exist.
 *
 * ## Both ends are reduced to their own local midnight first
 *
 * Not tidiness: the value a screen hands the picker is a *range in force*, whose end is typically the
 * last millisecond of its day (`endOfDay`, which is what the dashboard sends). Differencing the raw
 * timestamps counts that as an extra day, and the dialog said **31 days** for the 30 the screen behind
 * it was showing.
 *
 * `Math.round` on the difference covers the other direction: a range that crosses a DST change has a
 * 23- or 25-hour day in it, and flooring would drop a day from it twice a year.
 */
export function rangeDayCount(range: PickedRange | undefined): number | null {
    const { from, to } = range ?? {}
    if (!from || !to) return null
    const midnight = (date: Date) =>
        new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    return Math.round((midnight(to) - midnight(from)) / 86_400_000) + 1
}
