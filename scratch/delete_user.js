const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Looking for user with number containing 9159384606...');
  
  // Search for the user with different formats
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { mobile: { contains: '9159384606' } },
        { mobile: { contains: '9159384606' } }
      ]
    },
    include: {
      profile: true,
      spProfile: true
    }
  });

  if (users.length === 0) {
    console.log('❌ No user found with phone number 9159384606.');
    process.exit(0);
  }

  console.log(`Found ${users.length} matching user(s):`);
  for (const user of users) {
    console.log(`- ID: ${user.id}`);
    console.log(`  Name: ${user.profile?.fullName || 'N/A'}`);
    console.log(`  Mobile: ${user.mobile}`);
    console.log(`  Role: ${user.role}`);

    // Let's delete in a transaction to handle all tables cleanly
    await prisma.$transaction(async (tx) => {
      // 1. Delete associated Feedback
      // feedback is connected to ServiceRequest. We find requests for this customer or SP.
      const requests = await tx.serviceRequest.findMany({
        where: {
          OR: [
            { customerId: user.id },
            { spId: user.id }
          ]
        },
        select: { id: true }
      });
      
      const requestIds = requests.map(r => r.id);
      
      if (requestIds.length > 0) {
        console.log(`  Deleting ${requestIds.length} feedback records...`);
        await tx.feedback.deleteMany({
          where: { requestId: { in: requestIds } }
        });

        console.log(`  Deleting ${requestIds.length} timed out request records...`);
        await tx.timedOutRequest.deleteMany({
          where: { requestId: { in: requestIds } }
        });

        console.log(`  Deleting ${requestIds.length} chat messages...`);
        await tx.chatMessage.deleteMany({
          where: { requestId: { in: requestIds } }
        });

        console.log(`  Deleting ${requestIds.length} request cancellation reasons...`);
        await tx.requestCancellationReason.deleteMany({
          where: { requestId: { in: requestIds } }
        });

        console.log(`  Deleting ${requestIds.length} rejections...`);
        await tx.serviceRequestRejection.deleteMany({
          where: { requestId: { in: requestIds } }
        });

        console.log(`  Deleting ${requestIds.length} service requests...`);
        await tx.serviceRequest.deleteMany({
          where: { id: { in: requestIds } }
        });
      }

      // 2. Delete any separate cancellation reasons
      await tx.requestCancellationReason.deleteMany({
        where: {
          OR: [
            { customerId: user.id },
            { spId: user.id }
          ]
        }
      });

      // 3. Delete any separate rejections
      await tx.serviceRequestRejection.deleteMany({
        where: { spId: user.id }
      });

      // 4. Delete Address
      console.log('  Deleting addresses...');
      await tx.address.deleteMany({
        where: { customerId: user.id }
      });

      // 5. Delete Profile & ServiceProviderProfile (Cascade handles these, but let's be explicit)
      console.log('  Deleting profile records...');
      await tx.profile.deleteMany({
        where: { userId: user.id }
      });
      await tx.serviceProviderProfile.deleteMany({
        where: { userId: user.id }
      });

      // 6. Finally delete User
      console.log('  Deleting User record...');
      await tx.user.delete({
        where: { id: user.id }
      });
    });

    console.log(`✅ Successfully deleted user ${user.mobile} and all associated data.`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error during deletion script:', err);
  process.exit(1);
});
