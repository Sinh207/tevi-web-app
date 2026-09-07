import { cn } from '@shared/lib/utils'
import type { Letter, LetterBlock } from '../content/types'
import { parseEmphasis } from '../lib/emphasis'

/**
 * The open letter as a page — everything `/letter` and its `/app/*` webview twin share.
 * A server component, so neither the copy nor the parser reaches the client bundle.
 *
 * It is not `LegalPageView` and does not want to be. That view is built around the things
 * a policy has and a letter does not: a numbered contents rail, per-clause anchors and
 * permalinks, a "last updated" line. A letter is read top to bottom once, so what is left
 * is a masthead, a column of prose and a sign-off — and a narrower measure than the
 * policies use, because 1080px of letter is a wall.
 *
 * The surface treatment *is* shared, deliberately: full-bleed on `--background-surface`
 * below md (the phone and the app's webview, where a card floating in a gutter reads as a
 * widget), a card with real padding from md. That is what makes it a document rather than
 * a screen, and the policies already established it.
 *
 * `heading` says who owns the `h1`, exactly as in `LegalPageView`: `/letter` has a back
 * bar carrying the short title on a phone, `/app/letter` has no bar at all.
 */

/**
 * The measure and gutters of the letter, as one string the page's sticky bar can apply too
 * — see `LEGAL_CONTAINER` for why the bar has to share it. Narrower than the policies':
 * legacy set the letter in a `sm` container, and prose people read straight through wants
 * a ~65-character line, not a legal document's 70+.
 */
export const LETTER_CONTAINER = 'mx-auto w-full max-w-[720px] md:px-6'

/**
 * The copy is the identity, and the position goes in front of it because the copy is not
 * unique — a letter repeats itself on purpose ("Every time.", "**active followers**"), and
 * two runs with the same text inside one paragraph would collide. Safe because a letter is
 * static: a block never moves and a run is never reordered. Same reasoning, and the same
 * shape, as `blockKey` in `legal-document.tsx`.
 */
function key(text: string, index: number): string {
    return `${index}:${text}`
}

function Runs({ text }: { text: string }) {
    return parseEmphasis(text).map((run, index) =>
        run.bold ? (
            <strong key={key(run.text, index)} className="font-semibold text-(--text-title)">
                {run.text}
            </strong>
        ) : (
            <span key={key(run.text, index)}>{run.text}</span>
        ),
    )
}

function Blocks({ blocks }: { blocks: LetterBlock[] }) {
    return blocks.map((block, index) =>
        block.kind === 'heading' ? (
            <h2
                key={key(block.text, index)}
                className="type-body-strong mt-2 text-(--text-title) md:type-subheading-strong md:mt-3"
            >
                {block.text}
            </h2>
        ) : block.kind === 'list' ? (
            <ul
                key={key(block.items[0], index)}
                className="type-dense-default flex list-disc flex-col gap-1 ps-6 text-(--text-subtitle) md:type-body-default md:gap-2"
            >
                {block.items.map(item => (
                    <li key={item}>
                        <Runs text={item} />
                    </li>
                ))}
            </ul>
        ) : (
            <p
                key={key(block.text, index)}
                className="type-dense-default text-(--text-subtitle) md:type-body-default"
            >
                <Runs text={block.text} />
            </p>
        ),
    )
}

export function OpenLetterView({
    letter,
    className,
    heading = 'always',
}: {
    letter: Letter
    className?: string
    /** `from-md` when a mobile bar above already carries the title. */
    heading?: 'always' | 'from-md'
}) {
    return (
        <div className={cn(LETTER_CONTAINER, 'flex flex-col', className)}>
            <header className="flex flex-col items-center gap-1 px-4 pb-4 md:gap-2 md:px-0 md:pt-10 md:pb-6">
                <h1
                    className={cn(
                        'type-subheading-strong text-center text-(--text-title) md:type-title-t1-semibold',
                        // Same reason as `LegalPageView`: an A4 sheet is below md, and the
                        // bar that carries the title there is itself `print:hidden`.
                        heading === 'from-md' && 'hidden md:block print:block',
                    )}
                >
                    {letter.title}
                </h1>
                {/* `<time>` rather than a `<p>`: the dateline is prose in three languages,
                    and this is the one form a crawler or a reader-mode can actually read. */}
                <time
                    dateTime={letter.publishedAt}
                    className="type-caption-meta text-center text-(--text-subtitle) md:type-body-default"
                >
                    {letter.dateline}
                </time>
            </header>

            <article
                className={cn(
                    'flex min-w-0 flex-col gap-3 bg-(--background-surface) px-4 py-4 md:gap-4 md:p-8 lg:p-10',
                    // Full-bleed surface on a phone; a card from md.
                    'md:mb-10 md:rounded-[var(--radius-2xl)] md:shadow-xs',
                    'print:bg-transparent print:p-0 print:shadow-none',
                )}
            >
                <Blocks blocks={letter.blocks} />
                {/* Set apart from the body the way a signature is: it is not another
                    paragraph, and it is the one line in the letter with a name on it. */}
                <p className="type-dense-strong mt-2 text-(--text-title) md:type-body-strong md:mt-3">
                    {letter.signOff}
                </p>
            </article>
        </div>
    )
}
