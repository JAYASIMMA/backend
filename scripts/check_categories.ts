
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const categories = await prisma.serviceCategory.findMany({
    include: { subCategories: true }
  });
  console.log('Categories in DB count:', categories.length);
  if (categories.length > 0) {
    console.log('Sample category:', JSON.stringify(categories[0], null, 2));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
