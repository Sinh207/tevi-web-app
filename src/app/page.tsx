import { getServerT } from '@shared/i18n/server'
import { Button } from '@shared/ui/button'

export default async function HomePage() {
    const t = await getServerT()
    return (
        <main className="mx-auto flex min-h-[var(--window-height)] max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
            <h1 className="font-brand text-hero font-bold text-primary-500">Tevi</h1>
            <p className="text-body text-muted-foreground">{t('home_tagline')}</p>
            <div className="flex flex-col gap-1 text-text-title">
                <span className="text-t2 font-semibold">Title T2 / 20 Semi Bold</span>
                <span className="text-dense text-text-body">Body Dense / 14 Regular</span>
                <span className="text-caption text-text-subtitle">Caption / 12</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
                <Button>Primary</Button>
                <Button variant="accent">Accent</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="outline">Outline</Button>
            </div>
        </main>
    )
}
