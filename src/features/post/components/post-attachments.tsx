'use client'

import { useCurrency } from '@features/balance'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatFiatAmount } from '@shared/lib/money'
import { safeExternalUrl } from '@shared/lib/safe-url'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import type { Post } from '../api/types'

/**
 * The three blocks that hang under a post's body: the mini-app banner, the affiliate card, and the
 * creator's own earnings strip.
 *
 * ## Why one file
 *
 * They are the same object drawn three times — a 40/48px mark, two lines of text, a trailing
 * control, one shadowed card — and legacy has them as three components with three copies of the
 * same nine style properties (`miniApp`, `affiliateProgram`, ` postInsights`, that leading space in
 * the directory name included). Here the shell is `AttachmentCard` and the three differ only in
 * what they put in it. A fourth block lands as a fourth caller, not a fourth copy.
 *
 * They also share the condition that decides whether any of them is drawn at all: legacy gates the
 * first two on `typePost ∈ {POST_HOME, POST_DETAIL}` — they are for the feed and the detail page,
 * never for a slider or a DM embed — which is the `attachments` prop on `PostCard`.
 */

/**
 * The shared shell: a row, a card, a shadow.
 *
 * `shadow-md` from the DS ramp rather than legacy's literal
 * `0px -2px 4px -2px rgba(24,24,27,0.06), 0px 4px 8px -2px rgba(24,24,27,0.1)` — that is
 * `--elevation-md`'s own value, and the token flips with the theme where the literal does not
 * (`docs/DESIGN_SYSTEM.md`). Legacy's `bgcolor: '#FFFFFF'` becomes `--background-surface` for the
 * same reason: a white card on a dark page is the one thing a literal guarantees.
 */
function AttachmentCard({ children, testId }: { children: React.ReactNode; testId?: string }) {
    return (
        <div
            data-testid={testId}
            className="flex min-w-0 items-center gap-2 overflow-hidden rounded-[12px] bg-(--background-surface) px-3 py-2.5 shadow-md md:gap-3 md:rounded-[16px] md:px-4 md:py-3"
        >
            {children}
        </div>
    )
}

/**
 * "This space is a mini app" — legacy's `posts/common/miniApp`.
 *
 * ## Opening it is the **caller's** callback, not an import
 *
 * The obvious version calls `useMiniApp().open(...)` from `@features/mini-app`. It cannot: that
 * feature imports `@features/channel`, and `features/channel` is the feature that will import this
 * one — `post → mini-app → channel → post` is a barrel cycle, which ESM resolves by handing one
 * side a half-initialised module and which therefore fails at *render* time rather than at build
 * time (`CLAUDE.md` describes the same trap for `channel/routes.ts`).
 *
 * So the banner is rendered here and the press is handed up, exactly as `onShare` is. Both of those
 * props belong to surfaces above this feature — `app/` and `features/channel` may import
 * `features/mini-app` freely — and a card mounted without the callback simply draws no banner,
 * rather than one that opens nothing.
 *
 * ## All three fields, or nothing
 *
 * Legacy's gate is `has_mini_app && mini_app_url && mini_app_id`, and each conjunct earns its
 * place: the flag with no URL is a button that opens nothing, and a URL with no id cannot be
 * resumed or reported. The URL is additionally run through `safeExternalUrl`, because it ends up as
 * an `iframe src` — the one sink where `javascript:` executes as us with no click to intercept
 * (`docs/MINI_APP.md` §6). Vetting it here means a malformed row never reaches the opener.
 */
/**
 * What the opener is handed — deliberately the exact shape `features/mini-app`'s `open()` takes.
 *
 * Declared here rather than imported from that feature for the cycle reason above, and kept
 * field-for-field identical so a caller can pass it straight through. A drift between the two
 * surfaces as a **type error at the call site**, which is the only place that can see both.
 */
export interface PostMiniAppApp {
    id: string
    name: string
    url: string
    iconUrl: string
    shareableUrl: string
}

export function PostMiniAppBanner({
    post,
    onOpen,
    testId,
}: {
    post: Post
    onOpen?: (app: PostMiniAppApp) => void
    testId?: string
}) {
    const { t } = useTranslation()
    const channel = post.channel

    const url = channel?.mini_app_url ? safeExternalUrl(channel.mini_app_url) : null
    const appId = channel?.mini_app_id
    if (!onOpen || !channel?.has_mini_app || !url || !appId) return null

    const name = channel.name ?? t('post_mini_app_fallback_name')

    return (
        <AttachmentCard testId={testId}>
            <AnimatedAvatar
                size="large"
                thumb={channel.images?.thumb ?? null}
                avatarVideo={channel.images?.avatar_video ?? null}
                isPremium={channel.is_premium}
                alt=""
                className="flex-none"
            />
            <span className="flex min-w-0 flex-1 flex-col justify-center">
                {channel.description ? (
                    <span className="type-caption-meta truncate text-(--text-placeholder)">
                        {channel.description}
                    </span>
                ) : null}
                <span className="type-body-emphasis truncate text-(--text-title)">{name}</span>
            </span>
            <Button
                variant="accent"
                size="small"
                data-testid={subTestId(testId, 'trigger')}
                onClick={() =>
                    onOpen({
                        id: appId,
                        name,
                        url,
                        iconUrl: channel.images?.thumb ?? '',
                        shareableUrl: channel.shareable_url ?? '',
                    })
                }
            >
                <span className="flex items-center gap-1">
                    {/* `grid-square` for legacy's `WidgetsRoundedIcon` — the sprite draws no
                        "widgets" glyph and this is the nearest thing that means "an app". */}
                    <Icon name="grid-square" size={16} />
                    {t('post_mini_app_open')}
                </span>
            </Button>
        </AttachmentCard>
    )
}

