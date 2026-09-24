'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Icon } from '@shared/ui/icon'
import { Radio } from '@shared/ui/radio'
import { Toggle } from '@shared/ui/toggle'
import { useId } from 'react'
import type { PostDraft } from '../lib/post-draft'
import { STAR_PRICE_MAX } from '../lib/post-draft'
import { PostCollectionPicker } from './post-collection-picker'

/**
 * The composer's settings screens — **three of them**, because legacy has three dialogs.
 *
 * ## Why three and not one
 *
 * They were collapsed into a single panel at first, on the grounds that they answer the same kind of
 * question. They do not: *Select your audience* decides whether the post is sold, *Who can reply?*
 * is a six-way choice with an explanation each, and *Post settings* is three switches and a notice.
 * Legacy titles them separately, and a creator who knows the app looks for a switch under the
 * heading it lives under.
 *
 * Each is a screen inside the composer's own dialog rather than a modal over it — this app's dialog
 * draws one layer, and `DialogScreenHeader`'s back arrow is the navigation.
 */

/** *Select your audience* — legacy's first dialog. */
export function PostAudienceScreen({
    draft,
    onChange,
    minPrice,
    tiers,
    disabled = false,
    testId,
}: {
    draft: PostDraft
    onChange: (next: Partial<PostDraft>) => void
    minPrice: number
    /** The creator's membership tiers. Empty means the members route cannot be offered. */
    tiers: { id: string; name: string }[]
    disabled?: boolean
    testId?: string
}) {
    const { t } = useTranslation()

    const paidRoute = draft.price !== null
    const memberRoute = draft.requiredPackages.length > 0
    const free = !paidRoute && !memberRoute

    /**
     * Turning a route on or off, and keeping `audience` in step.
     *
     * The audience is never set by a control directly — it is whatever the two routes imply. Legacy
     * has two handlers that each have to remember to consult the other; here the shape that needs
     * remembering (`STARGAZERS` with neither route set, a post only its author can read) cannot
     * arise.
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
        <div data-testid={testId} className="flex flex-col">
            {/*
             * **Free is its own switch**, not the absence of the other two — legacy draws it that
             * way, and it is the difference between "this post is free" as a statement and as a
             * leftover. Turning it on clears both routes; turning it off does nothing, because
             * "not free" is not an instruction until one of the routes below is chosen.
             */}
            <SwitchRow
                label={t('post_audience_free')}
                checked={free}
                disabled={disabled}
                onChange={on => {
                    if (on) setRoutes({ price: null, packages: [] })
                }}
                testId={subTestId(testId, 'option')}
            />

            <Rule />

            <h3 className="type-dense-emphasis pt-3 pb-1 text-(--text-title)">
                {t('post_audience_exclusive')}
            </h3>

            <SwitchRow
                label={t('post_audience_pay_per_post')}
                hint={t('post_audience_pay_per_post_hint')}
                checked={paidRoute}
                disabled={disabled}
                onChange={on => setRoutes({ price: on ? minPrice : null })}
                testId={subTestId(testId, 'item')}
            />

            {paidRoute ? (
                <label className="flex items-center gap-2 pb-3">
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
                             * An empty field is not a price of zero. Clearing it while typing is
                             * ordinary, so it falls back to the floor rather than to a value
                             * `postDraftProblem` would then refuse — the author is mid-edit.
                             */
                            const parsed = Number(event.target.value)
                            setRoutes({
                                price: Number.isFinite(parsed) && parsed > 0 ? parsed : minPrice,
                            })
                        }}
                        className="type-body-default w-28 rounded-(--radius-sm) border border-(--input-border) bg-transparent px-2 py-1 text-(--text-title)"
                    />
                    <Icon name="star" size={16} className="text-(--icon-secondary)" />
                </label>
            ) : null}

            {/*
             * The members route is offered only when there is a tier to require. A creator with no
             * membership would otherwise switch it on and produce a post gated behind an empty tier
             * list — which reaches nobody, and which `buildPostBody` then republishes as public.
             */}
            {tiers.length > 0 ? (
                <SwitchRow
                    label={t('post_audience_members')}
                    hint={t('post_audience_members_hint')}
                    checked={memberRoute}
                    disabled={disabled}
                    onChange={on => setRoutes({ packages: on && tiers[0] ? [tiers[0].id] : [] })}
                    testId={subTestId(testId, 'affix')}
                />
            ) : null}
        </div>
    )
}

/** *Who can reply?* — legacy's second dialog: a subtitle and six explained choices. */
export function PostReplyAudienceScreen({
    draft,
    onChange,
    disabled = false,
    testId,
}: {
    draft: PostDraft
    onChange: (next: Partial<PostDraft>) => void
    disabled?: boolean
    testId?: string
}) {
    const { t } = useTranslation()

    return (
        <div data-testid={testId} className="flex flex-col gap-3">
            <p className="type-dense-default text-(--text-subtitle)">
                {t('post_reply_setting_subtitle')}
            </p>

            {REPLY_AUDIENCES.map(audience => (
                // biome-ignore lint/a11y/noLabelWithoutControl: `Radio` renders the `<input type="radio">` this label wraps; the rule cannot see through a component.
                <label
                    key={audience.value}
                    className="flex cursor-pointer items-start gap-2"
                    data-option-value={audience.value}
                >
                    {/*
                     * `as="span"`, because `Radio` defaults to rendering a `<label>` around its own
                     * input — and a label inside a label gives the words to the outer one and the
                     * control to the inner, so pressing the text toggles nothing.
                     */}
                    <Radio
                        as="span"
                        name="post-reply-audience"
                        checked={draft.replyAllowedUser === audience.value}
                        disabled={disabled}
                        onChange={() => onChange({ replyAllowedUser: audience.value })}
                        data-testid={subTestId(testId, 'option')}
                        className="mt-0.5 flex-none"
                    />
                    <span className="flex min-w-0 flex-col">
                        <span className="type-dense-emphasis text-(--text-title)">
                            {t(audience.labelKey)}
                        </span>
                        {/*
                         * Each choice carries its own second line, as legacy's do. *Spaces you
                         * follow* is not self-evident, and a bare list of six would leave the
                         * creator guessing at three of them.
                         */}
                        <span className="type-caption-meta text-(--text-placeholder)">
                            {t(audience.hintKey)}
                        </span>
                    </span>
                </label>
            ))}
        </div>
    )
}

