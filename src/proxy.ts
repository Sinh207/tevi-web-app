import { type NextRequest, NextResponse } from 'next/server'

/** Legacy URL rewrites (ported from the old app). No auth here — auth is client-side. */
const REDIRECTS: { pattern: RegExp; action: string }[] = [
    { pattern: /^\/([^/]+)\/direct-donation$/, action: 'direct_donation' },
    { pattern: /^\/([^/]+)\/membership\/[^/]+$/, action: 'become_a_member' },
]

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl

    if (pathname.startsWith('/app/')) return NextResponse.next()

    for (const { pattern, action } of REDIRECTS) {
        const match = pathname.match(pattern)
        if (match) {
            const channelSlug = match[1]
            const url = request.nextUrl.clone()
            url.pathname = `/${channelSlug}`
            url.searchParams.set('action', action)
            return NextResponse.redirect(url)
        }
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|sw.js).*)'],
}
