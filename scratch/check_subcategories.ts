
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkSub() {
  const subs = await prisma.serviceSubcategory.findMany();
  console.log('Subcategories:', JSON.stringify(subs, null, 2));
}

checkSub()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
