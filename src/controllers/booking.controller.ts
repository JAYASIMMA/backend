import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { uploadFile } from '../services/s3.service';

const prisma = new PrismaClient();

export const createBooking = async (req: any, res: Response) => {
  let { categoryId, subCategoryId, locationId, messageText, audioMessageUrl, scheduledAt } = req.body;

  if (!categoryId || !locationId) {
    console.warn(`[CREATE BOOKING] Validation Failed: categoryId=${categoryId}, locationId=${locationId}`);
    return res.status(400).json({ success: false, message: 'Category and Location IDs are required' });
  }

  console.log(`[CREATE BOOKING] Initiated by user: ${req.userId} for category: ${categoryId}`);
  console.log(`[CREATE BOOKING] req.file present: ${!!req.file}`);
  if (req.file) {
     console.log(`[CREATE BOOKING] File details: name=${req.file.originalname}, size=${req.file.size}, type=${req.file.mimetype}`);
  }

  try {
    // If a file is uploaded (voice instruction), send it to S3
    if (req.file) {
      try {
        console.log('[CREATE BOOKING] Uploading voice instruction to S3...');
        audioMessageUrl = await uploadFile(req.file, 'audio');
        console.log(`[CREATE BOOKING] Audio S3 URL: ${audioMessageUrl}`);
      } catch (uploadErr: any) {
        console.error('[CREATE BOOKING] S3 Upload Error:', uploadErr.message);
        // We continue with null URL if upload fails, or we can throw
      }
    }

    const booking = await prisma.serviceRequest.create({
      data: {
        customerId: req.userId,
        categoryId,
        subCategoryId,
        locationId,
        messageText,
        audioMessageUrl,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status: 'PENDING',
      },
    });

    console.log(`[CREATE BOOKING] Successfully created booking ID: ${booking.id}`);
    res.status(201).json({ success: true, data: booking });
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
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ success: true, data: bookings });
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
        await prisma.serviceRequest.update({
          where: { id },
          data: { status, spId: req.userId },
        });
      } else if (status === 'TEMP_WORK_STARTED' && booking.status === 'ACCEPTED') {
        // Generate Start OTP for customer to give to SP
        const startOtp = Math.floor(1000 + Math.random() * 9000).toString();
        await prisma.serviceRequest.update({
          where: { id },
          data: { status, startOtp },
        });
        
        // (Twilio functionality removed - refer to console for OTP)
        
        console.log(`[START OTP] ${startOtp}`);
      } else if (status === 'WORK_STARTED' && booking.status === 'TEMP_WORK_STARTED') {
        if (otp !== booking.startOtp) {
          return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }
        await prisma.serviceRequest.update({
          where: { id },
          data: { status },
        });
      } else if (status === 'TEMP_COMPLETED' && booking.status === 'WORK_STARTED') {
        // Generate Completion OTP
        const completionOtp = Math.floor(1000 + Math.random() * 9000).toString();
        await prisma.serviceRequest.update({
          where: { id },
          data: { status, completionOtp },
        });

        // (Twilio functionality removed - refer to console for OTP)

        console.log(`[COMPLETION OTP] ${completionOtp}`);
      } else if (status === 'COMPLETED' && booking.status === 'TEMP_COMPLETED') {
        if (otp !== booking.completionOtp) {
          return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }
        await prisma.serviceRequest.update({
          where: { id },
          data: { status },
        });
      }
    }

    res.status(200).json({ success: true, message: 'Status updated' });
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

    // Only allow customer or assigned SP to cancel
    if (booking.customerId !== req.userId && booking.spId !== req.userId) {
      return res.status(403).json({ success: false, message: 'Forbidden: You are not authorized to cancel this booking' });
    }

    if (booking.status === 'COMPLETED') {
      return res.status(400).json({ success: false, message: 'Cannot cancel a completed booking' });
    }

    // Perform as a transaction
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
    ]);

    res.status(200).json({ success: true, message: 'Booking cancelled successfully' });
  } catch (error) {
    console.error('Cancellation Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get Job History (Completed or Cancelled)
 */
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
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.status(200).json({ success: true, data: bookings });
  } catch (error) {
    console.error('History Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
