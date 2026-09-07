import { getServerT } from '@shared/i18n/server'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import type { CSSProperties } from 'react'
import type { LegalDocument } from '../content/types'
import { LegalDocumentBody } from './legal-document'
import { LegalToc } from './legal-toc'

/**
 * A legal document as a page — everything the public route and its `/app/*` webview twin
 * share, for every document (privacy policy, terms of use, …). A server component, so the
 * legal copy never reaches the client bundle.
 *
 * Two designs, one document, because the two contexts are genuinely different work:
 *
 * - **From md** it is a published legal document: a masthead (overline · title · the
 *   effective date), a quiet numbered contents rail pinned alongside, and the copy itself
 *   on an elevated surface at a ~70-character measure with 16px type. The card is what
 *   does most of the work — text laid straight onto the page background reads like a
 *   utility screen, the same text on a surface with real padding reads like a document.
 *   Sections are numbered so a clause can be cited, and each heading carries a permalink.
 * - **Below md** — the phone and the app's webview — the masthead compresses to a title
 *   and a date, the rail becomes a sticky row of section chips, and the copy runs
 *   full-bleed on `--background-surface` at 14px. That is the treatment legacy styled for
 *   narrow screens but never rendered, because it gated the whole menu on `matchUpMd`.
 *
 * It also prints properly, which for a document people are asked to agree to is not a
 * flourish: the chrome, the rail and the card's elevation all drop out on paper.
 *
 * `heading` says who owns the `h1`, and it is per breakpoint rather than a boolean because
 * the answer changes with the layout: `/privacy` shows it in the back bar on a phone and
 * in the masthead from md, so there the document's own title is `from-md`. `/app/privacy`
 * has no bar at all — the native header is outside the document — so there it is `always`.
 */

/** Height of the mobile chip row: 40 chip + 8 padding × 2 + the two hairline borders. */
const CHIP_ROW_HEIGHT = 58
/** Anchor for "back to top" — on the outer box, which exists at every breakpoint. */
const TOP_ID = 'legal-top'

/**
 * The measure and gutters of a legal page, as one string both the document **and the
 * page's sticky bar** apply. The bar's own background has to run full-bleed while its
 * contents line up with the copy underneath, and that only holds if the two share this
 * definition rather than each hardcoding 1080.
 */
export const LEGAL_CONTAINER = 'mx-auto w-full max-w-[1080px] md:px-6 lg:px-8'

export async function LegalPageView({
    document,
    titleKey,
    lastUpdatedKey,
    className,
    heading = 'always',
    /** Height of the host's own sticky bar; the mobile chip row parks under it. */
    stickyOffset = 0,
}: {
    document: LegalDocument
    /** Translation key for the document's name — the same one the host's bar shows. */
    titleKey: string
    /**
     * Translation key for the "last updated" line; interpolates `{{date}}`. Omitted for a
     * document that states no effective date — see `LegalDocument.effectiveDate`.
     */
    lastUpdatedKey?: string
    className?: string
    /** `from-md` when a mobile bar above already carries the title. */
    heading?: 'always' | 'from-md'
    stickyOffset?: number
}) {
    const t = await getServerT()
    const items = document.sections.map(({ id, title }) => ({ id, title }))
    const label = t('legal_table_of_contents')

    return (
        <div
            id={TOP_ID}
            className={cn(
                LEGAL_CONTAINER,
                'flex scroll-mt-6 flex-col',
                /*
                 * From md it is a two-column grid rather than a flex row, so the contents
                 * rail can span both rows while the masthead and the document share the
                 * second column: the title then lines up with the card it introduces
                 * instead of hanging over the sidebar. The rail is narrower until lg
                 * because at exactly 900 the measure is what has to give, not the copy.
                 */
                'md:grid md:grid-cols-[200px_minmax(0,1fr)] md:gap-x-8',
                'lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-x-10',
                className,
            )}
            /*
             * Where a `#section` jump has to stop, per breakpoint — consumed by the
             * headings' `scroll-mt` and read back by the scroll-spy. Both clear the host's
             * sticky bar; on a phone the chip row is sticky under it and has to be cleared
             * too, while from md the chip row is gone and the rail sits beside the copy, so
             * the bar plus breathing room is all there is.
             */
            style={
                {
                    '--legal-offset-sm': `${stickyOffset + CHIP_ROW_HEIGHT + 8}px`,
                    '--legal-offset-md': `${stickyOffset + 24}px`,
                } as CSSProperties
            }
        >
            <header className="flex flex-col gap-1 px-4 pb-4 md:col-start-2 md:gap-3 md:px-0 md:pt-10 md:pb-6">
                <h1
                    className={cn(
                        'type-subheading-strong text-center text-(--text-title) md:type-heading-h1-bold md:text-start',
                        // `print:block` is not redundant with `md:block`: an A4 sheet is
                        // ~794 CSS px, i.e. below md, and the bar that carries the title
                        // there is itself `print:hidden` — without this the printed
                        // document comes out with no title on it at all.
                        heading === 'from-md' && 'hidden md:block print:block',
                    )}
                >
                    {t(titleKey)}
                </h1>
                {/* No date, no line: the mini app documents carry none, and `t()` would
                    otherwise print "…effective from " with nothing after it. */}
                {lastUpdatedKey && document.effectiveDate ? (
                    <p className="type-caption-meta text-center text-(--text-subtitle) md:type-body-default md:text-start md:text-(--text-body)">
                        {t(lastUpdatedKey, { date: document.effectiveDate })}
                    </p>
                ) : null}
            </header>

            {/* Mobile: chips above the copy, sticky under the host's bar. */}
            <LegalToc
                items={items}
                label={label}
                orientation="chips"
                className="sticky z-10 border-y border-(--separator-default) bg-(--background-surface) md:hidden print:hidden"
                style={{ top: stickyOffset }}
            />

            {/* Grid row 1–2 of the first column: pinned beside the whole document, top
                aligned with the masthead. */}
            <LegalToc
                items={items}
                label={label}
                numbered
                className="sticky hidden h-fit self-start md:col-start-1 md:row-start-1 md:row-span-2 md:flex print:hidden"
                style={{ top: stickyOffset + 40 }}
            />

            <article
                className={cn(
                    'min-w-0 bg-(--background-surface) px-4 py-4 md:col-start-2 md:p-8 lg:p-10',
                    // Full-bleed surface on a phone; a card from md.
                    'md:mb-10 md:rounded-[var(--radius-2xl)] md:shadow-xs',
                    'print:bg-transparent print:p-0 print:shadow-none',
                )}
            >
                <LegalDocumentBody document={document} numbered />

                {/* Legal documents are long and read top to bottom; the rail is pinned for
                    desktop, and this is the phone's way out of the last section. */}
                <a
                    data-testid="legal-back-to-top"
                    href={`#${TOP_ID}`}
                    className="type-dense-emphasis mt-8 inline-flex items-center gap-2 rounded-(--radius-md) text-(--text-body) no-underline transition-colors hover:text-(--text-title) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) print:hidden"
                >
                    <Icon name="arrow-up" size={16} />
                    {t('legal_back_to_top')}
                </a>
            </article>
        </div>
    )
}
