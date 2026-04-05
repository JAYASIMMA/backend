import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({
    where: { role: 'SP' },
    include: { spProfile: true }
  });
  console.log('SP Users:', JSON.stringify(users, null, 2));

  const requests = await prisma.serviceRequest.findMany({
    where: { status: 'PENDING' },
    include: { location: true, category: true }
  });
  console.log('Pending Requests:', JSON.stringify(requests, null, 2));
}

check();
