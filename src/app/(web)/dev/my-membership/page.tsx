import { ChannelEmptyState } from '@features/channel'
import { MY_MEMBERSHIP_CONTAINER } from '@features/membership'
import { type Membership, MembershipRow, MyMembershipSkeleton } from '@features/membership/dev'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
    MembershipBarPreview,
    MembershipCardPreview,
    MembershipDialogPreview,
    MembershipSearchPreview,
} from './preview'

export const metadata: Metadata = {
    title: 'My membership',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of `/my-membership`'s row, its search bar and its empty states: `pnpm dev`, then
 * open /dev/my-membership. 404s in production (`proxy.ts` stops the request; the `notFound()` below is
 * the belt to that braces).
 *
 * It exists for the reason `/dev/blocked-accounts` does — the real screen is **unreachable without an
 * account that is actually paying a creator**, so a design pass on it meant either buying a membership
 * or faking an API response. Every state the row has is pure props, so all of them render here
 * honestly: this is a preview of the shipped component with the shipped copy, not a mock of it.
 *
 * What it deliberately does **not** preview is `MyMembershipView` — that component owns two queries,
 * and a version of it that did not would be a second implementation of the screen with its own drift.
 * The tab strip and the payment filter are DS primitives with their own previews at
 * /dev/icons-adjacent DS pages; what is *not* previewed anywhere else, and is here, is the **Search
 * Bar** — its three Figma states are two DOM facts (focus, and whether the field has a value), and
 * those are only checkable by using one.
 */

/** Fixtures, covering the payload shapes the row has to survive rather than four nice names. */
const ROWS: Membership[] = [
    {
        // The ordinary row: renewing, paid in Star, verified, Premium (so the avatar may animate).
        id: 's1',
        status: 'active',
        payment_method: 'star',
        canceled_at: null,
        end_date: '2026-09-01T00:00:00Z',
        package_price: 500,
        package_price_currency: 'TVS',
        channel: {
            id: 'c1',
            name: 'Ada Lovelace',
            slug: 'ada',
            images: { thumb: null, avatar_video: null },
            verified_tick_badge: { image: null },
            is_premium: true,
        },
        package: { id: 'p1', name: 'Gold', description: null, channel: null, prices: [] },
    },
    {
        // Cancelled: the same `end_date`, a different promise — the line reads "Expiry date".
        id: 's2',
        status: 'active',
        payment_method: 'card',
        canceled_at: '2026-08-02T00:00:00Z',
        end_date: '2026-08-30T00:00:00Z',
        package_price: 4.99,
        package_price_currency: 'USD',
        channel: {
            id: 'c2',
            name: 'Grace Hopper',
            slug: 'grace',
            images: { thumb: null, avatar_video: null },
            verified_tick_badge: null,
            is_premium: false,
        },
        package: { id: 'p2', name: 'Silver', description: null, channel: null, prices: [] },
    },
    {
        // A method this client has no copy for: `prettifyPaymentMethod` prints it as itself.
        id: 's3',
        status: 'active',
        payment_method: 'apple_pay',
        canceled_at: null,
        end_date: '2026-10-14T00:00:00Z',
        package_price: 1200,
        package_price_currency: 'TVS',
        channel: {
            id: 'c3',
            name: 'Katherine Johnson',
            slug: 'katherine',
            images: { thumb: null, avatar_video: null },
            verified_tick_badge: null,
            is_premium: false,
        },
        package: { id: 'p3', name: 'Bronze', description: null, channel: null, prices: [] },
    },
    {
        // Everything missing that can be: no price to print, no date, no method, and a name long
        // enough to truncate against the (now absent) price column.
        id: 's4',
        status: 'expired',
        payment_method: null,
        canceled_at: null,
        end_date: null,
        package_price: 0,
        package_price_currency: null,
        channel: {
            id: 'c4',
            name: 'A creator name long enough that it has to truncate before the price column',
            slug: 'averylonghandlethatalsotruncates',
            images: { thumb: null, avatar_video: null },
            verified_tick_badge: null,
            is_premium: false,
        },
        package: null,
    },
    {
        // No name and no slug: the label falls all the way through to the unknown-creator string,
        // and the identity block renders without an anchor rather than linking to `/@`.
        id: 's5',
        status: 'expired',
        payment_method: 'vip_pass',
        canceled_at: null,
        end_date: '2025-12-31T00:00:00Z',
        package_price: 300,
        package_price_currency: 'TVS',
        channel: {
            id: 'c5',
            name: null,
            slug: '',
            images: null,
            verified_tick_badge: null,
            is_premium: false,
        },
        /*
         * No package **and** no slug, so `renewalOffer` answers `null` twice over: this is the expired
         * row that gets a sentence and no Renew button.
         */
        package: null,
    },
    {
        /*
         * Expired **with** both price lines — the row that can be bought again, and the one that shows
         * the currency picker on renewal. The USD line is first on purpose: the resolver selects by
         * currency, never by position (see B44).
         */
        id: 's7',
        status: 'expired',
        payment_method: 'star',
        canceled_at: null,
        end_date: '2025-06-15T00:00:00Z',
        package_price: 500,
        package_price_currency: 'TVS',
        channel: {
            id: 'c7',
            name: 'Radia Perlman',
            slug: 'radia',
            images: null,
            verified_tick_badge: null,
            is_premium: false,
        },
        package: {
            id: 'p7',
            channel: null,
            name: 'Gold',
            description: null,
            prices: [
                { id: 'price-usd', amount: 5, amount_currency: 'USD' },
                { id: 'price-tvs', amount: 500, amount_currency: 'TVS' },
            ],
        },
    },
    {
        /*
         * **No `channel` at all** — the case that produced a tab reading `Expired (15)` over an empty
         * panel, because rows like this were being dropped by the parser. They are kept now, and this
         * fixture is here so the row's fallback identity stays looked at: the record of what was paid
         * and when it ended is the point of the row, and it survives without a payee.
         */
        id: 's6',
        status: 'expired',
        payment_method: 'card',
        canceled_at: null,
        end_date: '2025-08-01T00:00:00Z',
        package_price: 9.99,
        package_price_currency: 'USD',
        channel: null,
        package: null,
    },
]

const PANEL = 'overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]'

/**
 * Fixtures picked **by id**, not by index.
 *
 * Index selection is what broke the moment a row was inserted mid-list: the dialog section silently
 * stopped previewing the expired-with-a-Star-price case and started previewing the one next to it.
 * Ids survive reordering, and a typo is a missing row rather than the wrong one.
 */
const byId = (...ids: string[]) =>
    ids.map(id => ROWS.find(row => row.id === id)).filter(Boolean) as Membership[]

export default function DevMyMembershipPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-10 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">My membership</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/membership` — the DS List/User Item row (2089:2965) as /my-membership
                    renders it, plus the DS Search Bar (122:28484). Focus the field to see the
                    cancel button appear and the pill narrow, and open the bar&apos;s filter to see
                    the accent an applied filter paints.
                </p>
            </header>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    page bar — payment filter
                </h2>
                <div className={MY_MEMBERSHIP_CONTAINER}>
                    <MembershipBarPreview />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">search bar</h2>
                <div className={MY_MEMBERSHIP_CONTAINER}>
                    <MembershipSearchPreview />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    content card — field, tabs and rows on one surface
                </h2>
                <div className={MY_MEMBERSHIP_CONTAINER}>
                    <MembershipCardPreview rows={byId('s1', 's2', 's3')} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    detail dialog — press a row
                </h2>
                <p className="type-caption-meta text-(--text-body)">
                    Ada is renewing (Cancel + confirm), Grace is cancelled (Renew via undo-cancel),
                    the unnamed row has ended with no price this app can bill (no button), and Radia
                    has ended with one — her Renew hands over to the <em>join</em> dialogs, currency
                    picker included, because buying an expired tier again is the same purchase the
                    space page makes. Payment history needs a bearer, so it shows its error state.
                </p>
                <div className={MY_MEMBERSHIP_CONTAINER}>
                    <MembershipDialogPreview rows={byId('s1', 's2', 's6', 's7')} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">rows</h2>
                <div className={MY_MEMBERSHIP_CONTAINER}>
                    <div className={PANEL}>
                        <ul className="list-none">
                            {ROWS.map((membership, index) => (
                                <MembershipRow
                                    key={membership.id}
                                    membership={membership}
                                    rule={index > 0}
                                    enterDelay={index * 40}
                                    locale="en"
                                />
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">rows — Vietnamese</h2>
                <p className="type-caption-meta text-(--text-body)">
                    The date is `Intl`-formatted, so its part order is the locale&apos;s. Only the
                    date changes here; the copy around it comes from `useTranslation` and follows
                    the app&apos;s own language.
                </p>
                <div className={MY_MEMBERSHIP_CONTAINER}>
                    <div className={PANEL}>
                        <ul className="list-none">
                            {ROWS.slice(0, 2).map((membership, index) => (
                                <MembershipRow
                                    key={membership.id}
                                    membership={membership}
                                    rule={index > 0}
                                    locale="vi"
                                />
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">loading</h2>
                <div className={MY_MEMBERSHIP_CONTAINER}>
                    <div className={PANEL}>
                        <MyMembershipSkeleton count={3} />
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">empty</h2>
                <div className={MY_MEMBERSHIP_CONTAINER}>
                    <div className={PANEL}>
                        <ChannelEmptyState
                            art={{
                                src: '/illustrations/theo-search.svg',
                                width: 94,
                                height: 118,
                            }}
                            title="No memberships yet"
                            body="You have not joined any memberships yet. When you do, they will show up here with all the details."
                        />
                    </div>
                </div>
            </section>
        </main>
    )
}
