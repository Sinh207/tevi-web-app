'use client'

import { ChannelEmptyState } from '@features/channel'
import {
    DEV_GIFT_PACKAGES,
    DEV_GIFT_RECIPIENTS,
    GIFT_PLAN_ORDER,
    GIFT_PREMIUM_ART,
    GIFT_PREMIUM_PANEL,
    GIFT_PREMIUM_PICKER_SCREEN,
    GIFT_PREMIUM_STATE_MIN,
    GiftFeaturedPlanCard,
    GiftFollowingStrip,
    GiftFollowingStripSkeleton,
    GiftPlanCard,
    GiftPlanGridSkeleton,
    GiftPremiumHero,
    type GiftRecipient,
    GiftRecipientRow,
    GiftRecipientSkeleton,
    groupGiftPlans,
    PREMIUM_HERO_RAMP,
} from '@features/premium/dev'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { ListHeader, ListHeaderTitle } from '@shared/ui/list'
import { SearchBar } from '@shared/ui/search-bar'
import Image from 'next/image'
import { useState } from 'react'

/**
 * Every previewable state, in the order somebody debugging this screen would want them.
 *
 * ## The catalogue fixture is the point of the first two blocks
 *
 * `DEV_GIFT_PACKAGES` holds the **real** prices, and they are the same $8.33 a month across all
 * three tiers — which is why the cards print a rate rather than a percentage. A fixture with
 * invented prices would make a discount appear that the catalogue does not have, and that is not
 * hypothetical: it is how the derived-percentage version of these cards came to look confirmed.
 *
 * ## The picker is assembled from its parts rather than mounted
 *
 * `GiftRecipientPicker` owns two queries and a debounce, so mounting it here would preview whatever
 * the backend answered rather than a chosen state. The parts are laid out in the panel they really
 * sit in (`GIFT_PREMIUM_PANEL` on `GIFT_PREMIUM_PICKER_SCREEN`), which is also what makes the
 * skeleton's fidelity checkable by eye: the loading block and the loaded block are a scroll apart.
 */
export function GiftPremiumPreview() {
    const plans = groupGiftPlans(DEV_GIFT_PACKAGES)
    const [chosen, setChosen] = useState<GiftRecipient | null>(null)

    return (
        <div className="flex flex-col gap-8">
            <Section
                title="Plan cards — the real catalogue"
                note="$24.99 / $49.99 / $99.99 for 3 / 6 / 12 months. All three are $8.33 a month, which is why the second line is a rate and not a percentage."
            >
                <div className={cn('rounded-2xl py-6', PREMIUM_HERO_RAMP)}>
                    <div className="grid grid-cols-1 gap-2 px-4 md:grid-cols-3 md:items-center">
                        {GIFT_PLAN_ORDER.map(plan => {
                            const pkg = plans[plan]
                            if (!pkg) return null
                            const Card = plan === 'year' ? GiftFeaturedPlanCard : GiftPlanCard
                            return <Card key={plan} plan={plan} pkg={pkg} onSend={() => {}} />
                        })}
                    </div>
                </div>
            </Section>

            <Section
                title="Plan cards — the skeleton"
                note="Reserved at the cards' real heights: measured 226 against 226 at 612, and 556 against 556 stacked."
            >
                <div className={cn('rounded-2xl py-6', PREMIUM_HERO_RAMP)}>
                    <GiftPlanGridSkeleton />
                </div>
            </Section>

            <Section
                title="Nothing to sell"
                note="The two answers the catalogue can give, and they are not the same fact. Empty came back fine and has nothing to retry; failed does."
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <Panel>
                        <Unavailable kind="empty" />
                    </Panel>
                    <Panel>
                        <Unavailable kind="error" />
                    </Panel>
                </div>
            </Section>

            <Section
                title="Picker — the invitation"
                note="What the step opens on. Nothing has been typed, so there is no list and nothing has failed."
            >
                <Panel>
                    <Field />
                    <Invitation />
                </Panel>
            </Section>

            <Section
                title="Picker — loading"
                note="The strip's header and tiles, the section header, then six rows — the whole 695px the loaded state occupies at both widths."
            >
                <Panel>
                    <Field value="ada" />
                    <GiftFollowingStripSkeleton />
                    <GlobalHeader />
                    <GiftRecipientSkeleton />
                </Panel>
            </Section>

            <Section
                title="Picker — loaded"
                note="Seven followed people, which is what makes the strip overflow and its arrows appear (fine pointers only). Scroll it: the leading arrow arrives and the trailing one goes."
            >
                <Panel>
                    <Field value="ada" />
                    <GiftFollowingStrip recipients={DEV_GIFT_RECIPIENTS} onSelect={setChosen} />
                    <GlobalHeader />
                    <ul className="list-none">
                        {DEV_GIFT_RECIPIENTS.slice(0, 4).map((recipient, index) => (
                            <GiftRecipientRow
                                key={recipient.slug}
                                recipient={recipient}
                                rule={index > 0}
                                onSelect={() => setChosen(recipient)}
                            />
                        ))}
                    </ul>
                </Panel>
                <p className="type-caption-meta text-(--text-subtitle)">
                    {chosen
                        ? `Selected @${chosen.slug} — the real screen would move to the offer step.`
                        : 'Press a tile or a row: selection is what these controls do, which is why they are buttons and not links.'}
                </p>
            </Section>

            <Section
                title="Picker — nothing matched, and a failed search"
                note="Brand's art for the first, the error mark and a retry for the second. Legacy shows the first one for both, so a search that 502s reads as a creator who does not exist."
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <Panel>
                        <NoResults />
                    </Panel>
                    <Panel>
                        <SearchFailed />
                    </Panel>
                </div>
            </Section>

            <Section
                title="The offer step's band"
                note="The coin turns and the burst comes off it — 150 sparks launched from behind an opaque disc, so they only appear once they clear its edge. The back of the coin is the Premium mark."
            >
                <GiftPremiumHero
                    state="offer"
                    handle="ada"
                    name="Ada Lovelace"
                    avatar={{ thumb: null, avatarVideo: null, isPremium: true }}
                    onSeeFeatures={() => {}}
                    sentinelRef={() => {}}
                />
            </Section>

            <Section
                title="The success screen"
                note="Rebuilt from `?gift_token=` on the real screen, so the ring holds initials: no image URL travels in that token. Legacy's confetti sits over the sparks."
            >
                <GiftPremiumHero
                    state="sent"
                    handle="ada"
                    name="Ada Lovelace"
                    sentinelRef={() => {}}
                />
            </Section>
        </div>
    )
}

