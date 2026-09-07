'use client'

import { useRequireAuth } from '@features/auth'
import { ChannelEmptyState } from '@features/channel'
import { MY_WALLET_PATH } from '@features/my-wallet/routes'
import { PageBackBar } from '@features/navigation'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Skeleton } from '@shared/ui/skeleton'
import { useSetupPayouts } from '../hooks/use-setup-payouts'
import { PAYOUT_CARD_CONTAINER } from '../lib/container'
import { PayoutConfigForm } from './payout-config-form'
import { PayoutInfoLink } from './payout-info-dialog'
import { PayoutMethodOptionRow } from './payout-method-option-row'
import { PayoutPickerField } from './payout-picker-field'

/**
 * `/my-wallet/setup-payouts` — choose where the money goes, then how it gets there.
 *
 * ## Two questions in order, and the second depends on the first
 *
 * A country, then a method: the methods on offer *are* a function of the country, so the second block
 * has nothing to show until the first is answered. Legacy renders both regardless, with an empty
 * method list under a heading that says "How would you like to get paid?" — which reads as a screen
 * that failed rather than one waiting for an answer. Here the method block says what it is waiting for.
 *
 * ## The country is preselected when it is known
 *
 * From where the visitor is calling from, read off the edge's header during the document render
 * (`shared/lib/geo-provider.tsx`) — so on a normal visit the field arrives already answered and the
 * method list is already loading. When nothing could say, it asks rather than guessing: a wrong
 * country silently offers the wrong methods. `useSetupPayouts` states the three conditions.
 *
 * ## Cards on the page colour, not one full-bleed panel
 *
 * Two blocks with a gap between them makes this a card-stack screen rather than a single-panel one
 * (`docs/DESIGN_SYSTEM.md` §6 — `MY_WALLET_SCREEN` draws the same line), so the page keeps
 * `--background` at every width. Painting the whole screen Surface below `md`, which this did first,
 * merged the country block and the method block into one white sheet with an invisible seam.
 *
 * ## The form belongs to the row
 *
 * Pressing a method opens its form inside that row, which is legacy's arrangement and the right one:
 * the fields are *about* the method, and a form in a separate panel below a list of radios loses that
 * connection the moment the list is longer than the viewport. `PayoutMethodOptionRow` owns the
 * disclosure semantics; `PayoutConfigForm` renders whatever the method asks for.
 */
