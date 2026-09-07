import type { Letter } from './types'

/**
 * The open letter to the Tevi community, ported verbatim from the legacy app
 * (`tevi-web-app/src/containers/letter/components/content/data.js`, served at `/letter`).
 *
 * **Three letters, not one letter translated.** Legacy writes it in English, Vietnamese
 * and Indonesian and shows the English one to everybody else — so the copy lives here,
 * per language, rather than as keys in `translation.json`. That is the opposite of the
 * policies (English only, never translated) and it is the same reason underneath: a
 * document's words belong to whoever wrote them. The other six locales get the English
 * letter, which is what legacy does and what `getOpenLetter` implements.
 *
 * `**bold**` markers are the copy's own, exactly as legacy authored them; the renderer
 * turns them into runs via `lib/emphasis.ts`. Nothing else about the text moved: the
 * dateline is part of the letter, the sign-off is set apart because legacy sets it apart,
 * and the two headings keep their sentence case.
 *
 * A letter is dated and does not change. When the team publishes the next one, this is a
 * new entry rather than an edit — and `/letter` then points at it.
 */
/**
 * One letter, published once, so the machine-readable date is one constant rather than
 * three copies that can drift apart — the datelines differ only because the languages do.
 */
const PUBLISHED_AT = '2026-08-02'

const EN: Letter = {
    barTitle: 'Open letter',
    title: 'An open letter to the Tevi community',
    dateline: 'August 2, 2026',
    publishedAt: PUBLISHED_AT,
    metaDescription:
        'An open letter from the Tevi team: the AI-powered moderation system now live across the platform, what it enforces, and what stays yours.',
    blocks: [
        {
            kind: 'paragraph',
            text: "Tevi was built for one reason: to give creators a Space they own. Free to express themselves. Free to earn from the people who value their work. That hasn't changed since day one, and it won't.",
        },
        { kind: 'paragraph', text: 'But freedom needs a floor to stand on.' },
        {
            kind: 'paragraph',
            text: 'Not everyone who came here came to create. Some came to fake the numbers. Some came to sell what was never theirs to sell. And some came for reasons no platform should ever tolerate. None of them were ever welcome here.',
        },
        {
            kind: 'paragraph',
            text: 'That work has never stopped. Over the past year we scaled it up: accounts taken down, coordinated abuse shut down, systems rebuilt. Most of it happened quietly. Announcing every enforcement action mainly teaches the next operator how to avoid it.',
        },
        {
            kind: 'paragraph',
            text: 'Today that work reaches a new stage. **A new AI-powered moderation system is now live across Tevi.**',
        },
        { kind: 'heading', text: 'What the system does' },
        {
            kind: 'list',
            items: [
                'Bots, spam and automated engagement are detected and removed at scale — not one report at a time.',
                'Attempts to push gambling, run scam funnels or post abusive material are screened at upload, not days later.',
                'Enforcement is per account and based on evidence — never by association alone.',
            ],
        },
        { kind: 'heading', text: 'What stays yours' },
        {
            kind: 'list',
            items: [
                'Your freedom to create.',
                'Your Space, your fans, your earnings — still yours. No feed algorithm deciding who gets to see you.',
                "Soon you'll also see **active followers**: how many people are genuinely following you. Not a smaller number — a truer one.",
            ],
        },
        {
            kind: 'paragraph',
            text: "We won't tell you Tevi is perfect. Moderation isn't a launch, it's a discipline, and we will get things wrong. When we do, we'll fix them and say so.",
        },
        {
            kind: 'paragraph',
            text: 'But let there be no confusion about where we stand. **Tevi is not neutral between a creator and the person exploiting them.** We are not a bystander on our own platform. Anyone who came here to exploit this community was never welcome, and there is no version of Tevi that will make room for them.',
        },
        { kind: 'paragraph', text: 'We choose the creators. Every time.' },
        {
            kind: 'paragraph',
            text: "If something gets past us, report it. We'd rather hear it from you than miss it.",
        },
        { kind: 'paragraph', text: 'Thank you for building here.' },
    ],
    signOff: '— The Tevi Team',
}

