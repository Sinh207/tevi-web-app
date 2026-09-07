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
     *
     * **Optional, because a document may genuinely not carry one.** The two mini app
     * documents print no date on any site that serves them, so they omit it and the page
     * drops the line rather than inventing a month — a made-up effective date is a false
     * statement about when terms took effect. Every document that has one states it.
     */
    effectiveDate?: string
    intro: LegalBlock[]
    sections: LegalSection[]
}

/**
 * The open letter (`/letter`) — a signed message from the team, not a policy, and
 * deliberately **not** a `LegalDocument`.
 *
 * Three differences make it its own shape rather than a variant:
 *
 *  - It is **written per language**, not keyed. Legacy ships three letters (en, vi, id)
 *    and falls back to English for the other six locales; a letter is a voice, and the
 *    six locales it was never written in should get the original rather than a machine
 *    paraphrase of it. Every other document here is English-only for the mirror-image
 *    reason: legal copy is not ours to translate at all.
 *  - Its sections carry **no ids**. Nobody cites clause 3 of a letter, so there is no
 *    anchor, no permalink and no table of contents — which is most of what `LegalPageView`
 *    is.
 *  - Its copy carries **inline emphasis** mid-sentence ("**Tevi is not neutral between a
 *    creator and the person exploiting them.**"), which `LegalBlock` has no room for on
 *    purpose: `lead` is a bold run at the *start* of a paragraph. The markers stay in the
 *    text as legacy wrote them and `parseEmphasis` (`lib/emphasis.ts`) turns them into
 *    runs at render — no inline markup, nothing near `dangerouslySetInnerHTML`.
 */
export type LetterBlock =
    | { kind: 'paragraph'; text: string }
    /** A heading inside the letter ("What the system does"). Not an anchor target. */
    | { kind: 'heading'; text: string }
    | { kind: 'list'; items: string[] }

export type Letter = {
    /**
     * The short name the page's back bar shows ("Open letter"). Held here rather than in
     * `translation.json` so a letter is one object in one place — and because it exists in
     * exactly the three languages the letter itself does.
     */
    barTitle: string
    title: string
    /** The date it was published, pre-formatted per language — part of the letter. */
    dateline: string
    /**
     * The same date, ISO, for the machines: `<time dateTime>` and the article's
     * `publishedTime`. A dateline is prose ("Ngày 2 tháng 8 năm 2026") and no parser should
     * be asked to read it in three languages, so the letter states the date twice on
     * purpose — once for the reader, once for the crawler.
     */
    publishedAt: string
    /** `<meta name="description">`; written per language for the same reason. */
    metaDescription: string
    blocks: LetterBlock[]
    /** "— The Tevi Team". Set apart from the body, so it is a field rather than a block. */
    signOff: string
}
