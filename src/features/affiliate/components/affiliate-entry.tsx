'use client'

import { AffiliateBanner } from '@features/campaign'
import { useState } from 'react'
import { AffiliateDialog } from './affiliate-dialog'

/**
 * The affiliate card and the dialog it opens, composed.
 *
 * This exists so that **`features/campaign` never has to know about `features/affiliate`**. The card
 * belongs to the campaign list (it is drawn from one row of `dapp-campaign`, and it renders or not
 * based on that row); the programs belong here, on the `raffi` service. Wiring them from the campaign
 * side would make the two barrels import each other, and ESM answers a cycle with a half-initialised
 * module — an `undefined is not a function` at render time rather than a build error. So the edge
 * runs one way, and this is the joint.
 *
 * It is what the end rail renders. The rail does not mount the dialog itself for the same reason it
 * does not mount the banner's query: neither is its subject.
 *
 * **The dialog is only mounted once opened.** Its three queries are gated on `open`, so mounting it
 * unopened costs nothing — but it also brings a `Menu`, two nested dialogs and the base-ui portal
 * machinery, and the card it hangs off renders on every desktop page.
 */
export function AffiliateEntry() {
    const [open, setOpen] = useState(false)

    return (
        <>
            <AffiliateBanner onPress={() => setOpen(true)} />
            {open ? <AffiliateDialog open={open} onOpenChange={setOpen} /> : null}
        </>
    )
}