/** The picker's own surface, so a state is previewed on the ground it really sits on. */
function Panel({ children }: { children: React.ReactNode }) {
    return (
        <div className={cn(GIFT_PREMIUM_PICKER_SCREEN, 'flex flex-col rounded-2xl p-0')}>
            <div className={cn(GIFT_PREMIUM_PANEL, 'rounded-2xl')}>{children}</div>
        </div>
    )
}

/** The field, inert — its behaviour is the hook's and is tested there. */
function Field({ value = '' }: { value?: string }) {
    const { t } = useTranslation()
    return (
        <div className="px-4 pt-4 pb-3">
            <SearchBar
                value={value}
                onValueChange={() => {}}
                label={t('giftpremium_search_label')}
                clearLabel={t('giftpremium_search_clear')}
                placeholder={t('giftpremium_search_placeholder')}
            />
        </div>
    )
}

function GlobalHeader() {
    const { t } = useTranslation()
    return (
        <ListHeader rule={false}>
            <ListHeaderTitle as="h2">{t('giftpremium_global')}</ListHeaderTitle>
        </ListHeader>
    )
}

function Invitation() {
    const { t } = useTranslation()
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-4 px-3 py-10 text-center',
                GIFT_PREMIUM_STATE_MIN,
                RISE,
            )}
        >
            {/* `next/image`, as the real block uses: the art is a committed local file, so the
                optimiser has something to work with and the harness previews what ships. */}
            <Image
                src={GIFT_PREMIUM_ART.invite.src}
                alt=""
                width={GIFT_PREMIUM_ART.invite.width}
                height={GIFT_PREMIUM_ART.invite.height}
                aria-hidden
                className="h-auto w-full max-w-[400px]"
            />
            <h2 className="type-body-strong text-(--text-title)">
                {t('giftpremium_invite_title')}
            </h2>
            <p className="type-dense-default max-w-[400px] text-(--text-body)">
                {t('giftpremium_invite_body')}
            </p>
        </div>
    )
}

function Unavailable({ kind }: { kind: 'empty' | 'error' }) {
    const { t } = useTranslation()
    return (
        <ChannelEmptyState
            className={cn(GIFT_PREMIUM_STATE_MIN, RISE)}
            icon="gift-simple"
            title={t(kind === 'error' ? 'giftpremium_unavailable' : 'giftpremium_no_packages')}
            action={
                kind === 'error' ? (
                    <Button variant="secondary" size="large">
                        {t('common_retry')}
                    </Button>
                ) : undefined
            }
        />
    )
}

function NoResults() {
    const { t } = useTranslation()
    return (
        <ChannelEmptyState
            className={cn(GIFT_PREMIUM_STATE_MIN, RISE)}
            art={GIFT_PREMIUM_ART.empty}
            title={t('giftpremium_no_results_title')}
            body={t('giftpremium_no_results_body')}
        />
    )
}

function SearchFailed() {
    const { t } = useTranslation()
    return (
        <ChannelEmptyState
            className={cn(GIFT_PREMIUM_STATE_MIN, RISE)}
            icon="exclamation-diamond"
            tone="error"
            title={t('giftpremium_error_title')}
            body={t('giftpremium_error_body')}
            action={
                <Button variant="secondary" size="large">
                    {t('common_retry')}
                </Button>
            }
        />
    )
}

function Section({
    title,
    note,
    children,
}: {
    title: string
    note: string
    children: React.ReactNode
}) {
    return (
        <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
                <h2 className="type-subheading-strong text-(--text-title)">{title}</h2>
                <p className="type-caption-meta max-w-[70ch] text-(--text-subtitle)">{note}</p>
            </div>
            {children}
        </section>
    )
}
