import type { LegalDocument } from './types'

/**
 * The Tevi privacy policy, ported verbatim from the legacy app
 * (`tevi-web-app/src/containers/privacy/components/content/index.js`).
 *
 * **English only, and deliberately not in `translation.json`.** The legacy pages ship
 * this text hardcoded in English at every locale, the platform has no translated
 * version of it, and a legal document is not ours to paraphrase — so the copy stays here
 * and only the page chrome (title, "last updated" line, table-of-contents heading)
 * goes through i18n. If Legal ever supplies translations, this file becomes a
 * per-locale lookup; the renderer does not change.
 *
 * Wording is unchanged, including its typos ("theServices", "We retains", the doubled
 * clause under Right to erasure). Three legacy *rendering* defects were fixed, because
 * they were duplication rather than text:
 *
 *  1. "How We Use Your Information" printed the same three closing paragraphs both
 *     before and after the purposes list. Kept once, after the list.
 *  2. "Your Rights" listed "Right to withdraw consent" twice; the second copy had the
 *     complete final sentence. Kept once, in the first position, with that sentence.
 *  3. A bullet under "Collected Information for Legitimate Interests" had a second
 *     bullet ("• Information regarding your access to and use of other apps") glued to
 *     the end of the device-identifiers item. Split back out.
 *
 * Section ids are the legacy ones — external links and the mobile app point at them.
 */
