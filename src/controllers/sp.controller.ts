import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient, Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { getPresignedUrl } from '../services/s3.service';

const prisma = new PrismaClient();

const getSignedAssetUrl = async (url: string | null): Promise<string | null> => {
  if (!url) return null;
  let key = url;
  if (url.includes('.amazonaws.com/')) {
    key = url.split('.amazonaws.com/')[1];
  }
  try {
    return await getPresignedUrl(key, 3600);
  } catch (err) {
    console.error(`[S3] Failed to sign URL for key: ${key}`, err);
    return null;
  }
};

/**
 * Worker Signup (Registration)
 */
export const signup = async (req: Request, res: Response) => {
  const { mobile, password, fullName, aadharNumber, categoryName, subCategoryName, address, bio } = req.body;

  if (!mobile || !password || !fullName) {
    return res.status(400).json({ success: false, message: 'Mobile, password, and full name are required' });
  }

  try {
    const mobileStr = mobile.toString();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { mobile: mobileStr },
    });

    if (existingUser) {
      return res.status(400).json({ success: false, message: 'A user with this mobile number already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create User, Profile, and ServiceProviderProfile in a transaction
    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          mobile: mobileStr,
          role: 'SP',
          passwordHash,
        },
      });

      await tx.profile.create({
        data: {
          userId: user.id,
          fullName,
        },
      });

      await tx.serviceProviderProfile.create({
        data: {
          userId: user.id,
          aadharNumber,
          address,
          bio,
          categoryName,
          subCategoryName,
          isVerified: false, 
        },
      });

      return user;
    });

    // Generate JWT
    const token = jwt.sign(
      { userId: newUser.id, mobile: newUser.mobile, role: newUser.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      token,
      role: newUser.role,
    });
  } catch (error: any) {
    console.error('Worker Signup Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', debug: error.message });
  }
};

/**
 * Get Service Provider Public Passport
 */
export const getPublicPassport = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const sp = await prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        spProfile: true,
      },
    });

    if (!sp || sp.role !== 'SP') {
      return res.status(404).json({ success: false, message: 'Service Provider not found' });
    }

    res.status(200).json({ success: true, data: sp });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get Job Broadcasts (Radius Search using PostGIS)
 */
export const getBroadcasts = async (req: any, res: Response) => {
  const { lat, lng, radius = 5000 } = req.query; // Radius in meters

  if (!lat || !lng) {
    console.warn('[BROADCAST] Missing coordinates. Lat:', lat, 'Lng:', lng);
    return res.status(400).json({ success: false, message: 'Latitude and Longitude are required' });
  }

  const userId = req.userId;
  console.log(`[BROADCAST] SP ${userId} @ [${lat}, ${lng}] Radius: ${radius}m`);

    try {
      // 0. Check if SP has any active WORK_STARTED job.
      const activeWork = await prisma.serviceRequest.findFirst({
        where: {
          spId: userId,
          status: { in: ['WORK_STARTED', 'TEMP_WORK_STARTED', 'TEMP_COMPLETED'] }
        }
      });

      if (activeWork) {
        console.log(`[BROADCAST] SP ${userId} is busy with job ${activeWork.id}. Hiding new broadcasts.`);
        return res.status(200).json({ success: true, data: [] });
      }

      const spProfile = await prisma.serviceProviderProfile.findUnique({
        where: { userId }
      });

      const categoryName = spProfile?.categoryName;
      console.log(`[BROADCAST] SP Category: ${categoryName}`);

      const requests: any[] = await prisma.$queryRaw`
        SELECT sr.*, a."addressLine", a.label, c.name as "categoryName"
        FROM "ServiceRequest" sr
        JOIN "Address" a ON sr."locationId" = a.id
        JOIN "ServiceCategory" c ON sr."categoryId" = c.id
        WHERE sr.status = 'PENDING'
        AND ST_DWithin(
          a.coordinates,
          ST_SetSRID(ST_Point(${parseFloat(lng as string)}, ${parseFloat(lat as string)}), 4326)::geography,
          ${parseFloat(radius as string)}
        )
        ${categoryName ? Prisma.sql`AND c.name ILIKE ${'%' + categoryName + '%'}` : Prisma.empty}
        ORDER BY sr."createdAt" DESC
      `;

      // Sign the audio URLs
      const processedRequests = await Promise.all(requests.map(async (r: any) => {
        return {
          ...r,
          audioMessageUrl: await getSignedAssetUrl(r.audioMessageUrl)
        };
      }));

      res.status(200).json({ success: true, data: processedRequests });
    } catch (error) {
      console.error('Broadcast Error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };

/**
 * Dashboard Statistics for Service Provider
 */
export const getDashboardStats = async (req: any, res: Response) => {
    const userId = req.userId;

    try {
        // 1. Current Active Jobs (Assigned but not completed/cancelled)
        const immediateTasks = await prisma.serviceRequest.count({
            where: {
                spId: userId,
                status: 'ACCEPTED'
            }
        });

        // 2. Queue (In Progress or Scheduled)
        const queueTasks = await prisma.serviceRequest.count({
            where: {
                spId: userId,
                status: 'WORK_STARTED'
            }
        });

        // 3. Lifetime Completions
        const totalCompleted = await prisma.serviceRequest.count({
            where: {
                spId: userId,
                status: 'COMPLETED'
            }
        });

        // 4. Rating Calculation
        const feedbacks = await prisma.feedback.findMany({
            where: {
                request: {
                    spId: userId
                }
            },
            select: { rating: true }
        });

        const avgRating = feedbacks.length > 0
            ? (feedbacks.reduce((sum, f) => sum + (f.rating || 5), 0) / feedbacks.length).toFixed(1)
            : "5.0";

        res.status(200).json({
            success: true,
            data: {
                immediate: immediateTasks,
                later: queueTasks,
                totalCompleted,
                rating: parseFloat(avgRating)
            }
        });
    } catch (error) {
        console.error('SP Stats Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

/**
 * Service History for Provider
 */
export const getServiceHistory = async (req: any, res: Response) => {
    const userId = req.userId;
    const { range = 'all' } = req.query;

    try {
        const dateFilter: any = {};
        if (range === '7days') {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            dateFilter.createdAt = { gte: sevenDaysAgo };
        }

        const history = await prisma.serviceRequest.findMany({
            where: {
                spId: userId,
                status: { in: ['COMPLETED', 'CANCELLED'] },
                ...dateFilter
            },
            include: {
                category: true,
                subCategory: true,
                location: true,
                customer: { include: { profile: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const enrichedHistory = await Promise.all(history.map(async (h: any) => {
            return {
                ...h,
                audioMessageUrl: await getSignedAssetUrl(h.audioMessageUrl)
            };
        }));

        res.status(200).json({ success: true, data: enrichedHistory });
    } catch (error) {
        console.error('SP History Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
