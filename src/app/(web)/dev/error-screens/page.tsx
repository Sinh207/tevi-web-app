import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Boom } from './boom'

export const metadata: Metadata = {
    title: 'Error screens',
    robots: { index: false, follow: false },
}

/**
 * Harness for the two boundary screens — `app/not-found.tsx` and `app/error.tsx`.
 *
 * The 404 can be reached by typing a URL. **The error boundary cannot**: nothing in the app throws
 * on purpose, so without this page the only way to see it is to break something and remember to put
 * it back. That is why this exists and the other dev harnesses' reasoning (a component gallery)
 * does not apply — this one is a *trigger*, not a gallery.
 *
 * `?boom=1` throws during a client render, which is what `error.tsx` catches. In `pnpm dev` Next
 * also raises its own error overlay on top; dismiss it and the real screen is underneath. A
 * production build shows only the screen — and `notFound()` below means this page is not in one.
 *
 * ⚠ **`/foo/bar/baz`, not `/foo`.** A single unknown segment is a *channel* URL (`(main)/[slug]`)
 * and renders that route's own not-found inside the shell, which is a different screen answering
 * 200. `e2e/not-found.spec.ts` carries the same warning for the same reason.
 */
export default async function ErrorScreensPage({
    searchParams,
}: {
    searchParams: Promise<{ boom?: string }>
}) {
    if (process.env.NODE_ENV === 'production') notFound()

    const { boom } = await searchParams
    if (boom) return <Boom />

    return (
        <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Error screens</h1>
                <p className="type-dense-default text-(--text-body)">
                    Toggle the theme and switch the locale in the app itself — both screens read the
                    same providers every other page does.
                </p>
            </header>
            <ul className="type-body-default flex flex-col gap-3">
                <li>
                    <Link
                        className="type-link-body text-(--text-brand)"
                        href="/dev/error-screens?boom=1"
                    >
                        Throw a render error
                    </Link>{' '}
                    — <code className="type-dense-emphasis">app/error.tsx</code>, the 500.
                </li>
                <li>
                    <Link className="type-link-body text-(--text-brand)" href="/foo/bar/baz">
                        A URL that matches no route
                    </Link>{' '}
                    — <code className="type-dense-emphasis">app/not-found.tsx</code>, the website
                    404.
                </li>
                <li>
                    <Link
                        className="type-link-body text-(--text-brand)"
                        href="/app/screen-that-never-shipped?lang=vi&theme=dark&platform=ios&v=3.14.0"
                    >
                        The same 404 inside a webview
                    </Link>{' '}
                    — no way out, and the app&apos;s own language and theme.
                </li>
            </ul>
        </main>
    )
}
