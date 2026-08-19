import type { LegalDocument } from './types'

/**
 * The Tevi terms of use, ported verbatim from the legacy app
 * (`tevi-web-app/src/containers/terms/components/content/index.js`).
 *
 * **English only, and deliberately not in `translation.json`** — same reasoning as
 * `privacy-policy.ts`: legacy ships this text hardcoded in English at every locale, and a
 * legal document is not ours to paraphrase. Only the page chrome goes through i18n.
 *
 * Wording is unchanged, including its slips ("TEVI make no representations", the doubled
 * "TEVI are property of TEVI are protected", "no other rights are vested in either
 * Party"). Two *rendering* differences from legacy, neither of them text:
 *
 *  1. The numbers are gone from the titles ("1. Special Notices" → "Special Notices").
 *     The renderer numbers the sections itself, so leaving them in printed "1. 1.".
 *  2. `support@tevi.com` was a bare `<span>` in legacy — styled, not a link. It stays
 *     plain text here, because the block types carry no inline markup.
 *
 * Section ids are the legacy ones — external links and the mobile app point at them.
 */
export const TERMS_OF_USE: LegalDocument = {
    effectiveDate: '27 November 2025',
    intro: [],
    sections: [
        {
            id: 'special-notices',
            title: 'Special Notices',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'These Terms of Service ("Terms") govern your access to and use of the Tevi livestreaming application, website, and related services (collectively, the "Services"), provided by Tevi Corporation ("we," "us," or "our"), a corporation located in California, USA. For the purposes of this Agreement, you and TEVI will be jointly referred to as the "Parties" and respectively as a "Party".',
                },
                {
                    kind: 'paragraph',
                    text: 'We may modify these Terms from time to time. We will notify you of material changes as required by law. Your continued use of the Services after the effective date of revised Terms constitutes your acceptance of the changes.',
                },
                {
                    kind: 'paragraph',
                    text: "When using the Services, you will be subject to TEVI's Privacy Policy, Broadcaster Agreement and you be subject to additional guidelines or rules that are posted on the Services or made available to you, or applicable to specific services and features that are disclosed to you in connection with such services. We may also offer certain paid services, which are subject to any additional terms or conditions that are disclosed to you in connection with such services.",
                },
                {
                    kind: 'paragraph',
                    text: 'By using our Services, or by clicking on "Sign Up" during the registration process, you agree to be bound by all terms of this Agreement and our Privacy Policy. We, at our sole discretion, may modify these Terms from time to time. By continuing to avail our Services, you agree to be bound by the revised Agreement. You may only use our Service according to the applicable laws and regulations in your country. You shall be solely responsible for the safekeeping of your TEVI account and password. All behaviors and activities conducted through your TEVI account will be deemed as your behaviors and activities for which you shall be solely responsible. If you do not agree to these Terms, you may not access or use the Services.',
                },
            ],
        },
        {
            id: 'services',
            title: 'Services',
            blocks: [
                {
                    kind: 'paragraph',
                    text: "Our mission is to give people the platform providing an unlimited source of premium live content; or go live, become a social influencer, build user's community, connect the world. To help advance this mission with a vision to be a content platform inspiring one billion people's lives, we provide the services described below to you:",
                },
                { kind: 'subheading', text: 'i. TEVI' },
                {
                    kind: 'paragraph',
                    text: 'Allows users to distribute streaming live, use TEVI services, such as chat, voice interactive services, and to participate in other activities in which you may create (User Content). Users of the Services may also overlay music, graphics, stickers, virtual items and other features provided by TEVI ("TEVI Features") onto this User Content and transmit this User Content through the Services. The views expressed by other users on the Services (including through use of the virtual gifts) do not represent our views or values.',
                },
                { kind: 'subheading', text: 'ii. Global access to our Services' },
                {
                    kind: 'paragraph',
                    text: 'To operate our global service, we need to store and distribute content and data in our data centers and systems around the world, including outside your country of residence. This infrastructure may be operated or controlled by Tevi Corporation and its affiliates.',
                },
            ],
        },
        {
            id: 'account',
            title: 'Account',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'You are solely responsible for maintaining the confidentiality of your account and password, for restricting access to your computer, and for all activities that occur under your account or password. Please make sure the information you provide to TEVI upon registration and at all other times is true, accurate, current, and complete to the best of your knowledge.',
                },
                {
                    kind: 'paragraph',
                    text: "We may permit you to register for and log on to the Services via certain third party services. The third party's collection, use and disclosure of your information will be subject to that third party service's privacy policy. Further information about how TEVI collects, uses and discloses your personal information when you link your TEVI account and with your account on any third party service can be found in our Privacy Policy.",
                },
                {
                    kind: 'paragraph',
                    text: 'We reserve the right to disable your user account at any time, including if you have failed to comply with any of the provisions of these terms, or if activities occur on your account which, in our sole discretion, would or might cause damage to or impair the Services or infringe or violate any third party rights, or violate any applicable laws or regulations.',
                },
                {
                    kind: 'paragraph',
                    text: 'If you no longer want to use our Services again, and would like your account deleted, we can take care of this for you. Please contact us via support@tevi.com, and we will provide you with further assistance and guide you through the process. Once you choose to delete your account, you will not be able to reactivate your account or retrieve any of the content or information you have added.',
                },
            ],
        },
        {
            id: 'privacy',
            title: 'Privacy',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'Your privacy is important to TEVI. Please see our Privacy Policy for information relating to how we collect, use, and disclose your personal information, and how you can manage your online privacy when you use the Services.',
                },
            ],
        },
        {
            id: 'use-of-the-services',
            title: 'Use of the Services',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'Your access to and use of the Services is subject to these terms and all applicable laws and regulations. You agree that you will comply with these terms of Services and will not:',
                },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Create, upload, transmit, distribute, or store any content that is inaccurate, unlawful, infringing, defamatory, obscene, pornographic, invasive of privacy or publicity rights, harassing, threatening, abusive, inflammatory, or otherwise objectionable;',
                        },
                        {
                            text: "Impersonate any person or entity, falsely claim an affiliation with any person or entity, or access TEVI accounts of others without permission, forge another person's identity, or content of information transmitted via the Services, or perform any other similar fraudulent activity;",
                        },
                        {
                            text: 'Defame, harass, abuse, threaten or defraud users of TEVI, or collect, or attempt to collect, personal information about users or third parties without their consent;',
                        },
                        {
                            text: 'Remove, circumvent, disable, damage or otherwise interfere with security-related features of the Services or User Content, features that prevent or restrict use or copying of any content accessible through the Services, features that enforce limitations on the use of the Services or User Content, or delete the copyright or other proprietary rights notices on the Services or User Content;',
                        },
                        {
                            text: 'Reverse engineer, decompile, disassemble or otherwise attempt to discover the source code of the Services or any part thereof, except and only to the extent that this activity is expressly permitted by the law of your jurisdiction of residence;',
                        },
                        {
                            text: 'Modify, adapt, translate or create derivative works based upon the Services or any part thereof, except and only to the extent that such activity is expressly permitted by applicable law notwithstanding this limitation;',
                        },
                        {
                            text: "Interfere with or damage operation of the Services or any user's enjoyment of them, by any means, including uploading or otherwise disseminating viruses, adware, spyware, worms, or other malicious code;",
                        },
                        {
                            text: 'Manipulate identifiers in order to disguise the origin of any User Content transmitted;',
                        },
                        {
                            text: 'Interfere with or disrupt the Services or servers or networks connected to the Services, or disobey any requirements, procedures, policies or regulations of networks connected to the Services; use the Services in any manner that could interfere with, disrupt, negatively affect or inhibit other users from fully enjoying the Services, or that could damage, disable, overburden or impair the functioning of the Services in any manner;',
                        },
                        {
                            text: 'Attempt to circumvent any content filtering techniques we employ, or attempt to access any service or area of the Services that you are not authorized to access;',
                        },
                        {
                            text: 'Use the Services for any illegal purpose, or in violation of any local, state, national, or international law or regulation, including, without limitation, laws governing intellectual property and other proprietary rights, data protection and privacy.',
                        },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'TEVI takes no responsibility and assumes no liability for any User Content or for any loss or damage resulting therefrom, nor is TEVI liable for any mistakes, defamation, slander, libel, omissions, falsehoods, obscenity, pornography or profanity you may encounter when using the Services. Your use of the Services is at your own risk. In addition, these rules do not create any private right of action on the part of any third party or any reasonable expectation that the Services will not contain any content that is prohibited by such rules.',
                },
                {
                    kind: 'paragraph',
                    text: 'TEVI is not liable for any statements or representations included in User Content. TEVI does not endorse any User Content, opinion, recommendation, or advice expressed therein, and TEVI expressly disclaims any and all liability in connection with User Content. To the fullest extent permitted by applicable law, TEVI reserves the right to remove, screen or edit any User Content posted or stored on the Services at any time and without notice, including where such User Content violates these terms of Use of the Services or applicable law, and you are solely responsible for creating backup copies of and replacing any User Content you post or store on the Services at your sole cost and expense. Any use of the Services in violation of the foregoing violates these terms of Use of the Services and may result in, among other things, termination or suspension of your rights to use the Services.',
                },
            ],
        },
        {
            id: 'virtual-items',
            title: 'Virtual Items',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'The price of the Stars will be displayed at the point of purchase. All charges and payments for Stars will be made in the currency specified at the point of purchase through the relevant payment mechanism. Currency exchange settlements, foreign transaction fees and payment channel fees, if any, are based on your agreement with the applicable payment provider.',
                },
                {
                    kind: 'paragraph',
                    text: 'You will be responsible for the payment of any Stars purchased by you. Once your purchase has been completed, your user account will be credited with Stars. Stars can be used to purchase Gifts. Stars cannot be exchanged for cash, or legal tender, or currency of any state, region, or any political entity, or any other form of credit. Stars can only be used on TEVI and as part of our Services, and cannot be combined or used in conjunction with other promotions, coupons, discounts or special offers, except those designated by us.',
                },
                {
                    kind: 'paragraph',
                    text: 'Except as otherwise set out in this Agreement, all sales of Stars and Gifts are final, and we do not offer refunds for any purchased Stars and Gifts. Stars and Gifts cannot be converted into or exchanged for cash, or be refunded or reimbursed by us for any reason.',
                },
            ],
        },
        {
            id: 'payment-terms',
            title: 'Payment Terms',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'We accept major credit cards, certain debit cards and/or such other payment methods we may make available to you from time-to-time through our site, as forms of payment. You are subject to all terms and conditions of the payment method you choose. By submitting an order through the Service, you authorize us, or our designated payment processor, to charge the account you specify for the purchase amount. All payments are to be made in United States Dollars, except where other currencies are offered via the payment methods made available by TEVI.',
                },
                {
                    kind: 'paragraph',
                    text: 'Our payment processing partners may request that you provide certain personal data (e.g., a valid government issued ID, your legal name, address, and date of birth) for the purpose of making payment through its financial institutions and complying with applicable international, national, federal, state, and local laws and regulations. They may also communicate directly with you regarding any issues with a payment.',
                },
                {
                    kind: 'paragraph',
                    text: 'If a purchase has been declined online due to issues with your payment method, please ensure all data is correct and resubmit. If the transaction is not accepted online, please contact customer support via the email address made available to you in connection with the purchase. For purchases on the Service, you may contact support@tevi.com.',
                },
            ],
        },
        {
            id: 'intellectual-property-rights',
            title: 'Intellectual Property Rights',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'All text, data, images, graphics, audio and/or video information and other materials within the Services provided by TEVI are property of TEVI are protected by copyright, trademark and/or other property rights laws. Nothing in this Agreement shall be construed as conferring any license of any intellectual property rights or such materials by TEVI to you.',
                },
                {
                    kind: 'paragraph',
                    text: 'By using and/or uploading any live stream content or other content through a TEVI Services to publicly accessible areas of TEVI website, you grant to TEVI and its sub- licensees the permission, free, permanent, irrevocable, non-exclusive and fully sub- licensable rights and license, without any territorial or time limitations and without requiring any approvals and/or compensations, to use, copy, modify, adapt, publish, translate, edit, dispose, create derivate works of, distribute, perform and publicly display such content (in whole or in part), and/or incorporate such content into existing or future forms of work, media or technology.',
                },
            ],
        },
        {
            id: 'terminating-services',
            title: 'Terminating Services',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'To the fullest extent permitted by applicable law, TEVI reserves the right, without notice and in our sole discretion, to terminate your license to use the Services (including to post User Content), and to block or prevent your future access to and use of the Services, including where we reasonably consider that: (a) your use of the Services violates this Agreement or applicable law; (b) you fraudulently use or misuse the Services; or (c) we are unable to continue providing the Services to you due to technical or legitimate business reasons. This includes the ability to terminate or to suspend your access to any purchased products or services. To the fullest extent permitted by applicable law, your only remedy with respect to any dissatisfaction with (i) the Services, (ii) any term of these terms of Services, (iii) any policy or practice of TEVI in operating the Services, or (iv) any content or information transmitted through the Services, is to terminate your account and to discontinue use of any and all parts of the Services.',
                },
            ],
        },
        {
            id: 'disclaimers',
            title: 'Disclaimers',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'You shall be fully responsible for any risks involved in using TEVI Services. Any use or reliance on TEVI Services will be at your own risk.',
                },
                {
                    kind: 'paragraph',
                    text: 'Under no circumstance does TEVI guarantee that the Services will satisfy your requirements, or guarantee that the Services will be uninterrupted. The timeliness, security and accuracy of the Services are also not guaranteed. You acknowledge and agree that the Services is provided by TEVI on an "as is" basis. TEVI make no representations or warranties of any kind express or implied as to the operation and the providing of such Services or any part thereof. TEVI shall not be liable in any way for the quality, timeliness, accuracy or completeness of the Services and shall not be responsible for any consequences which may arise from your use of such Services.',
                },
                {
                    kind: 'paragraph',
                    text: 'TEVI does not guarantee the accuracy and integrity of any external links that may be accessible by using the Services and/or any external links that have been placed for the convenience of you. TEVI shall not be responsible for the content of any linked site or any link contained in a linked site, and TEVI shall not be held responsible or liable, directly or indirectly, for any loss or damage in connection with the use of the Services by you. Moreover, TEVI shall not bear any responsibility for the content of any webpage that you are directed via an external link that is not under the control of TEVI.',
                },
                {
                    kind: 'paragraph',
                    text: 'TEVI shall not bear any liability for the interruption of or other inadequacies in the Services caused by circumstances of force majeure, or that are otherwise beyond the control of TEVI. However, as far as possible, TEVI shall reasonably attempt to minimize the resulting losses of and impact upon you.',
                },
            ],
        },
        {
            id: 'governing-law-and-dispute-resolution',
            title: 'Governing Law and Dispute Resolution',
            blocks: [
                { kind: 'subheading', text: 'A. Governing Law.' },
                {
                    kind: 'paragraph',
                    text: 'These Terms and any action related thereto will be governed by the laws of the State of California, without regard to its conflict of law provisions.',
                },
                { kind: 'subheading', text: 'B. Agreement to Arbitrate.' },
                {
                    kind: 'paragraph',
                    text: 'Most disputes can be resolved informally. If we cannot, you and Tevi agree to resolve any claim, dispute, or controversy through final and binding arbitration in the State of California, rather than in court. The arbitration will be conducted by a single arbitrator under the rules of JAMS (Judicial Arbitration and Mediation Services). Judgment on the award rendered by the arbitrator may be entered in any court having jurisdiction thereof.',
                },
                { kind: 'subheading', text: 'C. Class Action Waiver.' },
                {
                    kind: 'paragraph',
                    text: 'YOU AND TEVI AGREE THAT EACH MAY BRING CLAIMS AGAINST THE OTHER ONLY IN YOUR OR ITS INDIVIDUAL CAPACITY, AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS OR REPRESENTATIVE PROCEEDING.',
                },
            ],
        },
        {
            id: 'request-for-information',
            title: 'Request for information',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'All requests for information or documents related to potential, anticipated or current legal proceedings, investigations or disputes, or for third party user information, from any TEVI Services must be made using the appropriate level TEVI INTERNATIONAL COMPANY LIMITED.',
                },
            ],
        },
        {
            id: 'modification-of-the-agreement',
            title: 'Modification of the Agreement',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'We amend these terms of the Agreement from time to time, for instance when we update the functionality of our Services, when we combine multiple apps or services operated by us or our affiliates into a single combined service or app, or when there are regulatory changes. However, you should look at the Agreement regularly to check for such changes. Your continued access or use of the Services after the date of the new terms constitutes your acceptance of the new terms. If you do not agree to the new terms, you must stop accessing or using the Services.',
                },
            ],
        },
        {
            id: 'other-terms',
            title: 'Other Terms',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'This Agreement constitutes the entire agreement of agreed items and other relevant matters between both parties. Other than as stipulated by this Agreement, no other rights are vested in either Party to this Agreement.',
                },
                {
                    kind: 'paragraph',
                    text: 'If any provision of this Agreement is rendered void or unenforceable by competent authorities, in whole or in part, for any reason, the remaining provisions of this Agreement shall remain valid and binding.',
                },
                {
                    kind: 'paragraph',
                    text: 'The headings within this Agreement have been set for the sake of convenience, and shall be disregarded in the interpretation of this Agreement.',
                },
            ],
        },
    ],
}
