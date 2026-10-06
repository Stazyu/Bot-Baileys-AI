import { getContentType as baileysGetContentType, proto } from '@stazyu/baileys';

/**
 * Keys Baileys attaches alongside the real payload (group sender keys,
 * device metadata, ads). They must never win over the actual content type.
 */
const METADATA_KEYS: Record<string, true> = {
  messageContextInfo: true,
  senderKeyDistributionMessage: true,
  fastRatchetKeySenderKeyDistributionMessage: true,
  deviceListMetadata: true,
  deviceListMetadataVersion: true,
  sessionState: true,
  externalAdReply: true,
  externalAdReplyContextInfo: true,
  businessMessageForwardInfo: true,
};

/** Payload keys of a decoded Baileys message. */
export type MessageType = keyof proto.IMessage;

/** Keys of any message type that carries a contextInfo (quotes/mentions). */
type ContextCarrier = {
  contextInfo?: proto.IContextInfo | null;
};

/**
 * Recursively unwraps container messages (ephemeral, viewOnce, documentWithCaption,
 * deviceSent, edited, status) up to 5 levels deep to return the innermost payload.
 */
export function unwrapMessage(content: proto.IMessage | null | undefined): proto.IMessage | null {
  // Guard kept: callers also feed deserialized DB blobs, not only typed Baileys objects.
  if (!content || typeof content !== 'object') {
    return null;
  }
  let current: proto.IMessage = content;

  for (let depth = 0; depth < 5; depth++) {
    const next: proto.IMessage | null | undefined =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message ||
      current.documentWithCaptionMessage?.message ||
      current.editedMessage?.message ||
      current.protocolMessage?.editedMessage ||
      current.deviceSentMessage?.message ||
      current.botInvokeMessage?.message ||
      current.associatedChildMessage?.message ||
      current.groupStatusMessage?.message ||
      current.groupStatusMessageV2?.message;

    if (!next) {
      break;
    }
    current = next;
  }

  return current;
}

/**
 * Actual payload type of a message, ignoring group/metadata keys that would
 * otherwise be mistaken for the content type (the group-only `null` bug).
 */
export function getRealContentType(content: proto.IMessage | null | undefined): MessageType | null {
  const unwrapped = unwrapMessage(content);
  if (!unwrapped) {
    return null;
  }

  // The object's own keys are, by construction, payload keys.
  const keys = Object.keys(unwrapped) as MessageType[];

  const payloadKey = keys.find(
    (key) =>
      !METADATA_KEYS[key] &&
      (key === 'conversation' || key.endsWith('Message') || key.endsWith('Response') || key.endsWith('Reply')),
  );
  if (payloadKey) {
    return payloadKey;
  }

  const baileysType = baileysGetContentType(unwrapped);
  if (baileysType && !METADATA_KEYS[baileysType]) {
    return baileysType;
  }

  return keys.find((key) => !METADATA_KEYS[key]) ?? null;
}

interface NativeFlowText {
  id: string | null;
  displayText: string | null;
}

/** Reads `id`/`displayText` out of an interactive native-flow `paramsJson`. */
function readNativeFlow(paramsJson: string): NativeFlowText | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(paramsJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const id = 'id' in parsed && typeof parsed.id === 'string' && parsed.id.length > 0 ? parsed.id : null;
  const displayText =
    'displayText' in parsed && typeof parsed.displayText === 'string' && parsed.displayText.length > 0
      ? parsed.displayText
      : null;
  return { id, displayText };
}

/** Button ID of an interactive native-flow reply — the command the user pressed. */
export function extractInteractiveButtonId(content: proto.IMessage | null | undefined): string | null {
  const paramsJson = unwrapMessage(content)?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  return paramsJson ? (readNativeFlow(paramsJson)?.id ?? null) : null;
}

/**
 * Human-readable text of any WhatsApp message type: conversations, extended text,
 * media captions, documents, button/interactive replies, polls, contacts, locations.
 * Returns null when the message carries no text at all.
 */
