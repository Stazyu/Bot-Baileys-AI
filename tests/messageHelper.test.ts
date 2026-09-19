import assert from 'node:assert/strict';
import test from 'node:test';
import type { proto } from '@stazyu/baileys';
import {
  unwrapMessage,
  getRealContentType,
  extractTextFromMessage,
  extractContextInfo,
  extractInteractiveButtonId,
} from '../src/utils/messageHelper.js';

test('unwrapMessage unwraps ephemeralMessage', () => {
  const input: proto.IMessage = {
    ephemeralMessage: {
      message: {
        conversation: 'pesan rahasia',
      },
    },
  };
  assert.deepEqual(unwrapMessage(input), { conversation: 'pesan rahasia' });
});

test('unwrapMessage unwraps viewOnceMessageV2 and viewOnceMessage', () => {
  const inputV2: proto.IMessage = {
    viewOnceMessageV2: {
      message: {
        imageMessage: { caption: 'lihat sekali', url: 'https://example.com/img' },
      },
    },
  };
  assert.equal(unwrapMessage(inputV2)?.imageMessage?.caption, 'lihat sekali');

  const inputV1: proto.IMessage = {
    viewOnceMessage: {
      message: {
        videoMessage: { caption: 'video sekali' },
      },
    },
  };
  assert.equal(unwrapMessage(inputV1)?.videoMessage?.caption, 'video sekali');
});

test('unwrapMessage unwraps documentWithCaptionMessage', () => {
  const input: proto.IMessage = {
    documentWithCaptionMessage: {
      message: {
        documentMessage: { caption: 'lampiran penting', fileName: 'doc.pdf' },
      },
    },
  };
  assert.equal(unwrapMessage(input)?.documentMessage?.caption, 'lampiran penting');
});

test('unwrapMessage unwraps edited message from protocolMessage', () => {
  const input: proto.IMessage = {
    protocolMessage: {
      type: 14,
      editedMessage: {
        conversation: 'pesan sudah diedit',
      },
    },
  };
  assert.deepEqual(unwrapMessage(input), { conversation: 'pesan sudah diedit' });

  const inputNested: proto.IMessage = {
    editedMessage: {
      message: {
        protocolMessage: {
          type: 14,
          editedMessage: {
            conversation: 'pesan nested edited',
          },
        },
      },
    },
  };
  assert.deepEqual(unwrapMessage(inputNested), { conversation: 'pesan nested edited' });
});

test('unwrapMessage unwraps multi-level nested containers', () => {
  const multiLevel: proto.IMessage = {
    ephemeralMessage: {
      message: {
        viewOnceMessageV2: {
          message: {
            imageMessage: { caption: 'double wrapped' },
          },
        },
      },
    },
  };
  assert.equal(unwrapMessage(multiLevel)?.imageMessage?.caption, 'double wrapped');
});

test('unwrapMessage handles null, undefined, or direct message gracefully', () => {
  assert.equal(unwrapMessage(null), null);
  assert.equal(unwrapMessage(undefined), null);
  // Guard against untrusted runtime input: callers also feed deserialized DB blobs.
  assert.equal(unwrapMessage('not an object' as unknown as proto.IMessage), null);
  const direct: proto.IMessage = { conversation: 'langsung' };
  assert.deepEqual(unwrapMessage(direct), direct);
});

test('getRealContentType ignores senderKeyDistributionMessage and messageContextInfo in groups', () => {
  const groupMsg: proto.IMessage = {
    messageContextInfo: { deviceListMetadata: {} },
    senderKeyDistributionMessage: { groupId: '123@g.us' },
    conversation: 'halo group',
  };
  assert.equal(getRealContentType(groupMsg), 'conversation');

  const groupExtendedMsg: proto.IMessage = {
    messageContextInfo: {},
    senderKeyDistributionMessage: {},
    extendedTextMessage: { text: '!help' },
  };
  assert.equal(getRealContentType(groupExtendedMsg), 'extendedTextMessage');
});

test('getRealContentType correctly resolves unwrapped types', () => {
  const ephemeral: proto.IMessage = {
    ephemeralMessage: {
      message: {
        imageMessage: { caption: 'gambar' },
      },
    },
  };
  assert.equal(getRealContentType(ephemeral), 'imageMessage');

  const doc: proto.IMessage = {
    documentWithCaptionMessage: {
      message: {
        documentMessage: { fileName: 'file.pdf' },
      },
    },
  };
  assert.equal(getRealContentType(doc), 'documentMessage');
});