export const PRIVACY_POLICY: LegalDocument = {
    effectiveDate: '11 November 2024',
    intro: [
        {
            kind: 'paragraph',
            text: 'This Privacy Policy explains how Tevi Private Livestream (“Tevi” “we” “us”) process any personal data we collect from visitors and users of Tevi, services provided in relation to the website (collectively, the “Tevi Services”).',
        },
        {
            kind: 'paragraph',
            text: 'We value the privacy of users, subscribers, publishers, members, and others who visit and use the Tevi Services (collectively or individually, “you” or “users”) and want you to be familiar with how we collect, use, and disclose personal information from and about you. You may share personal information when using the Tevi Services. One example is when you provide information about yourself as part of the Tevi account creation process. Another is when you take certain actions on the Tevi Services that are public or intended to be public in nature. We encourage you to be mindful of this when considering your activity on the Tevi Services.',
        },
    ],
    sections: [
        {
            id: 'what-information-do-we-collect',
            title: 'What Information Do We Collect?',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'We obtain information about you through the means discussed below when we provide the Tevi Services. Please note that we need certain types of information so that we can provide the Tevi Services to you.',
                },
                {
                    kind: 'list',
                    items: [
                        { text: 'Account-provided Information' },
                        { text: 'Collected Information for Legitimate Interests' },
                    ],
                },
            ],
        },
        {
            id: 'account-provided-information',
            title: 'Account-provided Information',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'You consent to provide some or all of the following Personal Information when you create an account on the App or use Tevi Services:',
                },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Registration information, such as your date of birth, phone number (or email, if applicable), password, user identifier, and language;',
                        },
                        {
                            text: 'Profile information, such as your alias, profile images, gender, self-introduction;',
                        },
                        {
                            text: 'User-generated contents (“UGC”), such as comments, images, videos, sounds, or other materials that you upload, distribute or stream on the App when you use Tevi Services;',
                        },
                        {
                            text: 'Facial data, such as when you use some features provided by us to create special effects or emojis for your streaming section or pictures that you uploaded on Tevi Services, but it will not use it for other purposes nor will we share such data with any third party.',
                        },
                        {
                            text: 'Payment information, such as full name, credit or debit card number, or other payment information where required for payment;',
                        },
                        {
                            text: 'Transaction information such as the transaction serial number and transaction historical records after you purchased Paid Services;',
                        },
                        {
                            text: 'Your opt-in choices and correspondence with us, such as information used to verify with your account or to resolve your feedback or complaints;',
                        },
                        {
                            text: 'Information you provide when participating in in-app surveys and activities.',
                        },
                    ],
                },
            ],
        },
        {
            id: 'collected-information-for-legitimate-interests',
            title: 'Collected Information for Legitimate Interests',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'We may collect some or all of the following Personal Information about you when you use Tevi Services for legitimate interests:',
                },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Network activity information, such as your browsing history, search history, the videos or pages you visited, the date and time of your visits;',
                        },
                        {
                            text: 'Information from Other Sources: We may obtain additional information from third parties and sources other than the TEVI Services;',
                        },
                        {
                            text: 'Device identifiers, such as your operating system, browser type, brand, model and serial number of your mobile device, Internet Protocol (IP) address, mobile carrier, screen resolution, language setting, IMEI number, IMSI number, and media access control address;',
                        },
                        { text: 'Information regarding your access to and use of other apps;' },
                        {
                            text: 'Other location information, such as the information based on your SIM card',
                        },
                        {
                            text: "Mobile advertising identifiers, which are used by mobile operating systems and made available to advertising providers to gather metrics on mobile apps (Apple's IDFA or Google's AAID) to help us and advertisers provide ads that may be more relevant to your interests;",
                        },
                        {
                            text: 'Metadata, associating with the UGC you provided us, which describes other data and provides information about how, when, and by whom the piece of UGC was collected and how that UGC was formatted, such as hashtags used to label the keywords to the video and captions; and',
                        },
                        {
                            text: 'Cookies, small pieces of data to enable us to provide certain features collected by us or our business partners to measure and understand the web pages you click on and how you use Tevi Services, enhancing your experience using Tevi Services.',
                        },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'We may also collect, use and share your information to produce and share aggregated insights that do not identify you. Aggregated data may be derived from your Personal Information but is not considered Personal Information as this data does not directly or indirectly reveal your identity.',
                },
                {
                    kind: 'paragraph',
                    text: 'Storage and access to cookies that are set in connection with the Tevi Services are governed by the Tevi Cookie Policy (“Cookie Policy”).',
                },
            ],
        },
        {
            id: 'how-we-use-your-information',
            title: 'How We Use Your Information',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'We will only use your Personal Information when the applicable laws allow us to. In general, we use your Personal Information for the following purposes:',
                },
                {
                    kind: 'list',
                    items: [
                        {
                            lead: 'Provision of services: ',
                            text: 'to present Tevi Services and its contents to you, including any interactive features on Tevi Services, and to provide you with information, products or services that you allow us to; we also collect and use Personal Information to verify your eligibility and deliver prizes in connection with promotion activities and sweepstakes',
                        },
                        {
                            lead: 'Improvement of services: ',
                            text: 'to improve and personalize our services by presenting new services, information, recommendations, and feedback;',
                        },
                        {
                            lead: 'Customer management: ',
                            text: 'to manage a registered user’s account, to provide customer support and notices to the registered user about his account or subscription, and notices about changes to Tevi Services or any other product or service we offer or provide through it;',
                        },
                        {
                            lead: 'Communication: ',
                            text: 'to communicate and interact with you directly, for an example, we may send notifications regarding upcoming changes, promotion activities or improvements on Tevi Services;',
                        },
                        {
                            lead: 'Content review: ',
                            text: 'to review pictures, images and contents posted or generated on Tevi Services to ensure that we comply with any applicable content regulations in any relevant jurisdiction;',
                        },
                        {
                            lead: 'Customization of content: ',
                            text: 'to perform research and analysis about your use of, or interest in contents, products, advertising, or services available on Tevi Services in order to develop and display content tailored to your interests on our Website and App;',
                        },
                        {
                            lead: 'Performance Analysis: ',
                            text: 'to determine whether users of Tevi Services are unique, or whether the same user is using Tevi Services on multiple occasions, and to monitor aggregate metrics such as total number of visitors, number of videos viewed, demographic patterns;',
                        },
                        {
                            lead: 'Functionality and security: ',
                            text: 'to identify users not meeting the age limit, to diagnose or fix technology problems, and to detect, prevent, and respond to actual or potential fraud, illegal activities, or intellectual property infringement;',
                        },
                        {
                            lead: 'Marketing and advertising: ',
                            text: 'to provide you with information about our products and services that you allow us to;',
                        },
                        {
                            lead: 'Aggregation: ',
                            text: 'to aggregate information we collect about you to which one or more purposes described above.',
                        },
                        {
                            lead: 'Compliance: ',
                            text: 'to enforce our terms of use and to comply with our legal obligations.',
                        },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'Additionally, We link your contact with your activity on our Platform across all your devices, using your email or other log-in or device information. We are not responsible for the privacy practices of these third parties, and the information practices of these third parties are not covered by this Privacy Policy.',
                },
                {
                    kind: 'paragraph',
                    text: 'You may be able to refuse or disable Cookies by adjusting your browser settings. Because each browser is different, please consult the instructions provided by your browser. If you choose to refuse, disable, or delete Cookies, some of the functionality of the Platform may no longer be available to you.',
                },
                {
                    kind: 'paragraph',
                    text: 'Note that we may process your Personal Information for more than one lawful ground depending on the specific purpose for which we use your Personal Information.',
                },
            ],
        },
        {
            id: 'how-we-share-your-information',
            title: 'How We Share Your Information',
            blocks: [
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'We may also share your information with other members, subsidiaries, or affiliates of our corporate group, to improve, optimize the Platform and to prevent illegal use.',
                        },
                        {
                            text: 'We may share your Personal Information outside of Tevi Services when we have your consent, either express or implied.',
                        },
                        {
                            text: 'We may disclose your Personal Information to members of our corporate group (that is, entities that control, are controlled by, or are under common control with us) to the extent this is necessary for services, customer management, customization of content, advertising, analytics, verifications, functionality and security, and compliance.',
                        },
                        {
                            text: 'We may disclose your Personal Information to our authorized service providers that perform certain services on our behalf. These services may include fulfilling orders, processing credit card payments, customization of content, analytics, security, map navigation, data storage and cloud services, supporting our functionality, and other features offered through Tevi Services. These service providers may have access to Personal Information have access to Personal Information needed to perform their functions but are not permitted to share or use such information for any other purposes. However, if you connect to a third-party service through Tevi Services or otherwise links your Tevi account with a third-party service, you are requesting and authorizing us to share or grant access to information on your behalf with such third party. We may also send information about the content that you watched or your activities on Tevi Services to such third party in order to upgrade your experience on Tevi Services.',
                        },
                        {
                            text: 'We may disclose or share your Personal Information to a buyer or other successor in the event of a merger, divestiture, restructuring, reorganization, dissolution or other sale or transfer of some or all of our assets, whether as a going concern or as part of bankruptcy, liquidation or similar proceeding, in which Personal Information about our users is among the assets transferred. If such a sale or transfer occur, we will use reasonable efforts to try to ensure that the entity to which we transfer your Personal Information uses information in a manner that is consistent with this privacy policy.',
                        },
                        {
                            text: 'We access, preserve and share your Personal Information with regulators, law enforcement or others where we reasonably believe such disclosure is needed to (a) comply with any applicable law, regulation, legal process, or governmental request, (b) enforce applicable terms of use, including investigation of potential violations thereof, (c) detect, prevent, or otherwise prevent, or otherwise address illegal or suspected illegal activities, security or technical issues, (d) protect against harm to the rights, property or safety of our company, our users, our employees, or other third parties; or (e) to maintain and protect the security and integrity of Tevi Services or infrastructure.',
                        },
                        {
                            text: 'We may disclose aggregated information about our users. We also may share aggregated information with third parties for conducting general business analysis. This information does not contain any Personal Information and may be used to develop content and services that we hope you and other users will find of interest.',
                        },
                    ],
                },
            ],
        },
        {
            id: 'international-data-transfers',
            title: 'International Data Transfers',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'Your Personal Information may be processed by us, our trusted third party suppliers outside of the country (s) in which you reside, including in countries where data protection and privacy laws or regulations may be equivalent to, or as protective as, the data protection laws and regulations in your country. In accordance with applicable data protection and privacy laws and regulations, we will implement appropriate measures to ensure that your personal information remains protected and secure when it is transferred outside of your country to a jurisdiction that has a less adequate level of protection of personal data. These measures include (where applicable) transferring pursuant to data transfer agreements implementing standard data protection clauses.',
                },
                {
                    kind: 'paragraph',
                    text: 'We may also transfer your personal information outside of your country as permitted by applicable data protection and privacy laws and regulations. Examples include where we need to transfer your personal information: (a) to perform a contract with you (or to take steps before the contract at your request); (b) perform a contract in your interests; or (c) in relation to legal claims.',
                },
            ],
        },
        {
            id: 'links-to-other-websites-or-application',
            title: 'Links to Other Websites or Application',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'When you click on a link to any other website, mobile application or third-party content through Tevi Services, you will go to another website or other mobile application and another entity may collect information from or about you. We have no control over, do not review, and cannot be responsible for, these third-party websites or mobile applications or their contents. Please be aware that the terms of this privacy policy do not apply to these third-party websites or mobile applications or content, or to any collection of information after you click on links to these third-party websites, mobile applications or content.',
                },
            ],
        },
        {
            id: 'data-security',
            title: 'Data Security',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'We take appropriate administrative, technical and physical security measures to safeguard your Personal Information from unauthorized access and disclosure. For example, only authorized employees are permitted to access Personal Information, and they may do so only for permitted business functions. In addition, we use encryption in the transmission of certain your Personal Information between your system and ours, and we use firewalls to help prevent unauthorized persons from gaining access to your Personal Information. Please be advised, however, that we cannot fully eliminate security risks associated with the storage and transmission of your Personal Information. You should use caution whenever submitting information through Tevi Services and take special care in deciding which information you provide us with.',
                },
                {
                    kind: 'paragraph',
                    text: 'You are responsible for maintaining the secrecy of your password and account information at all times.',
                },
            ],
        },
        {
            id: 'your-choices',
            title: 'Your Choices',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'You can set your browser to refuse all or some browser cookies or to alert you when cookies are being sent. Please note that your choice to disable cookies will be specific to the particular browser or device that you are using when you disable cookies, so you may need to separately disable cookies for each type of browser or device. If you disable or refuse cookies, please note that some parts of the Website may then be inaccessible or not function properly.',
                },
                {
                    kind: 'paragraph',
                    text: 'You can at any time request to opt out from allowing us to send you push notifications by adjusting the permissions in your mobile device.',
                },
                {
                    kind: 'paragraph',
                    text: 'You can switch off GPS location, Microphone, Camera or other similar functions on your mobile device if you do not wish to share them. You can also hide your location, videos uploaded, recent active time and other information by adjusting “Privacy” setting.',
                },
                {
                    kind: 'paragraph',
                    text: 'You can choose not to provide us with Personal Information, but that may result in you being unable to use certain features of Tevi Services because such information may be required for you to register as a user, purchase Paid Services, participate in a promotion, survey, sweepstakes or make complaints.',
                },
                {
                    kind: 'paragraph',
                    text: 'You can make changes to your information, including accessing your information, correcting or updating your information or deleting your information by editing your profile in the App.',
                },
            ],
        },
        {
            id: 'your-rights',
            title: 'Your Rights',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'Some jurisdictions’ laws grant specific rights to Tevi Live users, which are set out in this section. You may have all or some of the following rights set forth below according to applicable laws. We will respond to your request consistent with the applicable laws as soon as practicable, normally within one month, after proper verification procedures. Your exercise of these rights is usually free of charge, unless we deem it is chargeable under the applicable laws.',
                },
                {
                    kind: 'paragraph',
                    lead: 'Right to access - ',
                    text: 'You may submit a request to access the Personal Information we collect about you by (a) using Help or Feedback function on Tevi Services or (b) by sending your request to us via email at support@tevi.com.',
                },
                {
                    kind: 'paragraph',
                    lead: 'Right to erasure - ',
                    text: 'You may submit a request to erase the Personal Information we collect about you by (a) using Help or Feedback function on TeviServices or (b) by sending your request to us via email. Though we cannot guarantee a complete erasure of your data that has been complete erasure of your data that has been stored in our backup servers, but we will not use the data within the backup servers for any other purpose.',
                },
                {
                    kind: 'paragraph',
                    lead: 'Right to data portability - ',
                    text: 'You may ask us to transfer some of your Personal Information, if it is collected on the basis of your consent, in structured, commonly used and machine-readable formats to you or other environments designated by you, if technically feasible, by (a) using Help or Feedback function on Tevi Services or (b) by sending your request to us via email at support@tevi.com .',
                },
                {
                    kind: 'paragraph',
                    lead: 'Right to withdraw consent - ',
                    text: 'You may withdraw your consent and ask us not to continue to collect or process your Personal Information at any time if that information is collected on the basis of your consent by (a) using Help or Feedback function on Tevi Services or (b) by sending your request to us via email. Your exercise of this right will not affect the processing activities that occurred before your withdrawal.',
                },
                {
                    kind: 'paragraph',
                    lead: 'Right to restrict processing - ',
                    text: 'You may request us to stop processing your Personal Information if you believe such information is collected unlawfully or you have other reason by (a) using Help or Feedback function on Tevi Services or (b) by sending your request to us via email at support@tevi.com. We will examine your request and respond accordingly.',
                },
                {
                    kind: 'paragraph',
                    lead: 'Right to object - ',
                    text: 'You may object to the processing of any Personal Information we collect about you, if such information is collected on the basis of legitimate interests, at any time by (a) using Help or Feedback function on Tevi Services or (b) by sending your request to us via email at support@tevi.com. Please note that we may reject your request if we demonstrate compelling legitimate grounds for the processing, which override your interests and freedom or the processing is for the establishment, exercise, or defense of legal claims.',
                },
                {
                    kind: 'paragraph',
                    lead: 'Right concerning automated decision making and profiling - ',
                    text: 'You may ask us to stop automated decision making or profile, if you believe such automated decision making and profiling has legal or similarly significant effect upon you by (a) using Help or Feedback function on Tevi Services or (b) by sending your request to us via email at support@tevi.com. We will examine your request and let you know if your request is applicable under the relevant laws and regulations. In addition to the foregoing rights, you also have the right to lodge complaints to the competent data protection authority (“DPA”), usually the DPA of your home country.',
                },
            ],
        },
        {
            id: 'retention-of-your-information',
            title: 'Retention of Your information',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'We will retain your Personal Information and other information for as long as you maintain your Tevi account.',
                },
                {
                    kind: 'paragraph',
                    text: 'You may request deletion of your account at any time in the app, or through sending email to support@tevi.com. Following such request with appropriate review by us, we will delete the data that it is not required to retain for purposes of regulatory, tax, insurance, litigation, or other legal requirements. We retains location, device, and usage data for these purposes for a reasonable period as may be necessary; while it retains such data, it may also use it for purposes of safety, security, fraud prevention and detection, and research and development. In certain circumstances, we may be unable to delete your account, such as if there’s a balance on the account or an unresolved claim or dispute. Upon resolution of the issue preventing deletion, we will delete the account as described above.',
                },
                {
                    kind: 'paragraph',
                    text: 'We may also retain certain information if necessary for purposes of safety, security, and fraud prevention. For example, if we deactivate a user’s account because of unsafe behavior or security incidents, we may retain certain information about that account to prevent that user from opening a new Tevi account in the future.',
                },
            ],
        },
        {
            id: 'changes-and-updates-to-this-privacy-policy',
            title: 'Changes and Updates to This Privacy Policy',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'We may modify or revise our privacy policy from time to time. Although we may attempt to notify you when major changes are made to this privacy policy, you are expected to periodically review the most up-to-date version found at Tevi Services so you are aware of any changes, as they are binding on you.',
                },
                {
                    kind: 'paragraph',
                    text: 'If we change anything in our privacy policy, the date of change will be reflected in the “ last updated date ” . By continuing to access or use theServices after those changes become effective, you agree to be bound by the revised Privacy Policy.',
                },
            ],
        },
        {
            id: 'no-sale-of-personal-information',
            title: 'No sale of personal information',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'In the twelve months prior to the effective date of this Disclosure, Tevi has not sold any personal information of you.',
                },
            ],
        },
        {
            id: 'no-discrimination',
            title: 'No discrimination',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'Tevi will not discriminate against any consumer for exercising their rights.',
                },
            ],
        },
    ],
}