export function extractTextFromMessage(content: proto.IMessage | null | undefined): string | null {
  const m = unwrapMessage(content);
  if (!m) {
    return null;
  }

  if (typeof m.conversation === 'string') {
    return m.conversation;
  }

  if (typeof m.extendedTextMessage?.text === 'string') {
    return m.extendedTextMessage.text;
  }

  if (typeof m.imageMessage?.caption === 'string') {
    return m.imageMessage.caption;
  }

  if (typeof m.videoMessage?.caption === 'string') {
    return m.videoMessage.caption;
  }

  if (typeof m.documentMessage?.caption === 'string') {
    return m.documentMessage.caption;
  }

  if (typeof m.documentMessage?.fileName === 'string') {
    return m.documentMessage.fileName;
  }

  const paramsJson = m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (paramsJson) {
    const flow = readNativeFlow(paramsJson);
    if (flow?.id) {
      return flow.id;
    }
    if (flow?.displayText) {
      return flow.displayText;
    }
  }

  if (typeof m.interactiveResponseMessage?.body?.text === 'string' && m.interactiveResponseMessage.body.text.length > 0) {
    return m.interactiveResponseMessage.body.text;
  }

  if (typeof m.interactiveMessage?.body?.text === 'string' && m.interactiveMessage.body.text.length > 0) {
    return m.interactiveMessage.body.text;
  }

  if (typeof m.interactiveMessage?.header?.title === 'string' && m.interactiveMessage.header.title.length > 0) {
    return m.interactiveMessage.header.title;
  }

  if (typeof m.buttonsResponseMessage?.selectedDisplayText === 'string' && m.buttonsResponseMessage.selectedDisplayText.length > 0) {
    return m.buttonsResponseMessage.selectedDisplayText;
  }

  if (typeof m.buttonsResponseMessage?.selectedButtonId === 'string' && m.buttonsResponseMessage.selectedButtonId.length > 0) {
    return m.buttonsResponseMessage.selectedButtonId;
  }

  if (typeof m.templateButtonReplyMessage?.selectedDisplayText === 'string' && m.templateButtonReplyMessage.selectedDisplayText.length > 0) {
    return m.templateButtonReplyMessage.selectedDisplayText;
  }

  if (typeof m.templateButtonReplyMessage?.selectedId === 'string' && m.templateButtonReplyMessage.selectedId.length > 0) {
    return m.templateButtonReplyMessage.selectedId;
  }

  if (typeof m.listResponseMessage?.title === 'string' && m.listResponseMessage.title.length > 0) {
    return m.listResponseMessage.title;
  }

  if (typeof m.listResponseMessage?.singleSelectReply?.selectedRowId === 'string' && m.listResponseMessage.singleSelectReply.selectedRowId.length > 0) {
    return m.listResponseMessage.singleSelectReply.selectedRowId;
  }

  if (typeof m.buttonsMessage?.contentText === 'string' && m.buttonsMessage.contentText.length > 0) {
    return m.buttonsMessage.contentText;
  }

  if (typeof m.templateMessage?.hydratedTemplate?.hydratedContentText === 'string' && m.templateMessage.hydratedTemplate.hydratedContentText.length > 0) {
    return m.templateMessage.hydratedTemplate.hydratedContentText;
  }

  if (typeof m.templateMessage?.hydratedTemplate?.templateId === 'string' && m.templateMessage.hydratedTemplate.templateId.length > 0) {
    return m.templateMessage.hydratedTemplate.templateId;
  }

  if (typeof m.pollCreationMessage?.name === 'string' && m.pollCreationMessage.name.length > 0) {
    return m.pollCreationMessage.name;
  }

  if (typeof m.pollCreationMessageV2?.name === 'string' && m.pollCreationMessageV2.name.length > 0) {
    return m.pollCreationMessageV2.name;
  }

  if (typeof m.pollCreationMessageV3?.name === 'string' && m.pollCreationMessageV3.name.length > 0) {
    return m.pollCreationMessageV3.name;
  }

  if (typeof m.locationMessage?.name === 'string' && m.locationMessage.name.length > 0) {
    return m.locationMessage.name;
  }

  if (typeof m.locationMessage?.comment === 'string' && m.locationMessage.comment.length > 0) {
    return m.locationMessage.comment;
  }

  if (typeof m.contactMessage?.displayName === 'string' && m.contactMessage.displayName.length > 0) {
    return m.contactMessage.displayName;
  }

  if (typeof m.reactionMessage?.text === 'string' && m.reactionMessage.text.length > 0) {
    return m.reactionMessage.text;
  }

  return null;
}

