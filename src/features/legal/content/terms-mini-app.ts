import type { LegalDocument } from './types'

/**
 * The Terms of Service for Mini Apps, ported verbatim from the webview app
 * (`tevi-web-view/src/containers/tosMiniApp/index.js`, served there at `/tos/miniapp`;
 * an older copy lives in `tevi_web/src/pages/tos/miniapp`).
 *
 * The **user↔Tevi** half of the mini app agreement, and the counterpart to
 * `PRIVACY_POLICY_MINI_APP`, which is the user↔developer half. Its subject is the Tevi
 * Mini App Feature itself — that Tevi neither operates the apps nor processes their
 * payments — so it is a document of its own rather than a clause of `TERMS_OF_USE`,
 * exactly as both legacy sites served it.
 *
 * **English only, and deliberately not in `translation.json`**, and **no effective date**:
 * both for the same reasons as the mini app privacy policy — see its header. §7 is what
 * this document says about its own versioning.
 *
 * Wording is unchanged, including its slips: the sub-heading numbering alternates between
 * "3.1" and "3.2.", §5 opens on "section 5.1" only after two pages of unnumbered prose,
 * and the disclaimer bullets end in full stops where the older copy used semicolons.
 * Two differences from the webview source, neither of them a word:
 *
 *  1. **A duplicated paragraph is dropped.** §1 ends with "For clarity, your continued
 *     access to and use of TMAF shall constitute your acceptance…" twice over, verbatim,
 *     as a single `<p>` with a `<br /><br />` between the copies. The earlier `tevi_web`
 *     build has it once, which is what is here. Nothing else in either build differs in
 *     that clause, so this is a transcription artefact rather than emphasis — if legal
 *     says otherwise, adding the paragraph back is one entry in this array.
 *  2. The numbers are gone from the section titles ("2. Mini Apps" → "Mini Apps"): the
 *     renderer numbers the sections itself. Sub-heading and clause numbers *inside* the
 *     copy stay, and the bullets are real list blocks, which is what they always were.
 *
 * The sub-clause numbering follows the webview build (5.1 Indemnity, 5.2 Conflicts of
 * Rules), not `tevi_web`'s 5.3/5.4 — section 5 has no other sub-clauses, so the webview's
 * is the corrected one.
 */
