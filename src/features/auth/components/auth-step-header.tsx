'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'

/**
 * The title bar of a step that took the auth card over — email sign-in, password reset.
 *
 * Every such step needs the same two things and needs them to look the same: a way back
 * to where it was opened from, and a heading saying where "here" is. The back control is
 * what makes taking the card over safe rather than a trap; a step without one is a dead
 * end on a page whose whole job is to let someone in.
 */
export function AuthStepHeader({ title, onBack }: { title: string; onBack: () => void }) {
    const { t } = useTranslation()

    return (
        <div className="flex w-full items-center gap-2">
            <button
                type="button"
                onClick={onBack}
                aria-label={t('common_back')}
                className="-ms-2 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-title transition-colors hover:bg-background-subtle"
            >
                {/* Flips with the document direction, unlike a hardcoded left arrow. */}
                <Icon name="angle-left" size={20} className="rtl:rotate-180" />
            </button>
            <h2 className="type-title-t2-semibold text-text-title">{title}</h2>
        </div>
    )
}
