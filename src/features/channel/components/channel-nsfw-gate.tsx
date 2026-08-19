'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import type { Channel } from '../api/types'
import { CHANNEL_PADDING } from '../lib/container'

/**
 * The sensitive-content gate — a **your-space** surface, never shown to an owner.
 *
 * ## Legacy does have one, and an earlier version of this file said it did not
 *
 * The claim was that legacy only has a *label* — `viewer/.../info/nsfw`, a CDN glyph beside the
 * untranslated string `"NSFW"`. That label is real, and it is not the gate: legacy also ships
 * `components/nsfw/sensitiveContent`, a Dialog with a red 48px warning mark, and its own `vs_nsfw_*`
 * key namespace. The copy here is now lifted from it rather than invented, and the difference is not
 * cosmetic:
 *
 * - It is an **age confirmation** ("Yes, I'm over 18 years old"), not a "show anyway". That is a legal
 *   affordance, and the wording is the affordance.
 * - Its body asks the reader to *confirm* they are 18, rather than describing the content.
 * - It carries a **"Disable filtering"** checkbox writing `nsfw_settings.show_sensitive` — a global
 *   preference. That half is not reproduced here: it is a settings write, and the settings screen owns
 *   it. What *is* wired is honouring it — see `channel-view.tsx`, which passes it alongside the
 *   per-channel consent, so someone who has already turned filtering off is never gated.
 *
 * Still a section rather than a Dialog, deliberately: this one needs no JavaScript to be correct (see
 * below), and the DS has no interstitial pattern to port. If product wants legacy's dialog shape, the
 * DS-backed route is `Sheet/Bottom Sheet data-type="alert"` through the ported `Dialog`.
 *
 * ## Blurred on the server, not after hydration
 *
 * `blur-2xl` on the wrapper needs no JavaScript, so the very first paint is already obscured. The
 * alternative — deciding client-side — shows a frame of unblurred cover to everyone, which is the
 * one thing a sensitive-content gate must not do.
 */
export function ChannelNsfwGate({
    channel,
    onConfirm,
}: {
    channel: Channel
    onConfirm: () => void
}) {
    const { t } = useTranslation()
    const cover = channel.images.cover
    const thumb = channel.images.thumb

    return (
        <section className="relative flex min-w-0 flex-col overflow-hidden rounded-none md:rounded-t-[var(--radius-xl)] md:bg-(--background-surface)">
            {/* The real art, heavily blurred — enough context to know whose space this is, not
                enough to be the content. `aria-hidden` because a blurred image conveys nothing to a
                screen reader; the explanation below carries the meaning. */}
            <div aria-hidden="true" className="pointer-events-none select-none">
                {cover ? (
                    <div className="relative aspect-[402/140] w-full overflow-hidden">
                        <Image
                            src={cover}
                            alt=""
                            fill
                            // Low quality on purpose: it is about to be blurred beyond recognition,
                            // so shipping full-resolution art would be bytes spent on nothing —
                            // and bytes of exactly the content being withheld.
                            quality={10}
                            sizes="64px"
                            className="scale-110 object-cover blur-2xl"
                        />
                    </div>
                ) : (
                    <div className="aspect-[402/140] w-full bg-(--background-segment)" />
                )}
            </div>

            <div className={CHANNEL_PADDING}>
                <div className="flex flex-col items-center gap-4 py-6 text-center">
                    {thumb ? (
                        <div
                            aria-hidden="true"
                            className="relative size-20 overflow-hidden rounded-[var(--radius-fill)]"
                        >
                            <Image
                                src={thumb}
                                alt=""
                                fill
                                quality={10}
                                sizes="64px"
                                className="object-cover blur-lg"
                            />
                        </div>
                    ) : null}

                    <Icon
                        name="nsfw"
                        size={32}
                        className="text-(--accents-warning-active)"
                        title={t('channel_nsfw')}
                    />

                    <div className="flex max-w-[420px] flex-col gap-1">
                        <p className="type-body-emphasis text-(--text-title)">
                            {t('channel_nsfw_gate_title')}
                        </p>
                        <p className="type-dense-default text-(--text-subtitle)">
                            {t('channel_nsfw_gate_body')}
                        </p>
                    </div>

                    {/*
                     * Consent is per channel and per account, persisted through
                     * `lib/nsfw-consent.ts` — so agreeing once here does not agree to every other
                     * creator's, and one account's answer is not another's.
                     */}
                    <Button variant="secondary" size="large" onClick={onConfirm}>
                        {t('channel_nsfw_gate_confirm')}
                    </Button>
                </div>
            </div>
        </section>
    )
}
