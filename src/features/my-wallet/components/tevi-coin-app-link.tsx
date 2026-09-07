'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'

/**
 * *Tevi Coin mini-app →* — the way out of the bonus note in the transaction-detail sheet.
 *
 * ## Why this is a plain `<Link>` and not `useMiniApp().open()`
 *
 * Opening a mini app needs a vetted `MiniAppConfig`, which is constructible only from a **channel
 * payload** (`miniAppFromChannel`: `mini_app_id` + `mini_app_url`). This feature cannot get one —
 * `channelApi` is deliberately not exported from `features/channel`'s barrel, and reaching past a
 * barrel is the boundary violation CLAUDE.md names.
 *
 * It does not need to. A space that *is* a mini app **opens it on arrival**
 * (`useAutoOpenMiniApp`, called by `ChannelViewerActions` — `docs/MINI_APP.md`), so navigating to the
 * space is what opens the app, and the config is assembled by the code that already has the channel.
 * One destination, one owner of the vetting, and this feature stays inside its boundary.
 *
 * That is also **legacy's own URL**: `${BASE_URL}/@TeviCoin`
 * (`transactionDetails/content/index.js:180`). Legacy then forks — a QR dialog on desktop, a
 * `redirectToApp()` deep link on a phone — because it is handing the reader off to the *native* app.
 * Neither fork is ported: this app hosts mini apps itself, so the web answer to "open the Tevi Coin
 * mini app" is to go to the space that is it.
 *
 * ## The slug is a constant, as it is in legacy
 *
 * `TeviCoin` is hard-coded there and there is no second source to read it from — no remote-config
 * key, nothing in the dApp payload. So it is a constant here too, named and commented rather than
 * inlined at the call site. If it ever needs to move, this is the one line.
 *
 * A real `<Link>`, so it is middle-clickable and copyable like the address it is — the same call
 * `/my-wallet`'s **View all** makes.
 */

/** Legacy's, verbatim. See the note above on why it is a literal. */
const TEVI_COIN_SLUG = 'TeviCoin'

export function TeviCoinAppLink() {
    const { t } = useTranslation()

    return (
        <Link
            data-testid="my-wallet-bonus-app-link"
            href={`/@${TEVI_COIN_SLUG}`}
            className="type-dense-default flex w-fit items-center gap-1 text-(--text-brand) transition-colors hover:underline"
        >
            {t('balance_txn_bonus_link')}
            {/*
             * `arrow-right`, legacy's `EastRoundedIcon`. `rtl:rotate-180` because the glyph means
             * "onward" rather than "east" — in Arabic onward is the other way, and an arrow that keeps
             * pointing right there points back at the text it came from.
             *
             * **16, not legacy's 14**: `IconSize` is a closed union starting at 16, because the DS
             * sprite is drawn on a 16 grid and a 14 would be a fractional scale of it. A type error
             * rather than a blurry glyph, which is what that union is for.
             */}
            <Icon name="arrow-right" size={16} aria-hidden className="flex-none rtl:rotate-180" />
        </Link>
    )
}
