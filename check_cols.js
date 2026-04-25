const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const cols = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'ServiceRequest'`;
  console.log('Columns:', cols.map(c => c.column_name));
  process.exit(0);
}

main();
