import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const requests = await prisma.serviceRequest.findMany({
    where: {
      status: 'PENDING'
    },
    include: {
      category: true,
      subCategory: true,
      location: true
    }
  });
  console.log(JSON.stringify(requests, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
