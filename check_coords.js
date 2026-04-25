const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const loc = await prisma.$queryRaw`SELECT ST_AsText(coordinates) as coords FROM "Address" WHERE id = '03927e01-690c-46d5-93ee-d8503d2ad726'`;
  console.log('Coords:', loc);
  process.exit(0);
}

main();
