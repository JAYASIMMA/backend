import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const mobile = '9965279413';
  try {
    const user = await prisma.user.findUnique({
      where: { mobile },
      include: { spProfile: true },
    });
    console.log('User found:', JSON.stringify(user, null, 2));
    
    // Test a fixed password too
    const bcrypt = require('bcryptjs');
    if (user?.passwordHash) {
       const isWorker123 = await bcrypt.compare('worker123', user.passwordHash);
       const isWorkar123 = await bcrypt.compare('workar123', user.passwordHash);
       console.log('Match worker123?', isWorker123);
       console.log('Match workar123?', isWorkar123);
    }
  } catch (e) {
    console.error('ERROR:', e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