export function SetupPayoutsView({ className }: { className?: string }) {
    const { t } = useTranslation()
    const requireAuth = useRequireAuth()
    const setup = useSetupPayouts()

    return (
        <>
            {/* Page-coloured, like the cards' ground: there is no panel here for the bar to continue,
                so a Surface bar would draw a seam across the top of the screen. */}
            <div className="sticky top-0 z-20 bg-(--background)">
                <PageBackBar
                    title={t('payout_setup_title')}
                    /*
                     * `/my-wallet`, not the method list: this screen is reachable from both, and the
                     * wallet is the one that always exists. A creator with no method at all has never
                     * seen `/my-wallet/payout-method`.
                     */
                    home={MY_WALLET_PATH}
                    className={PAYOUT_CARD_CONTAINER}
                />
            </div>

            <div
                className={cn(PAYOUT_CARD_CONTAINER, 'flex flex-1 flex-col gap-3 pb-6', className)}
            >
                {setup.isSignedOut ? (
                    <div className="flex flex-1 flex-col rounded-2xl bg-(--background-surface)">
                        <ChannelEmptyState
                            className={cn('flex-1', RISE)}
                            icon="bank"
                            title={t('payout_signed_out_title')}
                            body={t('payout_signed_out_body')}
                            action={
                                <Button
                                    data-testid="payout-setup-sign-in"
                                    variant="primary"
                                    size="large"
                                    onClick={requireAuth(() => undefined)}
                                >
                                    {t('auth_sign_in')}
                                </Button>
                            }
                        />
                    </div>
                ) : (
                    <>
                        <header className="flex flex-col gap-1 pt-2">
                            <h2 className="type-body-strong m-0 text-(--text-title)">
                                {t('payout_setup_heading')}
                            </h2>
                            <p className="type-dense-default m-0 text-(--text-body)">
                                {t('payout_setup_subheading')}
                            </p>
                        </header>

                        {/* ── where you bank ─────────────────────────────────────────── */}
                        <section
                            aria-label={t('payout_setup_country_label')}
                            className="flex flex-col gap-3 rounded-2xl bg-(--background-surface) p-4"
                        >
                            <div className="flex flex-col gap-1">
                                <h3 className="type-body-strong m-0 text-(--text-title)">
                                    {t('payout_setup_country_label')}
                                </h3>
                                <p className="type-dense-default m-0 text-(--text-body)">
                                    {t('payout_setup_country_help')}{' '}
                                    <PayoutInfoLink
                                        kind="location"
                                        label={t('payout_setup_more_info')}
                                        testId="payout-setup-location-info"
                                    />
                                </p>
                            </div>
                            {setup.isCountriesLoading ? (
                                <Skeleton w="100%" h={48} />
                            ) : setup.isCountriesError ? (
                                /*
                                 * An inline retry, not a wall: the rest of the screen is still
                                 * meaningful (there is nothing to choose from *yet*), and a full-page
                                 * error state would hide the heading that explains what failed.
                                 */
                                <div className="flex items-center justify-between gap-3 rounded-lg bg-(--background-segment) p-3">
                                    <span className="type-dense-default text-(--text-body)">
                                        {t('payout_setup_countries_error')}
                                    </span>
                                    <Button
                                        data-testid="payout-setup-countries-retry"
                                        variant="secondary"
                                        size="small"
                                        onClick={setup.retryCountries}
                                    >
                                        {t('common_retry')}
                                    </Button>
                                </div>
                            ) : (
                                /*
                                 * The code rides along as the row's subtitle, which is what makes the
                                 * search useful: `PayoutPickerField` matches the value too, so typing
                                 * `US` finds the United States.
                                 */
                                <PayoutPickerField
                                    testId="payout-setup-country"
                                    label={t('payout_setup_country_field')}
                                    dialogTitle={t('payout_setup_location_dialog_title')}
                                    placeholder={t('payout_setup_country_placeholder')}
                                    value={setup.country?.code ?? ''}
                                    options={setup.countries.map(country => ({
                                        value: country.code,
                                        label: country.name,
                                        subtitle: country.code,
                                    }))}
                                    onSelect={setup.selectCountry}
                                />
                            )}
                        </section>

                        {/* ── how it gets there ──────────────────────────────────────── */}
                        <section
                            aria-label={t('payout_setup_methods_label')}
                            /* The rows run to the card's edges (they bring their own `px-4`), so the
                               inset is vertical only and the header carries the horizontal one. */
                            className="flex flex-col gap-3 overflow-clip rounded-2xl bg-(--background-surface) py-4"
                        >
                            <div className="flex flex-col gap-1 px-4">
                                <h3 className="type-body-strong m-0 text-(--text-title)">
                                    {t('payout_setup_methods_label')}
                                </h3>
                                <p className="type-dense-default m-0 text-(--text-body)">
                                    {t('payout_setup_methods_help')}{' '}
                                    <PayoutInfoLink
                                        kind="timing"
                                        label={t('payout_setup_learn_more')}
                                        testId="payout-setup-timing-info"
                                    />
                                </p>
                            </div>

                            {!setup.country ? (
                                <p
                                    data-testid="payout-setup-awaiting-country"
                                    className="type-dense-default px-4 pb-4 text-(--text-subtitle)"
                                >
                                    {t('payout_setup_pick_country_first')}
                                </p>
                            ) : setup.isMethodsLoading ? (
                                <div className="flex flex-col gap-3 px-4 pb-4">
                                    {[0, 1, 2].map(index => (
                                        <div key={index} className="flex items-center gap-3">
                                            <Skeleton w={28} h={28} />
                                            <Skeleton w="60%" h={16} delay={index * 80} />
                                        </div>
                                    ))}
                                </div>
                            ) : setup.isMethodsError ? (
                                <div className="px-4 pb-4">
                                    <ChannelEmptyState
                                        className={RISE}
                                        icon="exclamation-diamond"
                                        tone="error"
                                        title={t('payout_setup_methods_error_title')}
                                        body={t('payout_setup_methods_error_body')}
                                        action={
                                            <Button
                                                data-testid="payout-setup-methods-retry"
                                                variant="secondary"
                                                size="large"
                                                onClick={setup.retryMethods}
                                            >
                                                {t('common_retry')}
                                            </Button>
                                        }
                                    />
                                </div>
                            ) : setup.isMethodsEmpty ? (
                                /*
                                 * A real backend answer, not a failure: the country is payout-enabled
                                 * but has no method configured for this account. Legacy renders an
                                 * empty fragment here, so the screen simply stops.
                                 */
                                <div className="px-4 pb-4">
                                    <ChannelEmptyState
                                        className={RISE}
                                        icon="bank"
                                        title={t('payout_setup_methods_empty_title')}
                                        body={t('payout_setup_methods_empty_body', {
                                            country: setup.country.name,
                                        })}
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-col pb-2">
                                    {setup.methods.map((method, index) => (
                                        <PayoutMethodOptionRow
                                            key={method.id}
                                            method={method}
                                            selected={setup.selected?.id === method.id}
                                            rule={index > 0}
                                            onSelect={next => setup.select(next ? method : null)}
                                        >
                                            <PayoutConfigForm method={method} setup={setup} />
                                        </PayoutMethodOptionRow>
                                    ))}
                                </div>
                            )}
                        </section>
                    </>
                )}
            </div>
        </>
    )
}
