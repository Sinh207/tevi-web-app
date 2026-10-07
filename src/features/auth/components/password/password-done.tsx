'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { POP, RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import { PasswordStepHeader } from './password-step-header'

/**
 * The end of both flows: the password now exists, or it is a different one.
 *
 * Legacy has this screen for the create flow only (`components/passwordUpdated`) and
 * answers a *change* with a green toast over a blanked form — which is indistinguishable
 * from a form that reset itself, and is the one moment in this feature where a user most
 * wants to be told plainly that it worked.
 *
 * The two modes differ in one sentence each. They are not one string with a variable in it:
 * "created" and "changed" are different events, and several of this app's locales inflect
 * the verb differently from English.
 */
export function PasswordDone({
    mode,
    email,
}: {
    mode: 'created' | 'changed'
    /** The address the password now belongs to, when the account has one. */
    email?: string
}) {
    const { t } = useTranslation()

    return (
        <div className="flex w-full flex-col gap-4 md:gap-6">
            {/* The same header every step of the flow wears, in success green and with the
                mark *landing* rather than rising — see `POP` in `shared/lib/motion.ts`. */}
            <PasswordStepHeader
                icon={{ name: 'check-circle', weight: 'filled' }}
                tone="success"
                markMotion={POP}
                title={t(mode === 'created' ? 'password_done_created' : 'password_done_changed')}
                description={t(
                    mode === 'created'
                        ? 'password_done_created_description'
                        : 'password_done_changed_description',
                )}
                email={email}
            />

            <Card type="basic" className={cn('items-start gap-2 p-3', RISE)} style={riseDelay(2)}>
                <Icon
                    name="shield"
                    weight="filled"
                    size={20}
                    aria-hidden
                    className="shrink-0 text-(--accents-success-active)"
                />
                <p className="type-caption-meta text-(--text-subtitle)">
                    {t('password_done_note')}
                </p>
            </Card>

            {/*
             * A real link, not a `router.push` in an `onClick` as legacy has it — so it can
             * be opened in a new tab, previewed on hover, and read as a destination by a
             * screen reader. `Button` renders it as an `<a>` and drops the native-button
             * semantics it would otherwise claim (see `shared/ui/button.tsx`).
             */}
            <Button
                data-testid="auth-password-done"
                render={<Link href="/" />}
                size="large"
                fullWidth
                className={cn('active:scale-[0.99]', RISE)}
                style={riseDelay(3)}
            >
                {t('password_done_cta')}
            </Button>
        </div>
    )
}
