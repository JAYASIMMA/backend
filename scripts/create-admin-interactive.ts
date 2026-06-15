import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import readline from 'readline';

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => rl.question(query, resolve));
};

async function main() {
  try {
    console.log('\n=====================================');
    console.log('    Interactive Admin User Seeder    ');
    console.log('=====================================\n');

    let mobile = await question('📱 Enter Admin Mobile Number (e.g., 9965332234): ');
    mobile = mobile.trim();
    if (!mobile) {
      console.log('❌ Error: Mobile number cannot be empty.');
      rl.close();
      return;
    }

    // Normalize: Add +91 prefix if it is a 10-digit number
    if (mobile.length === 10 && !mobile.startsWith('+')) {
      mobile = `+91${mobile}`;
    }

    let password = await question('🔑 Enter Password: ');
    password = password.trim();
    if (!password) {
      console.log('❌ Error: Password cannot be empty.');
      rl.close();
      return;
    }

    let roleInput = await question('🛡️  Enter Role (SUPER_ADMIN or ADMIN, default: SUPER_ADMIN): ');
    let role: Role = 'SUPER_ADMIN';
    const normalizedRole = roleInput.trim().toUpperCase();
    if (normalizedRole === 'ADMIN') {
      role = 'ADMIN';
    } else if (normalizedRole && normalizedRole !== 'SUPER_ADMIN') {
      console.log('⚠️  Invalid role entered. Defaulting to SUPER_ADMIN.');
    }

    rl.close();

    console.log('\n⏳ Creating/updating admin user in database...');

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create or Update the Admin
    const admin = await prisma.user.upsert({
      where: { mobile },
      update: {
        role,
        passwordHash,
      },
      create: {
        mobile,
        role,
        passwordHash,
      },
    });

    console.log('\n✅ Admin user created/updated successfully!');
    console.log(`📱 Mobile: ${admin.mobile}`);
    console.log(`🛡️  Role: ${admin.role}`);
    console.log('=====================================\n');

  } catch (error: any) {
    console.error('\n❌ Failed to seed Admin:', error.message || error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
