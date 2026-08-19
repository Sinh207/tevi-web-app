import { getServerT } from '@shared/i18n/server'
import { Button } from '@shared/ui/button'

export default async function HomePage() {
    const t = await getServerT()
    return (
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
            <h1 className="font-brand type-display-hero-bold text-primary-500">Tevi</h1>
            <p className="type-body-default text-text-body">{t('home_tagline')}</p>
            <div className="flex flex-col gap-1 text-text-title">
                <span className="type-title-t2-semibold">Title T2 / 20 Semi Bold</span>
                <span className="type-dense-default text-text-body">Body Dense / 14 Regular</span>
                <span className="type-caption-meta text-text-subtitle">Caption / 12</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
                <Button>Primary</Button>
                <Button variant="accent">Accent</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
            </div>
        </main>
    )
}
