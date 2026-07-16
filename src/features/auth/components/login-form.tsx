'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { env } from '@shared/config/env'
import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import Script from 'next/script'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAuth } from '../providers/auth-provider'

const emailSchema = z.object({
    email: z.string().email('auth_email_invalid'),
    password: z.string().min(6, 'auth_password_min'),
})
type EmailValues = z.infer<typeof emailSchema>

interface GoogleCredentialResponse {
    credential: string
    clientId?: string
}
declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize: (cfg: {
                        client_id: string
                        callback: (r: GoogleCredentialResponse) => void
                        ux_mode?: string
                    }) => void
                    renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void
                }
            }
        }
    }
}

export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
    const { t } = useTranslation()
    const { signInWithGoogle, signInWithEmail, isLoadingAction } = useAuth()
    const googleBtnRef = useRef<HTMLDivElement>(null)
    const [gsiReady, setGsiReady] = useState(false)

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<EmailValues>({ resolver: zodResolver(emailSchema) })

    const onGoogleCredential = useCallback(
        async (res: GoogleCredentialResponse) => {
            try {
                await signInWithGoogle({ access_token: res.credential, id_token: res.clientId })
                onSuccess?.()
            } catch (e) {
                toast.error(e instanceof Error ? e.message : t('auth_google_failed'))
            }
        },
        [signInWithGoogle, onSuccess, t],
    )

    useEffect(() => {
        const clientId = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
        if (!gsiReady || !clientId || !window.google || !googleBtnRef.current) return
        window.google.accounts.id.initialize({
            client_id: clientId,
            callback: onGoogleCredential,
            ux_mode: 'popup',
        })
        window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'outline',
            size: 'large',
            width: 320,
        })
    }, [gsiReady, onGoogleCredential])

    const onSubmit = handleSubmit(async values => {
        try {
            await signInWithEmail(values)
            onSuccess?.()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : t('auth_sign_in_failed'))
        }
    })

    return (
        <div className="flex w-full max-w-sm flex-col gap-5">
            <Script
                src="https://accounts.google.com/gsi/client"
                strategy="afterInteractive"
                onLoad={() => setGsiReady(true)}
            />

            <div ref={googleBtnRef} className="flex justify-center" />

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {t('auth_or')}
                <span className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={onSubmit} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                    <input
                        {...register('email')}
                        type="email"
                        placeholder={t('auth_email')}
                        autoComplete="email"
                        className="h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {errors.email && (
                        <span className="text-xs text-destructive">
                            {t(errors.email.message ?? '')}
                        </span>
                    )}
                </div>
                <div className="flex flex-col gap-1">
                    <input
                        {...register('password')}
                        type="password"
                        placeholder={t('auth_password')}
                        autoComplete="current-password"
                        className="h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {errors.password && (
                        <span className="text-xs text-destructive">
                            {t(errors.password.message ?? '')}
                        </span>
                    )}
                </div>
                <Button type="submit" disabled={isSubmitting || isLoadingAction}>
                    {isSubmitting || isLoadingAction ? t('auth_signing_in') : t('auth_sign_in')}
                </Button>
            </form>
        </div>
    )
}
