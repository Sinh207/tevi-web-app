import type { LegalDocument } from './types'

/**
 * The Tevi community guidelines, ported verbatim from the legacy app
 * (`tevi-web-app/src/containers/communityGuidelines/components/content/index.js`).
 *
 * **English only, and deliberately not in `translation.json`** — same reasoning as
 * `privacy-policy.ts` and `terms-of-use.ts`: legacy ships this text hardcoded in English
 * at every locale, and a policy people are enforced against is not ours to paraphrase.
 * Only the page chrome goes through i18n.
 *
 * Wording is unchanged, including its slips — the trailing "local law enforcement.
 * involved.", the sub-heading spelled "Impersionation", and "Tevi aligns with our
 * Community Guidelines, we prohibit games…". Three *rendering* differences from legacy,
 * none of them text:
 *
 *  1. The six `h2[id]` anchors legacy scraped out of the DOM after mount become the six
 *     sections here, so the contents rail exists server-side. Everything legacy rendered
 *     as `StyledSubTitle` becomes a `subheading` block: those were never anchors and must
 *     not reach the rail.
 *  2. Legacy set "IRL streaming", "Swim and beaches, concerts and festivals", "Body Art",
 *     "Context transitions" and "Additional exceptions" as ordinary paragraphs, which
 *     reads as body copy running into the label above it. They are labels on the
 *     paragraph beneath them, so they are `subheading` blocks here — flattened one level,
 *     since the block model has a single heading depth.
 *  3. The renderer numbers the sections, so nothing carries a number in its title.
 *
 * Section ids are the legacy ones — external links and the mobile app point at them.
 */