/**
 * The affiliate program a space is promoting — legacy's `posts/common/affiliateProgram`.
 *
 * `channel.promote.referral_url` is the only field it cannot render without; the name and icon
 * decorate it. The link is **external and vetted**, opens in a new tab, and carries
 * `rel="noopener noreferrer"` — a referral URL is a third party's and `window.opener` is how a
 * newly opened tab reaches back into this one.
 *
 * No feature import: this is a link, so `features/affiliate` (which owns the dialog and the
 * programs list) has nothing this card needs.
 */
export function PostAffiliateCard({ post, testId }: { post: Post; testId?: string }) {
    const { t } = useTranslation()
    const promote = post.channel?.promote

    const href = promote?.referral_url ? safeExternalUrl(promote.referral_url) : null
    if (!href) return null

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={subTestId(testId, 'trigger')}
            onClick={event => event.stopPropagation()}
        >
            <AttachmentCard testId={testId}>
                {promote?.app_icon_url ? (
                    <Image
                        src={promote.app_icon_url}
                        alt=""
                        width={48}
                        height={48}
                        className="size-10 flex-none rounded-full object-cover md:size-12"
                    />
                ) : (
                    <span className="flex size-10 flex-none items-center justify-center rounded-full bg-(--background-segment) md:size-12">
                        <Icon name="grid-square" size={20} className="text-(--icon-secondary)" />
                    </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col justify-center">
                    <span className="type-caption-meta truncate text-(--text-placeholder)">
                        {t('post_affiliate_recommended')}
                    </span>
                    <span className="type-body-emphasis truncate text-(--text-title)">
                        {promote?.app_name ?? ''}
                    </span>
                </span>
                {/*
                 * A `span` styled as a button, not a `<Button>`: the whole card is already an
                 * anchor, and a button inside an anchor is invalid markup that browsers resolve by
                 * breaking one of the two.
                 */}
                <span className="type-dense-emphasis flex flex-none items-center gap-1 rounded-[12px] bg-(--button-accent-bg) px-3 py-2 text-(--button-accent-text)">
                    <Icon name="grid-square" size={16} />
                    {t('post_affiliate_visit')}
                </span>
            </AttachmentCard>
        </a>
    )
}

/**
 * What the post has earned — legacy's ` postInsights`, and it is **only ever the author's**.
 *
 * ## Two conditions, and the second is the interesting one
 *
 * `_insights` present, **and** a revenue above zero. Legacy returns `null` on
 * `post_total_revenue === 0`, which is right: a creator scrolling their own feed does not want an
 * "Earnings: $0.00" strip under every post they have ever written. It is a highlight, not a field.
 *
 * ## The figure is money and goes through the reader's currency
 *
 * Not `formatStarAmount`. `post_total_revenue` is earnings, so it is multiplied by the rate the
 * reader has chosen and printed in their currency — the same `useCurrency` the wallet uses. That is
 * why this component reaches `@features/balance`: it is the feature that owns the rate, it imports
 * only `auth` and `realtime`, and nothing below it could answer the question.
 *
 * `isRateKnown` gates the strip rather than being papered over with the hook's fallback rate of `1`:
 * a revenue printed at an assumed exchange rate is a wrong number that looks exactly like a right
 * one. `useCurrency` deliberately falls back to `1` for the *wallet*, where an unconverted figure
 * beats no figure at all — here there is no such pressure, because the strip is an extra.
 */
export function PostInsights({ post, testId }: { post: Post; testId?: string }) {
    const { t, currentLanguage } = useTranslation()
    const { currency, rate, isRateKnown } = useCurrency()

    const revenue = post._insights?.post_total_revenue ?? 0
    if (!post.is_owner || revenue <= 0 || !isRateKnown || !currency) return null

    return (
        <div
            data-testid={testId}
            className="flex h-10 min-w-0 items-center justify-between rounded-[12px] bg-(--background-segment) px-3 md:px-6"
        >
            <span className="type-dense-emphasis text-(--text-title)">
                {t('post_insights_earnings')}
            </span>
            <span
                data-testid={subTestId(testId, 'label-data')}
                className="type-dense-strong tabular-nums text-(--text-title)"
            >
                {formatFiatAmount(revenue * rate, currency, currentLanguage)}
            </span>
        </div>
    )
}
