import type { CommandModule } from '../../types/index.js';
import { log } from '../../utils/logger.js';

const INVITE_CODE_REGEX = /chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]{10,})/i;

/** Extract a group invite code from raw text, a bare link, or a bare code. */
export function extractInviteCode(input: string | undefined | null): string | null {
  if (!input) return null;

  const text = input.trim();
  if (!text) return null;

  const match = text.match(INVITE_CODE_REGEX);
  if (match) return match[1];

  // Bare code, e.g. "!join AbCdEfGhIjKlMn"
  if (/^[A-Za-z0-9_-]{15,}$/.test(text)) return text;

  return null;
}

const joinCommand: CommandModule = {
  config: {
    name: 'join',
    aliases: ['joingroup', 'gabung'],
    description: 'Buat bot masuk ke grup lewat link undangan',
    usage: '!join <link undangan grup>',
    category: 'owner',
    ownerOnly: true,
    cooldown: 5,
  },
  handler: async function (context, args: string[]): Promise<void> {
    const quotedInfo = context.simplified?.quotedInfo;
    const quotedInvite = quotedInfo?.quotedMessage?.groupInviteMessage;

    let inviteCode: string | null = null;
    let viaInviteMessage = false;

    // Priority 1: quoted group invite message (reply "!join" to an invitation).
    // groupAcceptInviteV4 needs inviteCode + groupJid + inviteExpiration to work.
    if (quotedInvite?.inviteCode && quotedInvite.groupJid && quotedInvite.inviteExpiration != null) {
      inviteCode = quotedInvite.inviteCode;
      viaInviteMessage = true;
    }

    // Priority 2: link/code from the command args or the quoted message body
    if (!inviteCode) {
      inviteCode =
        extractInviteCode(args.join(' ')) ||
        extractInviteCode(context.simplified?.body) ||
        extractInviteCode(quotedInvite?.caption);
    }

    if (!inviteCode) {
      await context.socket.sendMessage(context.fromJid, {
        text:
          '❌ Link undangan tidak ditemukan.\n\n' +
          'Cara pakai:\n' +
          '• `!join https://chat.whatsapp.com/xxxxxxxx`\n' +
          '• Reply pesan undangan grup dengan `!join`',
      });
      return;
    }

    // Try to join. A quoted invite is accepted first (most reliable for private groups).
    let groupJid: string | undefined;

    if (viaInviteMessage && quotedInvite) {
      // First param is the inviter's JID (or a full WAMessageKey).
      const inviterKey = quotedInfo?.participant || context.fromJid;
      try {
        groupJid = (await context.socket.groupAcceptInviteV4(inviterKey, quotedInvite)) || undefined;
      } catch (error) {
        log.warn('⚠️ [Join] groupAcceptInviteV4 gagal, fallback ke groupAcceptInvite:', error as object);
      }
    }

    if (!groupJid) {
      try {
        groupJid = await context.socket.groupAcceptInvite(inviteCode);
      } catch (error) {
        log.error('❌ [Join] Error joining group:', error as object);
        await context.socket.sendMessage(context.fromJid, {
          text:
            '❌ Gagal join ke grup.\n\n' +
            'Kemungkinan penyebab:\n' +
            '• Link sudah kedaluwarsa / dibatalkan\n' +
            '• Link direset oleh admin grup\n' +
            '• Bot sudah jadi anggota grup itu\n' +
            '• Grup penuh atau butuh persetujuan admin',
        });
        return;
      }
    }

    if (!groupJid) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Gagal join: server tidak mengembalikan ID grup. Coba lagi nanti.',
      });
      return;
    }

    const target = groupJid.includes('@') ? groupJid : `${groupJid}@g.us`;
    let groupName = target;

    try {
      const metadata = await context.socket.groupMetadata(target);
      groupName = metadata.subject || target;
    } catch {
      // Metadata is best-effort; joining already succeeded.
    }

    await context.socket.sendMessage(context.fromJid, {
      text: `✅ Berhasil join ke grup *${groupName}*\n🆔 ${target}`,
    });

    log.info(`✅ [Join] Joined group ${target} (${groupName}) via ${viaInviteMessage ? 'invite message' : 'invite link'}`);
  },
};

export default joinCommand;