export const COMMUNITY_GUIDELINES: LegalDocument = {
    effectiveDate: '11 November 2024',
    intro: [],
    sections: [
        {
            id: 'introduction',
            title: 'Introduction',
            blocks: [
                {
                    kind: 'paragraph',
                    text: "Tevi takes safety very seriously, and it's a crucial prerequisite for a community that supports and sustains streamers' ability to express themselves and provides a welcoming and entertaining environment for viewers. The Community Guidelines set the expectations for behavior that everyone on Tevi is expected to demonstrate, and they apply to all content on our service. We take a layered approach to safety, combining the efforts of both Tevi and members of the community to promote safety in real-time.",
                },
                {
                    kind: 'paragraph',
                    text: 'In addition to these guidelines, streamers and moderators can use customizable Tevi safety tools to tailor their channel standards to meet their needs. Viewers, moderators, and streamers all play a crucial role by reporting content or behavior that breaks our Community Guidelines. Reports are reviewed by our global Safety Operations team who work 24/7/365 to ensure a swift response.',
                },
            ],
        },
        {
            id: 'safety',
            title: 'Safety',
            blocks: [
                { kind: 'subheading', text: 'Self-destructive behavior' },
                {
                    kind: 'paragraph',
                    text: 'Regarding self-destructive behavior, Tevi does not allow content that glorifies, promotes, or encourages self-harm. We also prohibit activity that may endanger your life, lead to your physical harm, or encourage others to engage in physically harmful behavior. Although sensitive topics related to self-harm or mental health can be discussed on Tevi, we do not make exceptions for self-destructive behavior performed as a stunt or gag made in jest or meant to entertain when the behavior could reasonably be expected to cause physical injury.',
                },
                {
                    kind: 'paragraph',
                    text: 'For example, you may not show or promote content that includes the glorification and/or promotion of self-harm, promotion of eating disorders, sharing of pro-eating disorder content, sharing graphic details of suicide notes or suicide attempts, use of hard drugs and substances not fit for human consumption, misuse of legal substances, cutting or other forms of self-injury, dangerous consumption of alcohol or other substances that lead to being incapacitated, or dangerous or distracted driving. If you feel like you or someone you know is struggling, or someone is at immediate risk of suicide, please contact a professional with the resources and expertise for urgent support, such as a mental health hotline or local law enforcement. involved.',
                },

                { kind: 'subheading', text: 'Violence and Threats' },
                {
                    kind: 'paragraph',
                    text: 'The promotion of violence and threats are detrimental to creating a safe and welcoming community on Tevi. We take a zero-tolerance approach to violence, and any accounts associated with such behavior will be indefinitely suspended',
                },
                { kind: 'paragraph', text: 'Examples of prohibited content include:' },
                {
                    kind: 'list',
                    items: [
                        { text: 'Threats or attempts to physically harm others' },
                        { text: 'Threats or attempts to hack, dox, DDOS, or SWAT others' },
                        { text: 'Use of weapons to intimidate or harm others' },
                        { text: 'Encouraging others to participate in violent acts' },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'In cases where a user has lost control of their broadcast due to severe injury, medical emergency, police action, or serious violence, we will temporarily remove the channel and associated content.',
                },
                {
                    kind: 'paragraph',
                    text: "In exceptional cases, we may preemptively suspend accounts if we believe that their use of Tevi poses a high likelihood of inciting violence. In assessing the risk of harm, we consider the user's influence, past behavior (on Tevi or elsewhere), the ongoing risk of harm, and the scale of ongoing threats.",
                },
                {
                    kind: 'paragraph',
                    text: 'Content that threatens or promotes sexual violence or exploitation is strictly prohibited and may be reported to law enforcement. See the section on Adult Sexual Violence and Exploitation for more information.',
                },

                { kind: 'subheading', text: 'Terrorism and Violent Extremism' },
                {
                    kind: 'paragraph',
                    text: 'Tevi does not allow content that depicts, glorifies, encourages, or supports terrorism or violent extremist acts or actors. This includes threatening or encouraging others to commit acts that would result in serious physical harm or significant property destruction.',
                },
                {
                    kind: 'paragraph',
                    text: 'Examples of prohibited content include: Displaying or linking terrorist or extremist propaganda, including graphic pictures or footage of violent acts, even for the purpose of denouncing such content.',
                },

                { kind: 'subheading', text: 'Adult Sexual Violence and Exploitation' },
                {
                    kind: 'paragraph',
                    text: 'Sexual violence and exploitation committed by adults are grave crimes. Any content or conduct that advocates or implies sexual violence or exploitation may be reported to law enforcement.',
                },
                {
                    kind: 'paragraph',
                    text: 'For example, exhibiting, promoting, or participating in any of the following is strictly prohibited and may result in account suspension:',
                },
                {
                    kind: 'list',
                    items: [
                        { text: 'Non-consensual sexual activities' },
                        { text: 'Forcing or blackmailing someone into sexual acts' },
                        { text: 'Inappropriately touching someone without their consent.' },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'The app strictly prohibits the creation, distribution, or sharing of any content that includes or promotes sexual activity involving animals, whether explicit, suggestive, or implied. Users found engaging in or facilitating the creation or distribution of such content will face immediate suspension or permanent closure of their account, along with possible legal action where applicable.',
                },

                { kind: 'subheading', text: 'Youth Safety' },
                {
                    kind: 'paragraph',
                    text: 'Tevi is committed to ensuring the safety of minors and prohibits any content or activity that endangers them. This includes content that features or promotes child sexual abuse material (CSAM), as well as sexual exploitation, sexual misconduct, or grooming of minors (defined in this policy as individuals under the age of 18). We immediately report any illegal content or activity to the National Center for Missing and Exploited Children, which works closely with law enforcement agencies worldwide. Violating this policy will result in immediate and indefinite account suspension.',
                },
                { kind: 'paragraph', text: 'Examples of prohibited content or activity include:' },
                {
                    kind: 'list',
                    items: [
                        { text: 'Sexually explicit material or images featuring minors' },
                        {
                            text: 'Sharing links to third-party sites that contain content prohibited by this policy',
                        },
                        {
                            text: 'Content that promotes, encourages, or instructs on the sexual exploitation or sexualization of minors',
                        },
                        {
                            text: 'Content that facilitates inappropriate interactions with minors, such as grooming, exposing minors to sexual material, or engaging in sexual conversations with minors through messaging',
                        },
                        {
                            text: 'Attempts to exploit minors by coercing them to provide money, favors, or intimate imagery with threats to expose intimate imagery or information',
                        },
                        { text: 'Content depicting nudity of minors' },
                        { text: 'Identifying alleged CSAM victims by name or image' },
                    ],
                },

                { kind: 'subheading', text: 'Off-Service Conduct' },
                {
                    kind: 'paragraph',
                    text: 'To ensure a secure and protected community for streamers and viewers, Tevi prohibits certain severe off-service offenses committed by its users that pose a substantial safety risk to the Tevi community. For some behaviors, the first offense may result in an indefinite suspension.',
                },
                { kind: 'paragraph', text: 'Examples of prohibited off-service conduct include:' },
                {
                    kind: 'list',
                    items: [
                        { text: 'Deadly violence and violent extremism' },
                        { text: 'Terrorism or recruiting for terrorist activities' },
                        {
                            text: 'Credible threats of mass violence, such as threats against a group of people, event, or location where people would gather',
                        },
                        { text: 'Leadership, membership, or sponsorship of a known hate group' },
                        {
                            text: 'Sexual exploitation of minors, including grooming and/or distribution of child sexual abuse material (CSAM)',
                        },
                        {
                            text: 'Actions that compromise the physical safety of the Tevi community',
                        },
                        { text: 'Credible threats against Tevi, including Tevi staff' },
                        {
                            text: 'Harmful misinformation or persistent misinformation superspreaders',
                        },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'Users may report cases of severe off-service offenses to the Tevi Off-Service Investigations Team, which investigates these allegations globally and handles reports with complete confidentiality.',
                },

                { kind: 'subheading', text: 'Evidence for Off-Service reports' },
                {
                    kind: 'paragraph',
                    text: 'To ensure appropriate action is taken for off-service behaviors, evidence of these activities must be verifiable. This includes content directly uploaded by the offending user or direct reports from victims sent to our Off-Service Investigations team with appropriate evidence.',
                },
                {
                    kind: 'paragraph',
                    text: 'Screenshots and other content from uninvolved groups that may be edited, doctored, or falsified are generally not considered sufficient unless they are supported by other verifiable evidence that is accurate and not misrepresented. Our third-party investigator must confirm the authenticity of such evidence.',
                },
                {
                    kind: 'paragraph',
                    text: 'In addition, we take into account any law enforcement action when assessing the credibility of accusations and evidence.',
                },

                { kind: 'subheading', text: 'Unauthorized Sharing of Private Information' },
                {
                    kind: 'paragraph',
                    text: "Sharing someone else's private information without their consent can be harmful and unsafe. For this reason, Tevi prohibits users from disclosing personal information of others on our platform.",
                },
                { kind: 'paragraph', text: 'Examples of actions that are not allowed include:' },
                {
                    kind: 'list',
                    items: [
                        {
                            text: "Revealing personally identifiable information (PII), such as a streamer's leaked address, and sharing it in chat.",
                        },
                        {
                            text: 'Sharing restricted or protected social media profiles, or any information from those profiles.',
                        },
                        {
                            text: "Sharing content that violates another person's reasonable expectation of privacy, such as streaming from a private space without permission.",
                        },
                        { text: 'Broadcasting a private video conference call without consent.' },
                    ],
                },
            ],
        },
        {
            id: 'civility-and-respect',
            title: 'Civility and Respect',
            blocks: [
                { kind: 'subheading', text: 'Hateful Conduct' },
                {
                    kind: 'paragraph',
                    text: 'Tevi has a zero-tolerance policy towards hateful conduct that is motivated by intolerance, prejudice, or hatred based on protected characteristics such as race, ethnicity, caste, national origin, religion, sex, gender, gender identity, sexual orientation, disability, serious medical condition, veteran status, and age. Tevi provides equal protection to every user globally, regardless of their protected characteristics.',
                },
                {
                    kind: 'paragraph',
                    text: 'Users are prohibited from engaging in activities such as promoting or glorifying violence, advocating for discrimination or denigration, using hateful slurs, posting hateful symbols or images, or engaging in activities that perpetuate negative stereotypes and memes about protected groups.',
                },
                {
                    kind: 'paragraph',
                    text: 'Tevi also prohibits calls for subjugation, exclusion, or segregation based on protected characteristics, as well as support for ideologies that promote the political or economic dominance of any group based on their protected characteristics. Tevi does, however, allow discussions on certain topics as long as they are not denigrating based on protected characteristics.',
                },

                { kind: 'subheading', text: 'Harassment' },
                {
                    kind: 'paragraph',
                    text: 'Harassment can have a devastating impact on the well-being of individuals and communities on Tevi, hindering their growth and diversity, and creating opportunities for more severe forms of harm and abuse. Harassment may come in different forms, such as personal attacks, promoting physical harm, or malicious brigading. Tevi takes harassment very seriously and will take enforcement action against accounts engaging in such behavior.',
                },
                {
                    kind: 'paragraph',
                    text: 'We also expect streamers to take necessary measures to prevent harassing content from appearing on their streams or in their chats. Streamers acting in good faith, such as using tools like AutoMod, timeouts, and channel bans to remove abuse from third parties and external sources, will not be suspended by Tevi.',
                },

                { kind: 'subheading', text: 'Sexual Harassment' },
                {
                    kind: 'paragraph',
                    text: "Unwanted sexual behavior and comments, known as sexual harassment, are never acceptable on our services. Such behavior can make users feel uncomfortable, unsafe, and discourage them from engaging in our platform. We prohibit unwelcome sexual advances, solicitation, sexual objectification, and degrading attacks based on a person's perceived sexual practices, regardless of their gender.",
                },
                {
                    kind: 'paragraph',
                    text: 'In handling reports of sexual harassment, we take into account feedback from individuals who have experienced such behavior. This helps us understand when advances and comments are unwanted, even if they are not explicitly derogatory.',
                },
                {
                    kind: 'paragraph',
                    text: 'As leaders of their communities, streamers must consider the impact of their words and actions on their audiences. Unwanted attention can encourage others to engage in abusive behavior, and streaming other channels while insulting them can incite further abuse towards the target. Streamers who engage in such behavior risk account suspension.',
                },
                {
                    kind: 'paragraph',
                    text: 'We expect streamers to take appropriate measures to prevent and mitigate harassing content on their streams. Streamers acting in good faith, using tools such as AutoMod, timeouts, and channel bans to remove abuse from third parties, will not face suspension.',
                },
            ],
        },
        {
            id: 'illegal-activity',
            title: 'Illegal activity',
            blocks: [
                { kind: 'subheading', text: 'Breaking the Law' },
                {
                    kind: 'paragraph',
                    text: 'To ensure the safety of our community, it is mandatory for our users to abide by all applicable local, national, and international laws while utilizing our services. Any conduct or content that promotes, solicits, encourages, or involves illegal activities is strictly prohibited and may be reported to law enforcement agencies.',
                },
                {
                    kind: 'paragraph',
                    text: 'As an example, you are not permitted to [content warning]:',
                },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Participate in any form of human trafficking, such as sex trafficking, forced marriages, sales of children, or domestic servitude.',
                        },
                        {
                            text: 'Buy or sell illicit drugs, firearms, or counterfeit items on Tevi.',
                        },
                        {
                            text: 'Assist or engage in the vandalism, theft, or destruction of public or private property without permission while using Tevi.',
                        },
                    ],
                },

                { kind: 'subheading', text: 'Intellectual Property Rights' },
                {
                    kind: 'paragraph',
                    text: 'To uphold the intellectual property rights of others and adhere to intellectual property laws, sharing content on a Tevi channel that a user does not own or have the right to share is not allowed.',
                },
                {
                    kind: 'paragraph',
                    text: 'For instance, without consent from the rights holders or unless permitted by law, sharing the following is prohibited:',
                },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Performing copyrighted content belonging to other individuals, such as playing copyrighted songs by other artists.',
                        },
                        {
                            text: 'Content belonging to other Tevi creators or content from other websites.',
                        },
                        { text: 'Pirated games or content from unauthorized private servers.' },
                        { text: 'Movies, television shows, or sports matches.' },
                        {
                            text: "Music that the user does not own or have the right to share, including music playing in the background of a user's broadcast.",
                        },
                        { text: 'Goods or services that are trademark-protected.' },
                        {
                            text: "Closed Alphas/Betas and Pre-Release Games. Users are requested to respect all publisher/developer-enforced release dates, embargoes, and NDAs by waiting to broadcast these games until everyone else has access to them. Unless given prior approval, users' channels may be subject to DMCA takedown by a rights holder. Learn more about our policies regarding including music in your Tevi channel.",
                        },
                        {
                            text: "Sharing unauthorized content on Tevi breaches our Terms of Service and may be subject to removal. Repeated violations of our policies may result in the permanent suspension of a user's account.",
                        },
                    ],
                },
            ],
        },
        {
            id: 'sensitive-content',
            title: 'Sensitive content',
            blocks: [
                { kind: 'subheading', text: 'Extreme Violence, Gore, and Other Obscene Conduct' },
                {
                    kind: 'paragraph',
                    text: 'Tevi allows for a wide range of content, but there are certain types of content that are prohibited due to their potentially disturbing nature. Specifically, content that features extreme violence or gore is not allowed, especially if it includes death, mutilation, or blood. Websites that primarily feature adult content, illegal content, or death and gore are also prohibited.',
                },
                { kind: 'paragraph', text: 'For example, you may not [content warning]:' },
                {
                    kind: 'list',
                    items: [
                        { text: 'Show content with death or extreme injury' },
                        { text: 'Browse 4chan, the dark web, or porn on Tevi' },
                        { text: 'Use randomized video chat services' },
                        { text: 'Sexually Explicit Content and Sexual Services' },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'Additionally, Tevi has strict policies regarding sexually explicit and suggestive content. Users are prohibited from broadcasting, uploading, soliciting, offering, and linking to pornographic or sexually explicit content, and from offering or soliciting any sexual content in exchange for money, services, or items of value.',
                },
                {
                    kind: 'paragraph',
                    text: 'For example, you may not show or promote [content warning]:',
                },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Explicit, simulated, or implied oral, anal, and vaginal sex, including prolonged audio that implies sex/masturbation/orgasm, such as clear moaning and grunting',
                        },
                        {
                            text: 'Explicit, simulated, or implied self or mutual masturbation, including groping or caressing genitals',
                        },
                        { text: 'Display of sexual bodily fluids' },
                        {
                            text: 'Phone sex, chat sex, or otherwise engaging with other person(s) or chat to create sexual content',
                        },
                        {
                            text: 'Advertisement or solicitation of sexual services, including prostitution, escort services, sexual massages, and filmed sexual activity',
                        },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'Broadcasting in areas where nudity or sexual activity may be taking place, even if such conduct or activity is not at the direction of the broadcaster or takes place in the background of the broadcast, is prohibited.',
                },
                {
                    kind: 'paragraph',
                    text: 'While users may not directly link to pornographic or sexually explicit content in their broadcasts, profile, or chat, users will not be penalized for linking to their personal websites or social media pages that may incidentally contain these links.',
                },
                {
                    kind: 'paragraph',
                    text: "Conversations about sex or nudity that are intended to be educational and otherwise comply with our policies should be marked as Mature Content via the respective channel's settings.",
                },

                { kind: 'subheading', text: 'Sexually Suggestive Content' },
                {
                    kind: 'paragraph',
                    text: 'To ensure content on Tevi is appropriate for diverse audiences, sexually suggestive content is prohibited on Tevi. Evaluations on the sexual suggestiveness of a behavior or activity are independent of user attire and are instead based on the overall surrounding framing and context.',
                },
                { kind: 'paragraph', text: 'For example, you may not engage in:' },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Content or camera focus on breasts, buttocks, or pelvic region, including poses that deliberately highlight these elements',
                        },
                        {
                            text: 'Groping or explicit gestures directed towards breasts, buttocks, or genitals',
                        },
                        {
                            text: 'Fetishizing behavior or activity, such as focusing on body parts for sexual gratification or erotic role play',
                        },
                        {
                            text: 'Featuring sex toys in contexts unrelated to sexual education',
                        },
                        { text: 'Erotic dances, such as those involving stripping or flashing' },
                        { text: 'Pole dances or acrobatics with sexually suggestive framing' },
                        {
                            text: 'Posting, displaying, or sharing erotica, including detailed descriptions of sex acts or pornography',
                        },
                    ],
                },

                { kind: 'subheading', text: 'Adult Nudity' },
                {
                    kind: 'paragraph',
                    text: 'To ensure a safe and appropriate streaming environment, Tevi strictly prohibits users from broadcasting or uploading content that includes depictions of actual nudity. Even if the content is partially censored through methods like pixelization, mosaics, or blurring, it still falls under this policy.',
                },
                {
                    kind: 'paragraph',
                    text: 'Examples of content that violate this policy include:',
                },
                {
                    kind: 'list',
                    items: [
                        { text: 'Fully unclothed buttocks or exposed anuses' },
                        { text: 'Any amount of exposed genitals' },
                        {
                            text: "Female-presenting individuals' breasts with exposed nipples (unless actively breastfeeding a child)",
                        },
                    ],
                },

                { kind: 'subheading', text: 'Attire' },
                {
                    kind: 'paragraph',
                    text: "In order to set consistent standards that allow creators to express themselves without exposing our community to inappropriate content, we have an attire policy, with detailed examples below. We aim to be transparent around our standards and expectations to empower creative expression and boost creators' confidence with a clear understanding of our guidelines.",
                },
                {
                    kind: 'paragraph',
                    text: 'The list of contextual exceptions, outlined below, is not exhaustive. If you find yourself in a situation that is not described by an exception, then we expect you to follow the standard guidelines.',
                },

                { kind: 'subheading', text: 'Standard guidelines:' },
                {
                    kind: 'paragraph',
                    text: "We don't permit streamers to be fully or partially nude, including exposing genitals or buttocks. We do not permit the visible outline of genitals, even when covered. Broadcasting nude or partially nude minors is always prohibited, regardless of context.",
                },
                {
                    kind: 'paragraph',
                    text: 'For those who present as women, we ask that you cover your nipples. We do not permit exposed underbust. Cleavage is unrestricted as long as these coverage requirements are met.',
                },
                {
                    kind: 'paragraph',
                    text: 'For all streamers, you must cover the area extending from your hips to the bottom of your pelvis and buttocks.',
                },
                {
                    kind: 'paragraph',
                    text: 'For those areas of the body where coverage is required, the coverage must be fully opaque; sheer or partially see-through clothing does not constitute coverage.',
                },
                {
                    kind: 'paragraph',
                    text: 'Augmented reality avatars that translate real-life movement into digital characters are subject to this standard, as is cosplay and other costumes. For details on how this policy applies to IRL, outdoors, and body art, please continue reading.',
                },

                { kind: 'subheading', text: 'Contextual exceptions' },
                { kind: 'subheading', text: 'IRL streaming' },
                {
                    kind: 'paragraph',
                    text: "Broadcasters, their co-hosts, and invited guests engaging in general IRL streaming outside the home must follow standard body-coverage expectations. Those passing through the background of your stream are not held to the same dress code requirement, but broadcasting nudity is not permitted regardless of context. If accidental nudity appears on your stream, we expect you to take immediate action, remove the content, and take precautionary steps so it won't happen again. You should not focus your stream on anyone violating our clothing or sexual content standards; you will be held accountable for doing so to the same extent as if you were violating the standards yourself.",
                },
                { kind: 'subheading', text: 'Swim and beaches, concerts and festivals' },
                {
                    kind: 'paragraph',
                    text: 'Swimwear is permitted as long as it completely covers the genitals, and those who present as women must also cover their nipples. Full coverage of buttocks is not required, but camera focus around them is still subject to our sexually suggestive content policy. Coverage must be fully opaque, even when wet. Sheer or partially see-through swimwear or other clothing does not constitute coverage.',
                },
                { kind: 'subheading', text: 'Body Art' },
                {
                    kind: 'paragraph',
                    text: 'For streams dedicated to body art, full chest coverage is not required, but those who present as women must completely cover their nipples & areola with a layer of non-transparent clothing or a paint & latex combination (artist-grade pasties, tape, latex or similar alternatives are acceptable). This coverage must be applied before streaming begins, not on-stream. Buttocks and genitals must also be fully covered by opaque attire. This exception to the general coverage requirements only applies while the streamer is actively engaged in body painting, though the streamer may take short breaks between active painting sessions, or when painting is complete to model the results.',
                },
                { kind: 'subheading', text: 'Context transitions' },
                {
                    kind: 'paragraph',
                    text: 'Streamers are given some leeway for making transitions between contexts with different limits of acceptable attire (e.g., beach to general outdoor IRL streaming). In these situations, streamers are expected to only spend as much time wearing insufficient attire as needed to add clothing or change offscreen into clothing with appropriate coverage for the new context.',
                },
                { kind: 'subheading', text: 'Additional exceptions' },
                {
                    kind: 'paragraph',
                    text: 'The standard chest coverage requirements outlined above do not apply to individuals actively breastfeeding a child on stream.',
                },

                { kind: 'subheading', text: 'Account Usernames and Display Names' },
                {
                    kind: 'paragraph',
                    text: 'To promote a safe and inclusive environment, we prohibit account usernames that violate our Community Guidelines. We understand that usernames have a greater impact across our services and are more persistent and visible than other forms of content. Therefore, we hold usernames to higher standards to minimize harm across our services.',
                },
                {
                    kind: 'paragraph',
                    text: 'For example, usernames and display names created on Tevi may not include:',
                },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Breaking the law, including terrorism and child exploitation',
                        },
                        { text: 'Violence and threats' },
                        { text: 'Hateful conduct' },
                        { text: 'Harassment and sexual harassment' },
                        { text: 'Unauthorized sharing of private information' },
                        { text: 'Impersonation' },
                        { text: 'Glorification of natural or violent tragedies' },
                        { text: 'Self-destructive behavior' },
                        {
                            text: 'References to recreational drugs, hard drugs, and drug abuse, with exceptions for alcohol, tobacco, and marijuana',
                        },
                        { text: 'References to sexual acts, genital, or sexual fluids' },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'Indefinite suspensions are issued for usernames and display names that constitute clear violations of our standard Community Guidelines, or that are typically representative of malicious and bad-faith behavior. For example, you may not create a username that includes [content warning]:',
                },
                {
                    kind: 'list',
                    items: [
                        { text: 'References to terrorism or terrorist organizations' },
                        { text: 'References to child grooming or exploitation' },
                        {
                            text: 'Threats, promotions, or calls to real-life violence against others (with exceptions for references to video game or non-hateful historical violence)',
                        },
                        { text: 'Calling for another group of people to be harmed or killed' },
                        {
                            text: 'Creating a username that threatens violence against another person',
                        },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'Hateful Conduct, including slurs and derogatory terminology related to protected characteristics:',
                },
                {
                    kind: 'list',
                    items: [
                        { text: 'Creating a username that includes a hateful slur' },
                        {
                            text: 'Glorifying, promoting, or advocating for discrimination, denigration, segregation, exclusion, hatred, or disgust based on protected characteristics (see our Hateful Conduct policy for more information)',
                        },
                        { text: 'Creating a username that references a hate group' },
                        {
                            text: 'Mocking, denying, or glorifying the occurrence of well-documented hate crimes or acts of genocide',
                        },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'Harassment and Sexual Harassment directed towards another person:',
                },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Creating a username that is sexually degrading towards another person',
                        },
                        {
                            text: "Creating a username that includes insults targeted towards another person's sexual practices",
                        },
                        {
                            text: 'Creating a username that includes a personal attack or targeted profanity against another person',
                        },
                        { text: 'Directing an insulting username towards another person' },
                        {
                            text: 'Mocking streamers, community members, or their friends and family that have passed away',
                        },
                    ],
                },
                { kind: 'paragraph', text: 'Threats or promotion of suicide and self-harm:' },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Glorifying methods of self-harm, including suicide and eating disorders',
                        },
                        { text: 'Encouraging another person to self-harm or commit suicide' },
                        { text: 'Registering a username that threatens suicidal action' },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'Personal information of another person leaked without consent:',
                },
                {
                    kind: 'list',
                    items: [
                        { text: 'IP addresses, email addresses' },
                        {
                            text: 'Mailing addresses, home addresses, private work or school addresses',
                        },
                        { text: 'Personal or private phone numbers' },
                        {
                            text: 'Sensitive identification or financial information, such as bank account numbers or government ID numbers',
                        },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'Impersonation of another person, company, or organization:',
                },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Attempting to misrepresent yourself as a staff member or employee of Tevi',
                        },
                        {
                            text: 'Creating an account with a nearly identical name to another Tevi user and attempting to pass yourself off as them',
                        },
                        {
                            text: 'Attempting to pose as a representative of a company or organization without authorization (See the Trademark Policy for more information on usernames that may constitute legal violation of a trademark.)',
                        },
                    ],
                },
                { kind: 'paragraph', text: 'Glorification of natural or violent tragedies:' },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Glorifying references to specific natural disasters that are responsible for death, such as Hurricane Katrina',
                        },
                        {
                            text: 'Glorifying people directly responsible for the murder or death of others, such as serial killers',
                        },
                        {
                            text: 'Celebrating deaths of individuals due to violence, including suicides and lethal government or police actions (see Hateful Conduct for more on our guidelines regarding glorifying violence on the basis of a protected class)',
                        },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'In instances where we believe users may be acting in good-faith, we will mandate a username or display name reset instead of indefinitely suspending the accounts. For example, your username may be reset if it includes:',
                },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'References to hard drugs, recreational drugs, and drug abuse (with the exceptions of alcohol, tobacco, and marijuana)',
                        },
                        {
                            text: 'Explicitly referencing recreational drugs or psychoactive substances, such as peyote',
                        },
                        {
                            text: 'Explicitly referencing hard drugs, including cocaine or heroin',
                        },
                        {
                            text: 'Overtly glorifying the abuse of prescription or harmful drugs, including practices such as inhalant abuse',
                        },
                        {
                            text: 'References to pornography, sexually explicit, and sexually suggestive content or behavior',
                        },
                        {
                            text: 'Creating usernames that reference explicit or implied sexual acts',
                        },
                        { text: 'Creating usernames that indicate overt sexual arousal' },
                        {
                            text: 'Creating usernames that include references to genitalia or sexual bodily fluids',
                        },
                        { text: 'References to sexually transmitted' },
                    ],
                },

                { kind: 'subheading', text: 'Prohibited Games' },
                {
                    kind: 'paragraph',
                    text: 'Tevi aligns with our Community Guidelines, we prohibit games that contain developer-generated content that violates our policies, as well as social platform games that are frequently associated with unmitigated abuse. Broadcasting or showcasing content from these games will result in enforcement action being taken against your account.',
                },
                {
                    kind: 'paragraph',
                    text: "Note that using the mature content flag, changing the broadcast or VOD title, setting the stream to subscribers only, or categorizing the stream under 'Not Playing' will not exempt you from this policy. Games that have an Adults Only (AO) rating from the ESRB, or that contain content that violates our community guidelines, are strictly prohibited from being streamed on Tevi.",
                },

                { kind: 'subheading', text: 'Prohibited Gambling Content' },
                {
                    kind: 'paragraph',
                    text: 'We do not allow users to share links or affiliate codes to sites that contain slots, roulette, or dice games.',
                },
                { kind: 'paragraph', text: 'For example, on Tevi you may not:' },
                {
                    kind: 'list',
                    items: [
                        { text: 'Share a referral code to a slots site with your chat' },
                        { text: 'Include a banner with a link to online roulette games' },
                        { text: 'Verbally refer your chat to a site containing dice games' },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'Furthermore, similar to our prohibited games policy, we do not allow the sites below to be streamed on Tevi, or linked to in chat. We consider many factors in determining whether a site is allowed, including whether the site includes safety protections, such as deposit limits, waiting periods, and age verification systems. We also take into account whether streamers use or encourage VPNs to evade geoblocking, and whether the site is licensed in the US or other jurisdictions that provide sufficient consumer protections.',
                },
                {
                    kind: 'paragraph',
                    text: 'We do not allow the following sites or associated domains:',
                },
                {
                    kind: 'list',
                    items: [
                        { text: 'stake.com' },
                        { text: 'rollbit.com' },
                        { text: 'duelbits.com' },
                        { text: 'roobet.com' },
                    ],
                },
                { kind: 'paragraph', text: 'We may identify others as we move forward.' },
            ],
        },
        {
            id: 'authenticity',
            title: 'Authenticity',
            blocks: [
                { kind: 'subheading', text: 'Impersionation' },
                {
                    kind: 'paragraph',
                    text: 'To maintain the integrity of our service and protect our users, impersonation is strictly prohibited on Tevi. Any content or activity that aims to impersonate an individual or organization, such as Tevi staff, celebrities, companies, or friends, is not allowed.',
                },
                { kind: 'paragraph', text: 'For example, you may not:' },
                {
                    kind: 'list',
                    items: [
                        { text: "Pretend to be a Tevi partner's account" },
                        { text: "Falsely claim to be a celebrity in a streamer's chat." },
                    ],
                },

                { kind: 'subheading', text: 'Spam, Scams, and Other Malicious Conduct' },
                {
                    kind: 'paragraph',
                    text: 'To maintain a positive user experience, uphold trust in our service, and prevent deception of viewers, creators, and advertisers, Tevi strictly prohibits spamming and other deceitful practices. Any content or action that interferes with, disturbs, damages, or undermines the integrity of Tevi services or the experience or devices of another user is not allowed.',
                },
                { kind: 'paragraph', text: 'For example, you may not:' },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Post spam, such as large amounts of repetitive, unwanted messages or user reports',
                        },
                        { text: 'Distribute unauthorized advertisements' },
                        { text: 'Engage in phishing, spreading malware, or viruses' },
                        { text: 'Defraud Tevi or others' },
                        {
                            text: 'Engage in viewership tampering (such as artificially inflating follow or live viewer stats)',
                        },
                        { text: 'Sell or sharing user accounts, services, or features' },
                        {
                            text: 'Cheat the Tevi rewards system (such as the Drops or channel points systems)',
                        },
                        {
                            text: 'Engage in any cheating, hacking, botting, or tampering, that gives the account owner an unfair advantage in an online multiplayer game',
                        },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'We understand that sometimes streamers are victims of account takeover, fraud, or viewbotting directed by a malicious third party. We have methods to detect the responsible party and do not penalize good-faith streamers under these circumstances.',
                },

                { kind: 'subheading', text: 'Suspension Evasion' },
                {
                    kind: 'paragraph',
                    text: "Circumventing our enforcement actions undermines the integrity of our service. Any attempt to circumvent an account suspension or chat ban by using other accounts, identities, or by appearing on another user's account will also result in an additional enforcement against your accounts, up to an indefinite suspension. Similarly, you may not use your channel to knowingly feature or advertise a suspended user.",
                },
                { kind: 'paragraph', text: 'For example, you may not:' },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Create a new account in order to evade a suspension issued to your primary account',
                        },
                        {
                            text: 'Facilitate a suspended user on your own channel, either by restreaming their content or hosting them directly',
                        },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'We understand that there may be instances where suspended users appear on your stream due to circumstances beyond your control, such as through third-party gaming tournaments. However, we expect that you make a good faith effort to remove them from your broadcast, mute them, or otherwise limit their interactions with your stream.',
                },

                { kind: 'subheading', text: 'Misinformation' },
                {
                    kind: 'paragraph',
                    text: "In order to reduce harm to our community and the public without undermining our streamers' open dialogue with their communities, we prohibit harmful misinformation superspreaders who persistently share misinformation on or off of Tevi. We remove users whose online presence is dedicated to (1) persistently sharing (2) widely disproven and broadly shared (3) harmful misinformation topics.",
                },
                {
                    kind: 'paragraph',
                    text: 'This policy is focused on Tevi users who persistently share harmful misinformation. It will not be applied to users based upon individual statements or discussions that occur on the channel. We will evaluate whether a user violates the policy by assessing both their on-platform behavior as well as their off-platform behavior. You can report these actors by sending an email to our internal investigations team with the account name and any available supporting evidence.',
                },
                {
                    kind: 'paragraph',
                    text: 'Under this policy we cover the following topic areas, and will continue to update this list as new trends emerge:',
                },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Misinformation that targets protected groups, which is already prohibited under our Hateful Conduct & Harassment Policy',
                        },
                        {
                            text: 'Harmful health misinformation and wide-spread conspiracy theories related to dangerous treatments, COVID-19, and COVID-19 vaccine misinformation',
                        },
                        {
                            text: 'Discussions of treatments that are known to be harmful without noting the dangers of such treatments',
                        },
                        {
                            text: 'For COVID-19—and any other WHO-declared Public Health Emergency of International Concern (PHEIC)—misinformation that causes imminent physical harm or is part of a broad conspiracy',
                        },
                        {
                            text: 'Misinformation promoted by conspiracy networks tied to violence and/or promoting violence',
                        },
                        {
                            text: 'Civic misinformation that undermines the integrity of a civic or political process',
                        },
                        {
                            text: 'Promotion of verifiably false claims related to the outcome of a fully vetted political process, including election rigging, ballot tampering, vote tallying, or election fraud*',
                        },
                        {
                            text: 'In instances of public emergencies (e.g., wildfires, earthquakes, active shootings), we may also act on misinformation that may impact public safety',
                        },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: '*Note: In order to evaluate civic misinformation claims, we work with independent misinformation experts such as the Global Disinformation Index, as well as information from election boards and congressional certification.',
                },

                { kind: 'subheading', text: 'Content Labeling' },
                {
                    kind: 'paragraph',
                    text: 'You are expected to accurately label your content to the best of your ability. When choosing a category or tag, please choose whichever best describes your content.',
                },
            ],
        },
    ],
}
