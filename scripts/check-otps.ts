import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  try {
    const count = await prisma.otpRecord.count();
    console.log('OTP Count:', count);
    const otps = await prisma.otpRecord.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
    console.log('Latest OTPs:', JSON.stringify(otps, null, 2));
  } catch (e) {
    console.error('ERROR:', e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
