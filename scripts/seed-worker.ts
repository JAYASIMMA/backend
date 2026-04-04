import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const mobile = '9965279413'; // Default Worker Mobile
  const password = 'workar123'; // Matches user request exactly

  try {
    console.log('--- Worker (Service Provider) Seeding ---');
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create or Update the Worker
    const worker = await prisma.user.upsert({
      where: { mobile },
      update: {
        role: 'SP',
        passwordHash,
      },
      create: {
        mobile,
        role: 'SP',
        passwordHash,
      },
    });

    // Ensure Service Provider Profile exists and is verified
    await prisma.serviceProviderProfile.upsert({
      where: { userId: worker.id },
      update: { isVerified: true },
      create: {
        userId: worker.id,
        isVerified: true,
        categoryName: 'Electrician', 
        address: 'Downtown Hub',
      },
    });

    console.log('✅ Worker created/updated successfully!');
    console.log(`📱 Mobile: ${mobile}`);
    console.log(`🔑 Password: ${password}`);
    console.log('--- Use these credentials at POST /api/v1/auth/login ---');

  } catch (error) {
    console.error('❌ Failed to seed Worker:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
