'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Icon } from '@shared/ui/icon'
import { Radio } from '@shared/ui/radio'
import { Toggle } from '@shared/ui/toggle'
import { useId } from 'react'
import type { PostDraft } from '../lib/post-draft'
import { STAR_PRICE_MAX } from '../lib/post-draft'
import type { ReplyAudience } from '../lib/who-can-reply'

/**
 * Everything about a post that is not its words — audience, paywall, who may reply, and the three
 * switches.
 *
 * ## One panel where legacy has three dialogs
 *
 * Legacy opens *Select your audience*, *Reply settings* and *Post settings* as separate modals from
 * three buttons on the composer's action bar. They are collapsed here because they are all the same
 * kind of question — "who is this for and what may they do with it" — and because three modals over
 * a modal is a stack this app's dialog primitive does not draw. What is kept from legacy is the
 * **grouping**, in the same order, so a creator who knows the app finds the same switch in the same
 * neighbourhood.
 *
 * ## The paywall's two routes are independent, and both write the same field
 *
 * A post can be unlocked by **buying it** (a Star price) or by **being a member** (a tier), and a
 * creator may offer either, both, or neither. Legacy models this as two booleans that each flip the
 * audience to `STARGAZERS` and back, which is why its `handlePaidChange` and `handleMemberChange`
 * each check the *other* before reverting. Here the audience is **derived** instead: it is
 * `STARGAZERS` exactly when at least one route is set, which `buildPostBody` re-derives on the way
 * out — so the two cannot drift.
 *
 * ## Why the reply audience is six radio rows and not a select
 *
 * The six values are `lib/who-can-reply.ts`'s, the same list the reader meets on the other side as
 * a sentence. Radios rather than a `<select>` because each one needs its own explanation — *Only
 * spaces you follow* is not self-evident — and the DS ships no select with a second line.
 */
export function PostSettingsPanel({
    draft,
    onChange,
    minPrice,
    /** The creator's membership tiers. Empty means the members route cannot be offered. */
    tiers,
    disabled = false,
    testId,
}: {
    draft: PostDraft
    onChange: (next: Partial<PostDraft>) => void
    minPrice: number
    tiers: { id: string; name: string }[]
    disabled?: boolean
    testId?: string
}) {
    const { t } = useTranslation()

    const paidRoute = draft.price !== null
    const memberRoute = draft.requiredPackages.length > 0

    /**
     * Turning a route on or off, and keeping `audience` in step.
     *
     * The audience is never set directly by a control — it is whatever the two routes imply. That is
     * the one rule this panel exists to hold: legacy has two handlers that each have to remember to
     * consult the other, and a post whose audience says `STARGAZERS` with neither route set is one
     * only its author can read (`buildPostBody` rewrites that shape, and this stops it arising).
     */
    function setRoutes(next: { price?: number | null; packages?: string[] }) {
        const price = next.price === undefined ? draft.price : next.price
        const packages = next.packages === undefined ? draft.requiredPackages : next.packages
        onChange({
            price,
            requiredPackages: packages,
            audience: price !== null || packages.length > 0 ? 'STARGAZERS' : 'EVERYONE',
        })
    }

    return (
        <div
            data-testid={testId}
            className="flex flex-col gap-4 border-(--separator-default) border-t pt-4"
        >
            <Section title={t('post_settings_audience')} testId={subTestId(testId, 'group')}>
                <SwitchRow
                    label={t('post_settings_paid')}
                    hint={t('post_settings_paid_hint')}
                    checked={paidRoute}
                    disabled={disabled}
                    onChange={on => setRoutes({ price: on ? minPrice : null })}
                    testId={subTestId(testId, 'option')}
                />

                {paidRoute ? (
                    <label className="flex items-center gap-2 ps-1">
                        <span className="type-dense-default text-(--text-subtitle)">
                            {t('post_settings_price')}
                        </span>
                        <input
                            type="number"
                            inputMode="numeric"
                            min={minPrice}
                            max={STAR_PRICE_MAX}
                            value={draft.price ?? minPrice}
                            disabled={disabled}
                            data-testid={subTestId(testId, 'input')}
                            onChange={event => {
                                /*
                                 * An empty field is not a price of zero. Clearing it while typing
                                 * is ordinary, so it falls back to the floor rather than to a value
                                 * `postDraftProblem` would then refuse — the author is mid-edit,
                                 * not wrong.
                                 */
                                const parsed = Number(event.target.value)
                                setRoutes({
                                    price:
                                        Number.isFinite(parsed) && parsed > 0 ? parsed : minPrice,
                                })
                            }}
                            className="type-body-default w-28 rounded-(--radius-sm) border border-(--input-border) bg-transparent px-2 py-1 text-(--text-title)"
                        />
                        <Icon name="star" size={16} className="text-(--icon-secondary)" />
                    </label>
                ) : null}

                {/*
                 * The members route is offered only when there is a tier to require. A creator with
                 * no membership set up would otherwise switch it on and produce a post gated behind
                 * a tier list that is empty — which reaches nobody, and which `buildPostBody` would
                 * then quietly republish as public.
                 */}
                {tiers.length > 0 ? (
                    <SwitchRow
                        label={t('post_settings_members')}
                        hint={t('post_settings_members_hint')}
                        checked={memberRoute}
                        disabled={disabled}
                        onChange={on =>
                            setRoutes({ packages: on && tiers[0] ? [tiers[0].id] : [] })
                        }
                        testId={subTestId(testId, 'item')}
                    />
                ) : null}
            </Section>

            <Section title={t('who_can_reply_title')} testId={subTestId(testId, 'list')}>
                {REPLY_AUDIENCES.map(audience => (
                    // biome-ignore lint/a11y/noLabelWithoutControl: `Radio` renders the `<input type="radio">` this label wraps; the rule cannot see through a component.
                    <label
                        key={audience.value}
                        className="flex cursor-pointer items-center gap-2"
                        data-option-value={audience.value}
                    >
                        {/*
                         * `as="span"`, because `Radio` defaults to rendering a `<label>` around its
                         * own input — and a label inside a label gives the words to the outer one
                         * and the control to the inner, so pressing the text toggles nothing. The
                         * DS geometry is untouched; only the element it renders as changes, which
                         * is what the prop is for.
                         */}
                        <Radio
                            as="span"
                            name="post-reply-audience"
                            checked={draft.replyAllowedUser === audience.value}
                            disabled={disabled}
                            onChange={() => onChange({ replyAllowedUser: audience.value })}
                            data-testid={subTestId(testId, 'option')}
                        />
                        <span className="type-dense-default text-(--text-title)">
                            {t(audience.labelKey)}
                        </span>
                    </label>
                ))}
            </Section>

            <Section title={t('post_settings_title')} testId={subTestId(testId, 'panel')}>
                <SwitchRow
                    label={t('post_settings_reply_links')}
                    checked={draft.replyAllowedLink}
                    disabled={disabled}
                    onChange={on => onChange({ replyAllowedLink: on })}
                    testId={subTestId(testId, 'field')}
                />
                <SwitchRow
                    label={t('post_settings_pin')}
                    checked={draft.pinned}
                    disabled={disabled}
                    onChange={on => onChange({ pinned: on })}
                    testId={subTestId(testId, 'affix')}
                />
                <SwitchRow
                    label={t('post_settings_nsfw')}
                    hint={t('post_settings_nsfw_hint')}
                    checked={draft.markedNsfw}
                    disabled={disabled}
                    onChange={on => onChange({ markedNsfw: on })}
                    testId={subTestId(testId, 'reveal')}
                />
                <SwitchRow
                    label={t('post_settings_paid_interaction')}
                    hint={t('post_settings_paid_interaction_hint')}
                    checked={draft.paidInteractionCost !== null}
                    disabled={disabled}
                    /*
                     * A cost of `1` when switched on, which is the smallest charge that means
                     * anything — `PostActions` prints a price chip only above 1, so anything less
                     * would be a charge the reader is never shown.
                     */
                    onChange={on => onChange({ paidInteractionCost: on ? 1 : null })}
                    testId={subTestId(testId, 'confirm')}
                />
            </Section>
        </div>
    )
}

