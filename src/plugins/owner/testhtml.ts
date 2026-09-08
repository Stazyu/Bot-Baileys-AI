import type { CommandModule } from '../../types/index.js';

/**
 * Test feature for the newest Baileys (@stazyu/baileys) API: `sendRichHtml`.
 * Sends a GenAI interactive HTML payload rendered as a live web view by the
 * WhatsApp client (HTML primitive inside unifiedResponse.data).
 */
function buildCardHtml(userName: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: radial-gradient(circle at top right, #1e293b, #0f172a);
    color: #f8fafc;
    padding: 16px;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  .card {
    border: 1px solid #334155;
    border-radius: 16px;
    padding: 16px;
    box-shadow: 0 10px 25px -5px rgba(0,0,0,.5);
  }
  .header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .badge {
    width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0;
    background: linear-gradient(135deg, #38bdf8, #6366f1);
    display: flex; align-items: center; justify-content: center;
    font-size: 22px;
  }
  h1 { font-size: 16px; color: #38bdf8; }
  .sub { font-size: 12px; color: #94a3b8; }
  .info {
    background: rgba(255,255,255,.05);
    padding: 12px; border-radius: 10px; margin-bottom: 12px;
    font-size: 13px; color: #cbd5e1; line-height: 1.5;
  }
  code { color: #f43f5e; background: #27272a; padding: 2px 5px; border-radius: 4px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px; text-align: center; }
  .stat { background: #1e3a5f; padding: 10px 4px; border-radius: 10px; }
  .stat b { display: block; font-size: 18px; color: #4ade80; }
  .stat span { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: .5px; }
  .counter {
    display: flex; align-items: center; justify-content: space-between;
    background: rgba(255,255,255,.05); border-radius: 12px; padding: 10px 14px; margin-bottom: 12px;
  }
  .counter .value { font-size: 28px; font-weight: 700; color: #fbbf24; min-width: 48px; text-align: center; }
  .btn {
    border: none; border-radius: 10px; padding: 10px 18px;
    font-size: 15px; font-weight: 600; color: #fff; cursor: pointer;
  }
  .btn-plus { background: linear-gradient(135deg, #22c55e, #16a34a); }
  .btn-minus { background: linear-gradient(135deg, #ef4444, #b91c1c); }
  .btn-reset { background: #475569; width: 100%; font-size: 13px; padding: 9px; }
  .btn:active { transform: scale(.96); }
  .footer { margin-top: 12px; text-align: center; font-size: 10px; color: #64748b; letter-spacing: .5px; }
</style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="badge">🧪</div>
      <div>
        <h1>Fitur Test HTML — sendRichHtml</h1>
        <p class="sub">GenAI Interactive HTML · @stazyu/baileys</p>
      </div>
    </div>
    <div class="info">
      Halo <b>${userName}</b>! Pesan ini dirender langsung oleh WhatsApp sebagai
      <i>live web view</i> memakai <code>sock.sendRichHtml()</code> — bukan gambar, bukan teks biasa.
    </div>
    <div class="grid">
      <div class="stat"><b>HTML</b><span>Payload</span></div>
      <div class="stat"><b>CSS</b><span>Inline</span></div>
      <div class="stat"><b>JS</b><span>Interaktif</span></div>
    </div>
    <div class="counter">
      <button class="btn btn-minus" onclick="ubah(-1)">−</button>
      <div class="value" id="angka">0</div>
      <button class="btn btn-plus" onclick="ubah(1)">+</button>
    </div>
    <button class="btn btn-reset" onclick="ubah(0, true)">Reset Counter</button>
    <div class="footer">BOT-BAILEYS-AI · RICH HTML TEST</div>
  </div>
<script>
  var n = 0;
  function ubah(d, reset) {
    n = reset ? 0 : n + d;
    var el = document.getElementById('angka');
    el.textContent = n;
    el.style.color = n > 0 ? '#4ade80' : n < 0 ? '#f87171' : '#fbbf24';
  }
</script>
</body>
</html>`;
}

const testhtmlCommand: CommandModule = {
  config: {
    name: 'testhtml',
    aliases: ['th', 'richhtml', 'html'],
    description: 'Test fitur terbaru Baileys: kirim interactive HTML (sendRichHtml)',
    usage: '!testhtml',
    category: 'owner',
  },
  handler: async function (context, args: string[]): Promise<void> {
    const jid = context.fromJid;
    const sock = context.socket;
    const userName = context.pushName || 'User';

    try {
      await sock.sendRichHtml(
        jid,
        {
          id: 'test-html-card',
          title: '🧪 Test Rich HTML',
          headerText: 'Fitur terbaru Baileys — sendRichHtml',
          footer: 'Coba tekan tombol + / − di atas. HTML dirender native oleh WhatsApp.',
          html: buildCardHtml(userName),
          source: 'bot-baileys-ai',
        },
        context.message
      );
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      await sock.sendMessage(jid, {
        text: `❌ Rich HTML gagal terkirim\n\n${reason}`,
      });
    }
  },
};

export default testhtmlCommand;