const VI: Letter = {
    barTitle: 'Thư ngỏ',
    title: 'Thư gửi cộng đồng Tevi',
    dateline: 'Ngày 2 tháng 8 năm 2026',
    publishedAt: PUBLISHED_AT,
    metaDescription:
        'Thư ngỏ từ đội ngũ Tevi: hệ thống kiểm duyệt mới vận hành bằng AI đã hoạt động trên toàn nền tảng, nó xử lý những gì, và điều gì vẫn là của bạn.',
    blocks: [
        {
            kind: 'paragraph',
            text: 'Tevi được tạo ra vì một lý do: cho creator một Space của riêng mình. Tự do thể hiện bản thân. Tự do kiếm tiền từ chính những người trân trọng công việc đó. Điều này không đổi từ ngày đầu tiên, và sẽ không đổi.',
        },
        { kind: 'paragraph', text: 'Nhưng tự do cần một cái nền để đứng.' },
        {
            kind: 'paragraph',
            text: 'Không phải ai đến đây cũng đến để sáng tạo. Có kẻ đến để làm giả những con số. Có kẻ đến để bán thứ không phải của mình. Và có kẻ đến vì những lý do mà không một nền tảng nào được phép dung thứ. Không một ai trong số đó từng được chào đón ở đây.',
        },
        {
            kind: 'paragraph',
            text: 'Việc đó chưa từng dừng. Hơn một năm qua chúng tôi đẩy nó lên quy mô lớn hơn: gỡ tài khoản, chặn đứng các hoạt động có tổ chức, xây lại hệ thống. Phần lớn việc đó diễn ra trong im lặng. Rao mọi đợt xử lý chủ yếu chỉ dạy cho kẻ tiếp theo cách né.',
        },
        {
            kind: 'paragraph',
            text: 'Hôm nay công việc đó bước sang một giai đoạn mới. **Hệ thống kiểm duyệt mới của Tevi, vận hành bằng AI, đã chính thức hoạt động trên toàn nền tảng.**',
        },
        { kind: 'heading', text: 'Hệ thống làm gì' },
        {
            kind: 'list',
            items: [
                'Bot, spam và tương tác tự động bị phát hiện và gỡ ở quy mô lớn, không còn xử từng report một.',
                'Mọi nỗ lực đẩy cờ bạc, dựng phễu lừa đảo hay đăng nội dung vi phạm đều bị soát ngay tại thời điểm đăng, không phải vài ngày sau.',
                'Xử lý theo từng tài khoản, dựa trên bằng chứng — không bao giờ chỉ vì liên đới.',
            ],
        },
        { kind: 'heading', text: 'Điều vẫn là của bạn' },
        {
            kind: 'list',
            items: [
                'Quyền tự do sáng tạo của bạn.',
                'Space của bạn, fan của bạn, thu nhập của bạn — vẫn là của bạn. Không có thuật toán phân phối nào quyết định ai được thấy bạn.',
                'Sắp tới bạn sẽ thấy thêm **active follower**: bao nhiêu người thật sự đang theo dõi bạn. Không phải con số nhỏ hơn — là con số thật hơn.',
            ],
        },
        {
            kind: 'paragraph',
            text: 'Chúng tôi sẽ không nói rằng Tevi đã hoàn hảo. Kiểm duyệt không phải một lần ra mắt, nó là một kỷ luật, và chúng tôi sẽ có lúc làm sai. Khi đó, chúng tôi sẽ sửa và nói rõ.',
        },
        {
            kind: 'paragraph',
            text: 'Nhưng đừng ai nhầm lẫn về chỗ đứng của chúng tôi. **Tevi không đứng giữa creator và kẻ trục lợi trên lưng họ.** Chúng tôi không đứng ngoài nhìn trên chính nền tảng của mình. Bất kỳ ai đến đây để trục lợi trên cộng đồng này đều chưa bao giờ được chào đón, và sẽ không có phiên bản Tevi nào chừa chỗ cho họ.',
        },
        { kind: 'paragraph', text: 'Chúng tôi chọn creator. Luôn luôn.' },
        {
            kind: 'paragraph',
            text: 'Nếu có gì vượt qua được chúng tôi, hãy report. Chúng tôi thà nghe từ bạn còn hơn bỏ sót.',
        },
        { kind: 'paragraph', text: 'Cảm ơn các bạn đã chọn xây dựng ở đây.' },
    ],
    signOff: '— Đội ngũ Tevi',
}

