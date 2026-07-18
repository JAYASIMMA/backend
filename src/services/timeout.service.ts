import { prisma } from '../lib/prisma';
import { RequestStatus } from '@prisma/client';

/**
 * Service to automatically monitor and process service requests that have timed out.
 * 
 * LOGIC:
 * 1. ONLY 'PENDING' requests are eligible for timeout.
 * 2. If a request is ACCEPTED, WORK_STARTED, or in any other state, the timeout IS NOT triggered.
 * 3. Once accepted, the request remains active until manually closed by the Customer or SP.
 */
export const startTimeoutChecker = () => {
  console.log('⏰ [TIMEOUT SERVICE] Background checker initialized (Monitoring every 60s)');
  
  setInterval(async () => {
    try {
      const timeoutThreshold = new Date(Date.now() - 5 * 60 * 1000);
      
      // We strictly filter for PENDING only. 
      // This ensures that any request accepted by an electrician or other SP stays active.
      const pendingTimedOut = await prisma.serviceRequest.findMany({
        where: {
          status: 'PENDING' as RequestStatus,
          createdAt: {
            lt: timeoutThreshold
          }
        },
        select: { id: true }
      });

      if (pendingTimedOut.length > 0) {
        console.log(`⏳ [TIMEOUT SERVICE] Detected ${pendingTimedOut.length} unaccepted requests exceeding 5min. Marking as TIMED_OUT...`);
        
        for (const request of pendingTimedOut) {
          try {
            await prisma.$transaction(async (tx: any) => {
              const result = await tx.serviceRequest.updateMany({
                where: { id: request.id, status: 'PENDING' },
                data: { status: 'TIMED_OUT' as any }
              });
              if (result.count === 0) return;

              await tx.timedOutRequest.upsert({
                where: { requestId: request.id },
                update: {},
                create: {
                  requestId: request.id,
                  reason: 'Automatic System Timeout: No professional accepted within the 5-minute window.'
                }
              });
            });
            console.log(`✅ [TIMEOUT SERVICE] Archived Request ID: ${request.id}`);
          } catch (innerError) {
            console.error(`❌ [TIMEOUT SERVICE] Failed to process ${request.id}:`, innerError);
          }
        }
      }
    } catch (error) {
      console.error('❌ [TIMEOUT SERVICE] Critical error:', error);
    }
  }, 60000); 
};
