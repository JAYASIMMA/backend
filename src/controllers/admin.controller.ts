import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { getPresignedUrl, uploadFile, getSignedAssetUrl } from '../services/s3.service';

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
    const { status } = req.body;
    try {
        const updated = await prisma.serviceRequest.update({
            where: { id },
            data: { status }
        });
        res.status(200).json({ success: true, data: updated });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Status adjustment failed' });
    }
}

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

const getAvatarUrl = async (url: string | null): Promise<string | null> => {
    if (!url) return null;
    let key = url;
    if (url.includes('.amazonaws.com/')) {
      key = url.split('.amazonaws.com/')[1];
    }
    try {
      return await getPresignedUrl(key, 3600);
    } catch (err) {
      return null;
    }
};

export const uploadAdminAsset = async (req: any, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file provided' });
        }
        const key = await uploadFile(req.file, 'admin-assets');
        const signedUrl = await getAvatarUrl(key);
        res.status(200).json({ success: true, url: signedUrl, key });
    } catch (error) {
        console.error('Admin Upload Error:', error);
        res.status(500).json({ success: false, message: 'Extraction/Upload Protocol Failed' });
    }
};
