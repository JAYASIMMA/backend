const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
  const c = await prisma.serviceRequest.count();
  console.log('Count:', c);
  const data = await prisma.serviceRequest.findMany({take:1});
  console.log('Sample:', JSON.stringify(data, null, 2));
}
check().finally(() => prisma.$disconnect());
