const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const req = await prisma.serviceRequest.findUnique({
    where: { id: '6557bb61-4835-47a4-a5d3-31a28ba02e2c' },
    include: { location: true }
  });
  console.log('Request Location:', req.location);
  process.exit(0);
}

main();
