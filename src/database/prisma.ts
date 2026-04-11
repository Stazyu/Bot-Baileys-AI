import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  // log: ['query', 'error', 'warn'],
});

export default prisma;

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
