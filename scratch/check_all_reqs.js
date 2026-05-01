const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const reqs = await prisma.serviceRequest.findMany({
    include: {
      category: true,
      customer: { include: { profile: true } },
      sp: { include: { profile: true } }
    }
  });
  console.log(JSON.stringify(reqs, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
