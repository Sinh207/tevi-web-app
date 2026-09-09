'use client'

import { TextAreaField, TextField } from '@shared/components/field'
import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import {
    SegmentedControl,
    SegmentedControlItem,
    SegmentedControlItemLabel,
} from '@shared/ui/segmented-control'
import { Toggle } from '@shared/ui/toggle'
import { type ReactNode, useId } from 'react'
import type { DonationFormState } from '../hooks/use-donation-form'
import { DONATION_FORM_FOOTER, DONATION_FORM_SECTION } from '../lib/container'
import { DONATION_TERM_OPTIONS, DONATION_UNIT_OPTIONS } from '../lib/donation-setting'

/**
 * One titled block of the form — legacy's `SectionCard` + `SectionHeader`, which are always used
 * together and never apart.
 *
 * **A band on the plane below `md`, a card from `md` up** — `DONATION_FORM_SECTION` carries the full
 * argument. The short version: a card inside the column's inset makes a phone pay the gutter twice,
 * so the blocks go full-bleed and their own `p-4` becomes the only one. The `border-b` is what
 * replaces the gap once the plane and the block are the same colour.
 *
 * `labelledBy` rather than a `<label htmlFor>`: three of the six blocks wrap a group of controls (the
 * unit chips, the term switch, a toggle row) and a `<label>` may point at only one. The heading
 * carries the id and each group points back at it, which is the arrangement a screen reader can
 * actually announce.
 */
function SettingSection({
    id,
    title,
    description,
    children,
}: {
    id: string
    title: string
    description: string
    children: ReactNode
}) {
    return (
        <section className={cn('flex flex-col gap-2 p-4', DONATION_FORM_SECTION)}>
            <div className="flex flex-col gap-0.5">
                <h2 id={id} className="type-body-strong m-0 text-(--text-title)">
                    {title}
                </h2>
                <p className="type-dense-default m-0 text-(--text-body)">{description}</p>
            </div>
            {children}
        </section>
    )
}

/**
 * `/monetization/donation`'s second screen — what a supporter buys, what it costs, and what they are
 * told afterwards.
 *
 * Legacy's six blocks, in legacy's order, with three departures that are each written down where
 * they happen:
 *
 * 1. **The unit chips are a real radio group** rather than four `<button>`s with a colour on one.
 * 2. **The thank-you message is bounded** at the schema's own `maxLength`, with a counter.
 * 3. **Save refuses a zero price**, which legacy will happily post.
 *
 * ## Why the chips are hand-built and the term switch is not
 *
 * They are the same *kind* of choice and the design draws them as two different objects: four pills
 * that scroll sideways, and a two-up track. The track is the DS's own `SegmentedControl`, so it is
 * used as such — including its `role="tab"`, which is the only flavour the DS ships. A `radiogroup`
 * variant would be `shared/ui` inventing something Figma does not draw, for one call site; the tab
 * semantics still announce the state correctly ("Donate, selected, 1 of 2").
 *
 * The chips have no DS component at all — the design system ships no chip — so they are authored
 * here, and being authored here they are authored *correctly*: `role="radiogroup"` over
 * `role="radio"` + `aria-checked`, which is what makes arrow keys and the "1 of 4" announcement work.
 *
 * ## The row scrolls natively, and that is a rule rather than a preference
 *
 * `overflow-x-auto` + `snap-x`, never `CardCarousel`. `CLAUDE.md` §10 draws the line exactly here: a
 * row you scroll sideways is not a carousel, and Embla's transform track costs momentum,
 * `overscroll-behavior` and the browser scrolling a focused child into view — the last of which is
 * the one that matters, because these chips are keyboard-reachable.
 */