/** *Post settings* — legacy's third dialog: three switches and a notice. */
export function PostSettingsScreen({
    draft,
    onChange,
    disabled = false,
    testId,
}: {
    draft: PostDraft
    onChange: (next: Partial<PostDraft>) => void
    disabled?: boolean
    testId?: string
}) {
    const { t } = useTranslation()

    return (
        <div data-testid={testId} className="flex flex-col">
            <SwitchRow
                label={t('post_settings_reply_links')}
                checked={draft.replyAllowedLink}
                disabled={disabled}
                onChange={on => onChange({ replyAllowedLink: on })}
                testId={subTestId(testId, 'field')}
            />
            <Rule />
            <SwitchRow
                label={t('post_settings_pin')}
                checked={draft.pinned}
                disabled={disabled}
                onChange={on => onChange({ pinned: on })}
                testId={subTestId(testId, 'affix')}
            />
            <Rule />
            <SwitchRow
                label={t('post_settings_nsfw')}
                hint={t('post_settings_nsfw_hint')}
                checked={draft.markedNsfw}
                disabled={disabled}
                onChange={on => onChange({ markedNsfw: on })}
                testId={subTestId(testId, 'reveal')}
            />
            <Rule />

            {/*
             * Not a switch — a **notice**, which is what legacy put here when the setting moved out
             * of the composer. Porting the control instead would offer a per-post override of
             * something the creator now configures once for their whole space, and `buildPostBody`
             * no longer sends the field at all (it says why).
             */}
            <div data-testid={subTestId(testId, 'message')} className="flex flex-col gap-1 py-3">
                <p className="type-dense-emphasis text-(--text-title)">
                    {t('post_settings_paid_interaction_moved')}
                </p>
                <p className="type-caption-meta text-(--text-placeholder)">
                    {t('post_settings_paid_interaction_moved_hint')}
                </p>
            </div>
        </div>
    )
}

/** *Add to a collection* — legacy's `BtnCollection`, opened from the composer's header. */
export function PostCollectionScreen({
    draft,
    onChange,
    disabled = false,
    testId,
}: {
    draft: PostDraft
    onChange: (next: Partial<PostDraft>) => void
    disabled?: boolean
    testId?: string
}) {
    return (
        <PostCollectionPicker
            selected={draft.collectionIds}
            onChange={ids => onChange({ collectionIds: ids })}
            disabled={disabled}
            alwaysOpen
            testId={testId}
        />
    )
}

/**
 * The six reply audiences, in legacy's order, with legacy's own labels.
 *
 * The wording is `useReplySetting`'s — *Paid viewers*, *Mentioned only* — rather than a paraphrase.
 * A creator picking a rule here and a reader meeting it on the post are looking at two sentences
 * about one setting, and the pair only reads as one product if both come from the same source. The
 * values are the wire's, which `lib/who-can-reply.ts` reads back.
 */
const REPLY_AUDIENCES: { value: string; labelKey: string; hintKey: string }[] = [
    {
        value: 'FOLLOWERS',
        labelKey: 'post_reply_option_followers',
        hintKey: 'post_reply_option_followers_hint',
    },
    {
        value: 'PAID_USERS',
        labelKey: 'post_reply_option_paid',
        hintKey: 'post_reply_option_paid_hint',
    },
    {
        value: 'FOLLOWINGS',
        labelKey: 'post_reply_option_followings',
        hintKey: 'post_reply_option_followings_hint',
    },
    {
        value: 'VERIFIED_SPACES',
        labelKey: 'post_reply_option_verified',
        hintKey: 'post_reply_option_verified_hint',
    },
    {
        value: 'MENTIONED_SPACES',
        labelKey: 'post_reply_option_mentioned',
        hintKey: 'post_reply_option_mentioned_hint',
    },
    { value: 'NONE', labelKey: 'post_reply_option_none', hintKey: 'post_reply_option_none_hint' },
]

/** The hairline legacy puts between setting rows (`<Divider/>`). */
function Rule() {
    return <span aria-hidden="true" className="h-px w-full bg-(--separator-default)" />
}

/**
 * A label, an optional second line, and a switch on the trailing edge.
 *
 * A `<div>`, not a `<label>`: `Toggle` is a `role="switch"` **button**, and a label wrapping one
 * labels nothing — the browser only associates a label with a form control. `aria-labelledby` is
 * what names the switch, and the hint is joined to it so a screen reader hears the qualification.
 */
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
    const labelId = useId()
    const hintId = `${labelId}-hint`

    return (
        <div className="flex items-start justify-between gap-3 py-3">
            <span className="flex min-w-0 flex-col gap-1">
                <span id={labelId} className="type-body-strong text-(--text-title)">
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
                className="mt-0.5 flex-none"
            />
        </div>
    )
}
