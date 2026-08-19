import type { LegalDocument } from './types'

/**
 * The Tevi Premium terms of service, ported verbatim from the legacy app
 * (`tevi-web-app/src/containers/termsPremium/components/content/index.js`).
 *
 * A document in its own right, not a section of `terms-of-use.ts`: legacy served it from
 * its own route (`/terms/tevi-premium`) with its own effective date, and the subscription
 * terms are what an app store reviewer is sent to read on their own.
 *
 * **English only, and deliberately not in `translation.json`** — same reasoning as the
 * other two documents: legacy ships this text hardcoded in English at every locale, and a
 * legal document is not ours to paraphrase. Only the page chrome goes through i18n.
 *
 * Wording is unchanged, including its slips ("Use of Service Prohibited Conduct" and
 * "Availability Software Requirements" are both missing an ampersand, and the sub-heading
 * numbering alternates between "3.1" and "3.2."). Three *rendering* differences from
 * legacy, none of them text:
 *
 *  1. The numbers are gone from the section titles ("1. Introduction" → "Introduction").
 *     The renderer numbers the sections itself, so leaving them in printed "1. 1.".
 *  2. Legacy wrote its bullets as one paragraph of `-` prefixes separated by `<br />`;
 *     they are real list blocks here, which is what they always were semantically.
 *  3. Clause 9 was a single such "bullet" with nothing to list against — a paragraph here,
 *     because a lone dash on its own line is a rendering artefact, not the copy.
 *
 * Section ids are the legacy ones — external links and the mobile app point at them —
 * with one correction: legacy's `third‑party-purchases-terms` id contains U+2011 (a
 * non-breaking hyphen), which has to be percent-encoded in a fragment, so that anchor
 * never worked as a link. The id is plain ASCII here; the *title* keeps the U+2011.
 */
export const TERMS_PREMIUM: LegalDocument = {
    effectiveDate: 'September 2025',
    intro: [
        {
            kind: 'paragraph',
            text: 'By using Tevi.com and its services, you also accept Tevi Privacy Policy and agree to abide by these Terms of Service.',
        },
    ],
    sections: [
        {
            id: 'introduction',
            title: 'Introduction',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'Tevi.com (“Tevi”) provides a platform for Livestream and entertainment (the “Service”), which may include free features and subscription-based premium features (“Tevi Premium”). By subscribing to Tevi Premium, you agree to recurring monthly or yearly payments using the payment method you select, until you or Tevi cancel the subscription.',
                },
            ],
        },
        {
            id: 'use-of-service-prohibited-conduct',
            title: 'Use of Service Prohibited Conduct',
            blocks: [
                { kind: 'paragraph', text: 'You agree that you will not use Tevi to:' },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Send spam, scams, or otherwise engage in fraudulent or deceptive practices.',
                        },
                        { text: 'Promote violence, hatred, or discrimination.' },
                        {
                            text: 'Post or distribute illegal content, pornography, or content that violates applicable laws.',
                        },
                        {
                            text: 'Violate any third party’s rights (privacy, copyright, trademark, etc.).',
                        },
                    ],
                },
            ],
        },
        {
            id: 'payment-subscription-premium-service',
            title: 'Payment, Subscription & Premium Service',
            blocks: [
                { kind: 'subheading', text: '3.1 Subscription and Payment' },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Tevi Premium unlocks additional features and enhanced functionality.',
                        },
                        {
                            text: 'Payments are recurring (monthly or yearly) and will continue until canceled by you or terminated by Tevi.',
                        },
                        {
                            text: 'We use third‑party payment processors to process subscription payments securely.',
                        },
                    ],
                },
                { kind: 'subheading', text: '3.2. Taxes & Conversion Rates' },
                {
                    kind: 'list',
                    items: [
                        { text: 'You’re responsible for any applicable local taxes or fees.' },
                        {
                            text: 'Payment processors may apply commissions, conversion rates, or fees beyond Tevi’s control.',
                        },
                    ],
                },
            ],
        },
        {
            id: 'cancellation-refunds',
            title: 'Cancellation & Refunds',
            blocks: [
                { kind: 'subheading', text: '4.1 Cancelling a Subscription' },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'You may cancel Tevi Premium at any time via your account’s subscription settings.',
                        },
                        {
                            text: 'If subscribed via a third party (e.g. Apple App Store, Google Play, other), cancel through that third party’s interface as required.',
                        },
                    ],
                },
                { kind: 'subheading', text: '4.2. Refunds & Effective Cancellation' },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'After cancellation, your Premium access will continue until the end of the current billing period.',
                        },
                        {
                            text: 'Generally, no refunds or credits will be issued for unused time or early cancellation.',
                        },
                        {
                            text: 'Deleting your Tevi account or uninstalling the app does not automatically cancel the subscription.',
                        },
                    ],
                },
            ],
        },
        {
            id: 'changes-premium-services-pricing',
            title: 'Changes to Premium Services & Pricing',
            blocks: [
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Tevi may add, remove, or modify Premium features, or change pricing, to reflect changes in business, economics, or legal conditions.',
                        },
                        {
                            text: 'If there are material changes (e.g. price increases), Tevi will provide at least 30 days’ advance notice via your registered email or via the app.',
                        },
                        {
                            text: 'You will have the option to cancel before new fees or terms take effect.',
                        },
                    ],
                },
            ],
        },
        {
            id: 'availability-software-requirements',
            title: 'Availability Software Requirements',
            blocks: [
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'We aim to make Tevi and its services available at all times, but technical issues or outages may occur. Tevi is not liable for losses due to temporary unavailability.',
                        },
                        {
                            text: 'Some features may require updating to the latest version of the Tevi app or software.',
                        },
                        {
                            text: 'In some cases, recipients of your shared content may also need updated versions to view certain Premium content or features.',
                        },
                    ],
                },
            ],
        },
        {
            id: 'third-party-purchases-terms',
            title: 'Third‑Party Purchases & Terms',
            blocks: [
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'If you purchase Tevi Premium via a third party (e.g. app store), your purchase may be subject to that third party’s terms in addition to these Terms.',
                        },
                        {
                            text: 'Refunds or chargebacks handled by third parties may require Tevi to disclose information about your account status or purchases to those third parties for verification.',
                        },
                    ],
                },
            ],
        },
        {
            id: 'termination',
            title: 'Termination',
            blocks: [
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'If you violate these Terms or applicable law, Tevi may suspend or terminate your access to all or part of the Service (including Premium).',
                        },
                        {
                            text: 'Tevi may decide to stop offering Tevi Premium or other features at any time. If so, Tevi will cancel your subscription and refund any prorated unused portion of prepaid fees, where legally required.',
                        },
                    ],
                },
            ],
        },
        {
            id: 'no-liability-for-certain-losses',
            title: 'No Liability for Certain Losses',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'To the maximum extent permitted by law, Tevi is not responsible for direct or indirect losses, costs or damages (financial or otherwise) arising from your use of the Service or from inability to use Premium features due to errors, outages, or third‑party dependencies.',
                },
            ],
        },
        {
            id: 'changes-to-terms',
            title: 'Changes to Terms',
            blocks: [
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Tevi reserves the right to update or revise these Terms at any time.',
                        },
                        {
                            text: 'Material changes will be notified to you in advance (at least 30 days), via email or in‑app.',
                        },
                        {
                            text: 'Continued use of Tevi after those changes means you accept the new Terms.',
                        },
                    ],
                },
            ],
        },
    ],
}
