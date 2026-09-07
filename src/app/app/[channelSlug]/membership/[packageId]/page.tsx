import { MembershipCheckoutScreen } from '@features/membership'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/app/[channelSlug]/membership/[packageId]` — the mobile app's membership card checkout.
 *
 * Legacy's URL and legacy's job (`../tevi-web-app/src/containers/app/membershipDetails`): the native
 * app has already shown its tier picker, the reader chose to pay by card, and this is the screen it
 * opens to collect one. The path is unchanged because shipped app builds construct it.
 *
 * ## Why the route is three segments deep, and why that is safe
 *
 * `[channelSlug]` sits directly under `/app/`, beside `privacy`, `terms`, `safety` and the rest. A
 * static sibling always wins in the App Router, and in any case those are **one** segment while this
 * pattern needs three — `/app/privacy` cannot match `/app/[channelSlug]/membership/[packageId]`.
 *
 * ## No `canonical`, and `noindex` twice over
 *
 * Unlike `/app/privacy` this screen has no public twin: buying a membership on the website is a
 * dialog over the space page, not a page of its own. `robots.ts` already disallows the whole
 * namespace; the meta tag says it again for a crawler that reached the URL another way — and this one
 * carries a `packageId` in its path, so it must never be indexed.
 *
 * Everything below is client code and has to be — but not for the usual reason. This screen has **no
 * bearer at all**: the native host owns the session and is asked for the account-scoped parts over the
 * JS bridge (`shared/lib/native-bridge.ts`), which exists only in a browser. The one thing that could
 * in principle be server-rendered is the tier, which is a public read; it is not, because the whole
 * screen is gated on a host being there and there is no way to know that from the server.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('payment_checkout_title'),
        robots: { index: false, follow: false },
    }
}

export default async function AppMembershipCheckoutPage({
    params,
}: {
    params: Promise<{ channelSlug: string; packageId: string }>
}) {
    const { channelSlug, packageId } = await params
    /*
     * Decoded here, once. `channelSlug` arrives percent-encoded when the app builds the URL from a
     * handle, and the model re-encodes it on the way out (`getChannelPackage`) — so passing the raw
     * segment through would double-encode and 404. The `@` legacy sometimes prefixes is stripped by
     * the model, not here, so both spellings resolve.
     */
    return (
        <MembershipCheckoutScreen
            slug={safeDecode(channelSlug)}
            packageId={safeDecode(packageId)}
        />
    )
}

/** `decodeURIComponent` throws on a lone `%`; a malformed segment should 404 at the API, not here. */
function safeDecode(value: string): string {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}
