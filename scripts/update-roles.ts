import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    where: {
      role: 'SUPER_ADMIN' as any
    },
    data: {
      role: 'ADMIN'
    }
  });
  console.log(`Successfully updated ${result.count} users from SUPER_ADMIN to ADMIN.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
