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