export const TERMS_MINI_APP: LegalDocument = {
    intro: [
        {
            kind: 'paragraph',
            text: 'Mini Apps (“MA”) on Tevi allow you to connect to third-party Service Providers (“SP”) in their mini app environment and access services or purchase goods directly from such Service Providers using Tevi apps.',
        },
        {
            kind: 'paragraph',
            text: 'These Terms of Service for Mini Apps (“MA Terms”) govern your usage of the Tevi Mini App Feature (“TMAF”) provided by Tevi International Co. Ltd (“Tevi”) and constitute a legally binding agreement between you and Tevi. For the purposes of these terms, ‘we’, ‘us’, and ‘our’ refers to Tevi, and ‘you’ refers to you, the user of the TMAF.',
        },
        {
            kind: 'paragraph',
            text: 'When you connect to a Mini App (“MA”), you may be further subject to its SP terms as agreed between you and the SP. Such terms are to be considered in addition to this document.',
        },
    ],
    sections: [
        {
            id: 'acceptance-of-ma-terms',
            title: 'Acceptance of MA Terms',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'By using the TMAF, you agree that you have read in full, understood, and accepted to be legally bound by the terms contained herein, in addition to Tevi’s Terms of Service, Tevi’s Privacy Policy, and the respective Terms of Service of each MA you access, if any. All of the aforementioned terms may be amended from time to time without notice. Should you decide to purchase goods through an MA, you may further be subject to the Terms of Service of the provider that will process your payment, as agreed between you and the payment provider. For clarity, your continued access to and use of TMAF shall constitute your acceptance of these MA Terms and all other terms that are incorporated herein, including any updates or modifications to them from time to time.',
                },
            ],
        },
        {
            id: 'mini-apps',
            title: 'Mini Apps',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'All products and services offered via TMAF are offered and managed by third-party SP. These SP are also responsible for any continued operation and maintenance for their MA on the Tevi platform. We are not affiliated with any of these SP, and they operate independently of Tevi. By using TMAF on the Tevi platform, you acknowledge and agree that:',
                },
                {
                    kind: 'list',
                    items: [
                        { text: 'You are accessing a third-party service directly from its SP.' },
                        {
                            text: 'Tevi only provides SP with access to third-party payment providers via its Payment Platform, and does not itself process payments or hold funds.',
                        },
                        {
                            text: 'SP may have additional terms as a part of their products or services with which you must comply.',
                        },
                        {
                            text: 'You fully acknowledge and explicitly assume any and all risks related to transactions with SP, and agree that we shall not be liable for any risks or adverse consequences arising from such transactions.',
                        },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'The individual SP that operate MA are solely responsible for the content, products, goods, or services made available to you directly via their respective MA – including but not limited to quality, performance and availability. You should contact the respective SP directly with any queries, and any disputes shall be resolved directly with the respective SP.',
                },
                {
                    kind: 'paragraph',
                    text: 'Cancellations or refunds for purchases from SP via TMAF are subject to the applicable terms of the specific SP from which the purchase was made. Tevi has no role in processing payments and governing refund or cancellation charges. Any disputes must be resolved by contacting the SP directly, who is responsible for resolving the dispute.',
                },
            ],
        },
        {
            id: 'payment',
            title: 'Payment',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'Tevi does not process payments. Instead, payments are processed by third-party payment providers, which are chosen by the SP for their MA, at the SP’s sole discretion.',
                },
                { kind: 'subheading', text: '3.1 Payment Information' },
                {
                    kind: 'paragraph',
                    text: 'Tevi does not store your credit card details for purchases made via TMAF. Such data is handled solely by third-party payment providers. See our Privacy Policy for more details.',
                },
                { kind: 'subheading', text: '3.2. Payment-Related Disputes' },
                {
                    kind: 'paragraph',
                    text: 'Payments conducted or initiated through a MA are processed by a third-party payment provider, as agreed between you, the SP and the payment provider, which at times may coincide.',
                },
                {
                    kind: 'paragraph',
                    text: 'Tevi does not handle, manage, oversee, verify or provide any sort of warranty over such transactions. Consequently, any disputes, claims, losses, misunderstandings, technical errors, or issues of any kind (both accidental and allegedly intentional) related to payments or transactions must be directed towards the respective payment provider SP. Tevi bears no responsibility whatsoever and will not be a party to any payment-related disputes or discussions, nor is it liable for any losses or damages the parties involved may incur.',
                },
            ],
        },
        {
            id: 'privacy',
            title: 'Privacy',
            blocks: [
                { kind: 'subheading', text: '4.1. Data We Share' },
                {
                    kind: 'paragraph',
                    text: 'When you interact with an MA, it will automatically acquire your IP address. Additionally, depending on which MA you use and how it was opened, we may also share some basic data with it, like your Tevi user ID, public Tevi space, slug and profile picture, an IETF language tag of your client language, your premium subscription status and some color parameters related to your in-app theme.',
                },
                {
                    kind: 'paragraph',
                    text: 'MA launched from the attachment menu in private chats will also receive similar information about your chat partner. MA launched from the attachment menu in channels and group chats may also receive the ID, type, title, username, slug, and photo of the chat in which they were opened.',
                },
                {
                    kind: 'paragraph',
                    text: 'By utilizing the TMAF, you expressly acknowledge and understand that such data will be shared with the SP that operates the MA you choose to access. Further, you agree not to hold us liable for any mismanagement, misuse, or mishandling of this data by the SP, under any circumstances.',
                },
                { kind: 'subheading', text: '4.2. Data You Share' },
                {
                    kind: 'paragraph',
                    text: 'You may also choose to provide certain data to the MA, including but not limited to your phone number, text, media, or locations in order to facilitate the service offered by its SP, or for any other reason as determined solely by you. By providing this data to the MA, you are in turn providing it to the SP, which is responsible for handling and storing any data provided to it.',
                },
                {
                    kind: 'paragraph',
                    text: 'Any processing or collection of data by the SP via TMAF is subject to any applicable terms between you and the SP. After transmitting it, Tevi does not have any access to or control over data shared between users and SP via TMAF. Any data that is shared with Tevi itself is governed by the Tevi Privacy Policy. Accordingly, you agree not to hold Tevi liable should the SP mismanage, misuse, or mishandle the data you provide to it, under any circumstances.',
                },
            ],
        },
        {
            id: 'disclaimers',
            title: 'Disclaimers',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'To the maximum extent permitted under applicable law, TMAF is offered to you on an “as is” and “as available” basis, and you agree to waive, and we categorically disclaim, any and all other warranties of any kind, whether express or implied, regardless of nature, including, without limitation, warranties of merchantability, fitness for a particular purpose, title or non-infringement warranties that arise from course of performance, course of dealing or usage in trade.',
                },
                {
                    kind: 'paragraph',
                    text: 'Without limiting the foregoing, we do not represent or warrant: (a) that TMAF, its contents and all goods or services provided therein are reliable, accurate, up-to-date, truthful, complete, functional, error-free, free of malware, and any other harmful or otherwise unwanted elements; or (b) that the goods and services you have purchased and will receive directly from the SP will remain available, functional, performant, relevant or maintain any value or quality.',
                },
                {
                    kind: 'paragraph',
                    text: 'You further acknowledge and agree that matters, issues, complaints and disputes pertaining to warranty, guarantee, quality and service shall be resolved in accordance with the terms set forth by the SP, and you consent to manage such concerns and disputes directly with the SP, without involving Tevi in any capacity.',
                },
                {
                    kind: 'paragraph',
                    text: 'Since goods and services are provided by the respective SP, you recognize and agree that we shall have no obligation, liability or responsibility to you concerning the goods and services, their quality, functionality, performance, value or general availability.',
                },
                {
                    kind: 'paragraph',
                    text: 'You further understand and agree that we will not be liable for any damages or losses due to or relating to:',
                },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Any inaccuracy, defect, error or omission of price data, including but not limited to cryptocurrency price data.',
                        },
                        {
                            text: 'Any error or delay in the transmission of price data, including but not limited to the transmission of your orders to both SP and payment providers, interruption in any such data.',
                        },
                        {
                            text: 'Any routine, unannounced or unscheduled maintenance as we see fit, either carried out by us directly, by our partners or by SP. This includes but is not limited to temporary or permanent interruptions in the provision of TMAF or goods and services deriving from or sustained as a result of such maintenance.',
                        },
                        {
                            text: 'Any harm or damage incurred as a result of illegal actions by third parties that were not sanctioned by us.',
                        },
                        {
                            text: 'Any harm or damage resulting either directly or indirectly from user actions, negligence, omissions or violations of any applicable laws and governing terms.',
                        },
                        {
                            text: 'Any other exceptions as described herein or in any other terms that govern your use of TMAF.',
                        },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'You acknowledge and agree that these MA Terms govern the relationship between you and us. Any and all agreements, dealings, transactions, or any other form of engagement you may have with Service Providers are solely between you and the respective SP; this includes SP found through, accessed through, or promoted through the TMAF. We have no liability, obligation, or responsibility to you in relation to any SP, including but not limited to their respective content, goods, services, terms either express or implied, or any other deliverables you obtained or intended to obtain from such SP, regardless of your optional engagement with the SP through their MA using Tevi’s TMAF.',
                },
                {
                    kind: 'paragraph',
                    text: 'By accepting these MA Terms, you acknowledge and fully understand that MA are operated by third parties. In light of this understanding, you agree that any and all legal actions, claims, or disputes arising out of or in relation to your usage of MA shall be exclusively directed towards the SP that operated the relevant MA. Further, to the maximum extent permitted under applicable law, no such legal recourse shall be initiated against Tevi.',
                },
                { kind: 'subheading', text: '5.1 Indemnity' },
                {
                    kind: 'paragraph',
                    text: 'You accept and agree to grant Tevi and its subsidiaries, affiliates, officers, agents, contractors and employees absolute indemnity and to hold them harmless from and against any and all claims, actions, proceedings, obligations, investigations, demands, suits, expenses, costs and damages (including but not limited to legal fees, fines or penalties imposed by any authorities or regulatory institutions) arising from, related to, or in any way incurred as a result of your use of, conduct in connection with, your purchase, receipt of and access to services and goods from the SP via the TMAF. For clarity, this indemnity clause complements the rights, privileges and protections already provided to us under the Tevi Terms of Service (if applicable).',
                },
                { kind: 'subheading', text: '5.2 Conflicts of Rules' },
                {
                    kind: 'paragraph',
                    text: 'Should any controversy arise between these MA Terms, the SP terms and any other provisions governing your use of MA, it shall be resolved in the manner that is most favorable to Tevi, to the full extent permitted under applicable law.',
                },
            ],
        },
        {
            id: 'modification-of-tmaf',
            title: 'Modification of TMAF',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'We may, at our sole and absolute discretion and without liability, at any time and without notice, modify TMAF in any way we deem necessary. We hold no liability for how these changes may affect access to and services provided by MA. SP are solely responsible for ensuring that their services are available to their users and compatible with TMAF. These changes include but are not limited to:',
                },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Altering, suspending, or fully discontinuing features within the MA platform, including but not limited to the TMAF itself.',
                        },
                        {
                            text: 'Restricting certain users from accessing TMAF or the Tevi platform.',
                        },
                        {
                            text: 'Adjusting, modifying or radically reshaping the way in which users find, access, interact with or otherwise make use of TMAF, to meet evolving technological, economical or regulatory standards.',
                        },
                    ],
                },
            ],
        },
        {
            id: 'changes-to-ma-terms',
            title: 'Changes to MA Terms',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'We will review and may update these MA Terms from time to time. Any changes to these MA Terms will become effective when we post the revised TMAF Terms of Service on this page. Please check our website frequently to see any updates or changes to our Terms, an optional summary of which we may set out below.',
                },
            ],
        },
    ],
}
