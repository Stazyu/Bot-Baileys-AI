/**
 * Migrasi data auth lama → WaAuthState
 *
 * ⚠️ BACKUP DATABASE ANDA TERLEBIH DAHULU ⚠️
 * Script ini MEMBACA collection Session (model lama) dan memindahkan
 * authData ke WaAuthState (model baru).
 *
 * Data lama TIDAK dihapus — Anda bisa cleanup manual setelah yakin.
 *
 * Jalankan:
 *   npx tsx scripts/migrateAuthState.ts
 */

import { PrismaClient } from '@prisma/client';
import { BufferJSON } from '@innovatorssoft/baileys';

const prisma = new PrismaClient();

async function migrate() {
  console.log('🚀 Memulai migrasi auth data lama → WaAuthState...');

  // Ambil semua session lama yang punya authData
  const oldSessions = await prisma.session.findMany({
    where: { authData: { not: null } },
  });

  console.log(`📦 Ditemukan ${oldSessions.length} session lama dengan authData`);

  let migrated = 0;
  let skipped = 0;

  for (const old of oldSessions) {
    const { sessionId, authData } = old;
    if (!authData) { skipped++; continue; }

    let parsed: any = authData;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { skipped++; continue; }
    }

    // Revive Buffer yang tersimpan
    let revived: { creds?: any; keys?: Record<string, any> };
    try {
      revived = JSON.parse(JSON.stringify(parsed), BufferJSON.reviver);
    } catch {
      console.warn(`⚠️  Gagal parse authData session "${sessionId}", skip`);
      skipped++;
      continue;
    }

    // 1. Simpan creds
    if (revived.creds) {
      const credsSerialized = JSON.parse(JSON.stringify(revived.creds, BufferJSON.replacer));
      await prisma.waAuthState.upsert({
        where: { sessionId_type_key: { sessionId, type: 'creds', key: 'creds' } },
        update: { value: credsSerialized },
        create: { sessionId, type: 'creds', key: 'creds', value: credsSerialized },
      });
      console.log(`  ✔ creds "${sessionId}"`);
    }

    // 2. Simpan keys (pecah per type/id)
    if (revived.keys && typeof revived.keys === 'object') {
      let keyCount = 0;
      for (const type of Object.keys(revived.keys)) {
        const typeData = revived.keys[type];
        if (!typeData || typeof typeData !== 'object') continue;
        for (const id of Object.keys(typeData)) {
          const value = typeData[id];
          if (value == null) continue;
          const valSerialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
          await prisma.waAuthState.upsert({
            where: { sessionId_type_key: { sessionId, type, key: id } },
            update: { value: valSerialized },
            create: { sessionId, type, key: id, value: valSerialized },
          });
          keyCount++;
        }
      }
      console.log(`  ✔ keys "${sessionId}" (${keyCount} row)`);
    }

    // 3. Update / buat WaSession metadata dari Session lama
    await prisma.waSession.upsert({
      where: { sessionId },
      update: {
        phoneNumber: old.phoneNumber,
        isActive: old.isActive,
        ...(old.isActive ? { status: 'connected' } : { status: 'disconnected' }),
      },
      create: {
        sessionId,
        phoneNumber: old.phoneNumber,
        isActive: old.isActive,
        status: old.isActive ? 'connected' : 'disconnected',
      },
    });

    migrated++;
  }

  console.log('');
  console.log('✅ Migrasi selesai.');
  console.log(`   - Berhasil: ${migrated}`);
  console.log(`   - Dilewati: ${skipped}`);
  console.log('');
  console.log('ℹ️  Data lama di collection Session masih intact.');
  console.log('ℹ️  Jika semua berjalan lancar, Anda bisa hapus field authData');
  console.log('   dari dokumen Session lama — atau hapus koleksi via MongoDB Compass.');
  console.log('');
  console.log('⚠️  Jangan lupa backup sebelum cleanup manual!');

  await prisma.$disconnect();
}

migrate().catch((err) => {
  console.error('❌ Migrasi gagal:', err);
  process.exit(1);
});
