import type { LegalDocument } from './types'

/**
 * The standard privacy policy for mini apps, ported verbatim from the webview app
 * (`tevi-web-view/src/containers/privacyMiniApp/index.js`, served there at
 * `/privacy/miniapp`; the same copy also lives in `tevi_web/src/pages/privacy/miniapp`).
 *
 * A **separate document**, not a clause of `PRIVACY_POLICY`: it governs the relationship
 * between a third-party *developer* and the user (§2.2 says so in as many words), it is
 * the default policy a mini app inherits until its developer publishes one of their own,
 * and Tevi's own policy neither supersedes nor is superseded by it. Its counterpart is
 * `TERMS_MINI_APP`, which is the agreement between the user and Tevi.
 *
 * **English only, and deliberately not in `translation.json`** — same reasoning as the
 * other five documents: the platform ships no translated version and legal copy is not
 * ours to paraphrase. Only the chrome (title, contents heading) is i18n'd.
 *
 * **No effective date.** The source page prints none — not in the webview build and not
 * in the older `tevi_web` one — so `effectiveDate` is omitted and `LegalPageView` drops
 * the "last updated" line rather than inventing a month. §8 is what the document says
 * about its own versioning. If legal supplies a date, add it here and pass a
 * `lastUpdatedKey` on both routes.
 *
 * Wording is unchanged, including its slips: §1.2 and §2.4 and §3.4 end without a full
 * stop, §5.3 cites "section 6.2." from inside section 5, and the definitions use an
 * en dash where a colon would read better. One typo is corrected because it is a missing
 * *space* rather than a word — the source reads "1.5.User". Three rendering differences,
 * none of them text:
 *
 *  1. The numbers are gone from the section titles ("1. Terms and Definitions" →
 *     "Terms and Definitions"): the renderer numbers the sections itself, so leaving them
 *     in printed "1. 1.". The clause numbers *inside* a paragraph ("1.1.", "(a)") are
 *     copy, not decoration, and stay.
 *  2. Each `<br /><br />` run is a real paragraph, and each lettered item under §7 is its
 *     own paragraph rather than a soft-wrapped line. No list block: the copy carries its
 *     own "(a)" markers, so a bullet or a generated number would double them up.
 *  3. The source draws its second `h1` — "Bot and Mini App Standard Privacy Policy" — in
 *     the body, below the introduction. A page has one `h1`, and here it is the document's
 *     name in the masthead, so that line is a sub-heading closing the intro.
 */
