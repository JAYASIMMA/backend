import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const mobile = '9884986223'; // Default SuperAdmin Mobile
  const password = 'admin1984'; // Default SuperAdmin Password

  try {
    console.log('--- SuperAdmin Secret Seeding ---');
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create or Update the SuperAdmin
    const admin = await prisma.user.upsert({
      where: { mobile },
      update: {
        role: 'ADMIN',
        passwordHash,
      },
      create: {
        mobile,
        role: 'ADMIN',
        passwordHash,
      },
    });

    console.log('✅ SuperAdmin created/updated successfully!');
    console.log(`📱 Mobile: ${mobile}`);
    console.log(`🔑 Password: ${password}`);
    console.log('--- Use these credentials at POST /api/v1/auth/login ---');

  } catch (error: any) {
    console.error('❌ Failed to seed SuperAdmin:', error.message || error);
    if (error.code) console.error('Error Code:', error.code);
    if (error.meta) console.error('Error Meta:', error.meta);
  } finally {
    await prisma.$disconnect();
  }
}

main();
