import { formatStarAmount } from '@shared/lib/money'
/*
 * A **type-only** import, which is erased at build time — so naming jsPDF here costs nothing at runtime
 * and the package still arrives only through the dynamic `import()` below.
 */
import type { jsPDF } from 'jspdf'
import type { Transfer, TransferParty } from '../api/types'

/**
 * The transfer receipt as a **PDF** — legacy's *Save as PDF*, ported.
 *
 * ```
 * const rows = receiptRows({ sender, transfers })   // pure, tested
 * await saveTransferPdf({ sender, transfers })      // loads jsPDF, draws, downloads
 * ```
 *
 * ## Why the document is in English
 *
 * jsPDF's built-in fonts are **Helvetica/Times/Courier with WinAnsi encoding** — Latin-1 and nothing
 * else. Push Vietnamese, Korean or Arabic through them and the glyphs do not degrade, they *vanish*: a
 * Korean reader would get a receipt of empty boxes and blank labels. Rendering the labels in one
 * language it can definitely draw is the honest version of that constraint, and it is what legacy does.
 *
 * The fix is a font, not a translation: embed an Inter subset with `addFileToVFS` + `addFont` and the
 * labels can come from `t()` like everything else. That needs a TTF this repo does not have (the app
 * loads Inter as `woff2`, which jsPDF cannot read) and roughly 300 KB of asset, so it is a deliberate
 * follow-up rather than a thing to fake now. **Do not** wire `t()` into this file before that lands.
 *
 * Names are the same problem with worse consequences, because they are *data*: see `pdfText`.
 *
 * ## One document, a page per receiver
 *
 * Legacy loops over the batch and calls save() once per receiver, so a transfer to forty people asks the
 * browser for forty downloads — which every browser blocks after the first. One document with
 * `addPage()` is the same information in the shape a person can actually keep.
 */

/** A4 in points, which is jsPDF's default unit and page size. */
const PAGE = { width: 595.28, height: 841.89 }
const MARGIN = 48
/** Line box for a label/value pair, and the gap between blocks. */
const LINE = 16
const BLOCK = 26

/**
 * Letters and punctuation `NFD` cannot help with.
 *
 * `NFD` splits a base letter from its accents, which is why `ễ` becomes `e`. It does **nothing** for a
 * letter that is not an accented form of another one — and Vietnamese has exactly that in `Đ`/`đ`, a
 * distinct letter outside Latin-1. Without this table `Được` prints as `uoc`, which a test caught and a
 * reader would have read as a corrupted name.
 *
 * The punctuation half is the same class of problem in messages: a curly apostrophe or an em dash is not
 * Latin-1 either, so a note typed on a phone would lose them silently.
 */
const SUBSTITUTIONS: [RegExp, string][] = [
    [/[Đ]/g, 'D'],
    [/[đ]/g, 'd'],
    [/[Ł]/g, 'L'],
    [/[ł]/g, 'l'],
    [/[Œ]/g, 'OE'],
    [/[œ]/g, 'oe'],
    [/[ẞ]/g, 'SS'],
    [/[‘’‚‛]/g, "'"],
    [/[“”„‟]/g, '"'],
    [/[‒–—―]/g, '-'],
    [/[…]/g, '...'],
    [/[•·]/g, '-'],
    [/[\u2000-\u200a\u202f\u205f]/g, ' '],
]

/**
 * Text jsPDF's standard font can actually draw.
 *
 * Three steps, in order:
 *
 * 0. **Substitute what `NFD` cannot reach** — `SUBSTITUTIONS` above, for `Đ`/`đ` and for the typographic
 *    punctuation a phone keyboard produces.
 * 1. **Decompose and drop the combining marks** — `NFD` splits `ễ` into `e` + two accents, and removing
 *    the marks leaves `e`. That turns Vietnamese into readable ASCII rather than into holes, which is the
 *    case that matters most for this product.
 * 2. **Drop anything still outside Latin-1**, since the font has no glyph for it and jsPDF would emit a
 *    blank or a `?` box. Korean, Chinese, Arabic and Thai names come out empty here — deliberately, so
 *    that step 3 can do something about it.
 * 3. **Fall back**, at the call site: every place a name is printed also has the account's **Tevi ID**,
 *    which is digits and always renders. A card that says `ID 1002884` with an empty name is worse than
 *    one with the name; a card of question marks is worse than both.
 *
 * A receipt is a document somebody may hand to support, so it must not contain characters that look like
 * corruption. When the font lands, this collapses to `String(value)`.
 */
export function pdfText(value: string | null | undefined): string {
    if (!value) return ''
    let text = value
    for (const [pattern, replacement] of SUBSTITUTIONS) text = text.replace(pattern, replacement)
    return (
        text
            .normalize('NFD')
            // The combining-diacritic block `NFD` just produced.
            .replace(/[\u0300-\u036f]/g, '')
            // Printable ASCII plus the Latin-1 supplement — exactly what WinAnsi can draw.
            .replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, '')
            .trim()
    )
}

/** One line of the receipt's summary table. */
export interface ReceiptRow {
    label: string
    value: string
}

export interface ReceiptInput {
    /** The account that sent it. `null` only in the impossible case — the page still prints. */
    sender: TransferParty | null
    /** What the write answered with. One page each. */
    transfers: Transfer[]
    /** Digit grouping. The *labels* stay English (see above); a number is still the reader's. */
    locale?: string
}

/**
 * The summary block for one transfer, as label/value pairs.
 *
 * Split out from the drawing so the document's **contents** can be tested without a PDF engine: what a
 * receipt says is a product decision, where the ink lands is not. The fields and their order are
 * legacy's — transfer ID, time, message, Star, fee — minus the ones it leaves blank.
 */
