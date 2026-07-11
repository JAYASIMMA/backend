import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { uploadFile, getSignedAssetUrl } from '../services/s3.service';
import * as admin from 'firebase-admin';
import { broadcastBookingUpdate } from '../services/websocket.service';

/**
 * Send a high-priority data-only multicast push notification to workers (SPs).
 */
const sendMulticastPush = async (tokens: string[], data: Record<string, string>) => {
  if (tokens.length === 0) return;
  const payload = {
    tokens,
    data,
    android: {
      priority: 'high' as const,
    },
    apns: {
      payload: {
        aps: {
          contentAvailable: true,
        },
      },
      headers: {
        'apns-priority': '10',
      },
    },
  };
  try {
    const response = await admin.messaging().sendEachForMulticast(payload);
    console.log(`[FCM] Multicast successfully sent ${response.successCount} messages; ${response.failureCount} failed.`);
  } catch (error) {
    console.error('[FCM] Multicast send error:', error);
  }
};

/**
 * Send a high-priority alarm-level return push notification to the customer.
 */
const sendSinglePush = async (token: string, data: Record<string, string>) => {
  const payload = {
    token,
    data,
    android: {
      priority: 'high' as const,
    },
    apns: {
      payload: {
        aps: {
          contentAvailable: true,
        },
      },
      headers: {
        'apns-priority': '10',
      },
    },
  };
  try {
    const response = await admin.messaging().send(payload);
    console.log(`[FCM] Customer alarm successfully sent message:`, response);
  } catch (error) {
    console.error('[FCM] Customer alarm send error:', error);
  }
};


