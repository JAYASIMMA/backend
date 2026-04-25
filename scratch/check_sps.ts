import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sps = await prisma.user.findMany({
    where: {
      role: 'SP'
    },
    include: {
      spProfile: true
    }
  });
  console.log(JSON.stringify(sps, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
