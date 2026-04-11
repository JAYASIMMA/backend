import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listUsers() {
  const users = await prisma.user.findMany({
    take: 10,
    select: { mobile: true, role: true }
  });
  console.log('Sample users:', users);
}

listUsers()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
