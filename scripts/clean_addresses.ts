import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function cleanDuplicateAddresses() {
  console.log('Cleaning duplicate addresses...');
  
  // Find all addresses grouped by customerId and addressLine
  const addresses = await prisma.address.findMany({
    orderBy: { createdAt: 'asc' }
  });

  const seen = new Set<string>();
  const toDelete: string[] = [];

  for (const addr of addresses) {
    const key = `${addr.customerId}-${addr.addressLine}-${addr.label}`;
    if (seen.has(key)) {
      toDelete.push(addr.id);
    } else {
      seen.add(key);
    }
  }

  if (toDelete.length > 0) {
    console.log(`Deleting ${toDelete.length} duplicate addresses...`);
    await prisma.address.deleteMany({
      where: {
        id: { in: toDelete }
      }
    });
    console.log('Clean up complete.');
  } else {
    console.log('No duplicates found.');
  }
}

cleanDuplicateAddresses()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
