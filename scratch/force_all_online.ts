import { PrismaClient } from '@prisma/client';
import process from 'process';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting to force all workers to online duty status...');
  
  const result = await prisma.serviceProviderProfile.updateMany({
    data: {
      dutyStatus: true
    }
  });

  console.log(`✅ Success! Updated ${result.count} worker profiles to dutyStatus: true`);
}

main()
  .catch((e) => {
    console.error('❌ Error updating duty status:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
