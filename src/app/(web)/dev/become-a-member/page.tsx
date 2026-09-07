'use client'

import { useAuth } from '@features/auth'
import { balanceKeys } from '@features/balance'
import { BecomeAMemberButton, type MembershipTarget } from '@features/membership'
import {
    BecomeAMemberDialogs,
    joinOffer,
    type Membership,
    type MembershipPackage,
    membershipKeys,
    useJoinMembershipPreview,
} from '@features/membership/dev'
import { Button } from '@shared/ui/button'
import { useQueryClient } from '@tanstack/react-query'
import { notFound } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * A stand-in for the creator's photo — a bundled square, not a CDN URL. What these pages preview is
 * layout, not the picture, and `src/` holds no static CDN image any more (`docs/STATIC_ASSETS.md`).
 */
const MOCK_AVATAR = '/campaign/affiliate-logo.png'

/**
 * Dev-only preview of the join flow: `pnpm dev`, then `/dev/become-a-member`. 404s in production.
 *
 * It exists because every screen here is behind **a space that sells a membership** *and* an account
 * that either does or does not already hold one — four combinations, none of which a developer can
 * arrange for themselves, because all four belong to somebody else's account.
 *
 * The tiers, the balance and the "am I a member" answer are all **seeded into the query cache**
 * rather than passed as props: the components read them through their own hooks, and giving them an
 * injection point they would never use in production is how a preview-only path ends up shipping.
 * Seeding the real keys exercises the real reads.
 *
 * ⚠ The **write** is real. Pressing through to "Yes, I want" posts to `billy/v3/subscription/…` for a
 * slug that does not exist and raises the error toast — which is itself the failure path worth
 * looking at, and the honest limit of what a harness can fake without stubbing the model.
 */
const SLUG = 'dev-membership-preview'
const CHANNEL_ID = 'ch_dev'

/**
 * The seeded membership behind the activated state — a full row rather than `{ id }`, because the
 * green button now **opens the detail dialog** and that dialog reads the price, the renewal date and
 * the payment method. A stub would preview a screen of fallbacks.
 *
 * `end_date` is a fixed string, not a computed one: `Date.now()` in a fixture makes the preview
 * change under you between reloads, which is the opposite of what a harness is for.
 */
const MEMBERSHIP = {
    id: 'sub_1',
    status: 'active',
    payment_method: 'star',
    canceled_at: null,
    end_date: '2026-12-01T00:00:00Z',
    package_price: 500,
    package_price_currency: 'TVS',
    channel: {
        id: 'ch_dev',
        name: 'Ada Lovelace',
        slug: 'dev-membership-preview',
        images: { thumb: MOCK_AVATAR },
    },
    package: { id: 'pkg_gold', name: 'Gold', prices: [] },
} as unknown as Membership

const TARGET: MembershipTarget = {
    slug: SLUG,
    name: 'Ada Lovelace',
    id: CHANNEL_ID,
    avatarUrl: MOCK_AVATAR,
}

const TIERS: { label: string; note: string; packages: MembershipPackage[] }[] = [
    {
        label: 'Star + cash — the ordinary case',
        note: 'Priced in both. The Star line is what this app can charge, so that is what is offered.',
        packages: [
            {
                id: 'pkg_gold',
                channel: null,
                name: 'Gold',
                description:
                    'Behind-the-scenes posts every week, plus the members-only chat where I take requests.',
                prices: [
                    { id: 'p_usd', amount: 5, amount_currency: 'USD' },
                    { id: 'p_tvs', amount: 500, amount_currency: 'TVS' },
                ],
            },
        ],
    },
    {
        label: 'Long pitch — clamped',
        note: 'A real tier description, six lines of it. Three lines then "more" — the case a short fixture never showed.',
        packages: [
            {
                id: 'pkg_long',
                channel: null,
                name: 'Ngày Chưa Giông Bão x Always Remember Us This Way',
                description:
                    'Xuân Hạ Thu Đông, rồi lại Xuân là một chương trình âm nhạc thực tế về âm nhạc, với sự góp mặt của 3 Nghệ sĩ chính: Hoà Minzy x Anh Tú x Hứa Kim Tuyền & các Nghệ sĩ khách mời theo từng tập phát sóng.',
                prices: [
                    { id: 'p_usd_long', amount: 3, amount_currency: 'USD' },
                    { id: 'p_tvs_long', amount: 250, amount_currency: 'TVS' },
                ],
            },
        ],
    },
    {
        label: 'Cash-only first tier',
        note: 'Legacy reads packages[0] and shows nothing. `firstJoinable` skips to the tier that works.',
        packages: [
            {
                id: 'pkg_bronze',
                channel: null,
                name: 'Bronze',
                description: null,
                prices: [{ id: 'p_usd', amount: 3, amount_currency: 'USD' }],
            },
            {
                id: 'pkg_silver',
                channel: null,
                name: 'Silver',
                description: null,
                prices: [{ id: 'p_tvs2', amount: 250, amount_currency: 'TVS' }],
            },
        ],
    },
    {
        label: 'Cash only — nothing renders',
        note: 'No TVS line anywhere. This is the pay-with-card-panel shaped hole (PAYMENT.md §8).',
        packages: [
            {
                id: 'pkg_cash',
                channel: null,
                name: 'Supporter',
                description: null,
                prices: [{ id: 'p_usd', amount: 9, amount_currency: 'USD' }],
            },
        ],
    },
    { label: 'No membership', note: 'The space sells nothing. Most spaces.', packages: [] },
]

