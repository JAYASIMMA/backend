import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const sps = await prisma.user.findMany({
    where: { role: 'SP' },
    select: {
      id: true,
      mobile: true,
      profile: { select: { fullName: true } },
      spProfile: { select: { categoryName: true, subCategoryName: true } }
    }
  });

  console.log('=== SERVICE PROVIDERS IN DB ===');
  console.log(JSON.stringify(sps, null, 2));

  const totalRequests = await prisma.serviceRequest.count();
  console.log('\nTotal ServiceRequests in DB:', totalRequests);

  const requestsBySp = await prisma.serviceRequest.findMany({
    select: {
      id: true,
      spId: true,
      status: true,
      amountPaid: true,
      createdAt: true
    }
  });

  console.log('\n=== ALL SERVICE REQUESTS IN DB ===');
  console.log(JSON.stringify(requestsBySp, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
