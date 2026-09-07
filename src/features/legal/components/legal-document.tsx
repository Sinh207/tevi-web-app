import { getServerT } from '@shared/i18n/server'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import type { ReactNode } from 'react'
import type { LegalBlock, LegalDocument as LegalDocumentData } from '../content/types'

/**
 * Renders a `LegalDocument`. A server component — the copy is static, so none of it
 * needs to reach the client bundle; only the table of contents is interactive.
 *
 * The type scales with the viewport rather than being one compromise for both: 14/dense
 * is right on a phone and cramped on a 1440 monitor, where long-form legal copy wants 16
 * and the measure the card gives it. Legacy's #131313 / #333333 become `--text-title` /
 * `--text-subtitle`, which is what makes the page work in dark mode — the Zinc ramp
 * inverts, the literals would not have.
 */

function Blocks({ blocks }: { blocks: LegalBlock[] }) {
    return blocks.map((block, index) =>
        block.kind === 'subheading' ? (
            /*
             * Same size as the copy it introduces, one weight heavier, with a little air
             * above it — a clause heading is a label on the paragraph under it, and
             * anything larger competes with the section's own `h2`. `mt` rather than a
             * bigger gap on the parent, because it applies only where a sub-heading is
             * (the section's first block never needs it: `gap` already put it there).
             */
            <h3
                key={blockKey(block, index)}
                className="type-dense-strong mt-2 text-(--text-title) md:type-body-strong md:mt-3 [&:first-child]:mt-0"
            >
                {block.text}
            </h3>
        ) : block.kind === 'list' ? (
            /*
             * `ol`/`ul` follows the data rather than being one element with a swapped
             * `list-style`: an enumeration a document cites by number is an ordered list
             * to a screen reader too, and that is only true of the element.
             */
            <List
                key={blockKey(block, index)}
                ordered={block.ordered}
                className="type-dense-default flex flex-col gap-1 ps-6 text-(--text-subtitle) md:type-body-default md:gap-2"
            >
                {block.items.map(item => (
                    <li key={item.text}>
                        {item.lead ? <strong className="font-semibold">{item.lead}</strong> : null}
                        {item.text}
                    </li>
                ))}
            </List>
        ) : block.kind === 'image' ? (
            /*
             * A figure — the safety policy's diagram. It sits on a rounded, hairline-bordered
             * plate because the source is a raster with its own dark background baked in:
             * unplated it reads as a hole punched in the card in light mode. `sizes` matches
             * the card's measure so a phone is not sent the 1280-wide original, and the
             * intrinsic ratio is what reserves its space before it lands.
             */
            <figure key={blockKey(block, index)} className="my-1 md:my-2 print:break-inside-avoid">
                <Image
                    src={block.src}
                    alt={block.alt}
                    width={block.width}
                    height={block.height}
                    /*
                     * The measures the card actually gives it: 1080 container − gutters −
                     * the contents rail and its gap − the card's own padding. 656 from lg,
                     * 556 from md, and full-bleed minus the phone's 16px gutters below that.
                     */
                    sizes="(min-width: 1040px) 656px, (min-width: 900px) 556px, calc(100vw - 32px)"
                    className="h-auto w-full rounded-(--radius-lg) border border-(--separator-default)"
                />
            </figure>
        ) : (
            <p
                key={blockKey(block, index)}
                className="type-dense-default text-(--text-subtitle) md:type-body-default"
            >
                {block.lead ? <strong className="font-semibold">{block.lead}</strong> : null}
                {block.text}
            </p>
        ),
    )
}

function List({
    ordered,
    className,
    children,
}: {
    ordered?: boolean
    className?: string
    children: ReactNode
}) {
    const Tag = ordered ? 'ol' : 'ul'
    return <Tag className={cn(className, ordered ? 'list-decimal' : 'list-disc')}>{children}</Tag>
}

/**
 * The copy is the identity here — there is no id to key on. The position goes in front of
 * it because the copy is not always unique: the community guidelines say "For example, you
 * may not:" three times inside the Authenticity section alone, and text alone would collide
 * on all three. Prefixing with the index is safe because a document is static — a block
 * never moves — and it keeps the text in the key, where it is worth having when debugging.
 */
function blockKey(block: LegalBlock, index: number): string {
    if (block.kind === 'list') return `${index}:list:${block.items[0]?.text}`
    if (block.kind === 'image') return `${index}:image:${block.src}`
    return `${index}:${block.text}`
}

export async function LegalDocumentBody({
    document,
    className,
    /** Numbers the sections, as a legal document is normally cited. */
    numbered = false,
}: {
    document: LegalDocumentData
    className?: string
    numbered?: boolean
}) {
    const t = await getServerT()

    return (
        <div className={cn('flex min-w-0 flex-col gap-6 md:gap-8', className)}>
            {/* The opening paragraphs are the document's lead — a step up in size from the
                body from md, the way a printed policy sets its preamble. Rendered only when
                there is one: the terms of use open straight on clause 1, and an empty box
                still takes its share of the parent's `gap`. */}
            {document.intro.length > 0 ? (
                <div className="flex flex-col gap-3 md:[&_p]:type-subheading-default">
                    <Blocks blocks={document.intro} />
                </div>
            ) : null}

            {document.sections.map((section, index) => (
                <section
                    data-testid="legal-section"
                    data-row-key={section.id}
                    key={section.id}
                    className="flex scroll-mt-[var(--legal-offset-sm,76px)] flex-col gap-2 md:scroll-mt-[var(--legal-offset-md,24px)] md:gap-3"
                    aria-labelledby={section.id}
                >
                    {/*
                     * `scroll-mt` sits on the heading as well as the section, because the
                     * heading is what carries the id and therefore what the browser scrolls
                     * to. The host sets `--legal-offset-*` to the height of its own sticky
                     * stack, which differs per breakpoint (a phone has a bar plus the chip
                     * row; from md the rail is beside the copy). The scroll-spy reads the
                     * same value back off the heading, so the two cannot drift.
                     */}
                    <h2
                        id={section.id}
                        className="type-body-strong group flex scroll-mt-[var(--legal-offset-sm,76px)] items-baseline gap-2 text-(--text-title) md:type-subheading-strong md:scroll-mt-[var(--legal-offset-md,24px)]"
                    >
                        {numbered ? (
                            <span className="type-dense-emphasis tabular-nums text-(--text-placeholder) md:type-body-emphasis">
                                {index + 1}.
                            </span>
                        ) : null}
                        <span className="min-w-0">{section.title}</span>
                        {/*
                         * The clause permalink: hidden until the heading is hovered or the
                         * link itself is focused, so it never competes with the copy but is
                         * always reachable. People cite these documents by section — this is
                         * how they get the URL for one.
                         */}
                        <a
                            data-testid="legal-section-link"
                            data-row-key={section.id}
                            href={`#${section.id}`}
                            aria-label={t('legal_link_to_section', { title: section.title })}
                            className="hidden shrink-0 rounded-(--radius-sm) text-(--text-placeholder) opacity-0 transition-opacity hover:text-(--text-link) focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) group-hover:opacity-100 md:inline-flex print:md:hidden"
                        >
                            <Icon name="link-simple" size={16} />
                        </a>
                    </h2>
                    <Blocks blocks={section.blocks} />
                </section>
            ))}
        </div>
    )
}
