import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { uploadFile, getPresignedUrl } from '../services/s3.service';

// Helper to handle legacy full URLs and generate signed URLs for both images and audio
const getSignedAssetUrl = async (url: string | null): Promise<string | null> => {
  if (!url) return null;
  // If it's already a full URL (legacy), extract the key
  let key = url;
  if (url.includes('.amazonaws.com/')) {
    key = url.split('.amazonaws.com/')[1];
  }
  try {
    return await getPresignedUrl(key, 3600); // 1 hour expiry
  } catch (err) {
    console.error(`[S3] Failed to sign URL for key: ${key}`, err);
    return null;
  }
};

export const createBooking = async (req: any, res: Response) => {
  let { categoryId, subCategoryId, locationId, messageText, audioMessageUrl, scheduledAt } = req.body;

  if (!categoryId || !locationId) {
    console.warn(`[CREATE BOOKING] Validation Failed: categoryId=${categoryId}, locationId=${locationId}`);
    return res.status(400).json({ success: false, message: 'Category and Location IDs are required' });
  }

  console.log(`[CREATE BOOKING] Initiated by user: ${req.userId} for category: ${categoryId}`);
  
  try {
    // If a file is uploaded (voice instruction), send it to S3
    if (req.file) {
      try {
        console.log('[CREATE BOOKING] Uploading voice instruction to S3...');
        audioMessageUrl = await uploadFile(req.file, 'audio');
        console.log(`[CREATE BOOKING] Audio S3 URL: ${audioMessageUrl}`);
      } catch (uploadErr: any) {
        console.error('[CREATE BOOKING] S3 Upload Error:', uploadErr.message);
      }
    }

    const booking = await prisma.serviceRequest.create({
      data: {
        customerId: req.userId,
        categoryId,
        subCategoryId: subCategoryId || null,
        locationId,
        messageText: messageText || null,
        audioMessageUrl: audioMessageUrl || null,
        scheduledAt: (scheduledAt && scheduledAt !== 'null') ? new Date(scheduledAt) : null,
        status: 'PENDING',
      },
    });

    console.log(`[CREATE BOOKING] Successfully created booking ID: ${booking.id}`);
    
    // Sign the URL for the response
    const responseData = {
      ...booking,
      audioMessageUrl: await getSignedAssetUrl(booking.audioMessageUrl)
    };

    res.status(201).json({ success: true, data: responseData });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getActiveBookings = async (req: any, res: Response) => {
  try {
    const bookings = await prisma.serviceRequest.findMany({
      where: {
        OR: [
          { customerId: req.userId },
          { spId: req.userId }
        ],
        status: { notIn: ['COMPLETED', 'CANCELLED'] }
      },
      include: {
        category: true,
        location: true,
        customer: {
          include: { profile: true }
        },
        sp: {
          include: { profile: true }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    // Process URLs for each booking
    const processedBookings = await Promise.all(bookings.map(async (b: any) => {
      return {
        ...b,
        audioMessageUrl: await getSignedAssetUrl(b.audioMessageUrl),
        sp: b.sp ? {
          ...b.sp,
          profile: b.sp.profile ? {
            ...b.sp.profile,
            profilePictureUrl: await getSignedAssetUrl(b.sp.profile.profilePictureUrl)
          } : null
        } : null
      };
    }));

    res.status(200).json({ success: true, data: processedBookings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateBookingStatus = async (req: any, res: Response) => {
  const { id } = req.params;
  const { status, otp } = req.body;

  try {
    const booking = await prisma.serviceRequest.findUnique({
      where: { id },
      include: { customer: true },
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Role-based status transitions
    if (req.role === 'SP') {
      if (status === 'ACCEPTED' && booking.status === 'PENDING') {
        // When SP accepts, generate a 4-digit numeric startOtp
        const startOtp = Math.floor(1000 + Math.random() * 9000).toString();
        await prisma.$transaction([
          prisma.serviceRequest.update({
            where: { id },
            data: { status, spId: req.userId, startOtp },
          }),
          prisma.serviceProviderProfile.update({
            where: { userId: req.userId },
            data: { dutyStatus: false } as any
          })
        ]);
        console.log(`[BOOKING] Mission ${id} accepted by ${req.userId}. Start OTP: ${startOtp}. Duty Status: OFF`);
      } else if (status === 'TEMP_WORK_STARTED' && booking.status === 'ACCEPTED') {
        // This is the stage where the worker arrives and asks for the START PIN
        // FALLBACK: Generate startOtp if missing
        const startOtp = booking.startOtp || Math.floor(1000 + Math.random() * 9000).toString();
        await prisma.serviceRequest.update({
          where: { id },
          data: { status, startOtp },
        });
        console.log(`[BOOKING] Mission ${id} worker arrived. Start OTP: ${startOtp}`);
      } else if (status === 'WORK_STARTED' && booking.status === 'TEMP_WORK_STARTED') {
        // Actual work start happens ONLY with correct OTP
        if (otp !== booking.startOtp) {
          return res.status(400).json({ success: false, message: 'Invalid start matching PIN' });
        }
        await prisma.serviceRequest.update({
          where: { id },
          data: { status },
        });
      } else if (status === 'TEMP_COMPLETED' && (booking.status === 'WORK_STARTED' || booking.status === 'TEMP_WORK_STARTED')) {
        // When worker finishes, generate a 4-digit completionOtp
        // FALLBACK: Always ensure a completionOtp exists
        const completionOtp = booking.completionOtp || Math.floor(1000 + Math.random() * 9000).toString();
        await prisma.serviceRequest.update({
          where: { id },
          data: { status, completionOtp },
        });
        console.log(`[BOOKING] Mission ${id} marked for completion. Completion OTP: ${completionOtp}`);
      } else if (status === 'COMPLETED' && booking.status === 'TEMP_COMPLETED') {
        // Final completion happens ONLY with correct PIN
        if (otp !== booking.completionOtp) {
          return res.status(400).json({ success: false, message: 'Invalid completion matching PIN' });
        }
        await prisma.$transaction([
          prisma.serviceRequest.update({
            where: { id },
            data: { status },
          }),
          prisma.serviceProviderProfile.update({
            where: { userId: booking.spId! },
            data: { dutyStatus: true } as any
          })
        ]);
        console.log(`[BOOKING] Mission ${id} COMPLETED. Duty Status: ON`);
      }
    }

    const updatedBooking = await prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        category: true,
        location: true,
        customer: { include: { profile: true } },
        sp: { include: { profile: true } }
      }
    });

    res.status(200).json({ success: true, message: 'Status updated', data: updatedBooking });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const cancelBooking = async (req: any, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({ success: false, message: 'Cancellation reason is required' });
  }

  try {
    const booking = await prisma.serviceRequest.findUnique({
      where: { id },
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.customerId !== req.userId && booking.spId !== req.userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Cancellation Policy: Cannot cancel once work has officially started OR once the worker has arrived (TEMP_WORK_STARTED)
    const nonCancellableStatuses = ['TEMP_WORK_STARTED', 'WORK_STARTED', 'TEMP_COMPLETED', 'COMPLETED', 'CANCELLED'];
    if (nonCancellableStatuses.includes(booking.status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Booking cannot be cancelled in its current state: ${booking.status}` 
      });
    }

    await prisma.$transaction([
      prisma.serviceRequest.update({
        where: { id },
        data: { status: 'CANCELLED' },
      }),
      prisma.requestCancellationReason.create({
        data: {
          requestId: id,
          reason,
          customerId: req.role === 'CUSTOMER' ? req.userId : null,
          spId: req.role === 'SP' ? req.userId : null,
        },
      }),
      ...(booking.spId ? [
        prisma.serviceProviderProfile.update({
          where: { userId: booking.spId },
          data: { dutyStatus: true } as any
        })
      ] : [])
    ]);

    res.status(200).json({ success: true, message: 'Booking cancelled' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getBookingHistory = async (req: any, res: Response) => {
  try {
    const bookings = await prisma.serviceRequest.findMany({
      where: {
        OR: [
          { customerId: req.userId },
          { spId: req.userId }
        ],
        status: { in: ['COMPLETED', 'CANCELLED'] }
      },
      include: {
        category: true,
        subCategory: true,
        location: true,
        sp: {
          include: { profile: true }
        },
        feedback: true,
        cancellation: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const processedHistory = await Promise.all(bookings.map(async (b: any) => {
      return {
        ...b,
        audioMessageUrl: await getSignedAssetUrl(b.audioMessageUrl),
        sp: b.sp ? {
          ...b.sp,
          profile: b.sp.profile ? {
            ...b.sp.profile,
            profilePictureUrl: await getSignedAssetUrl(b.sp.profile.profilePictureUrl)
          } : null
        } : null
      };
    }));

    res.status(200).json({ success: true, data: processedHistory });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const submitFeedback = async (req: any, res: Response) => {
  const requestId = req.params.requestId || req.body.requestId;
  const { rating, comment } = req.body;

  if (!requestId || !rating) {
    return res.status(400).json({ success: false, message: 'Request ID and Rating are required' });
  }

  try {
    const feedback = await prisma.feedback.upsert({
      where: { requestId },
      update: {
        rating: parseInt(rating),
        comment: comment || null,
      },
      create: {
        requestId,
        rating: parseInt(rating),
        comment: comment || null,
      },
    });

    res.status(201).json({ success: true, data: feedback });
  } catch (error: any) {
    console.error('Submit Feedback Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', debug: error.message });
  }
};
