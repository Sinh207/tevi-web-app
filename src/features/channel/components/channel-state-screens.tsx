'use client'

import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import type { TeviIconName } from '@shared/ui/icon-names'
import Link from 'next/link'
import type { Channel } from '../api/types'
import { useChannelActions } from '../hooks/use-channel-actions'
import type { ChannelVisibility } from '../lib/channel-flags'
import { CHANNEL_PADDING } from '../lib/container'
import { ChannelNsfwGate } from './channel-nsfw-gate'

/**
 * Every wall the channel page can put up, and the NSFW gate.
 *
 * ## Identity, then an explanation, then nothing
 *
 * A terminal state shows the avatar and the name and says why you cannot see the rest. It does
 * **not** show the cover, the stats, the bio, the socials or the tabs. Legacy expresses the same
 * intent as two independently-computed booleans (`isShowChannelStats` and `isShowSecondaryData`)
 * checked in different places, which is how they came to disagree; here `channelVisibility` has
 * already decided and this component only renders the answer.
 *
 * ## Illustrations are deliberately absent
 *
 * Legacy has two CDN images (unpublished 240×140, suspended 224×140) and two hand-drawn inline SVGs
 * (protected 67×105, blocked 142×177). The DS has none of them — its `__illustration` is a slot.
 * Pasting 177 lines of path data into this repo creates an un-versioned copy with no source, so the
 * sprite glyph carries the state until Brand publishes the set to the CDN. Named in the plan as a
 * design dependency rather than quietly approximated.
 */
export function ChannelStateScreen({
    channel,
    visibility,
    onConfirmNsfw,
}: {
    channel: Channel
    visibility: ChannelVisibility
    onConfirmNsfw: () => void
}) {
    if (visibility.kind === 'nsfw') {
        return <ChannelNsfwGate channel={channel} onConfirm={onConfirmNsfw} />
    }
    return <TerminalScreen channel={channel} visibility={visibility} />
}

function TerminalScreen({
    channel,
    visibility,
}: {
    channel: Channel
    visibility: ChannelVisibility
}) {
    const { t } = useTranslation()
    const { unblock, follow } = useChannelActions(channel)

    /**
     * Every wall here is a **your-space** surface: legacy keeps them under its `vs_*` namespace, and
     * `channelVisibility` short-circuits all of them for an owner, so none can ever be shown to the
     * person whose space it is. That is why three of them address the creator in the third person and
     * interpolate their name — copy an owner would never read.
     *
     * The strings are legacy's own, not paraphrases of them. An earlier version of this file invented
     * all five, which lost both the wording and the name: "You cannot view this space" where legacy
     * says "@ada has blocked you", and "This space is private" where legacy explains *how* to get in
     * ("Only confirmed followers have access to ada's contents… Tap the 'Follow' button to send a
     * follow request"). The second is not a nicer sentence, it is the only one that tells the reader
     * what to do.
     */
    const name = channel.name ?? channel.slug
    const copy: Record<string, { icon: TeviIconName; title: string; body: string }> = {
        suspended: {
            icon: 'ban',
            title: t('channel_state_suspended_title'),
            body: t('channel_state_suspended_body'),
        },
        'blocked-by': {
            icon: 'ban',
            title: t('channel_state_blocked_by_title', { name }),
            body: t('channel_state_blocked_by_body'),
        },
        blocking: {
            icon: 'ban',
            title: t('channel_state_blocking_title', { name }),
            body: t('channel_state_blocking_body'),
        },
        unpublished: {
            icon: 'lock-simple',
            title: t('channel_state_unpublished_viewer_body'),
            body: '',
        },
        protected: {
            icon: 'lock-simple',
            title: t('channel_state_protected_title'),
            body: t('channel_state_protected_body', { name }),
        },
    }

    const state = copy[visibility.kind]
    if (!state) return null

    return (
        <section
            className={cn(
                'flex min-w-0 flex-col items-center gap-6 text-center',
                CHANNEL_PADDING,
                'py-10',
            )}
        >
            {/*
             * The avatar and name still render: a wall with no identity leaves the visitor unsure
             * they even reached the right URL. Everything past this point is what the wall hides.
             */}
            <div className="flex flex-col items-center gap-3">
                <AnimatedAvatar
                    size="xl"
                    thumb={channel.images.thumb}
                    // Even a Premium creator's clip does not play behind a wall — it would read as
                    // content leaking past the thing that is supposed to be blocking it.
                    isPremium={false}
                    alt={channel.name ?? channel.slug}
                    initials={(channel.name ?? channel.slug).slice(0, 2).toUpperCase()}
                />
                <p className="type-title-t2-bold text-(--text-title)">
                    {channel.name ?? `@${channel.slug}`}
                </p>
            </div>

            <div className="flex max-w-[420px] flex-col items-center gap-2">
                <Icon name={state.icon} size={32} className="text-(--icon-secondary)" />
                <p className="type-body-emphasis text-(--text-title)">{state.title}</p>
                {state.body && (
                    <p className="type-dense-default text-(--text-subtitle)">{state.body}</p>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
                {/* A blocking screen must offer the way out, or it is a dead end the visitor
                    created and cannot undo from the only page that shows it. */}
                {visibility.kind === 'blocking' && (
                    <Button
                        variant="secondary"
                        size="large"
                        onClick={unblock.run}
                        disabled={unblock.isPending}
                    >
                        {t('channel_action_unblock')}
                    </Button>
                )}

                {visibility.kind === 'protected' && (
                    <Button
                        variant={visibility.requested ? 'secondary' : 'primary'}
                        size="large"
                        onClick={follow.run}
                        disabled={follow.isPending || visibility.requested}
                    >
                        <Icon name="user-plus" weight="filled" size={20} />
                        {visibility.requested
                            ? t('channel_action_requested')
                            : t('channel_action_follow')}
                    </Button>
                )}

                {/* Suspended and unpublished have nothing to act on, so the only affordance is
                    leaving — legacy's "Return to home". */}
                {(visibility.kind === 'suspended' || visibility.kind === 'unpublished') && (
                    <Button variant="secondary" size="large" render={<Link href="/" />}>
                        {t('channel_return_home')}
                    </Button>
                )}
            </div>

            {visibility.kind === 'suspended' && (
                <Link
                    href="/community-guidelines"
                    className="type-dense-default text-(--text-link) hover:underline"
                >
                    {t('channel_community_guidelines')}
                </Link>
            )}
        </section>
    )
}
