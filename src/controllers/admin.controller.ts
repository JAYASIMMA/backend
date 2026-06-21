import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { getPresignedUrl, uploadFile, getSignedAssetUrl } from '../services/s3.service';
import * as firebaseAdmin from 'firebase-admin';

const sendSinglePush = async (token: string, data: Record<string, string>) => {
  if (!token) return;
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
    const response = await firebaseAdmin.messaging().send(payload);
    console.log(`[FCM-ADMIN] Success sending push:`, response);
  } catch (error) {
    console.error('[FCM-ADMIN] Push send error:', error);
  }
};

// Dashboard Stats
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const totalRequests = await prisma.serviceRequest.count();
    const completedRequests = await prisma.serviceRequest.count({ where: { status: 'COMPLETED' } });
    const totalCustomers = await prisma.user.count({ where: { role: 'CUSTOMER' } });
    const totalSPs = await prisma.user.count({ where: { role: 'SP' } });

    // Dummy revenue calc for now (could be part of request if price was in schema)
    const revenue = completedRequests * 450; 

    res.status(200).json({
      success: true,
      data: {
        totalRevenue: revenue,
        totalCustomers,
        totalSPs,
        completedJobs: completedRequests,
        activeRequests: totalRequests - completedRequests
      }
    });
  } catch (error) {
    console.error('Admin Stats Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Customer Directory
export const getCustomers = async (req: Request, res: Response) => {
  try {
    const customers = await prisma.user.findMany({
      where: { role: 'CUSTOMER' },
      include: {
        profile: true,
        addresses: {
          select: {
            id: true,
            addressLine: true,
            city: true,
            pincode: true,
            label: true,
            isDefault: true
          }
        },
        requests: true
      }
    });
    const signedCustomers = await Promise.all(customers.map(async (c: any) => {
        if (c.profile?.profilePictureUrl) {
            c.profile.profilePictureUrl = await getSignedAssetUrl(c.profile.profilePictureUrl);
        }
        return c;
    }));
    res.status(200).json({ success: true, data: signedCustomers });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Merchant Ecosystem (Optimized)
export const getSPs = async (req: Request, res: Response) => {
  try {
    const sps = await prisma.user.findMany({
      where: { role: 'SP' },
      include: {
        profile: true,
        spProfile: true,
      },
      take: 100, // Safety limit
    });

    // 1. Efficiently get ratings and counts in one query using GroupBy
    // This is MUCH faster than calculating manually in TypeScript
    const feedbackStats = await prisma.feedback.groupBy({
      by: ['requestId'],
      _avg: { rating: true },
    });

    // Use a map for O(1) lookup
    const requestsWithFeedback = await prisma.serviceRequest.findMany({
        where: { spId: { in: sps.map(sp => sp.id) } },
        select: { id: true, spId: true, feedback: { select: { rating: true } } }
    });

    const spStatsMap: any = {};
    requestsWithFeedback.forEach(r => {
        if (!r.spId) return;
        if (!spStatsMap[r.spId]) spStatsMap[r.spId] = { sum: 0, count: 0 };
        if (r.feedback) {
            spStatsMap[r.spId].sum += r.feedback.rating;
            spStatsMap[r.spId].count += 1;
        }
    });

    // 2. Batch process S3 signing (only for what's visible or useful)
    const enrichedSPs = await Promise.all(sps.map(async (sp: any) => {
        const stats = spStatsMap[sp.id] || { sum: 0, count: 0 };
        sp.rating = stats.count > 0 ? Number((stats.sum / stats.count).toFixed(1)) : 0;
        sp.feedbackCount = stats.count;

        if (sp.profile?.profilePictureUrl) {
            sp.profile.profilePictureUrl = await getSignedAssetUrl(sp.profile.profilePictureUrl);
        }
        if (sp.spProfile?.aadharCardUrl) {
            sp.spProfile.aadharCardUrl = await getSignedAssetUrl(sp.spProfile.aadharCardUrl);
        }

        return sp;
    }));

    res.status(200).json({ success: true, data: enrichedSPs });
  } catch (error) {
    console.error('getSPs Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Operating Center (All Requests)
export const getAllRequests = async (req: Request, res: Response) => {
  try {
    const requests = await prisma.serviceRequest.findMany({
      include: {
        customer: { include: { profile: true } },
        sp: { include: { profile: true } },
        category: true,
        subCategory: true,
        location: {
          select: {
            id: true,
            addressLine: true,
            city: true,
            pincode: true,
            label: true
          }
        },
        feedback: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateRequestStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, amountPaid, optedServices, completionOtp } = req.body;
    try {
        const booking = await prisma.serviceRequest.findUnique({
            where: { id },
            include: {
                customer: { include: { profile: true } },
                sp: { include: { profile: true } }
            }
        });

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        const updateData: any = {};
        if (status !== undefined) {
            updateData.status = status;
        }

        // Generate startOtp if transitioning to ACCEPTED/TEMP_WORK_STARTED and it doesn't exist
        if (status === 'ACCEPTED' || status === 'TEMP_WORK_STARTED') {
            updateData.startOtp = booking.startOtp || Math.floor(1000 + Math.random() * 9000).toString();
        }

        // Generate completionOtp if transitioning to TEMP_COMPLETED and it doesn't exist
        if (status === 'TEMP_COMPLETED') {
            updateData.completionOtp = booking.completionOtp || completionOtp || Math.floor(1000 + Math.random() * 9000).toString();
        }

        // Allow explicit generation of completionOtp even if status remains the same
        if (completionOtp !== undefined) {
            updateData.completionOtp = completionOtp;
        }

        if (amountPaid !== undefined) {
            updateData.amountPaid = typeof amountPaid === 'string' ? parseFloat(amountPaid) : amountPaid;
        }

        if (optedServices !== undefined) {
            updateData.optedServices = optedServices;
        }

        const updated = await prisma.serviceRequest.update({
            where: { id },
            data: updateData,
            include: {
                customer: { include: { profile: true } },
                sp: { include: { profile: true } },
                category: true,
                subCategory: true,
                location: {
                    select: {
                        id: true,
                        addressLine: true,
                        city: true,
                        pincode: true,
                        label: true
                    }
                },
                feedback: true
            }
        });

        // Duty status update on COMPLETED status
        if (status === 'COMPLETED' && updated.spId) {
            try {
                await prisma.serviceProviderProfile.update({
                    where: { userId: updated.spId },
                    data: { dutyStatus: true } as any
                });
            } catch (err) {
                console.error('[ADMIN] Error updating SP duty status on completion:', err);
            }
        }

        // Send Push Notifications in background
        (async () => {
            try {
                const currentStatus = updated.status;
                const startPin = updated.startOtp || '';
                const endPin = updated.completionOtp || '';
                const spName = updated.sp?.profile?.fullName || 'A Service Professional';

                // 1. Notify Customer
                if (updated.customer?.fcmToken) {
                    let customerTitle = 'Mission Update';
                    let customerBody = `Your booking status has been updated to ${currentStatus}.`;

                    if (currentStatus === 'ACCEPTED') {
                        customerTitle = 'Mission Accepted! 🛠️';
                        customerBody = `${spName} has accepted your request. Start PIN: ${startPin}`;
                    } else if (currentStatus === 'TEMP_WORK_STARTED') {
                        customerTitle = 'Professional Arrived! 📍';
                        customerBody = 'Your professional has arrived at your location. Please share the start PIN with them.';
                    } else if (currentStatus === 'WORK_STARTED') {
                        customerTitle = 'Work Started! ⚡';
                        customerBody = 'Your service has officially begun.';
                    } else if (currentStatus === 'TEMP_COMPLETED') {
                        customerTitle = 'Work Finished! 🎉';
                        customerBody = `The service is complete. Please share completion PIN ${endPin} to authorize.`;
                    } else if (currentStatus === 'COMPLETED') {
                        customerTitle = 'Mission Complete! ✅';
                        customerBody = 'Your service has been fully completed. Thank you!';
                    } else if (currentStatus === 'CANCELLED') {
                        customerTitle = 'Mission Cancelled ❌';
                        customerBody = 'Your booking has been cancelled by administration.';
                    }

                    await sendSinglePush(updated.customer.fcmToken, {
                        click_action: 'FLUTTER_NOTIFICATION_CLICK',
                        type: 'CUSTOMER_ALARM',
                        bookingId: updated.id,
                        title: customerTitle,
                        body: customerBody,
                        status: currentStatus,
                        startOtp: startPin,
                        completionOtp: endPin
                    });
                }

                // 2. Notify SP
                if (updated.sp?.fcmToken) {
                    let spTitle = 'Mission Update';
                    let spBody = `Your booking status has been updated to ${currentStatus}.`;

                    if (currentStatus === 'ACCEPTED') {
                        spTitle = 'Mission Assigned! 🛠️';
                        spBody = `Admin has assigned you a service mission. Start PIN: ${startPin}`;
                    } else if (currentStatus === 'TEMP_WORK_STARTED') {
                        spTitle = 'Mission Update';
                        spBody = 'Status updated to Arrived. Please get the Start PIN from the customer.';
                    } else if (currentStatus === 'WORK_STARTED') {
                        spTitle = 'Work Started! ⚡';
                        spBody = 'Admin has verified the start PIN. You can now begin work.';
                    } else if (currentStatus === 'TEMP_COMPLETED') {
                        spTitle = 'Finishing PIN Generated! 🔑';
                        spBody = `Completion PIN ${endPin} has been generated by admin.`;
                    } else if (currentStatus === 'COMPLETED') {
                        spTitle = 'Mission Completed! ✅';
                        spBody = 'Admin has verified and completed the service mission.';
                    } else if (currentStatus === 'CANCELLED') {
                        spTitle = 'Mission Cancelled ❌';
                        spBody = 'This request has been terminated by administration.';
                    }

                    await sendSinglePush(updated.sp.fcmToken, {
                        click_action: 'FLUTTER_NOTIFICATION_CLICK',
                        type: 'SP_ALARM',
                        bookingId: updated.id,
                        title: spTitle,
                        body: spBody,
                        status: currentStatus,
                        startOtp: startPin,
                        completionOtp: endPin
                    });
                }
            } catch (fcmErr) {
                console.error('[ADMIN] FCM broadcast error:', fcmErr);
            }
        })();

        res.status(200).json({ success: true, data: updated });
    } catch (error) {
        console.error('Status adjustment failed:', error);
        res.status(500).json({ success: false, message: 'Status adjustment failed' });
    }
};

// Feedback & Audits
export const getAudits = async (req: Request, res: Response) => {
  try {
    const feedbacks = await prisma.feedback.findMany({
      include: { request: { include: { customer: true, sp: true } } }
    });
    const cancellations = await prisma.requestCancellationReason.findMany({
      include: { request: true, customer: true, sp: true }
    });
    res.status(200).json({ success: true, data: { feedbacks, cancellations } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Onboard New Service Provider
export const createSP = async (req: Request, res: Response) => {
  const { mobile, fullName, aadharNumber, address, latitude, longitude, bio, categoryName, subCategoryName, password } = req.body;
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  
  let aadharCardUrl: string | undefined = undefined;
  let profilePictureUrl: string | undefined = undefined;

  try {
    const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;

    // Check if user exists
    let user = await prisma.user.findUnique({ where: { mobile } });
    
    // Role check: Only block if user is an ADMIN (to prevent role downgrade or duplicate)
    if (user && user.role === 'ADMIN') {
       return res.status(400).json({ success: false, message: 'Cannot modify an Administrator account via this panel.' });
    }

    // Handle Profile Picture
    if (files?.profilePicture?.[0]) {
      profilePictureUrl = await uploadFile(files.profilePicture[0], 'profiles');
    }

    // Handle Aadhar Card
    if (files?.aadharCard?.[0]) {
      aadharCardUrl = await uploadFile(files.aadharCard[0], 'documents');
    }

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { 
          role: 'SP',
          ...(passwordHash && { passwordHash })
        }
      });
    } else {
      user = await prisma.user.create({
        data: { 
          mobile, 
          role: 'SP',
          passwordHash: passwordHash || "" // Set a placeholder or fail if no password
        }
      });
    }

    await prisma.profile.upsert({
      where: { userId: user.id },
      update: { 
        fullName, 
        ...(profilePictureUrl && { profilePictureUrl }) 
      },
      create: { 
        userId: user.id, 
        fullName, 
        profilePictureUrl: profilePictureUrl || "" 
      }
    });

    const spProfile = await prisma.serviceProviderProfile.upsert({
      where: { userId: user.id },
      update: { 
        aadharNumber, 
        address, 
        latitude: latitude ? parseFloat(latitude) : undefined,
        longitude: longitude ? parseFloat(longitude) : undefined,
        bio, 
        ...(aadharCardUrl && { aadharCardUrl }), 
        categoryName, 
        subCategoryName 
      },
      create: { 
        userId: user.id, 
        aadharNumber, 
        address, 
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        bio, 
        aadharCardUrl: aadharCardUrl || "", 
        categoryName, 
        subCategoryName 
      }
    });

    res.status(201).json({ success: true, data: { user, spProfile } });
  } catch (error) {
    console.error('Create SP Error:', error);
    res.status(500).json({ success: false, message: 'Failed to onboard partner' });
  }
};

// Toggle SP Verification
export const toggleSPVerification = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { isVerified } = req.body;
    try {
        await prisma.serviceProviderProfile.update({
            where: { userId: id },
            data: { isVerified }
        });
        res.status(200).json({ success: true, message: 'Verification status updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Update failed' });
    }
};

// Reset Customer Password
export const resetCustomerPassword = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { newPassword } = req.body;
    try {
        const passwordHash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id },
            data: { passwordHash }
        });
        res.status(200).json({ success: true, message: 'Password reset successful' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Reset failed' });
    }
};

// Delete Partner
export const deletePartner = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await prisma.user.delete({ where: { id } });
        res.status(200).json({ success: true, message: 'Partner removed' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Delete failed' });
    }
};

// Update Admin Profile (With S3 Upload)
export const updateAdminProfile = async (req: any, res: Response) => {
  const userId = req.user.userId;
  const { fullName } = req.body;
  const file = req.file as Express.Multer.File;

  try {
    let profilePictureUrl = undefined;

    // Handle Profile Picture Upload to S3
    if (file) {
      profilePictureUrl = await uploadFile(file, 'admin-profiles');
    }

    // Update Profile in DB
    const profile = await prisma.profile.upsert({
      where: { userId },
      update: {
        fullName,
        ...(profilePictureUrl && { profilePictureUrl })
      },
      create: {
        userId,
        fullName,
        profilePictureUrl: profilePictureUrl || ""
      }
    });

    res.status(200).json({
      success: true,
      message: 'Admin profile updated successfully!',
      data: profile
    });
  } catch (error) {
    console.error('Update Admin Profile Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
};

// Update SP Account (Mobile, Password, etc)
export const updateSPAccount = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { mobile, password, fullName, bio, isVerified, categoryName, subCategoryName, address } = req.body;

    try {
        const userData: any = {};
        
        // If mobile is changing, we should check if another user is using it.
        if (mobile) {
            const existingUser = await prisma.user.findUnique({ where: { mobile } });
            if (existingUser && existingUser.id !== id) {
                return res.status(400).json({ success: false, message: 'This mobile number is already assigned to another user.' });
            }
            userData.mobile = mobile;
        }

        if (password) {
            userData.passwordHash = await bcrypt.hash(password, 10);
        }

        // 1. Update Core User (Mobile/Password)
        if (Object.keys(userData).length > 0) {
            await prisma.user.update({
                where: { id },
                data: userData
            });
        }

        // 2. Update Profile Name
        if (fullName) {
            await prisma.profile.upsert({
                where: { userId: id },
                update: { fullName },
                create: { userId: id, fullName, profilePictureUrl: "" }
            });
        }

        // 3. Update SP specific profile fields
        if (bio !== undefined || isVerified !== undefined || categoryName || subCategoryName || address) {
            await prisma.serviceProviderProfile.upsert({
                where: { userId: id },
                update: { 
                    ...(bio !== undefined && { bio }),
                    ...(isVerified !== undefined && { isVerified }),
                    ...(categoryName && { categoryName }),
                    ...(subCategoryName && { subCategoryName }),
                    ...(address && { address })
                },
                create: { 
                    userId: id, 
                    bio: bio || "", 
                    isVerified: !!isVerified,
                    aadharNumber: "0", 
                    address: address || "N/A", 
                    aadharCardUrl: "", 
                    categoryName: categoryName || "N/A", 
                    subCategoryName: subCategoryName || "N/A" 
                }
            });
        }

        res.status(200).json({ success: true, message: 'Merchant account updated successfully' });
    } catch (error) {
        console.error('Update SP Account Error:', error);
        res.status(500).json({ success: false, message: 'Update failed' });
    }
};

// Admin Management
export const getAdmins = async (req: Request, res: Response) => {
    try {
        const admins = await prisma.user.findMany({
            where: { role: 'ADMIN' },
            include: { profile: true }
        });
        const signedAdmins = await Promise.all(admins.map(async (admin: any) => {
            if (admin.profile?.profilePictureUrl) {
                admin.profile.profilePictureUrl = await getSignedAssetUrl(admin.profile.profilePictureUrl);
            }
            return admin;
        }));
        res.status(200).json({ success: true, data: signedAdmins });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch admins' });
    }
};

export const createAdmin = async (req: Request, res: Response) => {
    const { fullName, mobile, password, profilePictureUrl } = req.body;
    try {
        const existingUser = await prisma.user.findUnique({ where: { mobile } });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Administrator with this mobile already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                mobile,
                passwordHash,
                role: 'ADMIN',
            }
        });

        await prisma.profile.create({
            data: {
                userId: user.id,
                fullName,
                profilePictureUrl: profilePictureUrl || ""
            }
        });

        res.status(201).json({ success: true, data: user });
    } catch (error) {
        console.error('Create Admin Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create administrator' });
    }
};

export const updateAdmin = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { mobile, fullName, password, profilePictureUrl } = req.body;
    try {
        const userData: any = {};
        if (mobile) {
            const existingUser = await prisma.user.findUnique({ where: { mobile } });
            if (existingUser && existingUser.id !== id) {
                return res.status(400).json({ success: false, message: 'Mobile number already in use' });
            }
            userData.mobile = mobile;
        }
        if (password) {
            userData.passwordHash = await bcrypt.hash(password, 10);
        }

        if (Object.keys(userData).length > 0) {
            await prisma.user.update({
                where: { id },
                data: userData
            });
        }

        if (fullName || profilePictureUrl !== undefined) {
            const profileData: any = {};
            if (fullName) profileData.fullName = fullName;
            if (profilePictureUrl !== undefined) profileData.profilePictureUrl = profilePictureUrl;

            await prisma.profile.upsert({
                where: { userId: id },
                update: profileData,
                create: { userId: id, ...profileData }
            });
        }

        res.status(200).json({ success: true, message: 'Administrator updated successfully' });
    } catch (error) {
        console.error('Update Admin Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update administrator' });
    }
};

export const deleteAdmin = async (req: any, res: Response) => {
    const { id } = req.params;
    const adminId = req.userId; // Current logged in admin

    if (id === adminId) {
        return res.status(400).json({ success: false, message: 'Security Breach: You cannot terminate your own administrative account.' });
    }

    try {
        await prisma.user.delete({ where: { id } });
        res.status(200).json({ success: true, message: 'Administrator account terminated successfully' });
    } catch (error) {
        console.error('Delete Admin Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete administrator' });
    }
};


export const uploadAdminAsset = async (req: any, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file provided' });
        }
        const key = await uploadFile(req.file, 'admin-assets');
        const signedUrl = await getSignedAssetUrl(key);
        res.status(200).json({ success: true, url: signedUrl, key });
    } catch (error) {
        console.error('Admin Upload Error:', error);
        res.status(500).json({ success: false, message: 'Extraction/Upload Protocol Failed' });
    }
};