export const PRIVACY_POLICY_MINI_APP: LegalDocument = {
    intro: [
        {
            kind: 'paragraph',
            text: 'The following serves as a standard Privacy Policy for mini apps on the Tevi platform.',
        },
        {
            kind: 'paragraph',
            text: 'By design, this policy is written to be generally applicable to a wide range of services. While this document serves as a functional agreement between developers and users, Tevi still encourages all developers to create their own, separate privacy policies to better describe the ways in which their service receives, processes and stores data from its users.',
        },
        { kind: 'subheading', text: 'Bot and Mini App Standard Privacy Policy' },
    ],
    sections: [
        {
            id: 'terms-and-definitions',
            title: 'Terms and Definitions',
            blocks: [
                {
                    kind: 'paragraph',
                    text: '1.1. Tevi – Tevi International Co. Ltd (also “we”).',
                },
                { kind: 'paragraph', text: '1.2. Platform – The Tevi Mini App' },
                {
                    kind: 'paragraph',
                    text: '1.3. Developer – The person or legal entity who operates and maintains Third-Party Service, as further defined in 3.1.',
                },
                {
                    kind: 'paragraph',
                    text: '1.4. Third-Party Service – The bot or mini app of Developer, made available to users on Platform.',
                },
                {
                    kind: 'paragraph',
                    text: '1.5. User – The person accessing Third-Party Service via their account on Platform (also “you”).',
                },
            ],
        },
        {
            id: 'general-provisions',
            title: 'General Provisions',
            blocks: [
                {
                    kind: 'paragraph',
                    text: '2.1. Policy is a standard document which applies to all third-party bots and mini apps on Platform by default, unless or until their respective developer has published a separate privacy policy.',
                },
                {
                    kind: 'paragraph',
                    text: '2.2. Policy governs solely the relationship between Developer and User. It cannot and does not regulate the relationship between Tevi and its users, nor does it supersede the Tevi Privacy Policy.',
                },
                {
                    kind: 'paragraph',
                    text: "2.3. Developer follows all privacy guidelines set forth by platforms that distribute Tevi apps, including Apple's App Review Guidelines and Google's Developer Policies.",
                },
                {
                    kind: 'paragraph',
                    text: '2.4. Policy regulates the collection, storage, distribution, usage and protection of information of Users who access Third-Party Service',
                },
                {
                    kind: 'paragraph',
                    text: '2.5. Your continued access to and use of Third-Party Service shall constitute your acceptance of Policy, the Tevi Bot Terms and the Tevi Mini App Terms.',
                },
                {
                    kind: 'paragraph',
                    text: '2.6. Note that this default Policy is meant to aid Developer in providing a functional privacy policy to their Users, with the understanding that the Policy is written to be generally applicable to a wide range of services. Accordingly, if Developer opts to use the Policy, it is solely their responsibility to ensure that the Policy fits the Developer’s use case and complies with all local laws.',
                },
                {
                    kind: 'paragraph',
                    text: '2.7. If you do not accept all the aforementioned terms, you should immediately cease your use of Third-Party Service.',
                },
            ],
        },
        {
            id: 'disclaimers',
            title: 'Disclaimers',
            blocks: [
                {
                    kind: 'paragraph',
                    text: '3.1. Third-Party Service is an independent third-party application that is neither maintained, endorsed, nor affiliated with Tevi. Developer is the person or entity defined as such.',
                },
                {
                    kind: 'paragraph',
                    text: '3.2. You understand and agree that, without limiting section 8, this Policy may be amended at any time, and it is your responsibility to review and agree to all changes.',
                },
                {
                    kind: 'paragraph',
                    text: '3.3. You acknowledge that you have read, understood and agreed to the Tevi Bot Terms and the Tevi Mini App Terms, as well as any other terms made available to you by the Developer.',
                },
                {
                    kind: 'paragraph',
                    text: '3.4. You acknowledge and warrant that you possess all the necessary rights and permissions to use Third-Party Service in compliance with applicable local laws and legal obligations, including without limitation age restrictions and third-party store terms',
                },
                {
                    kind: 'paragraph',
                    text: '3.5. Developer operates under the understanding that all information you provide is submitted in good-faith, and is not obligated to check or verify your statements for errors or inaccuracies. It is your responsibility to ensure that all information you provide is accurate and up-to-date.',
                },
                {
                    kind: 'paragraph',
                    text: '3.6. You may decide to make some information available in the public domain, either directly on Platform, elsewhere on the internet, or via Third-Party Service. The information you choose to make public may be accessed by other users of Third-Party Service via Platform or on the internet, in which case it will not be covered or protected by Policy.',
                },
            ],
        },
        {
            id: 'collection-of-personal-data',
            title: 'Collection of Personal Data',
            blocks: [
                {
                    kind: 'paragraph',
                    text: '4.1. The ways in which Platform natively allows Third-Party Service to access certain limited information from and about User are described in the Tevi Privacy Policy and Mini App Terms.',
                },
                {
                    kind: 'paragraph',
                    text: '4.2. Without limiting section 4.1., Third-Party Service has the ability to receive additional data from you if you send it messages, upload files to it, or choose to share personal information such as your contact or phone number.',
                },
                {
                    kind: 'paragraph',
                    text: '4.3. If Third-Party Service is a mini app, it may also receive additional data as detailed in sections 4.1. and 4.2. of the Mini App Terms. In this case, Third-Party Service may also acquire additional information as a result of your interactions with it.',
                },
                {
                    kind: 'paragraph',
                    text: '4.4. Third-Party Service may collect anonymous data that is not linked to you in any way, such as anonymized diagnostics or usage statistics.',
                },
                {
                    kind: 'paragraph',
                    text: '4.5. Right to erasure - You may submit a request to erase the Personal Information we collect about you by (a) using Help or Feedback function on Tevi Services or (b) by sending your request to us via email. Though we cannot guarantee a complete erasure of your data that has been stored in our backup servers, but we will not use the data within the backup servers for any other purpose.',
                },
            ],
        },
        {
            id: 'processing-of-personal-data',
            title: 'Processing of Personal Data',
            blocks: [
                {
                    kind: 'paragraph',
                    text: '5.1. Third-Party Service only requests, collects, processes and stores data that is necessary for its designated features to function properly. Third-Party Service processes your personal data on the legal ground that such processing is necessary to further its legitimate interests, including (i) providing services to its users; (ii) detecting and addressing security issues in respect of its provision of services; unless those interests are overridden by your interest or fundamental rights and freedoms that require protections of personal data.',
                },
                {
                    kind: 'paragraph',
                    text: '5.2. Developer does not monetize or otherwise utilize user data for applications outside the scope of Third-Party Service, unless otherwise clearly stated by Developer and explicitly agreed to by User.',
                },
                {
                    kind: 'paragraph',
                    text: '5.3. Without limiting section 6.2., private user information will not be transferred or made accessible to any third party, except as stipulated by Policy and agreed to by User.',
                },
                {
                    kind: 'paragraph',
                    text: '5.4. In any event, Developer will only collect or otherwise aggregate user data in compliance with applicable laws, third-party store terms, and for no other purposes than those clearly stated in Policy and necessary to furnish and enhance the functionality of Third-Party Service.',
                },
            ],
        },
        {
            id: 'data-protection',
            title: 'Data Protection',
            blocks: [
                {
                    kind: 'paragraph',
                    text: '6.1. Developer employs robust security measures to protect the integrity and confidentiality of all data it processes. User information is handled, transferred and stored in compliance with applicable laws, including all necessary precautions to prevent unauthorized access, modification, deletion, or distribution.',
                },
                {
                    kind: 'paragraph',
                    text: '6.2. Developer will never share user data with third parties, including with Developer’s own additional services or bots (if any, as the case may be) unless explicitly authorized by User or required by law, such as in response to a lawful court order.',
                },
            ],
        },
        {
            id: 'rights-and-obligations',
            title: 'Rights and Obligations',
            blocks: [
                { kind: 'paragraph', text: '7.1. Tevi may:' },
                {
                    kind: 'paragraph',
                    text: '(a) delete data sent from User to Third-Party Service from its servers in response to abuse of Platform by either User or Developer. This deletion may include sent messages, mini app cloud storage, the entire chat with Third-Party Service, or Third-Party Service itself as the case may be.',
                },
                { kind: 'paragraph', text: '7.2. Developer may:' },
                {
                    kind: 'paragraph',
                    text: '(a) seek verification of the identity of the User submitting data requests if they suspect unauthorized access to or misuse of personal information.',
                },
                {
                    kind: 'paragraph',
                    text: '(b) impose reasonable limits on the number of data requests User can submit within a given timeframe, in order to prevent abuse of the request system. In any event, these limits cannot undermine User’s rights under applicable law.',
                },
                { kind: 'paragraph', text: '7.3. Developer shall:' },
                {
                    kind: 'paragraph',
                    text: '(a) comply with the stipulations set forth in Policy, or those outlined in any additional or substitute Policy they choose to enact, provided that neither can supersede the Tevi Terms of Service, and, by extension, the Tevi Bot Developer Terms.',
                },
                {
                    kind: 'paragraph',
                    text: '(b) provide an easily accessible avenue for User to consult Policy, and for them to exercise all rights Policy entitles them to under applicable law.',
                },
                {
                    kind: 'paragraph',
                    text: '(c) promptly process and respond to lawful requests from users within the timeframes allowed by applicable law, and, in any event, no later than 30 days from the date the request was submitted.',
                },
                { kind: 'paragraph', text: '7.4. User may:' },
                {
                    kind: 'paragraph',
                    text: '(a) submit a request to Developer for a copy of all personal data Third-Party Service collected and stored in connection with them.',
                },
                {
                    kind: 'paragraph',
                    text: '(b) submit a request to Developer for the timely deletion of all personal data Third-Party Service collected and stored in connection with them, with the exception of essential data that Developer may preserve if and as permitted by applicable law. Examples of essential data vary by jurisdiction and may include but are not limited to data required for performing legal obligations, defense of legal claims, public interest or transactional history for the purpose of fulfilling tax obligations.',
                },
                {
                    kind: 'paragraph',
                    text: '(c) amend, restrict, or object to the processing of their data, or exercise the option to revoke any previously given consent at any time and for any reason, including withdrawing from Policy entirely and discontinuing their use of Third-Party Service.',
                },
                {
                    kind: 'paragraph',
                    text: '(d) lodge a complaint with national data protection authorities having jurisdiction if they believe their rights are not being upheld by Developer.',
                },
                { kind: 'paragraph', text: '7.5. User shall:' },
                {
                    kind: 'paragraph',
                    text: '(a) provide accurate and up-to-date information when submitting data requests to Developer, and cooperate with any reasonable measures necessary for Developer to fulfill these requests.',
                },
                {
                    kind: 'paragraph',
                    text: '(b) adhere to the terms set forth in Policy and any additional policy enacted by Developer or Tevi.',
                },
            ],
        },
        {
            id: 'changes-to-this-privacy-policy',
            title: 'Changes to this Privacy Policy',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'While we do not anticipate frequent changes, we will review and may update this Privacy Policy from time to time. Any changes to this Privacy Policy will become effective when we post the revised Privacy Policy on this page. Please check our website frequently to see any updates or changes to this Privacy Policy, a summary of which we will set out below.',
                },
            ],
        },
    ],
}