test('extractTextFromMessage extracts text across various message types', () => {
  assert.equal(extractTextFromMessage({ conversation: 'halo' }), 'halo');

  assert.equal(
    extractTextFromMessage({ extendedTextMessage: { text: 'panjang' } }),
    'panjang',
  );

  assert.equal(
    extractTextFromMessage({ imageMessage: { caption: 'caption foto' } }),
    'caption foto',
  );
  assert.equal(
    extractTextFromMessage({ videoMessage: { caption: 'caption video' } }),
    'caption video',
  );
  assert.equal(
    extractTextFromMessage({ documentMessage: { caption: 'caption doc' } }),
    'caption doc',
  );
  assert.equal(
    extractTextFromMessage({ documentMessage: { fileName: 'file.pdf' } }),
    'file.pdf',
  );

  // Wrapped container (ephemeral)
  assert.equal(
    extractTextFromMessage({
      ephemeralMessage: { message: { conversation: 'isi ephemeral' } },
    }),
    'isi ephemeral',
  );

  // Interactive native flow button response — command id wins over the label
  assert.equal(
    extractTextFromMessage({
      interactiveResponseMessage: {
        nativeFlowResponseMessage: {
          paramsJson: JSON.stringify({ id: '!menu', displayText: 'Menu' }),
        },
      },
    }),
    '!menu',
  );

  // Native flow without an id falls back to the visible label
  assert.equal(
    extractTextFromMessage({
      interactiveResponseMessage: {
        nativeFlowResponseMessage: { paramsJson: JSON.stringify({ displayText: 'Menu' }) },
      },
    }),
    'Menu',
  );

  assert.equal(
    extractTextFromMessage({ templateButtonReplyMessage: { selectedId: '!ping' } }),
    '!ping',
  );

  assert.equal(
    extractTextFromMessage({ buttonsResponseMessage: { selectedButtonId: '!help' } }),
    '!help',
  );

  assert.equal(
    extractTextFromMessage({
      listResponseMessage: {
        singleSelectReply: { selectedRowId: '!ai' },
        title: 'Tanya AI',
      },
    }),
    'Tanya AI',
  );

  assert.equal(
    extractTextFromMessage({ pollCreationMessage: { name: 'Pilih mana?' } }),
    'Pilih mana?',
  );

  // Empty string preservation
  assert.equal(extractTextFromMessage({ conversation: '' }), '');
});

test('extractInteractiveButtonId reads the command id from native flow params', () => {
  assert.equal(
    extractInteractiveButtonId({
      interactiveResponseMessage: {
        nativeFlowResponseMessage: { paramsJson: JSON.stringify({ id: '!sticker', displayText: 'Sticker' }) },
      },
    }),
    '!sticker',
  );

  // Malformed JSON must not throw
  assert.equal(
    extractInteractiveButtonId({
      interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{not json' } },
    }),
    null,
  );
});

test('extractContextInfo extracts context and unwraps inner quotedMessage', () => {
  const msgWithQuotedEphemeral: proto.IMessage = {
    extendedTextMessage: {
      text: 'reply to ephemeral',
      contextInfo: {
        participant: '628111@s.whatsapp.net',
        quotedMessage: {
          ephemeralMessage: {
            message: {
              imageMessage: { caption: 'foto rahasia' },
            },
          },
        },
      },
    },
  };

  const ctx = extractContextInfo(msgWithQuotedEphemeral);
  assert.ok(ctx);
  assert.equal(ctx.participant, '628111@s.whatsapp.net');
  // Inner quoted message must be unwrapped
  assert.equal(ctx.quotedMessage?.imageMessage?.caption, 'foto rahasia');
});

test('extractContextInfo reads contextInfo from non-text payloads (image caption reply)', () => {
  const imageWithQuote: proto.IMessage = {
    imageMessage: {
      caption: '!sticker',
      contextInfo: {
        stanzaId: 'ORIGINAL-ID',
        quotedMessage: { stickerMessage: { mimetype: 'image/webp' } },
      },
    },
  };

  const ctx = extractContextInfo(imageWithQuote);
  assert.equal(ctx?.stanzaId, 'ORIGINAL-ID');
  assert.ok(ctx?.quotedMessage?.stickerMessage);
});
