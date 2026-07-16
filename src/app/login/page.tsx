import { LoginForm } from '@features/auth'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return { title: t('auth_sign_in'), robots: { index: false } }
}

export default async function LoginPage() {
    const t = await getServerT()
    return (
        <main className="mx-auto flex min-h-[var(--window-height)] max-w-md flex-col items-center justify-center gap-8 p-6">
            <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="font-brand text-t1 font-bold text-primary-500">Tevi</h1>
                <p className="text-dense text-muted-foreground">{t('auth_sign_in_to_continue')}</p>
            </div>
            <LoginForm />
        </main>
    )
}
