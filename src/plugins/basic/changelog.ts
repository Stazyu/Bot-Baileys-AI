import type { CommandModule } from '../../types/index.js';
import { getPrefixes } from '../../config/botConfig.js';

const changelogCommand: CommandModule = {
  config: {
    name: 'changelog',
    aliases: ['cl', 'update', 'perubahan'],
    description: 'Lihat apa aja yang baru di bot ini',
    usage: '!changelog',
    category: 'basic',
  },
  handler: async function (context): Promise<void> {
    const prefixes = getPrefixes();
    const matchedPrefix = context.simplified?.matchedPrefix || prefixes[0] || '!';

    const text = `╭━━━━━━━━━━━━━━━━━━╮
┃      📋 *CHANGELOG*     
┃   _Apa yang baru?_
╰━━━━━━━━━━━━━━━━━━╯

📅 *4 Oktober 2026*

╭━━━「 🧩 *Bot Ngerti Sticker* 」━━━╮
┃
┃ • *Feat:* Sticker yang dikirim
┃   atau dibalas di grup bisa
┃   dilihat bot, bukan cuma
┃   gambar biasa.
┃
┃ • *Feat:* Sticker dibaca sebagai
┃   *ekspresi* — bot nangkep mood
┃   user (ketawa, kesel, bingung)
┃   dan nanggepin sesuai konteks.
┃
┃ • *Fix:* Balas pesan bot pakai
┃   sticker doang? Langsung direspons,
┃   nggak diem & nggak nanya-nanya.
┃
╰━━━━━━━━━━━━━━━━━━╯

╭━━━「 👤 *Info Pembuat Bot* 」━━━╮
┃
┃ • *Feat:* Command baru buat liat
┃   pembuat bot & sosial medianya.
┃
┃ • *Usage:* \`!owner\` — alias
┃   \`!creator\`, \`!pembuat\`, \`!dev\`.
┃
┃ • *Feat:* AI juga bisa jawab kalau
┃   ditanya siapa pembuat bot atau
┃   minta sosmed-nya.
┃
╰━━━━━━━━━━━━━━━━━━╯

📅 *3 Oktober 2026*

╭━━━「 👥 *Warning Member* 」━━━╮
┃
┃ • *Feat:* Sistem peringatan member
┃   grup — maks 3x, lalu otomatis
┃   di-kick dari grup.
┃
┃ • *Usage:* \`!warn @user <alasan>\`,
┃   \`!warn 1 @user\`, \`!unwarn @user\`,
┃   \`!warnlist\` (admin grup).
┃
┃ • *Feat:* AI bisa kasih warning,
┃   unwarn, & cek warning langsung
┃   dari obrolan grup.
┃
╰━━━━━━━━━━━━━━━━━━╯

📅 *29 September 2026*

╭━━━「 🖼️ *Bot Bisa Liat Gambar* 」━━━╮
┃
┃ • *Feat:* Kirim gambar langsung
┃   atau balas gambar — bot bisa
┃   liat & jelasin isinya.
┃
┃ • *Feat:* Jalan di chat pribadi
┃   maupun grup.
┃
╰━━━━━━━━━━━━━━━━━━╯

📅 *17 Agustus 2026*

╭━━━━━「 📨 *Sticker Pack Telegram* 」━━━━━╮
┃
┃ • *Feat:* Ubah pack sticker Telegram
┃   (t.me/addstickers) jadi sticker
┃   pack WhatsApp.
┃
┃ • *Usage:* \`!tgstickerpack <url/nama>\`
┃
╰━━━━━━━━━━━━━━━━━━╯

╭━━━━━「 📌 *Sticker Pack Pinterest* 」━━━━━╮
┃
┃ • *Feat:* Bikin banyak sticker dari
┃   Pinterest sekaligus, dikirim jadi
┃   satu sticker pack (maksimal 50).
┃
┃ • *Usage:* \`!pinsticker <url/keyword>\`
┃   atau minta langsung ke AI.
┃
╰━━━━━━━━━━━━━━━━━━╯

📅 *15 Agustus 2026*

╭━━━━━「 📦 *Sticker Pack* 」━━━━━╮
┃
┃ • *Feat:* Bikin & kirim *sticker pack*
┃   langsung dari WhatsApp.
┃
┃ • *Feat:* Dukung album — reply ke
┃   beberapa media sekaligus jadi
┃   satu pack (maksimal 60 sticker).
┃
┃ • *Usage:* \`!stickerpack <Nama|Publisher>\`
┃   → \`!stickerpack add\` → \`!stickerpack send\`
┃
╰━━━━━━━━━━━━━━━━━━╯

📅 *14 Agustus 2026*

╭━━━━━「 🧠 *AI Lebih Cepat* 」━━━━━╮
┃
┃ • *Feat:* Mesin AI baru — respons
┃   lebih cepat & stabil.
┃
┃ • *Fix:* Pencarian web & baca
┃   halaman nggak gampang gagal lagi.
┃
╰━━━━━━━━━━━━━━━━━━╯

╭━━━━━「 📸 *Instagram Fix* 」━━━━━╮
┃
┃ • *Fix:* Video yang gagal di upload ke story whatsapp (codec nggak cocok
┃   WhatsApp) sekarang aman.
┃
┃ • *Fix:* Kalau download gagal, ada
┃   pesan error yang jelas.
┃
╰━━━━━━━━━━━━━━━━━━╯

📅 *25 Juli 2026*

╭━━━━━「 💎 *Sistem Premium* 」━━━━━╮
┃
┃ • *Feat:* Tier baru — *free*,
┃   *premium*, & *pro*.
┃
┃ • *Feat:* Batas pemakaian AI &
┃   command per hari per user.
┃
╰━━━━━━━━━━━━━━━━━━╯

📅 *30 Juni 2026*

╭━━━「 📸 *Instagram Download* 」━━━╮
┃
┃ • *Fix:* Error "Gagal mengekstrak
┃   URL media dari Instagram" pas
┃   download Reels/foto/slide.
┃
┃ • *Fix:* Video Reels sekarang ada
┃   suaranya, nggak sepi lagi.
┃
┃ • *Fix:* AI mode juga udah bisa
┃   download dari Instagram lagi.
┃
╰━━━━━━━━━━━━━━━━━━╯

📅 *22 Juni 2026*

╭━━━「 🔥 *Cari & Baca Web* 」━━━╮
┃
┃ • *Feat:* Bot bisa baca halaman
┃   web — tinggal kirim URL, bot
┃   bacain & kasih ringkasan.
┃
┃ • *Feat:* Cari info langsung dari
┃   internet — harga emas, cuaca,
┃   berita, tinggal tanya aja.
┃
╰━━━━━━━━━━━━━━━━━━╯

╭━━━「 🧠 *AI Makin Pinter* 」━━━╮
┃
┃ • *Feat:* AI sekarang tau tanggal
┃   & jam, jadi jawaban nggak
┃   ngelantur tahun lalu.
┃
┃ • *Feat:* Search diatur biar
┃   hasilnya paling baru & akurat.
┃
┃ • *Feat:* Fitur search & baca web
┃   bisa dipake di grup juga.
┃
╰━━━━━━━━━━━━━━━━━━╯

╭━━━「 ⚙️ *Lainnya* 」━━━╮
┃
┃ • *Style:* Bersihin & rapiin kode
┃   biar lebih ringan & cepat.
┃
╰━━━━━━━━━━━━━━━━━━╯

╭━━━「 📌 *INFO* 」━━━╮
┃
┃ ✦ Ketik \`${matchedPrefix}help\` buat
┃   liat semua perintah.
┃ ✦ Ada bug? Lapor lewat
┃   \`${matchedPrefix}reportbug\`
┃
╰━━━━━━━━━━━━━━━━━━╯`;
    await context.socket.sendMessage(context.fromJid, { text });
  },
};

export default changelogCommand;