/**
 * contextInfo (mentions, quoted message) of any message type that carries one.
 * The embedded `quotedMessage` is unwrapped so consumers get the real payload.
 */
export function extractContextInfo(content: proto.IMessage | null | undefined): proto.IContextInfo | undefined {
  const m = unwrapMessage(content);
  if (!m) {
    return undefined;
  }

  const carriers: Array<ContextCarrier | null | undefined> = [
    m.extendedTextMessage,
    m.imageMessage,
    m.videoMessage,
    m.documentMessage,
    m.audioMessage,
    m.stickerMessage,
    m.buttonsResponseMessage,
    m.templateButtonReplyMessage,
    m.listResponseMessage,
    m.interactiveResponseMessage,
    m.contactMessage,
    m.locationMessage,
  ];

  for (const carrier of carriers) {
    const ctx = carrier?.contextInfo;
    if (!ctx) {
      continue;
    }
    ctx.quotedMessage = unwrapMessage(ctx.quotedMessage);
    return ctx;
  }

  return undefined;
}

/**
 * Quoted-message summary for AI prompts.
 *
 * A reply's meaning usually lives in the message it quotes — especially when
 * the bot never saw the original (another member's message, or a bot reply
 * that already expired from the conversation cache). Without the quoted content
 * the model ends up answering its own previous turn instead of the message the
 * user actually replied to.
 */
export interface QuotedMessageSummary {
  /** Quoted text, or a bracketed placeholder (`[gambar]`) when it carries none. */
  text: string;
  /** True when `text` is a placeholder, i.e. the quote has no readable text. */
  isPlaceholder: boolean;
}

/** Placeholder for quoted payloads that carry no text of their own. */
const QUOTED_PLACEHOLDERS: Partial<Record<MessageType, string>> = {
  imageMessage: '[gambar]',
  videoMessage: '[video]',
  audioMessage: '[audio/voice note]',
  stickerMessage: '[sticker]',
  documentMessage: '[dokumen]',
  contactMessage: '[kontak]',
  locationMessage: '[lokasi]',
  pollCreationMessage: '[poll]',
  pollCreationMessageV2: '[poll]',
  pollCreationMessageV3: '[poll]',
};

/** Max characters of quoted text forwarded to the AI — keeps prompts bounded. */
const MAX_QUOTED_TEXT_LENGTH = 500;

/**
 * Describe a quoted message payload for an AI prompt.
 *
 * Returns null when there is no quote at all. Container payloads are unwrapped
 * first, whitespace is collapsed so the quote stays a single prompt line, and
 * long text is truncated — a quoted wall of text must not blow up the request.
 */
export function describeQuotedMessage(
  quoted: proto.IMessage | null | undefined,
): QuotedMessageSummary | null {
  const m = unwrapMessage(quoted);
  if (!m) {
    return null;
  }

  const text = extractTextFromMessage(m);
  if (text?.trim()) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    return {
      text:
        normalized.length > MAX_QUOTED_TEXT_LENGTH
          ? `${normalized.slice(0, MAX_QUOTED_TEXT_LENGTH)}…`
          : normalized,
      isPlaceholder: false,
    };
  }

  const type = getRealContentType(m);
  return {
    text: (type && QUOTED_PLACEHOLDERS[type]) || '[pesan tanpa teks]',
    isPlaceholder: true,
  };
}

/** Bot's own WhatsApp identity, used to tell "replied to the bot" from "replied to a member". */
export interface BotIdentity {
  /** Bot JID, e.g. `628123:1@s.whatsapp.net`. */
  id?: string | null;
  /** Bot LID, e.g. `123456:1@lid`. */
  lid?: string | null;
}

/** Digits only, so `628123:1@s.whatsapp.net` and `628123` compare equal. */
function jidDigits(jid: string | null | undefined): string {
  return jid?.split(':')[0].replace(/\D/g, '') ?? '';
}

