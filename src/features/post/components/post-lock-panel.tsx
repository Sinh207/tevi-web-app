'use client'

import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import Image from 'next/image'
import type { Post } from '../api/types'
import { postGate } from '../lib/post-access'
import { postUnlockPrice } from '../lib/post-intent'
import { formatDurationPadded, lockCoverAspectRatio } from '../lib/post-media'
import { LockIcon, LockMediaIcon } from './legacy-icons'

/**
 * What a locked post shows instead of its body — legacy's paywall, ported.
 *
 * ## It is a picture, not a notice
 *
 * The shape matters more than it looks like it should. A locked post is **the creator's cover image
 * at full width**, blurred when `cover_image.blur` says so, with a black pill centred on it naming
 * the price and a second pill in the bottom corner saying what is behind it. A grey box with a
 * padlock — which is what a "tidier" version becomes — sells nothing, and selling is the entire
 * function of this surface.
 *
 * The blur is the **backend's** instruction, not a decision here: a creator picks whether their
 * cover is safe to show sharp, and a client that blurred everything would throw that away.
 *
 * ## The class name is load-bearing
 *
 * `tevi-paywall` is referenced by the post page's Article schema as its paywall `cssSelector`, which
 * is how a search engine is told this content is gated rather than cloaked. Renaming it silently
 * turns the page into something that looks like it serves crawlers different content than readers.
 *
 * ## A bug carried over on purpose
 *
 * Legacy's "Unlock for" string has no `[%s]` placeholder in its fallback, so its `.replace()` finds
 * nothing and **the price never appears** on the purchase-only branch. Here the price is a real
 * interpolation and does appear — the one place this port does not reproduce legacy, because
 * reproducing it would mean shipping a button that names no price.
 */
export function PostLockPanel({
    post,
    onPress,
    testId,
}: {
    post: Post
    /**
     * What the press opens — `usePostUnlock`'s gated `press`.
     *
     * Optional, and its absence is what makes the panel a **picture** rather than a dead button:
     * the harness and any read-only surface render it without one, and a panel with no handler is
     * not focusable and not announced as a control. Legacy has no such distinction and its paywall
     * is always clickable, including in previews where nothing happens.
     */
    onPress?: () => void
    testId?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const gate = postGate(post)
    const cover = post.cover_image
    const coverSrc = cover?.uri ?? cover?.thumb ?? null
    const detail = post.unlock_detail
    /*
     * The **same** price the flow will charge, not `post.price` — `postUnlockPrice` rejects `0` and
     * a missing value, and reading the raw field here is how the pill came to say "Unlock for 0" on
     * a post whose confirmation dialog then refused to open. A surface that names a price the flow
     * will not take is worse than one that names none.
     */
    const price = postUnlockPrice(post)

    const priceText = price === null ? '' : new Intl.NumberFormat(currentLanguage).format(price)

    const label =
        gate === 'members'
            ? t('post_lock_become_member')
            : price === null
              ? /*
                 * Gated, and the payload carries no usable price. Legacy prints its
                 * placeholder-less string here and the reader sees "Unlock for" with nothing after
                 * it; this says the one true thing instead, and the press still opens whatever route
                 * `postIntent` found.
                 */
                t('post_lock_unlock')
              : gate === 'members-or-purchase'
                ? t('post_lock_member_or_price', { price: priceText })
                : t('post_lock_unlock_for', { price: priceText })

    /**
     * One clause, in legacy's order: images, else video, else text. Not a list — the pill is a
     * single line and a post with four images and a clip says "4", because that is the thing the
     * reader is most likely buying.
     */
    const media: { kind: 'images' | 'video' | 'text'; text: string } | null =
        detail && detail.images_count > 0
            ? { kind: 'images', text: String(detail.images_count) }
            : detail && (detail.video_duration_seconds ?? 0) > 0
              ? {
                    kind: 'video',
                    text: formatDurationPadded(detail.video_duration_seconds) ?? '',
                }
              : detail && detail.text_length > 0
                ? { kind: 'text', text: t('post_lock_text_only') }
                : null

    /*
     * A `button` when it does something and a `div` when it does not — not a `div` with a handler.
     * The whole surface is the call to action, so it has to be reachable by keyboard and announced
     * as pressable; `aria-label` carries the same sentence the pill prints, because the pill is
     * inside the button and a screen reader would otherwise read the price twice.
     */
    const Frame = onPress ? 'button' : 'div'

    return (
        <Frame
            {...(onPress ? { type: 'button' as const, onClick: onPress, 'aria-label': label } : {})}
            data-testid={testId}
            className="tevi-paywall relative w-full overflow-hidden rounded-[8px] bg-(--background-segment)"
            style={{
                aspectRatio: lockCoverAspectRatio(cover, detail?.video_duration_seconds ?? null),
            }}
        >
            {coverSrc ? (
                <Image
                    src={coverSrc}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="object-cover"
                    style={{ filter: cover?.blur ? 'blur(10px)' : undefined }}
                />
            ) : null}

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                {/*
                 * Lock, label, star — in that order and **all three unconditionally**, which is
                 * legacy's `LockTag`. The star is there even on the members-only variant that names
                 * no price: the pill's job is to say "this costs something", and the mark is half of
                 * how it says it.
                 */}
                <LockPill testId={subTestId(testId, 'title')}>
                    <LockIcon size={16} />
                    <span className="type-caption-label-strong">{label}</span>
                    <StarMark size={16} />
                </LockPill>
            </div>

            {media ? (
                <div className="pointer-events-none absolute bottom-0 start-0 p-4">
                    <LockPill testId={subTestId(testId, 'label')}>
                        <LockMediaIcon kind={media.kind} size={16} />
                        <span className="type-caption-label-strong">{media.text}</span>
                    </LockPill>
                </div>
            ) : null}
        </Frame>
    )
}

/**
 * The pill both overlays use: `rgba(0,0,0,0.6)`, a 40px radius and a half-opacity white hairline.
 *
 * Fixed black rather than a token, and deliberately: it sits on **an arbitrary photograph**, so it
 * has to be legible against whatever the creator uploaded rather than against the page. A
 * theme-aware surface would go light in light mode and vanish on a bright cover.
 */
function LockPill({ children, testId }: { children: React.ReactNode; testId?: string }) {
    return (
        <span
            data-testid={testId}
            className="flex w-max items-center gap-1 rounded-[40px] border border-white/50 bg-black/60 px-2 py-1 text-white"
        >
            {children}
        </span>
    )
}