export default function BecomeAMemberDevPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    const { activeId, isBootstrapping } = useAuth()
    const queryClient = useQueryClient()
    const [index, setIndex] = useState(0)
    const [member, setMember] = useState(false)
    const [rich, setRich] = useState(true)
    const [seeded, setSeeded] = useState(false)

    useEffect(() => {
        if (isBootstrapping) return
        queryClient.setQueryData(
            membershipKeys.channelPackages(activeId, SLUG),
            TIERS[index].packages,
        )
        queryClient.setQueryData(membershipKeys.channelMembership(activeId, CHANNEL_ID), {
            results: member ? [MEMBERSHIP] : [],
            count: member ? 1 : 0,
            received: member ? 1 : 0,
        })
        queryClient.setQueryData(balanceKeys.balance(activeId), { star: rich ? 1240 : 120, usd: 0 })
        setSeeded(true)
    }, [queryClient, activeId, index, member, rich, isBootstrapping])

    const preview = useJoinMembershipPreview(joinOffer(TIERS[index].packages[0] ?? null))

    return (
        <main className="flex flex-col gap-8 p-6">
            <header className="flex max-w-2xl flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Become a member</h1>
                <p className="type-dense-default text-(--text-body)">
                    The join control from a space’s action row and the three dialogs behind it.
                </p>
                <ul className="type-caption-meta flex list-disc flex-col gap-1 ps-5 text-(--text-body)">
                    <li>
                        Star only — a cash-only tier renders no button, like a cash-only donation.
                    </li>
                    <li>
                        Already a member keeps the same slot, painted with the DS success ramp
                        (`--accents-success-bg-active` + `--accents-success-active`) — and it is{' '}
                        <strong>pressable</strong>: it opens the membership detail dialog, the same
                        one `/my-membership` opens, so cancelling has one implementation. Legacy
                        does the same off one `handleClick`.
                    </li>
                    <li>
                        “Needs a card” is a <em>200</em> from the backend, not an error — the
                        confirm says so and disables itself rather than reporting a purchase.
                    </li>
                </ul>
            </header>

            <section className="flex max-w-[612px] flex-col gap-3">
                <h2 className="type-subheading-strong text-(--text-title)">What the space sells</h2>
                <div className="flex flex-wrap gap-2">
                    {TIERS.map((preset, i) => (
                        <Button
                            key={preset.label}
                            variant={i === index ? 'primary' : 'secondary'}
                            size="medium"
                            onClick={() => setIndex(i)}
                        >
                            {preset.label}
                        </Button>
                    ))}
                </div>
                <p className="type-caption-meta text-(--text-body)">{TIERS[index].note}</p>

                <h2 className="type-subheading-strong text-(--text-title)">This account</h2>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant={member ? 'primary' : 'secondary'}
                        size="medium"
                        onClick={() => setMember(!member)}
                    >
                        {member ? 'Already a member' : 'Not a member'}
                    </Button>
                    <Button
                        variant={rich ? 'primary' : 'secondary'}
                        size="medium"
                        onClick={() => setRich(!rich)}
                    >
                        {rich ? '1,240 Star' : '120 Star — short'}
                    </Button>
                </div>
            </section>

            <section className="flex max-w-[612px] flex-col gap-3">
                <h2 className="type-subheading-strong text-(--text-title)">
                    Action row — beside Follow and Donate
                </h2>
                <div className="flex min-w-0 items-center gap-2">
                    <div className="type-dense-emphasis flex h-12 flex-1 items-center justify-center rounded-[var(--radius-lg)] bg-(--background-segment) text-(--text-body)">
                        Follow
                    </div>
                    {seeded && (
                        <BecomeAMemberButton target={TARGET} memberCount={128} className="flex-1" />
                    )}
                </div>
            </section>

            <section className="flex max-w-[612px] flex-col gap-3">
                <h2 className="type-subheading-strong text-(--text-title)">
                    The three dialogs, driven by hand
                </h2>
                <p className="type-caption-meta text-(--text-body)">
                    The real button runs through <code>useRequireAuth</code>, so signed out these
                    are unreachable. Driven by <code>useJoinMembershipPreview</code> — the two
                    guards and the write taken out, nothing else.
                </p>
                <div className="flex flex-wrap gap-2">
                    {(['details', 'confirm', 'success'] as const).map(name => (
                        <Button
                            key={name}
                            variant="secondary"
                            size="medium"
                            onClick={() => {
                                preview.setNeedsCard(false)
                                preview.setStep(name)
                            }}
                        >
                            {name}
                        </Button>
                    ))}
                    <Button
                        variant="secondary"
                        size="medium"
                        onClick={() => {
                            preview.setNeedsCard(true)
                            preview.setStep('confirm')
                        }}
                    >
                        confirm · needs a card
                    </Button>
                </div>
                <BecomeAMemberDialogs flow={preview} target={TARGET} memberCount={128} />
            </section>
        </main>
    )
}
