
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
    select: { mobile: true, role: true }
  });
  console.log('Admins found:', admins);
}

main().catch(console.error).finally(() => prisma.$disconnect());
