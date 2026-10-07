'use client'

import { useRequireAuth } from '@features/auth'
import { openPostComposer } from '@features/post'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import Link from 'next/link'
import { toChannelPath } from '../lib/channel-slug'
import { useMyChannel } from '../providers/my-channel-provider'

/**
 * *What's new?* — the bar at the top of the home feed and of your own space's Posts tab, which is
 * legacy's `WhatNew` (`containers/home/components/posts/whatNew`, and its twin under the creator's
 * `tabs/post/common/whatNew`). Your avatar, a grey prompt, and a purple *Post*; a press anywhere but
 * the avatar opens the composer.
 *
 * ## Two buttons, not a clickable row
 *
 * Legacy puts `onClick` on the whole `Stack` and a `Button` inside it, so the visible *Post* is a
 * button nested in a click target — one press, two handlers, and a keyboard user can reach only the
 * inner one. Here the prompt **is** a button (it fills the row's middle, so the hit area is the
 * same) and *Post* is the other. Both open the same composer.
 *
 * ## The composer is reached through its store
 *
 * `openPostComposer`, not a dialog rendered here: the composer is mounted **once** by the session
 * stack (`app/post-composer-host.tsx`), because the rail's `+` and the tab bar's FAB already open it
 * and a second mount would be a second dialog. Legacy mounts a `PostForm` per bar.
 *
 * ## A guest is asked to sign in at the press
 *
 * Legacy's home bar does the same (`openDialog('login')`). The bar is drawn for everybody — on home
 * it is the feed's own invitation to post, and hiding it from a guest hides the reason to sign in.
 * With no space yet the avatar is initials and not a link; there is nowhere to go.
 *
 * Geometry is legacy's: `12px` / `12px 24px` around the row, a 40px avatar 4px from the prompt,
 * 14/400 placeholder ink. *Post* is the DS button rather than legacy's hand-sized 29px pill:
 * `accent`, which is `--primary-500` — legacy's `#501BC0` exactly — at `small` (28px). Not
 * `primary`, which in this DS is the black button.
 */
export function WhatsNewBar({
    className,
    testId = 'channel-composer',
}: {
    className?: string
    testId?: string
}) {
    const { t } = useTranslation()
    const requireAuth = useRequireAuth()
    const { myChannel, isPremium } = useMyChannel()

    const open = requireAuth(() => openPostComposer())
    const name = myChannel?.name?.trim() || myChannel?.slug || ''
    const avatar = (
        <AnimatedAvatar
            size="medium"
            thumb={myChannel?.images?.thumb ?? null}
            avatarVideo={myChannel?.images?.avatar_video ?? null}
            isPremium={isPremium}
            alt={name}
            initials={name ? name.slice(0, 2).toUpperCase() : undefined}
            className="flex-none"
        />
    )

    return (
        <div
            data-testid={testId}
            className={cn(
                'flex min-w-0 items-center gap-1 bg-(--background-surface) px-3 py-3 md:px-6',
                className,
            )}
        >
            {myChannel?.slug ? (
                <Link
                    href={toChannelPath(myChannel.slug)}
                    aria-label={name}
                    className="flex-none rounded-full"
                >
                    {avatar}
                </Link>
            ) : (
                avatar
            )}
            <button
                type="button"
                onClick={open}
                data-testid={subTestId(testId, 'trigger')}
                className="min-w-0 flex-1 cursor-pointer self-stretch truncate text-start type-dense-default text-(--text-placeholder)"
            >
                {t('channel_whats_new')}
            </button>
            <Button
                variant="accent"
                size="small"
                onClick={open}
                data-testid={subTestId(testId, 'submit')}
                className="flex-none"
            >
                {t('post_create_submit')}
            </Button>
        </div>
    )
}
