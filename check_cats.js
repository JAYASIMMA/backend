const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const categories = await prisma.serviceCategory.findMany({
    select: { name: true }
  });
  console.log('Categories:', categories.map(c => c.name));
  process.exit(0);
}

main();
