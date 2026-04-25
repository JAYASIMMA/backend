const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const reqs = await prisma.serviceRequest.findMany({
    where: { status: 'PENDING' },
    include: { category: true }
  });
  reqs.forEach(r => {
    console.log(`ReqID: ${r.id}, Category: ${r.category.name}, Status: ${r.status}`);
  });
  process.exit(0);
}

main();