const enrichAndProcessBooking = async (b: any) => {
  if (!b) return null;
  let locationWithCoords = b.location;

  if (b.locationId) {
    try {
      const coords: any[] = await prisma.$queryRaw`
        SELECT ST_X(coordinates::geometry) as lng, ST_Y(coordinates::geometry) as lat 
        FROM "Address" 
        WHERE id = ${b.locationId}
      `;

      if (coords && coords.length > 0) {
        locationWithCoords = {
          ...b.location,
          latitude: coords[0].lat,
          longitude: coords[0].lng
        };
      }
    } catch (err) {
      console.warn(`Failed to fetch coordinates for booking ${b.id}:`, err);
    }
  }

  const signedAudioUrl = b.audioMessageUrl ? await getSignedAssetUrl(b.audioMessageUrl) : null;

  return {
    ...b,
    location: locationWithCoords,
    audioMessageUrl: signedAudioUrl,
    customer: b.customer ? {
      ...b.customer,
      profile: b.customer.profile ? {
        ...b.customer.profile,
        profilePictureUrl: b.customer.profile.profilePictureUrl ? await getSignedAssetUrl(b.customer.profile.profilePictureUrl) : null
      } : null
    } : null,
    sp: b.sp ? {
      ...b.sp,
      profile: b.sp.profile ? {
        ...b.sp.profile,
        profilePictureUrl: b.sp.profile.profilePictureUrl ? await getSignedAssetUrl(b.sp.profile.profilePictureUrl) : null
      } : null
    } : null
  };
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
      include: {
        category: true,
        location: true,
        subCategory: true,
      }
    });

    console.log(`[CREATE BOOKING] Successfully created booking ID: ${booking.id}`);

    // Dispatch FCM notifications to matched workers in the background
    (async () => {
      try {
        const category = await prisma.serviceCategory.findUnique({
          where: { id: categoryId }
        });
        const subCategory = subCategoryId ? await prisma.serviceSubcategory.findUnique({
          where: { id: subCategoryId }
        }) : null;

        if (category) {
          const targetCategory = category.name.trim();
          const targetSubCategory = subCategory?.name?.trim();

          const workers = await prisma.user.findMany({
            where: {
              role: 'SP',
              fcmToken: { not: null },
              spProfile: {
                OR: [
                  { categoryName: targetCategory },
                  { subCategoryName: targetCategory },
                  ...(targetSubCategory ? [
                    { categoryName: targetSubCategory },
                    { subCategoryName: targetSubCategory }
                  ] : [])
                ]
              }
            },
            select: { fcmToken: true }
          });

          const tokens = workers.map(w => w.fcmToken as string).filter(t => t !== '');
          if (tokens.length > 0) {
            console.log(`[FCM] Found ${tokens.length} matching workers for category "${targetCategory}". Sending push notifications...`);
            const dataPayload = {
              click_action: 'FLUTTER_NOTIFICATION_CLICK',
              type: 'NEW_BOOKING',
              bookingId: booking.id,
              title: 'New Mission Request!',
              body: `A new ${targetCategory}${targetSubCategory ? ` (${targetSubCategory})` : ''} mission is available near you.`,
              categoryName: targetCategory,
              messageText: messageText || ''
            };
            await sendMulticastPush(tokens, dataPayload);
          } else {
            console.log(`[FCM] No workers with active FCM tokens found for category "${targetCategory}".`);
          }
        }
      } catch (fcmErr: any) {
        console.error('[FCM] Error processing worker broadcast pushes:', fcmErr);
      }
    })();

    // Sign the URL and enrich coordinates for the response
    const responseData = await enrichAndProcessBooking(booking);

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
        status: { notIn: ['COMPLETED', 'CANCELLED', 'TIMED_OUT'] }
      },
      include: {
        category: true,
        subCategory: true,
        location: true,
        customer: {
          include: { profile: true }
        },
        sp: {
          include: {
            profile: true,
            spProfile: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    // Process URLs and fetch coordinates for each booking
    const processedBookings = await Promise.all(bookings.map(enrichAndProcessBooking));

    res.status(200).json({ success: true, data: processedBookings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateBookingStatus = async (req: any, res: Response) => {
  const { id } = req.params;
  const { status, otp, amountPaid, optedServices } = req.body;

  try {
    const booking = await prisma.serviceRequest.findUnique({
      where: { id },
      include: { customer: true },
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Role-based status transitions
    if (status === 'TIMED_OUT' && booking.status === 'PENDING') {
      await prisma.$transaction([
        prisma.serviceRequest.update({
          where: { id },
          data: { status: 'TIMED_OUT' }
        }),
        prisma.timedOutRequest.upsert({
          where: { requestId: id },
          update: {},
          create: {
            requestId: id,
            reason: "No professional accepted within 5 minutes"
          }
        })
      ]);
      console.log(`[BOOKING] Mission ${id} TIMED_OUT by system/customer.`);
    } else if (req.role === 'SP') {
      if (status === 'ACCEPTED' && booking.status === 'PENDING') {
        // Concurrency check: At most 5 accepted/active requests
        const activeCount = await prisma.serviceRequest.count({
          where: {
            spId: req.userId,
            status: { in: ['ACCEPTED', 'TEMP_WORK_STARTED', 'WORK_STARTED', 'TEMP_COMPLETED'] }
          }
        });

        if (activeCount >= 5) {
          return res.status(400).json({
            success: false,
            message: 'You cannot accept more than 5 active missions. Please complete current ones first.'
          });
        }

        // When SP accepts, status is updated, spId is set, and startOtp is automatically generated.
        const startOtp = Math.floor(1000 + Math.random() * 9000).toString();
        await prisma.serviceRequest.update({
          where: { id },
          data: { status, spId: req.userId, startOtp },
        });
        console.log(`[BOOKING] Mission ${id} accepted by ${req.userId}. startOtp auto-generated: ${startOtp}. Duty Status: REMAINS ON`);
      } else if (status === 'TEMP_WORK_STARTED' && booking.status === 'ACCEPTED') {
        // Worker arrives at location. Use the customer's pre-generated startOtp if it exists,
        // otherwise generate a new one now.
        const startOtp = (booking as any).startOtp || Math.floor(1000 + Math.random() * 9000).toString();
        await prisma.$transaction([
          prisma.serviceRequest.update({
            where: { id },
            data: { status, startOtp },
          }),
          prisma.serviceProviderProfile.updateMany({
            where: { userId: req.userId },
            data: { dutyStatus: true } // Keep online even when working
          })
        ]);
        console.log(`[BOOKING] Mission ${id} marked as ARRIVED. Start OTP generated: ${startOtp}. Duty Status set to OFF.`);
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
        // When worker finishes, status becomes TEMP_COMPLETED.
        // The completionOtp must remain null until the customer enters the amount.
        await prisma.serviceRequest.update({
          where: { id },
          data: { status },
        });
        console.log(`[BOOKING] Mission ${id} marked for completion by SP. Waiting for customer details.`);
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
            data: { dutyStatus: true } as any // Keep online after completion
          })
        ]);
        console.log(`[BOOKING] Mission ${id} COMPLETED. Duty Status: OFF (Worker must manually toggle back to ON)`);
      }
    } else if (req.role === 'CUSTOMER' || req.userId === booking.customerId) {
      console.log(`[BOOKING] Customer branch entered. req.role=${req.role}, req.userId=${req.userId}, booking.customerId=${booking.customerId}, currentBookingStatus=${booking.status}, amountPaid=${amountPaid}`);

      if (booking.status === 'ACCEPTED' && !booking.startOtp) {
        // Customer generates the start OTP at the ACCEPTED stage so they can share it
        // with the SP when the SP arrives. The SP enters it to begin work.
        const startOtp = Math.floor(1000 + Math.random() * 9000).toString();
        await prisma.serviceRequest.update({
          where: { id },
          data: { startOtp },
        });
        console.log(`[BOOKING] Customer generated startOtp for mission ${id}: ${startOtp}`);
      } else if (booking.status === 'TEMP_COMPLETED') {
        // SP has already finished work. Customer now provides payment details & generates the completion OTP.
        const updateData: any = {};

        if (amountPaid !== undefined && amountPaid !== null) {
          updateData.amountPaid = typeof amountPaid === 'string' ? parseFloat(amountPaid) : Number(amountPaid);
        }
        if (optedServices !== undefined && optedServices !== null) {
          updateData.optedServices = optedServices;
        }

        // Generate a fresh completionOtp if one hasn't been set yet.
        if (!booking.completionOtp) {
          updateData.completionOtp = Math.floor(1000 + Math.random() * 9000).toString();
        }

        if (Object.keys(updateData).length > 0) {
          console.log(`[BOOKING] Customer providing payment details for mission ${id}:`, JSON.stringify(updateData));
          await prisma.serviceRequest.update({
            where: { id },
            data: updateData,
          });
          console.log(`[BOOKING] Mission ${id}: customer payment details saved. completionOtp=${updateData.completionOtp || booking.completionOtp}, amountPaid=${updateData.amountPaid}`);
        }
      } else {
        console.warn(`[BOOKING] Customer attempted to update mission ${id} in invalid state: ${booking.status}. Ignoring.`);
      }
    }

    const updatedBooking = await prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        category: true,
        subCategory: true,
        location: true,
        customer: { include: { profile: true } },
        sp: {
          include: {
            profile: true,
            spProfile: true
          }
        }
      }
    });

    const responseData = await enrichAndProcessBooking(updatedBooking);

    // Broadcast the update via WebSocket
    if (updatedBooking) {
      broadcastBookingUpdate(id, responseData);
    }

    // Send customer return push notification on worker actions
    if (req.role === 'SP' && updatedBooking && updatedBooking.customer?.fcmToken) {
      (async () => {
        try {
          const customerFcmToken = updatedBooking.customer.fcmToken!;
          const currentStatus = updatedBooking.status;

          let alertTitle = 'Mission Update';
          let alertBody = `Your booking status has been updated to ${currentStatus}.`;

          if (currentStatus === 'ACCEPTED') {
            const spName = updatedBooking.sp?.profile?.fullName || 'A Service Professional';
            alertTitle = 'Mission Accepted! 🛠️';
            alertBody = `${spName} has accepted your request. Open the app to generate your Start PIN.`;
          } else if (currentStatus === 'TEMP_WORK_STARTED') {
            alertTitle = 'Professional Arrived! 📍';
            alertBody = 'Your professional has arrived at your location. Please share the start PIN with them.';
          } else if (currentStatus === 'WORK_STARTED') {
            alertTitle = 'Work Started! ⚡';
            alertBody = 'Your service has officially begun.';
          } else if (currentStatus === 'TEMP_COMPLETED') {
            alertTitle = 'Work Completed! 🎉 Generate Finish OTP';
            alertBody = 'Your service professional has finished the work. Please open the app, enter the payment amount, and generate the completion OTP to close the mission.';
          } else if (currentStatus === 'COMPLETED') {
            alertTitle = 'Mission Complete! ✅';
            alertBody = 'Your service has been fully completed. Thank you!';
          }

          console.log(`[FCM] Sending return notification to customer ${updatedBooking.customerId} for status "${currentStatus}"...`);

          const dataPayload = {
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
            type: 'CUSTOMER_ALARM',
            bookingId: updatedBooking.id,
            title: alertTitle,
            body: alertBody,
            status: currentStatus,
            startOtp: updatedBooking.startOtp || '',
          };

          await sendSinglePush(customerFcmToken, dataPayload);
        } catch (fcmErr) {
          console.error('[FCM] Error sending return push to customer:', fcmErr);
        }
      })();
    }

    // Send worker push notification on customer actions
    if (req.role === 'CUSTOMER' && updatedBooking && updatedBooking.sp?.fcmToken) {
      const spFcmToken = updatedBooking.sp.fcmToken;
      const spId = updatedBooking.spId;
      (async () => {
        try {
          const currentStatus = updatedBooking.status;

          let alertTitle = 'Mission Update';
          let alertBody = `Customer has updated the mission status to ${currentStatus}.`;

          if (currentStatus === 'TEMP_COMPLETED') {
            alertTitle = 'Completion PIN Ready! 🔑';
            alertBody = `Customer has generated the completion PIN. Enter PIN ${updatedBooking.completionOtp || ''} to complete the mission.`;
          } else if (currentStatus === 'COMPLETED') {
            alertTitle = 'Mission Completed! ✅';
            alertBody = 'Your service mission has been fully completed. Thank you!';
          }

          console.log(`[FCM] Sending update notification to SP ${spId} for status "${currentStatus}"...`);

          const dataPayload = {
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
            type: 'SP_ALARM',
            bookingId: updatedBooking.id,
            title: alertTitle,
            body: alertBody,
            status: currentStatus,
          };

          await sendSinglePush(spFcmToken, dataPayload);
        } catch (fcmErr) {
          console.error('[FCM] Error sending return push to SP:', fcmErr);
        }
      })();
    }

    res.status(200).json({ success: true, message: 'Status updated', data: responseData });
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
        prisma.serviceProviderProfile.updateMany({
          where: { userId: booking.spId },
          data: { dutyStatus: true } // Keep online after cancellation
        })
      ] : [])
    ]);

    // Broadcast the cancellation update via WebSocket
    try {
      const updatedBooking = await prisma.serviceRequest.findUnique({
        where: { id },
        include: {
          category: true,
          subCategory: true,
          location: true,
          customer: { include: { profile: true } },
          sp: {
            include: {
              profile: true,
              spProfile: true
            }
          }
        }
      });
      if (updatedBooking) {
        const responseData = await enrichAndProcessBooking(updatedBooking);
        broadcastBookingUpdate(id, responseData);
      }
    } catch (err) {
      console.error('[CANCEL_BOOKING] WebSocket broadcast error:', err);
    }

    return res.status(200).json({ success: true, message: 'Booking cancelled successfully' });
  } catch (error: any) {
    console.error('[CANCEL_BOOKING] Error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during cancellation' });
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
        status: { in: ['COMPLETED', 'CANCELLED', 'TIMED_OUT'] }
      },
      include: {
        category: true,
        subCategory: true,
        location: true,
        customer: {
          include: { profile: true }
        },
        sp: {
          include: { profile: true }
        },
        feedback: true,
        cancellation: true,
        timedOut: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const processedHistory = await Promise.all(bookings.map(enrichAndProcessBooking));

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

export const getBookingById = async (req: any, res: Response) => {
  const { id } = req.params;
  try {
    const booking = await prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        category: true,
        subCategory: true,
        location: true,
        customer: { include: { profile: true } },
        sp: {
          include: {
            profile: true,
            spProfile: true
          }
        }
      }
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.customerId !== req.userId && booking.spId !== req.userId && req.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Unauthorized access' });
    }

    const responseData = await enrichAndProcessBooking(booking);
    res.status(200).json({ success: true, data: responseData });
  } catch (error) {
    console.error('[GET BOOKING BY ID] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
