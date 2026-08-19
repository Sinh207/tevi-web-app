/**
 * The shape of a static legal document (privacy policy, terms of use, …).
 *
 * The copy lives in data rather than JSX so the renderer, the table of contents and
 * the on-page anchors all derive from one source: the TOC can never drift from the
 * headings, which is exactly what the legacy app got wrong (it scraped `h2[id]` out
 * of the DOM after mount, so the TOC only existed once the client had hydrated).
 *
 * The blocks are deliberately poor — paragraph, optional bold lead, bullet list,
 * sub-heading, figure — and carry no inline markup. That is all the legacy pages used,
 * and it keeps the copy out of `dangerouslySetInnerHTML`.
 */

/** A run of bold text at the start of a paragraph or bullet ("Right to access - "). */
export type LegalLead = string

export type LegalBlock =
    | { kind: 'paragraph'; lead?: LegalLead; text: string }
    /**
     * `ordered` when the numbers are part of the copy rather than decoration — the
     * premium policy enumerates its legal bases as "1…4" and is cited that way, so the
     * list carries the numbering instead of each item's text starting with a digit.
     */
    | { kind: 'list'; ordered?: boolean; items: { lead?: LegalLead; text: string }[] }
    /**
     * A clause heading *inside* a section ("i. TEVI", "A. Governing Law."), used by the
     * terms of use. A block rather than a nested section: it carries its own numbering
     * in the copy, it is not an anchor target, and it must not appear in the contents
     * rail — that lists the 14 top-level clauses people cite, not 19 entries.
     */
    | { kind: 'subheading'; text: string }
    /**
     * A figure — the safety policy's "layered approach" diagram, the one illustration in
     * any of these documents. Intrinsic `width`/`height` are required rather than nice to
     * have: they are what stops the copy below it reflowing when the image lands.
     * `alt` carries the diagram's content, since ours is a picture of text.
     */
    | { kind: 'image'; src: string; alt: string; width: number; height: number }

export type LegalSection = {
    /** Anchor id — also the TOC href. Stable: legacy links point at these. */
    id: string
    title: string
    blocks: LegalBlock[]
}

export type LegalDocument = {
    /**
     * Shown in the "last updated" line. A plain, pre-formatted string rather than a
     * `Date`: it is part of the legal text (the day the policy took effect), not a
     * timestamp to be localized or recomputed per request.
     */
    effectiveDate: string
    intro: LegalBlock[]
    sections: LegalSection[]
}
