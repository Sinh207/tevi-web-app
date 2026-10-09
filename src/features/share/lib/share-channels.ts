import { env } from '@shared/config/env'
import type { TeviIconName } from '@shared/ui/icon-names'

/**
 * The channels the sheet offers, in the order it draws them — and the three places the wire
 * spelling disagrees with the product name.
 *
 * ## Why the wire value is a field and not the id
 *
 * `share_channel` on `POST v1/links` is the backend's enum, and it does not match what the row says
 * on screen: **X posts as `twitter`**, the QR code posts as **`direct_link`** (the *code* is not a
 * channel — scanning one lands on the same link a person could have pasted), and Tevi's own DM
 * posts as `internal`. Legacy carries the same mapping in `SHARE_CHANNEL` and the app then passes
 * those strings around as its channel identity, so every call site has to know that "the twitter
 * one" is the X button. Here the id is the product name, the enum lives in one column, and a typo
 * in either is a type error.
 *
 * ## What is deliberately not here
 *
 * - **WhatsApp.** Legacy's third-most prominent row, and it cannot be ported as it stands: the
 *   design system has **no WhatsApp glyph** (not in the Figma library, and upstream Zappicon v1.2.0
 *   was checked — it carries no brand marks at all), and legacy's own button does not have one
 *   either. Its inline `<svg>` is **byte-identical to the Facebook button's** — a copy-paste that
 *   has shipped, so what a reader presses today is Facebook's ✱f✱ on a green disc. Copying that
 *   would be porting the bug; drawing the real mark from memory is what `CLAUDE.md` forbids. It
 *   needs one SVG from Brand, and then it is one entry here: `wire: 'whatsapp'`, brand `#25D366`,
 *   `target: url => 'https://wa.me/?text=' + encodeURIComponent(url)`.
 * - **The DM block** (`internal`) — "Send in message". It is not a row: it is a block of its own,
 *   drawn by `features/message` and reached through `lib/share-in-message.tsx`, so its one wire
 *   value lives beside this table as `DIRECT_MESSAGE_WIRE` rather than in it.
 */
export type ShareChannel =
    | 'copy-link'
    | 'qr-code'
    | 'telegram'
    | 'facebook'
    | 'x'
    | 'messenger'
    | 'email'

/** A logo the DS sprite does not carry; drawn by `components/brand-marks.tsx`. */
export type ShareBrandMark = 'messenger-mark'

export type ShareTargetContext = {
    /** The email row's subject line, translated. */
    subject: string
    /** Where Messenger returns the reader afterwards — the page they pressed Share on. */
    redirectUri: string
    /** Meta app id, `NEXT_PUBLIC_FACEBOOK_CLIENT_ID`. Without it the Messenger row is not offered. */
    appId?: string
}

export type ShareChannelSpec = {
    id: ShareChannel
    /** `share_channel` on `POST v1/links`, and the analytics dimension it becomes. */
    wire: string
    /** `{module}_{slug}`, resolved by the dialog — the label under the disc. */
    labelKey: string
    /**
     * A DS sprite name, or one of the brand marks the library does not carry
     * (`components/brand-marks.tsx` says why those are allowed to live outside the sprite).
     *
     * Every sprite name below exists in the Figma library except `envelope`, which
     * `tevi-icons.extra.svg` carries from upstream Zappicon for the two-step-verification steps.
     */
    glyph: TeviIconName | ShareBrandMark
    /**
     * The brand badge's fill (fed to the sprite's `--tevi-icon-brand`), or `null` for the neutral ones.
     *
     * A literal hex, and one of the few places that is right rather than lazy: these are other
     * companies' marks, and their colours are theirs — there is no Tevi token for Telegram blue,
     * inventing one would claim the design system owns a value it cannot change, and flipping it
     * with the theme would make the mark wrong rather than dark. Same reasoning as the white plate
     * under a QR code in `share-qr-panel.tsx`. Values are legacy's own, to the digit.
     */
    brand: string | null
    /**
     * A gradient for the disc instead of a flat fill — Messenger's, and only Messenger's.
     *
     * Separate from `brand` because the two are different CSS properties: a colour is a
     * `background-color` and a gradient is a `background-image`, and the disc has to pick the
     * matching utility. Legacy writes this exact value inline.
     */
    brandGradient?: string
    /**
     * Swap the disc to white with a black glyph in dark mode.
     *
     * For X, whose mark is black on a black-ish sheet — the disc stops being a disc. This is not an
     * invention: X publishes the inverse lockup (black mark on white) for exactly this case, so the
     * mark stays correct rather than being tinted or ringed. Legacy has no dark mode and therefore
     * no answer here; `features/auth/components/provider-button.tsx` already solves the same problem
     * the same way for the provider logos.
     */
    invertInDark?: true
    /**
     * The URL to send the reader to, or `null` when the press is handled in the app (copy, QR).
     *
     * Everything the target could need arrives in one context object rather than as a growing
     * argument list, and it is passed to every row: that is what lets the dialog loop over this
     * array instead of switching on the id. Only email reads `subject`, only Messenger reads
     * `redirectUri` and `appId`.
     *
     * `redirectUri` is handed in rather than read from `window` here, so this stays a pure table —
     * one that a node test can call every row of.
     */
    target: ((url: string, ctx: ShareTargetContext) => string) | null
}

