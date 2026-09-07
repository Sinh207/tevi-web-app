/**
 * Did this visitor arrive from **outside**, at a space that is on air?
 *
 * The rule for deciding whether to take somebody straight into the live rather than leaving them on
 * the profile.
 *
 * ⚠ **Nothing calls this yet, and that is on purpose.** Its one consumer is the redirect into
 * `/@{slug}/event/{code}`, and that route does not exist in this rewrite (legacy has
 * `pages/[channelSlug]/event/[eventCode]`). It is emphatically *not* the trigger for the
 * platform-restricted dialog: that dialog answers a **press**, and opening it on arrival takes a
 * page somebody asked for and puts something they did not ask for in front of it. Pure, and given the referrer rather than reading it, so the
 * whole decision is testable — `document.referrer` is one of those values that is empty for half a
 * dozen unrelated reasons and impossible to reason about from a component.
 *
 * ## Staying is the answer for one case, and it is the important one
 *
 * A reader who **came back from this space's own live** must not be thrown into it again: they
 * pressed back, and a redirect that fires on arrival turns that press into a loop they cannot
 * escape without closing the tab. So a same-origin referrer pointing at this space — the profile
 * itself or its event pages — means stay.
 *
 * Everything else opens: no referrer at all (a pasted link, a QR, a link from an app that strips
 * it), another site, or another page of ours. That last one is deliberate and is the sharp edge of
 * this rule — tapping the space from our own home feed also jumps into the live. It follows from
 * "not a channel link ⇒ open", and if it turns out to be too eager, the narrowing goes here rather
 * than at the call site.
 *
 * `referrer` is passed as the raw string `document.referrer` gives, empty string included.
 */
export function isExternalArrival({
    referrer,
    origin,
    slug,
}: {
    referrer: string
    /** This document's own origin — `window.location.origin`. */
    origin: string
    /** The space being looked at, without the leading `@`. */
    slug: string
}): boolean {
    if (!referrer) return true

    let url: URL
    try {
        url = new URL(referrer)
    } catch {
        // An unparseable referrer is not evidence of anything; treat it as an outside arrival,
        // which is the same answer an absent one gets.
        return true
    }

    if (url.origin !== origin) return true

    /*
     * `/@slug` and anything under it — `/@slug/event/{code}` above all, which is where the reader
     * pressing back is coming from. Compared case-insensitively because a slug in a shared link is
     * routinely capitalised differently from the one in the payload, and `decodeURIComponent`
     * because a slug can be percent-encoded in a URL and never is in the field.
     */
    const path = safeDecode(url.pathname).toLowerCase()
    const home = `/@${slug.replace(/^@/, '').toLowerCase()}`
    return path !== home && !path.startsWith(`${home}/`)
}

function safeDecode(value: string): string {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}
