import assert from 'node:assert/strict';
import test from 'node:test';
import { getCreatorInfo } from '../src/config/botConfig.js';
import { getSystemPrompt, getGroupSystemPrompt } from '../src/services/systemPrompt.js';
import ownerCommand from '../src/plugins/basic/owner.js';

async function runOwner(): Promise<string> {
  const sent: string[] = [];
  const context = {
    fromJid: 'x@s.whatsapp.net',
    socket: { sendMessage: async (_jid: string, message: { text: string }) => { sent.push(message.text); } },
  } as unknown as Parameters<typeof ownerCommand.handler>[0];
  await ownerCommand.handler(context, []);
  return sent[0];
}

function withCreator(value: string | undefined, fn: () => void): void {
  const prev = process.env.BOT_CREATOR;
  if (value === undefined) delete process.env.BOT_CREATOR;
  else process.env.BOT_CREATOR = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.BOT_CREATOR;
    else process.env.BOT_CREATOR = prev;
  }
}

async function withCreatorAsync(value: string | undefined, fn: () => Promise<void>): Promise<void> {
  const prev = process.env.BOT_CREATOR;
  if (value === undefined) delete process.env.BOT_CREATOR;
  else process.env.BOT_CREATOR = value;
  try {
    await fn();
  } finally {
    if (prev === undefined) delete process.env.BOT_CREATOR;
    else process.env.BOT_CREATOR = prev;
  }
}

test('getCreatorInfo: null kalau env kosong', () => {
  withCreator(undefined, () => assert.equal(getCreatorInfo(), null));
});

test('getCreatorInfo: null + warning kalau JSON rusak / tanpa name', () => {
  withCreator('bukan-json', () => assert.equal(getCreatorInfo(), null));
  withCreator('{"socials":{"instagram":"@x"}}', () => assert.equal(getCreatorInfo(), null));
});

test('getCreatorInfo: parse name + socials', () => {
  withCreator('{"name":"Wahyu","socials":{"instagram":"@wahyu"}}', () => {
    const info = getCreatorInfo();
    assert.equal(info?.name, 'Wahyu');
    assert.equal(info?.socials?.instagram, '@wahyu');
  });
});

test('prompt memuat pembuat + sosmed, tanpa nomor telepon', () => {
  withCreator('{"name":"Wahyu","socials":{"Instagram":"@wahyu","TikTok":""}}', () => {
    const prompts = [getSystemPrompt(), getGroupSystemPrompt('08:00', 'Budi')];
    for (const prompt of prompts) {
      assert.match(prompt, /PEMBUAT BOT/);
      assert.match(prompt, /Nama: Wahyu/);
      assert.match(prompt, /Instagram: @wahyu/);
      assert.match(prompt, /Bot ini dibuat oleh Wahyu:/);
      assert.doesNotMatch(prompt, /TikTok: /);
    }
  });
});

test('format balasan mengikuti sosmed yang diisi', () => {
  withCreator('{"name":"Wahyu","socials":{"Instagram":"@wahyu","Website":"wahyu.dev"}}', () => {
    const prompt = getSystemPrompt();
    assert.match(prompt, /Instagram: <nilai>/);
    assert.match(prompt, /Website: <nilai>/);
  });
});

test('prompt tidak menambah blok pembuat kalau env kosong', () => {
  withCreator(undefined, () => {
    assert.doesNotMatch(getSystemPrompt(), /PEMBUAT BOT/);
    assert.doesNotMatch(getGroupSystemPrompt('08:00', 'Budi'), /PEMBUAT BOT/);
  });
});

test('command !owner balas sosmed satu per baris', async () => {
  await withCreatorAsync('{"name":"Wahyu H.P","socials":{"Instagram":"@wahyuhp57","GitHub":"stazyu","TikTok":""},"note":"Project pribadi"}', async () => {
    const text = await runOwner();
    assert.equal(
      text,
      [
        '👤 *Pembuat Bot Ini*',
        '',
        'Bot ini dikembangkan dan dirawat oleh *Wahyu H.P*.',
        '',
        '📱 *Sosmed:*',
        '• Instagram: @wahyuhp57',
        '• GitHub: stazyu',
        '',
        '_Project pribadi_',
      ].join('\n'),
    );
  });
});

test('command !owner kasih pesan ramah kalau env kosong', async () => {
  await withCreatorAsync(undefined, async () => {
    assert.match(await runOwner(), /belum diatur/);
  });
});