export const SHARE_CHANNELS: readonly ShareChannelSpec[] = [
    {
        id: 'copy-link',
        wire: 'copy_link',
        labelKey: 'share_copy_link',
        glyph: 'link-simple',
        brand: null,
        target: null,
    },
    {
        id: 'qr-code',
        // Not `qr_code`: the *link* is a direct link, and the code is one way of reading it out.
        wire: 'direct_link',
        labelKey: 'share_qr_code',
        glyph: 'qr-code',
        brand: null,
        target: null,
    },
    {
        id: 'telegram',
        wire: 'telegram',
        labelKey: 'share_telegram',
        glyph: 'telegram-icon',
        brand: '#0088cc',
        target: url => `https://t.me/share/url?url=${encodeURIComponent(url)}`,
    },
    {
        id: 'facebook',
        wire: 'facebook',
        labelKey: 'share_facebook',
        glyph: 'facebook-icon',
        brand: '#1877F2',
        target: url => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
    {
        id: 'x',
        /*
         * `twitter`, on the wire and in the analytics. The rename never reached this enum, so
         * sending `x` would file the presses under a channel no report groups by.
         */
        wire: 'twitter',
        labelKey: 'share_x',
        glyph: 'x-icon',
        brand: '#000000',
        invertInDark: true,
        /*
         * `twitter.com/intent/tweet` and not `x.com/intent/post`, which is legacy's value and still
         * the documented endpoint — x.com serves a redirect either way, and following the redirect
         * is one hop cheaper to be wrong about than guessing the new path.
         */
        target: url => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`,
    },
    {
        id: 'messenger',
        /*
         * **`facebook`, the same value the Facebook row sends** — the enum has no `messenger`, and
         * legacy maps it the same way. Two consequences worth knowing rather than discovering: the
         * two rows are indistinguishable in the analytics, and because the cache is keyed on this
         * value they **share one minted link**. Pressing Facebook and then Messenger is one request,
         * which is right — it is one share channel with two doors.
         */
        wire: 'facebook',
        labelKey: 'share_messenger',
        glyph: 'messenger-mark',
        brand: null,
        // Messenger's own gradient, to the digit, from legacy's `btnMessage`. (Legacy also lists a
        // `url(../../assets/images/message.png)` layer over it, whose relative path resolves to
        // nothing and has never loaded; the gradient is what has always been on screen.)
        brandGradient:
            'radial-gradient(110% 110% at 16.75% 100%, #09F 0%, #A033FF 60%, #FF5280 90%, #FF7061 100%)',
        /*
         * **`app_id` is the fix.** Legacy sends it empty, and `dialog/send` without an app id is
         * Meta's error page rather than a share sheet — the row has been dead for as long as it has
         * existed. The id is the one the Facebook sign-in button already uses, and when it is not
         * configured `visibleShareChannels` drops the row instead of offering a broken one; that is
         * the same call `auth-method-buttons.tsx` makes about the sign-in button.
         */
        target: (url, { redirectUri, appId }) =>
            `https://www.facebook.com/dialog/send?link=${encodeURIComponent(url)}` +
            `&app_id=${encodeURIComponent(appId ?? '')}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}`,
    },
    {
        id: 'email',
        wire: 'email',
        /*
         * The label says **Gmail**, because that is what the button opens. Legacy is honest about
         * this too — `t('share_w2_gmail', 'Gmail')` over a neutral disc — and the alternative is
         * worse in both directions: a row labelled "Email" that always opens Gmail is a lie, and
         * `mailto:` (the correct-looking fix) opens nothing at all on a desktop with no mail client
         * configured, which is most of them. A real "Email" row needs the platform's own compose
         * sheet, which is `navigator.share` territory rather than a URL.
         */
        labelKey: 'share_gmail',
        glyph: 'envelope',
        brand: null,
        target: (url, { subject }) =>
            `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(
                subject,
            )}&body=${encodeURIComponent(url)}`,
    },
] as const

/**
 * The rows to draw, which is every row whose destination this deployment can actually reach.
 *
 * Only Messenger is conditional, and it is conditional on configuration rather than on a runtime
 * check: `dialog/send` needs a Meta app id, and a row that opens an error page is worse than a row
 * that is not there. Same rule the Facebook **sign-in** button follows
 * (`features/auth/components/auth-method-buttons.tsx` hides itself without the same id), so the two
 * cannot disagree about whether this deployment has one.
 */
export function visibleShareChannels(): readonly ShareChannelSpec[] {
    if (env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID) return SHARE_CHANNELS
    return SHARE_CHANNELS.filter(spec => spec.id !== 'messenger')
}

/**
 * `share_channel` for a link sent in a Tevi DM — legacy's `SHARE_CHANNEL.DIRECT_MESSAGE`, and the
 * value Android mints with too. iOS mints nothing for a DM and sends the raw URL (**B113**).
 */
export const DIRECT_MESSAGE_WIRE = 'internal'

/** Lookup by id, for the two call sites that act on one channel rather than the row. */
export const SHARE_CHANNEL_BY_ID: Record<ShareChannel, ShareChannelSpec> = Object.fromEntries(
    SHARE_CHANNELS.map(spec => [spec.id, spec]),
) as Record<ShareChannel, ShareChannelSpec>
