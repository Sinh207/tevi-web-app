'use client'

import { RedeemGiftCodeView } from '@features/gift-code'
import { type RedeemFlow, type RedeemOutcome, RedeemResultDialog } from '@features/gift-code/dev'
import { notFound } from 'next/navigation'
import { useState } from 'react'

/**
 * Dev-only preview of the gift-code screen and its result panel: `pnpm dev`, then
 * `/dev/redeem-gift-code`. 404s in production.
 *
 * It exists because the result panel needs **a real, unused code** — one the billing or Premium
 * service will actually accept. A developer cannot mint one, and the only way to reach the panel for
 * real is to spend somebody's gift. So the three outcomes are driven by hand here, the same way
 * `/dev/donate` drives the donation stepper and `/dev/space-visibility` drives a card's `busy` state.
 *
 * The **form** above is the real one, mounted unmodified: pressing Redeem posts a made-up code to
 * both services and shows the *rejection* path, which is the half a harness cannot fake and the half
 * worth looking at. Signed out, it shows the sign-in gate instead.
 *
 * ⚠ The Premium panel's three rows come from `premium/v1/user/info/` as the **real** account. A
 * developer without Premium sees the panel with its rows dropped, which is itself one of the states
 * this page is for (see `PremiumReceipt`); the skeleton and the populated rows need an account that
 * has a grant.
 */
const OUTCOMES: { label: string; note: string; outcome: RedeemOutcome }[] = [
    {
        label: 'Star gift',
        note: 'A star_gift with a quantity — amount redeemed over the current balance from `features/balance`.',
        outcome: { kind: 'star', stars: 500 },
    },
    {
        label: 'Premium',
        note: 'Duration / active from / valid until, read from premium/v1/user/info/ as this account.',
        outcome: { kind: 'premium' },
    },
    {
        label: 'Something else',
        note: 'A redemption this client has no panel for — a product the backoffice added. The code was still spent.',
        outcome: { kind: 'other' },
    },
]

export default function RedeemGiftCodeDevPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    const [open, setOpen] = useState<number | null>(null)

    /**
     * A hand-built `RedeemFlow`. Only `result` and `closeResult` are read by the dialog — the rest is
     * the form's half of the shape and is stubbed rather than faked, so a future field on the type
     * shows up here as a type error instead of as a silently dead preview.
     */
    const flow: RedeemFlow = {
        code: '',
        changeCode: () => {},
        submit: () => {},
        canSubmit: false,
        isRedeeming: false,
        errorKey: null,
        result: open === null ? null : OUTCOMES[open].outcome,
        closeResult: () => setOpen(null),
    }

    return (
        <main className="flex flex-col gap-8 p-6">
            <header className="flex max-w-2xl flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Redeem gift code</h1>
                <p className="type-dense-default text-(--text-body)">
                    The real screen, plus the three result panels a real code would be needed to
                    reach. The live form below posts to both services — a made-up code shows the
                    rejection line under the field.
                </p>
                <ul className="type-caption-meta flex list-disc flex-col gap-1 ps-5 text-(--text-body)">
                    <li>
                        Under six characters and the button stays disabled; typing clears a
                        rejection the moment the field changes.
                    </li>
                    <li>
                        Signed out, the button reads <strong>Sign in</strong> and stays pressable —
                        pressing opens the login dialog.
                    </li>
                    <li>
                        A rejected code writes one line under the field; a <em>failed</em> request
                        (5xx, offline) raises a toast and leaves the field alone. Turn the network
                        off to see the second one.
                    </li>
                    <li>
                        Toggle the theme and an Arabic locale — tokens and logical properties
                        throughout.
                    </li>
                </ul>
            </header>

            <section className="flex max-w-[612px] flex-col gap-3">
                <h2 className="type-subheading-strong text-(--text-title)">Result panel</h2>
                <div className="flex flex-wrap gap-2">
                    {OUTCOMES.map((preset, i) => (
                        <button
                            key={preset.label}
                            type="button"
                            onClick={() => setOpen(i)}
                            className="type-dense-default rounded-[var(--radius-md)] bg-(--background-segment) px-3 py-2 text-(--text-title)"
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
                <p className="type-caption-meta text-(--text-body)">
                    {open === null ? 'Pick one to open the dialog.' : OUTCOMES[open].note}
                </p>
                <RedeemResultDialog flow={flow} />
            </section>

            <section className="flex max-w-[612px] flex-col gap-3">
                <h2 className="type-subheading-strong text-(--text-title)">
                    The screen, as it ships
                </h2>
                <RedeemGiftCodeView />
            </section>
        </main>
    )
}