/**
 * The six reply audiences, in legacy's own order.
 *
 * Values are the wire's (`lib/who-can-reply.ts` reads the same six coming back), so the composer and
 * the reader's panel cannot disagree about what a post says.
 */
const REPLY_AUDIENCES: { value: string; labelKey: string; audience: ReplyAudience }[] = [
    { value: 'FOLLOWERS', labelKey: 'post_settings_reply_followers', audience: 'followers' },
    { value: 'PAID_USERS', labelKey: 'post_settings_reply_paid', audience: 'paid-users' },
    { value: 'FOLLOWINGS', labelKey: 'post_settings_reply_followings', audience: 'followings' },
    {
        value: 'VERIFIED_SPACES',
        labelKey: 'post_settings_reply_verified',
        audience: 'verified-spaces',
    },
    {
        value: 'MENTIONED_SPACES',
        labelKey: 'post_settings_reply_mentioned',
        audience: 'mentioned-spaces',
    },
    { value: 'NONE', labelKey: 'post_settings_reply_none', audience: 'none' },
]

function Section({
    title,
    children,
    testId,
}: {
    title: string
    children: React.ReactNode
    testId?: string
}) {
    return (
        <section data-testid={testId} className="flex flex-col gap-2">
            <h3 className="type-dense-emphasis text-(--text-title)">{title}</h3>
            {children}
        </section>
    )
}

/** A label, an optional second line, and a switch on the trailing edge. */
function SwitchRow({
    label,
    hint,
    checked,
    disabled,
    onChange,
    testId,
}: {
    label: string
    hint?: string
    checked: boolean
    disabled?: boolean
    onChange: (checked: boolean) => void
    testId?: string
}) {
    /*
     * A `<div>`, not a `<label>`. `Toggle` is a `role="switch"` **button**, and a label wrapping one
     * labels nothing — the browser only associates a label with a form control. `aria-labelledby`
     * is what gives the switch its name, and the hint is joined to it so a screen reader hears the
     * qualification rather than just the noun.
     */
    const labelId = useId()
    const hintId = `${labelId}-hint`

    return (
        <div className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 flex-col">
                <span id={labelId} className="type-dense-default text-(--text-title)">
                    {label}
                </span>
                {hint ? (
                    <span id={hintId} className="type-caption-meta text-(--text-placeholder)">
                        {hint}
                    </span>
                ) : null}
            </span>
            <Toggle
                checked={checked}
                disabled={disabled}
                onCheckedChange={onChange}
                aria-labelledby={hint ? `${labelId} ${hintId}` : labelId}
                data-testid={testId}
                className="flex-none"
            />
        </div>
    )
}