const ID: Letter = {
    barTitle: 'Surat terbuka',
    title: 'Surat terbuka untuk komunitas Tevi',
    dateline: '2 Agustus 2026',
    publishedAt: PUBLISHED_AT,
    metaDescription:
        'Surat terbuka dari tim Tevi: sistem moderasi baru bertenaga AI yang kini berjalan di seluruh platform, apa yang ditindak, dan apa yang tetap milikmu.',
    blocks: [
        {
            kind: 'paragraph',
            text: 'Tevi dibangun untuk satu alasan: memberi kreator sebuah Space milik mereka sendiri. Bebas berekspresi. Bebas menghasilkan dari orang-orang yang menghargai karya mereka. Itu tidak berubah sejak hari pertama, dan tidak akan berubah.',
        },
        { kind: 'paragraph', text: 'Tapi kebebasan butuh fondasi untuk berpijak.' },
        {
            kind: 'paragraph',
            text: 'Tidak semua yang datang ke sini datang untuk berkarya. Ada yang datang untuk memalsukan angka. Ada yang datang untuk menjual sesuatu yang bukan miliknya. Dan ada yang datang dengan alasan yang tidak boleh ditoleransi platform mana pun. Tidak satu pun dari mereka pernah diterima di sini.',
        },
        {
            kind: 'paragraph',
            text: 'Pekerjaan itu tidak pernah berhenti. Setahun terakhir kami memperbesar skalanya: akun ditutup, operasi terorganisir dihentikan, sistem dibangun ulang. Sebagian besar berlangsung dalam diam. Mengumumkan setiap penindakan pada dasarnya hanya mengajari pelaku berikutnya cara menghindar.',
        },
        {
            kind: 'paragraph',
            text: 'Hari ini pekerjaan itu memasuki babak baru. **Sistem moderasi baru Tevi yang didukung AI kini resmi berjalan di seluruh platform.**',
        },
        { kind: 'heading', text: 'Apa yang dilakukan sistem ini' },
        {
            kind: 'list',
            items: [
                'Bot, spam, dan interaksi otomatis dideteksi dan dihapus dalam skala besar — bukan satu laporan demi satu laporan.',
                'Setiap upaya mempromosikan judi, membangun funnel penipuan, atau mengunggah konten melanggar disaring pada saat diunggah, bukan beberapa hari kemudian.',
                'Penindakan dilakukan per akun dan berbasis bukti — tidak pernah hanya karena keterkaitan.',
            ],
        },
        { kind: 'heading', text: 'Apa yang tetap milikmu' },
        {
            kind: 'list',
            items: [
                'Kebebasanmu berkarya.',
                'Space-mu, fans-mu, penghasilanmu — tetap milikmu. Tidak ada algoritma distribusi yang menentukan siapa yang bisa melihatmu.',
                'Segera kamu juga akan melihat **active followers**: berapa orang yang benar-benar mengikutimu. Bukan angka yang lebih kecil — angka yang lebih jujur.',
            ],
        },
        {
            kind: 'paragraph',
            text: 'Kami tidak akan bilang Tevi sudah sempurna. Moderasi bukan sebuah peluncuran, melainkan sebuah disiplin, dan kami pasti akan melakukan kesalahan. Ketika itu terjadi, kami akan memperbaikinya dan mengatakannya terus terang.',
        },
        {
            kind: 'paragraph',
            text: 'Tapi jangan sampai ada yang keliru soal di mana kami berdiri. **Tevi tidak netral antara kreator dan orang yang mengeksploitasi mereka.** Kami bukan penonton di platform kami sendiri. Siapa pun yang datang ke sini untuk mengeksploitasi komunitas ini tidak pernah diterima, dan tidak akan pernah ada versi Tevi yang menyediakan tempat untuk mereka.',
        },
        { kind: 'paragraph', text: 'Kami memilih para kreator. Selalu.' },
        {
            kind: 'paragraph',
            text: 'Kalau ada yang lolos dari kami, laporkan. Lebih baik kami dengar darimu daripada terlewat.',
        },
        { kind: 'paragraph', text: 'Terima kasih sudah membangun di sini.' },
    ],
    signOff: '— Tim Tevi',
}

/** The languages the letter was actually written in. */
export const OPEN_LETTER = { en: EN, vi: VI, id: ID } as const

export type LetterLocale = keyof typeof OPEN_LETTER

/**
 * The letter for a locale, English for the six it was not written in.
 *
 * Takes a plain string rather than `Locale` so the caller can hand it whatever the request
 * resolved to — `zh-Hant`, a cookie value, anything — without a cast. The fallback is the
 * whole point: an untranslated letter is still the letter, and there is no key-level
 * fallback to lean on the way `translation.json` has.
 *
 * `Object.hasOwn`, not `in`: `in` walks the prototype chain, so `getOpenLetter('toString')`
 * would answer with `Object.prototype.toString` and the page would render a function. The
 * locale is a string off the request, which is exactly where such a value comes from.
 */
export function getOpenLetter(locale: string): Letter {
    return Object.hasOwn(OPEN_LETTER, locale) ? OPEN_LETTER[locale as LetterLocale] : EN
}