/**
 * Build the `[Membalas pesan ...]` prompt hint for a reply.
 *
 * Carries the QUOTED CONTENT, not just who was quoted. A reply's meaning lives
 * in the message it points at, and that message is often not in the AI's own
 * history (another member's chat, a bot reply that expired from the cache, or a
 * private-chat reply where the bot never stored the quoted turn) — without the
 * content the model just re-answers its own previous message.
 *
 * Returns '' when the message is not a reply.
 */
export function buildReplyHint(
  quotedInfo: proto.IContextInfo | null | undefined,
  bot: BotIdentity = {},
): string {
  const summary = describeQuotedMessage(quotedInfo?.quotedMessage);
  if (!summary) {
    return '';
  }

  const botId = jidDigits(bot.id);
  const botLid = jidDigits(bot.lid);
  const participant = quotedInfo?.participant || '';
  const quoteDigits = jidDigits(participant);
  const isBotQuoted = Boolean(
    (botId && quoteDigits === botId) || (botLid && quoteDigits === botLid),
  );

  let who: string;
  if (isBotQuoted) {
    who = 'Membalas pesan BOT sendiri sebelumnya';
  } else if (participant) {
    who = `Membalas pesan dari user @${participant.split('@')[0]}`;
  } else {
    who = 'Membalas pesan sebelumnya';
  }

  // Placeholders ([gambar], [sticker]) are already bracketed — quoting them
  // again would read as literal text rather than a note.
  const content = summary.isPlaceholder ? summary.text : `"${summary.text}"`;
  return `[${who}: ${content}]`;
}

/**
 * Downloadable image payload for AI vision input: the message's own image or
 * sticker, or the one it replies to (so "apa ini?" over a quoted photo works too).
 *
 * Stickers count as images on purpose: WhatsApp encrypts them with the SAME HKDF
 * key as photos (`MEDIA_HKDF_KEY_MAPPING` maps both to 'Image'), so the bytes
 * decrypt to a plain WebP that vision models read fine. Static, animated, and
 * `.json` (LOTTIE) stickers all arrive here the same way.
 *
 * Pure payload inspection — no download, no I/O. Returns null when neither the
 * message nor its quote carries an image.
 */
/** Where a vision payload came from — the message itself, or the one it quotes. */
export type VisionImageSource = 'own' | 'quoted';

/** A vision payload plus its origin. */
export interface VisionImageResolution {
  payload: proto.Message.IImageMessage | proto.Message.IStickerMessage;
  source: VisionImageSource;
}

/**
 * Resolve the image/sticker payload AND where it came from.
 *
 * The origin matters for stickers: one the user sends is an expression of their
 * mood, while one they REPLY to is the subject of a question — the prompt must
 * tell the model which of the two it is looking at.
 */
export function extractVisionImageSource(
  content: proto.IMessage | null | undefined,
): VisionImageResolution | null {
  const m = unwrapMessage(content);
  if (!m) {
    return null;
  }

  if (m.imageMessage) {
    return { payload: m.imageMessage, source: 'own' };
  }

  if (m.stickerMessage) {
    return { payload: m.stickerMessage, source: 'own' };
  }

  const quoted = extractContextInfo(m)?.quotedMessage;
  if (quoted?.imageMessage) {
    return { payload: quoted.imageMessage, source: 'quoted' };
  }

  if (quoted?.stickerMessage) {
    return { payload: quoted.stickerMessage, source: 'quoted' };
  }

  return null;
}

/**
 * Downloadable image payload for AI vision input: the message's own image or
 * sticker, or the one it replies to (so "apa ini?" over a quoted photo works too).
 *
 * Stickers count as images on purpose: WhatsApp encrypts them with the SAME HKDF
 * key as photos (`MEDIA_HKDF_KEY_MAPPING` maps both to 'Image'), so the bytes
 * decrypt to a plain WebP that vision models read fine. Static, animated, and
 * `.json` (LOTTIE) stickers all arrive here the same way.
 *
 * Pure payload inspection — no download, no I/O. Returns null when neither the
 * message nor its quote carries an image.
 */
export function extractVisionImagePayload(
  content: proto.IMessage | null | undefined,
): proto.Message.IImageMessage | proto.Message.IStickerMessage | null {
  return extractVisionImageSource(content)?.payload ?? null;
}
