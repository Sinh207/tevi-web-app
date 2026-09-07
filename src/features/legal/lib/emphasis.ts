/**
 * Split copy written with `**bold**` markers into runs the renderer can draw.
 *
 * Only the open letter uses it: the policies carry no inline markup at all, and their one
 * bold shape (a `lead` at the start of a paragraph) is a separate field. A letter argues,
 * and an argument emphasises mid-sentence.
 *
 * Markers rather than structured runs in the data because the copy has to stay *readable*
 * as copy — three languages of it, edited by whoever writes the next letter — and because
 * this is how legacy already authored it, so the port is a copy rather than a re-editing.
 * The output is data, never HTML: an unmatched or empty marker is left as literal text, so
 * the worst a malformed letter can do is print an asterisk.
 */
export type TextRun = { text: string; bold: boolean }

/** `**` around at least one non-`*` character, and nothing spanning a marker. */
const BOLD = /(\*\*[^*]+\*\*)/g

export function parseEmphasis(text: string): TextRun[] {
    return text
        .split(BOLD)
        .filter(part => part !== '')
        .map(part =>
            part.startsWith('**') && part.endsWith('**')
                ? { text: part.slice(2, -2), bold: true }
                : { text: part, bold: false },
        )
}
