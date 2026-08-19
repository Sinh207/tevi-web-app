'use client'

import { SPACE_VISIBILITY_OPTIONS, SpaceVisibilityOption } from '@features/channel'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Radio } from '@shared/ui/radio'
import { notFound } from 'next/navigation'
import { useId, useState } from 'react'

/**
 * Dev-only preview of the Space visibility picker: `pnpm dev`, then `/dev/space-visibility`.
 * 404s in production.
 *
 * It exists because three of the card's four states are otherwise unreachable in a browser:
 * `current` needs a signed-in account with a space, `busy` lasts as long as one request, and
 * `softDisabled` lasts exactly as long as `busy`. The real screen is
 * `/settings/space-visibility`; this one only renders the card and the primitive under it.
 *
 * Same convention, and the same reason, as `/dev/left-bar` and `/dev/identification`.
 */
export default function SpaceVisibilityDevPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    const { t } = useTranslation()
    const live = useId()
    const frozen = useId()
    const [selected, setSelected] = useState(SPACE_VISIBILITY_OPTIONS[0].value)
    /* The real screen's two-state confirm wiring, reproduced so the *exit* can be looked at:
       `confirming` deliberately outlives `confirmOpen`, or the sentence and the red button
       would vanish while the dialog is still fading out. */
    const [confirming, setConfirming] = useState<'protected' | 'unpublished'>('unpublished')
    const [confirmOpen, setConfirmOpen] = useState(false)

    return (
        <main className="flex flex-col gap-8 p-6">
            <header className="flex max-w-2xl flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Space visibility</h1>
                <p className="type-dense-default text-(--text-body)">
                    The picker from{' '}
                    <code className="type-dense-emphasis">/settings/space-visibility</code>. The
                    group below is live — click a card, or tab into it and use the arrow keys, which
                    is the native radio-group behaviour the card gets for free by being a{' '}
                    <code className="type-dense-emphasis">label</code> over a real{' '}
                    <code className="type-dense-emphasis">input[type=radio]</code>.
                </p>
                <ul className="type-caption-meta flex list-disc flex-col gap-1 ps-5 text-(--text-body)">
                    <li>
                        <code>Radio</code> is a fresh port of the <code>.tevi-radio</code> half of
                        Figma 48:10447. Its 8px dot is the one value not read off the stylesheet —{' '}
                        <code>components.css</code> is over the DesignSync 256&nbsp;KiB cap, and the
                        DS exposes no class for the mark.
                    </li>
                    <li>
                        Tiles are green → amber → grey, an escalation of closedness. None of them is
                        Indigo, which is the selection colour on this screen.
                    </li>
                    <li>
                        Toggle the theme and the direction (an Arabic locale) — the card is tokens
                        and logical properties throughout.
                    </li>
                </ul>
            </header>

            <section className="flex max-w-[612px] flex-col gap-3">
                <h2 className="type-subheading-strong text-(--text-title)">Live group</h2>
                {SPACE_VISIBILITY_OPTIONS.map((option, index) => (
                    <SpaceVisibilityOption
                        key={option.value}
                        option={option}
                        name={live}
                        id={`${live}-${option.value}`}
                        label={t(option.titleKey)}
                        body={t(option.bodyKey)}
                        bullets={option.bulletKeys.map(key => t(key))}
                        checked={selected === option.value}
                        current={selected === option.value}
                        currentLabel={t('space_visibility_current')}
                        busy={false}
                        softDisabled={false}
                        onSelect={() => setSelected(option.value)}
                        className={RISE}
                        style={riseDelay(index)}
                    />
                ))}
            </section>

            <section className="flex max-w-[612px] flex-col gap-3">
                <h2 className="type-subheading-strong text-(--text-title)">
                    Mid-write — one card saving, the rest locked
                </h2>
                <p className="type-caption-meta text-(--text-body)">
                    The selection has already moved (the write is optimistic), so the loader is
                    reporting whether it has <em>landed</em>, not whether it is selected. The other
                    cards are <code>aria-disabled</code>, never <code>disabled</code> — the latter
                    would blur the control that was just pressed.
                </p>
                {SPACE_VISIBILITY_OPTIONS.map(option => (
                    <SpaceVisibilityOption
                        key={option.value}
                        option={option}
                        name={frozen}
                        id={`${frozen}-${option.value}`}
                        label={t(option.titleKey)}
                        body={t(option.bodyKey)}
                        bullets={option.bulletKeys.map(key => t(key))}
                        checked={option.value === 'protected'}
                        current={option.value === 'protected'}
                        currentLabel={t('space_visibility_current')}
                        busy={option.value === 'protected'}
                        softDisabled
                        onSelect={() => {}}
                    />
                ))}
            </section>

            <section className="flex max-w-[612px] flex-col gap-3">
                <h2 className="type-subheading-strong text-(--text-title)">
                    Confirm dialog — and its exit
                </h2>
                <p className="type-caption-meta text-(--text-body)">
                    Only the two directions that take something away are confirmed; only
                    unpublishing gets the red button, because it is the one that stops memberships
                    auto-renewing. Close it and watch the fade: the sentence and the button colour
                    must still be there all the way out.
                </p>
                <div className="flex gap-2">
                    {(['protected', 'unpublished'] as const).map(value => (
                        <Button
                            key={value}
                            variant="secondary"
                            size="medium"
                            data-testid={`open-${value}`}
                            onClick={() => {
                                setConfirming(value)
                                setConfirmOpen(true)
                            }}
                        >
                            {value}
                        </Button>
                    ))}
                </div>
                <ConfirmDialog
                    open={confirmOpen}
                    onOpenChange={open => {
                        if (!open) setConfirmOpen(false)
                    }}
                    title={t('space_visibility_confirm_title')}
                    description={t(`space_visibility_confirm_${confirming}`)}
                    confirmLabel={t('common_confirm')}
                    cancelLabel={t('common_close')}
                    destructive={confirming === 'unpublished'}
                    onConfirm={() => setConfirmOpen(false)}
                />
            </section>

            <section className="flex max-w-[612px] flex-col gap-4">
                <h2 className="type-subheading-strong text-(--text-title)">
                    Radio — every state the DS draws
                </h2>
                <div className="flex flex-col gap-3">
                    {(
                        [
                            ['default', {}],
                            ['checked', { defaultChecked: true }],
                            ['disabled', { disabled: true }],
                            ['checked + disabled', { defaultChecked: true, disabled: true }],
                        ] as const
                    ).map(([label, props]) => (
                        <div key={label} className="flex items-center gap-4">
                            <span className="type-caption-meta w-[160px] text-(--text-body)">
                                {label}
                            </span>
                            {/* Each row is its own `name`, so they do not fight over one
                                selection — the DS preview does the same. */}
                            <Radio name={`state-${label}`} {...props} />
                        </div>
                    ))}
                </div>
            </section>
        </main>
    )
}