export function receiptRows(transfer: Transfer, locale = 'en'): ReceiptRow[] {
    const rows: ReceiptRow[] = [
        { label: 'Transfer ID', value: pdfText(transfer.id) || '-' },
        { label: 'Transfer time', value: pdfDate(transfer.createdAt) },
    ]
    if (transfer.description) {
        rows.push({ label: 'Message', value: pdfText(transfer.description) })
    }
    rows.push(
        { label: 'Star transferred', value: formatStarAmount(transfer.stars, locale) },
        { label: 'Transfer fee', value: formatStarAmount(transfer.fee, locale) },
    )
    return rows
}

/**
 * The timestamp, in local time and in a form the standard font can draw — `18 Aug 2026, 16:20`.
 *
 * `en-GB` rather than the reader's locale, for the same reason the labels are English: a Korean or Arabic
 * month name has no glyph in this font. Local time rather than UTC, because a receipt dated the day before
 * the transfer is a support ticket.
 */
export function pdfDate(value: number): string {
    try {
        return new Intl.DateTimeFormat('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(value))
    } catch {
        return new Date(value).toISOString().slice(0, 16).replace('T', ' ')
    }
}

/**
 * A party's two printed fields — the ID always, the name when the font can draw it.
 *
 * The ID carries the fallback described on `pdfText`: a name that sanitises to nothing is omitted rather
 * than printed as an empty value, and the ID beside it is what identifies the account either way.
 */
export function partyLines(party: TransferParty | null, fallbackId?: string): ReceiptRow[] {
    const id = pdfText(party?.id ?? fallbackId) || '-'
    const name = pdfText(party?.name)
    const rows: ReceiptRow[] = [{ label: 'Tevi ID', value: id }]
    if (name) rows.push({ label: 'Username', value: name })
    return rows
}

/**
 * Draw and download the receipt.
 *
 * `jspdf` is **dynamically imported**, as legacy imports it: it is ~350 KB and this is the only path in
 * the app that needs it, so nothing pays for it until somebody presses the button. That also keeps it out
 * of every route's shared chunk.
 *
 * Rejects rather than swallowing — the caller raises the toast, because only the caller knows whether a
 * failure should also close something.
 */
export async function saveTransferPdf({ sender, transfers, locale = 'en' }: ReceiptInput) {
    if (transfers.length === 0) return

    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const total = transfers.reduce((sum, transfer) => sum + transfer.stars, 0)

    transfers.forEach((transfer, index) => {
        if (index > 0) doc.addPage()
        let y = MARGIN + 8

        // ── Heading ──────────────────────────────────────────────────────────────
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(18)
        centred(doc, 'Transaction completed successfully', y)
        y += 22

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(11)
        doc.setTextColor(110)
        centred(
            doc,
            transfers.length > 1
                ? `Receiver ${index + 1} of ${transfers.length}`
                : 'Amount of transferred Star',
            y,
        )
        y += 24

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(26)
        doc.setTextColor(20)
        centred(doc, `${formatStarAmount(transfer.stars, locale)} Star`, y)
        y += BLOCK

        if (transfers.length > 1) {
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            doc.setTextColor(110)
            centred(doc, `Batch total ${formatStarAmount(total, locale)} Star`, y)
            y += BLOCK
        }

        // ── Summary ──────────────────────────────────────────────────────────────
        y = section(doc, 'Transaction summary', y)
        y = table(doc, receiptRows(transfer, locale), y)

        // ── The two parties ──────────────────────────────────────────────────────
        y = section(doc, 'Sender', y)
        y = table(doc, partyLines(sender), y)

        y = section(doc, 'Receiver', y)
        y = table(doc, partyLines(transfer.party, transfer.id), y)

        // ── Footer ───────────────────────────────────────────────────────────────
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(150)
        doc.text('Tevi - transfer receipt', MARGIN, PAGE.height - 32)
        doc.text(`Page ${index + 1} / ${transfers.length}`, PAGE.width - MARGIN, PAGE.height - 32, {
            align: 'right',
        })
    })

    /*
     * Named after the **transfer**, not the receiver: it is the value support asks for, it is unique, and
     * a folder of `transaction_receipt_1002884_1755600000000.pdf` (legacy's name) sorts by nothing useful.
     */
    doc.save(`tevi-transfer-${pdfText(transfers[0].id) || 'receipt'}.pdf`)
}

type Doc = jsPDF

function centred(doc: Doc, text: string, y: number) {
    doc.text(text, PAGE.width / 2, y, { align: 'center' })
}

/** A section heading with a rule under it. Returns the next baseline. */
function section(doc: Doc, title: string, y: number): number {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(20)
    doc.text(title, MARGIN, y)
    doc.setDrawColor(225)
    doc.line(MARGIN, y + 6, PAGE.width - MARGIN, y + 6)
    return y + 24
}

/**
 * Label on the left, value on the right, one line each. Returns the next baseline.
 *
 * The value is right-aligned and **not** wrapped: every value on this receipt is an ID, a figure or a
 * short date, except the message — which is split by `splitTextToSize` so a long note becomes lines
 * rather than running off the page.
 */
function table(doc: Doc, rows: ReceiptRow[], startY: number): number {
    let y = startY
    for (const row of rows) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(110)
        doc.text(row.label, MARGIN, y)

        doc.setTextColor(20)
        const width = (PAGE.width - MARGIN * 2) * 0.6
        const lines = doc.splitTextToSize(row.value || '-', width) as string[]
        doc.text(lines, PAGE.width - MARGIN, y, { align: 'right' })
        y += LINE * Math.max(1, lines.length)
    }
    return y + 10
}
