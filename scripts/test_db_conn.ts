import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Testing RDS PostgreSQL connection...');
  const count = await prisma.user.count();
  console.log('Successfully connected! Total users in DB:', count);
}

main().catch(console.error).finally(() => prisma.$disconnect());
