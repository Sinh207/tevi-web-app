import { LoginScreen } from '@features/auth'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return { title: t('auth_sign_up'), robots: { index: false } }
}

export default function SignUpPage() {
    return <LoginScreen mode="sign-up" />
}