export function DonationSetupForm({
    form,
    className,
}: {
    form: DonationFormState
    className?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const unitHeadingId = useId()
    /** Shared `name` for the four radios — what makes the browser treat them as one group. */
    const unitGroupName = useId()
    const amountHeadingId = useId()
    const termHeadingId = useId()
    const thanksHeadingId = useId()
    const displayHeadingId = useId()
    const activeHeadingId = useId()

    return (
        <form
            /*
             * `gap-0` below `md`: the blocks are bands on one plane there and separate themselves
             * with a hairline, so a gap would open a seam of surface between two surfaces and
             * separate nothing. From `md` they are cards again and the gap is what holds them apart.
             */
            className={cn('flex flex-1 flex-col gap-0 md:gap-3', className)}
            onSubmit={event => {
                event.preventDefault()
                void form.submit()
            }}
        >
            <SettingSection
                id={unitHeadingId}
                title={t('monetization_donation_unit_label')}
                description={t('monetization_donation_unit_hint')}
            >
                {/*
                 * **Native radios**, one `<input type="radio">` per chip behind a `<label>`, rather
                 * than four `<button role="radio">`s.
                 *
                 * The ARIA version was the first cut and it is strictly more work for a worse
                 * result: with `role="radio"` the arrow keys, the roving `tabIndex` and the
                 * "1 of 4" announcement are all code somebody has to write and keep in sync with
                 * the state. With real radios sharing a `name` the browser does every one of those,
                 * and there is no `aria-checked` that can disagree with what is painted. Legacy's
                 * four `<Box component='button'>`s have none of it — the chips are not reachable by
                 * arrow key and a screen reader is told nothing about the choice being exclusive.
                 *
                 * `<fieldset>` + `aria-labelledby` rather than a `<legend>`: the section heading
                 * already prints those words, and a legend would print them twice. `min-w-0` and
                 * the reset are not optional — a fieldset's default `min-inline-size: min-content`
                 * would stop the row below from ever scrolling.
                 *
                 * `-mx-4 px-4` so the row bleeds to the card's own edges while it scrolls: without
                 * it the first and last chip clip at the padding rather than at the card, and a
                 * scrolling row that stops 16px short reads as one that has ended.
                 */}
                <fieldset aria-labelledby={unitHeadingId} className="m-0 min-w-0 border-0 p-0">
                    <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:flex-wrap [&::-webkit-scrollbar]:hidden">
                        {DONATION_UNIT_OPTIONS.map(unit => (
                            <label
                                key={unit.key}
                                className="flex flex-none cursor-pointer snap-start items-center"
                            >
                                <input
                                    type="radio"
                                    name={unitGroupName}
                                    value={unit.key}
                                    checked={form.values.unit === unit.key}
                                    onChange={() => form.setUnit(unit.key)}
                                    data-testid="monetization-donation-unit"
                                    data-option-value={unit.key}
                                    className="peer sr-only"
                                />
                                <span
                                    className={cn(
                                        'type-dense-emphasis flex h-8 items-center gap-1 whitespace-nowrap',
                                        'rounded-(--radius-fill) border px-3 transition-colors',
                                        'border-(--button-secondary-border) bg-(--button-ghost-bg) text-(--text-title)',
                                        'hover:bg-(--background-subtle)',
                                        // The DS's own selected-segment pair, so a chip and a
                                        // segment agree about what "chosen" looks like.
                                        'peer-checked:border-transparent peer-checked:bg-(--brand) peer-checked:text-(--text-on-accent)',
                                        // The ring belongs to the visible chip, not to the 1px
                                        // input that actually holds focus.
                                        'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--focus-ring)',
                                    )}
                                >
                                    {/* The emoji is the design's own mark, not a stand-in for a
                                        missing glyph — see `DONATION_UNIT_OPTIONS`. Decorative:
                                        the word is beside it. */}
                                    <span aria-hidden>{unit.emoji}</span>
                                    {t(unit.labelKey)}
                                </span>
                            </label>
                        ))}
                    </div>
                </fieldset>
            </SettingSection>

            <SettingSection
                id={amountHeadingId}
                title={t('monetization_donation_amount_label')}
                description={t('monetization_donation_amount_hint')}
            >
                <TextField
                    data-testid="monetization-donation-amount"
                    // The field's own label row is redundant under the section heading, so the
                    // heading *is* the label and the row is not drawn twice.
                    label={
                        <span className="sr-only">{t('monetization_donation_amount_label')}</span>
                    }
                    /*
                     * `$`, and **not** the reader's own currency. billy prices the offer in USD and
                     * TVS and takes nothing else, so relabelling this with the reader's unit would
                     * be a lie about what the number means. Every *display* of money in this app is
                     * converted; this is an input to a USD field, which is the opposite direction.
                     */
                    prefix="$"
                    suffix={
                        <span className="type-dense-default flex items-center gap-1 text-(--text-subtitle)">
                            <Icon name="arrows-left-right" size={16} aria-hidden />
                            <StarMark size={14} />
                            {t('monetization_donation_star_suffix', {
                                stars: form.starEquivalent.toLocaleString(currentLanguage),
                            })}
                        </span>
                    }
                    /*
                     * `inputMode="decimal"` and a plain text type: `type="number"` brings a spinner,
                     * silently accepts `1e3`, and reports `''` for an unparseable value — which
                     * would take `parseDonationAmountInput`'s whole job away from it.
                     */
                    inputMode="decimal"
                    value={form.values.amount}
                    onChange={event => form.setAmount(event.target.value)}
                    placeholder="10"
                />
            </SettingSection>

            <SettingSection
                id={termHeadingId}
                title={t('monetization_donation_term_label')}
                description={t('monetization_donation_term_hint')}
            >
                <SegmentedControl role="tablist" aria-labelledby={termHeadingId}>
                    {DONATION_TERM_OPTIONS.map(term => (
                        <SegmentedControlItem
                            key={term.key}
                            data-testid="monetization-donation-term"
                            data-option-value={term.key}
                            selected={form.values.term === term.key}
                            onClick={() => form.setTerm(term.key)}
                        >
                            <SegmentedControlItemLabel>
                                {t(term.labelKey)}
                            </SegmentedControlItemLabel>
                        </SegmentedControlItem>
                    ))}
                </SegmentedControl>
            </SettingSection>

            <SettingSection
                id={thanksHeadingId}
                title={t('monetization_donation_thanks_label')}
                description={t('monetization_donation_thanks_hint')}
            >
                <TextAreaField
                    data-testid="monetization-donation-thanks"
                    label={
                        <span className="sr-only">{t('monetization_donation_thanks_label')}</span>
                    }
                    /*
                     * The counter is the only thing that says why typing stopped, so it is not
                     * decoration. The limit is the **schema's** (`maxLength: 500`) — legacy enforces
                     * none and lets billy refuse the write, which surfaces as a generic failure with
                     * nothing pointing at the field that caused it.
                     */
                    labelData={`${form.values.message.length}/${form.messageMax}`}
                    maxLength={form.messageMax}
                    rows={4}
                    value={form.values.message}
                    onChange={event => form.setMessage(event.target.value)}
                    placeholder={t('monetization_donation_thanks_placeholder')}
                />
            </SettingSection>

            <ToggleSection
                headingId={displayHeadingId}
                testId="monetization-donation-display-count"
                title={t('monetization_donation_display_count_label')}
                description={t('monetization_donation_display_count_hint')}
                checked={form.values.displaySupporterCount}
                onCheckedChange={form.setDisplaySupporterCount}
            />

            <ToggleSection
                headingId={activeHeadingId}
                testId="monetization-donation-activation"
                title={t('monetization_donation_active_label')}
                description={t('monetization_donation_active_hint')}
                checked={form.values.isActive}
                onCheckedChange={form.setIsActive}
            />

            {/*
             * The form's foot — the API's refusal, then Save — as a **bar pinned to the bottom of
             * the viewport**. `DONATION_FORM_FOOTER` carries the whole argument; the short version
             * is that this form is 1077px tall on an 844px phone, so an in-flow Save is two screens
             * below the field somebody just filled in.
             *
             * `mt-auto md:mt-0` still earns its place beside `sticky`, and they do different jobs:
             * sticky stops the bar scrolling *past* the viewport, and does nothing at all when the
             * content is short enough to fit. `mt-auto` is what puts the bar at the foot of the
             * column in that case rather than immediately under the last block — so a short form on
             * a phone looks the same as a long one that has been scrolled to the end.
             */}
            <div className={cn('mt-auto md:mt-0', DONATION_FORM_FOOTER)}>
                {form.errorText ? (
                    /*
                     * The API's own sentence, in the form and not in a toast — `docs/API_ERRORS.md`.
                     * It sits directly above Save because that is the control that produced it, and
                     * it rides the bar so a refusal is visible without scrolling back to find it.
                     */
                    <p
                        role="alert"
                        data-testid="monetization-donation-save-error"
                        className="type-dense-default m-0 text-(--accents-error-active)"
                    >
                        {form.errorText}
                    </p>
                ) : null}

                <Button
                    type="submit"
                    data-testid="monetization-donation-save"
                    variant="accent"
                    size="large"
                    fullWidth
                    disabled={!form.canSave}
                    aria-busy={form.isSaving || undefined}
                >
                    {/* `Loader` **inside** the button with the label passed to it, so the word does
                        not swap out and the button does not resize mid-press. */}
                    {form.isSaving ? <Loader label={t('common_save')} /> : t('common_save')}
                </Button>
            </div>
        </form>
    )
}

/**
 * A section whose whole content is one switch — legacy's `ToggleRow` inside its `SectionCard`.
 *
 * Split out because the two callers are identical in shape and differ only in their words, and
 * because the switch needs `aria-labelledby` **and** `aria-describedby`: a `role="switch"` with no
 * name announces as "switch, on", which is true and useless.
 */
function ToggleSection({
    headingId,
    testId,
    title,
    description,
    checked,
    onCheckedChange,
}: {
    headingId: string
    testId: string
    title: string
    description: string
    checked: boolean
    onCheckedChange: (checked: boolean) => void
}) {
    const descriptionId = `${headingId}-description`

    return (
        <section className={cn('flex items-center gap-4 p-4', DONATION_FORM_SECTION)}>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h2 id={headingId} className="type-body-strong m-0 text-(--text-title)">
                    {title}
                </h2>
                <p id={descriptionId} className="type-dense-default m-0 text-(--text-body)">
                    {description}
                </p>
            </div>
            <Toggle
                data-testid={testId}
                aria-labelledby={headingId}
                aria-describedby={descriptionId}
                checked={checked}
                onCheckedChange={onCheckedChange}
            />
        </section>
    )
}
