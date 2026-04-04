import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { getPresignedUrl, uploadFile } from '../services/s3.service';

const prisma = new PrismaClient();

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
        addresses: true,
        requests: true
      }
    });
    res.status(200).json({ success: true, data: customers });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Merchant Ecosystem
export const getSPs = async (req: Request, res: Response) => {
  try {
    const sps = await prisma.user.findMany({
      where: { role: 'SP' },
      include: {
        profile: true,
        spProfile: true,
        spRequests: true
      }
    });

    // Enrich with Presigned URLs
    const enrichedSPs = await Promise.all(sps.map(async (sp: any) => {
        // Sign Profile Picture
        if (sp.profile?.profilePictureUrl?.includes('amazonaws.com')) {
            try {
                const url = new URL(sp.profile.profilePictureUrl);
                const key = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
                if (key) {
                    sp.profile.profilePictureUrl = await getPresignedUrl(key, 3600);
                }
            } catch (e) {
                console.error('Sign Profile Pic Error for partner:', sp.mobile, e);
            }
        }
        // Sign Aadhar Card
        if (sp.spProfile?.aadharCardUrl?.includes('amazonaws.com')) {
           try {
               const url = new URL(sp.spProfile.aadharCardUrl);
               const key = url.pathname.substring(1);
               if (key) sp.spProfile.aadharCardUrl = await getPresignedUrl(key, 3600);
           } catch (e) {
               console.error('Sign Aadhar Error:', e);
           }
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
        location: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
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
  const { mobile, fullName, aadharNumber, address, latitude, longitude, bio, categoryName, subCategoryName } = req.body;
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  
  let aadharCardUrl = undefined;
  let profilePictureUrl = undefined;

  try {
    // Check if user exists
    let user = await prisma.user.findUnique({ where: { mobile } });
    
    // Role check: Only block if user is an ADMIN (to prevent role downgrade or duplicate)
    // We allow CUSTOMERS to be upgraded to SP and existing SPs to be updated.
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
        data: { role: 'SP' }
      });
    } else {
      user = await prisma.user.create({
        data: { mobile, role: 'SP' }
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

    const spProfile = await (prisma as any).serviceProviderProfile.upsert({
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
        const bcrypt = require('bcryptjs');
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
