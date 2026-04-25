
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkRequests() {
  const requests = await prisma.serviceRequest.findMany({
    where: { status: 'PENDING' },
    include: {
      category: true,
      subCategory: true,
      location: true
    }
  });
  console.log('Pending Requests:', JSON.stringify(requests, null, 2));
}

checkRequests()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
