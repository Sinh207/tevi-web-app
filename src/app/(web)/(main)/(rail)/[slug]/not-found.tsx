import { getServerT } from '@shared/i18n/server'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'

/**
 * No such channel — a **real 404**, not a 200 with a sad face.
 *
 * `notFound()` on a dynamic route does set the status correctly, unlike a page that merely renders
 * "not found" content. Which is why `resolveChannelFetchStatus` is careful that only a definitive
 * upstream 404 reaches here: a 5xx routed to this page would tell a crawler a live profile had been
 * deleted.
 *
 * Rendered inside the `(main)` shell, so the rail and the tab bar stay put and the visitor can go
 * somewhere else without using the browser's back button.
 */
export default async function ChannelNotFound() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
            <Icon name="user-simple-alt" size={32} className="text-(--icon-secondary)" />
            <div className="flex max-w-[420px] flex-col gap-1">
                <h1 className="type-title-t2-semibold text-(--text-title)">
                    {t('channel_not_found_title')}
                </h1>
                <p className="type-dense-default text-(--text-subtitle)">
                    {t('channel_not_found_body')}
                </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
                {/*
                 * Two ways out, as legacy offers: "Discover Creators" is the useful one — someone who
                 * followed a dead channel link is looking for *a* creator, not for the home feed — and
                 * `vs_not_found_w2_discover_creators` is legacy's own label for it. It points at home
                 * until a discover route exists, which is why it is the secondary of the two.
                 */}
                <Button
                    data-testid="channel-not-found-home"
                    variant="primary"
                    size="large"
                    render={<Link href="/" />}
                >
                    {t('channel_not_found_discover')}
                </Button>
                <Button
                    data-testid="channel-not-found-search"
                    variant="secondary"
                    size="large"
                    render={<Link href="/" />}
                >
                    {t('channel_return_home')}
                </Button>
            </div>
        </main>
    )
}
