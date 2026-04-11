import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteUserByMobile(mobile: string) {
  try {
    // 1. Find the user first to confirm visibility
    const user = await prisma.user.findFirst({
      where: {
        mobile: {
          contains: mobile
        }
      }
    });

    if (!user) {
      console.log(`❌ No user found with mobile number containing: ${mobile}`);
      return;
    }

    console.log(`🔎 Found user: ${user.mobile} (ID: ${user.id})`);
    
    // 2. Delete the user
    // Note: Due to 'onDelete: Cascade' in schema.prisma, this will also delete 
    // their Profile, Addresses, and other linked data.
    await prisma.user.delete({
      where: { id: user.id }
    });

    console.log(`✅ Successfully deleted user ${user.mobile} and all associated data.`);
  } catch (error) {
    console.error('❌ Error during deletion:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get mobile from command line or use a default
const targetMobile = process.argv[2] || '9159384606';
deleteUserByMobile(targetMobile);
