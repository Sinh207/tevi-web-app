import { getServerT } from '@shared/i18n/server'
import { Button } from '@shared/ui/button'
import Link from 'next/link'

export default async function NotFound() {
    const t = await getServerT()
    return (
        <main className="mx-auto flex min-h-[var(--window-height)] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
            <h1 className="font-brand text-hero font-bold text-primary-500">404</h1>
            <p className="text-dense text-muted-foreground">{t('notfound_message')}</p>
            <Button render={<Link href="/" />}>{t('common_back_home')}</Button>
        </main>
    )
}
