import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';
import { getPresignedUrl, getSignedAssetUrl } from '../services/s3.service';


/**
 * Worker Signup (Registration)
 */
export const signup = async (req: Request, res: Response) => {
  const { mobile, password, fullName, aadharNumber, categoryName, subCategoryName, specialty, address, bio } = req.body;
  const finalSubCategory = subCategoryName || specialty;

  if (!mobile || !password || !fullName) {
    return res.status(400).json({ success: false, message: 'Mobile, password, and full name are required' });
  }

  try {
    let mobileStr = mobile.toString().trim();
    
    // Normalize: If 10 digits, assume +91 prefix
    if (mobileStr.length === 10 && !mobileStr.startsWith('+')) {
      mobileStr = `+91${mobileStr}`;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { mobile: mobileStr },
    });

    if (existingUser && existingUser.role === 'SP') {
      return res.status(400).json({ success: false, message: 'A Service Provider with this mobile number already exists.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create or Update User, Profile, and ServiceProviderProfile in a transaction
    const newUser = await prisma.$transaction(async (tx) => {
      let user;
      
      if (existingUser) {
        // Upgrade existing CUSTOMER to SP
        user = await tx.user.update({
          where: { id: existingUser.id },
          data: {
            role: 'SP',
            passwordHash,
          },
        });
      } else {
        // Create new SP
        user = await tx.user.create({
          data: {
            mobile: mobileStr,
            role: 'SP',
            passwordHash,
          },
        });
      }

      await tx.profile.upsert({
        where: { userId: user.id },
        update: { fullName },
        create: {
          userId: user.id,
          fullName,
        },
      });

      await tx.serviceProviderProfile.upsert({
        where: { userId: user.id },
        update: {
          aadharNumber,
          address,
          bio,
          categoryName,
          subCategoryName: finalSubCategory,
          isVerified: false, 
        },
        create: {
          userId: user.id,
          aadharNumber,
          address,
          bio,
          categoryName,
          subCategoryName: finalSubCategory,
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
      userId: newUser.id
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

    if (sp.profile) {
      sp.profile.profilePictureUrl = await getSignedAssetUrl(sp.profile.profilePictureUrl);
    }
    if (sp.spProfile) {
      sp.spProfile.aadharCardUrl = await getSignedAssetUrl(sp.spProfile.aadharCardUrl);
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
  const { lat, lng, radius = 7000 } = req.query; // Radius in meters (7km default)

  if (!lat || !lng) {
    console.warn('[BROADCAST] Missing coordinates. Lat:', lat, 'Lng:', lng);
    return res.status(400).json({ success: false, message: 'Latitude and Longitude are required' });
  }

  const userId = req.userId;
  
  // 📍 PRINT WORKER LOCATION IN TERMINAL
  console.log('---------------------------------------------------------');
  console.log(`[WORKER LOCATION] SP_ID: ${userId}`);
  console.log(`[COORDINATES] Lat: ${lat}, Lng: ${lng}`);
  console.log(`[SETTINGS] Search Radius: ${radius}m`);
  console.log('---------------------------------------------------------');

  try {
    // 0. Check for physical work or mission limit
    const activeRequests = await prisma.serviceRequest.findMany({
      where: {
        spId: userId,
        status: { in: ['ACCEPTED', 'WORK_STARTED', 'TEMP_WORK_STARTED', 'TEMP_COMPLETED'] }
      }
    });

    const isPhysicallyWorking = activeRequests.some(r => 
        ['TEMP_WORK_STARTED', 'WORK_STARTED', 'TEMP_COMPLETED'].includes(r.status)
    );

    if (isPhysicallyWorking) {
      console.log(`[BROADCAST] SP ${userId} is currently ON-SITE. Hiding new broadcasts.`);
      return res.status(200).json({ success: true, data: [] });
    }

    if (activeRequests.length >= 5) {
      console.log(`[BROADCAST] SP ${userId} reached MAX MISSIONS (5). Hiding new broadcasts.`);
      return res.status(200).json({ success: true, data: [] });
    }

    const spProfile = await prisma.serviceProviderProfile.findUnique({
      where: { userId }
    });

    // FORCE ALWAYS ONLINE: Ignoring dutyStatus check to ensure unlimited requests
    const dutyStatus = true;
    console.log(`[BROADCAST] SP ${userId} | Duty Status: ALWAYS ONLINE (Forced)`);
    const radiusMeters = parseFloat(radius as string) || 500000; // Increased default to 500km for testing
    
    const categoryName = spProfile?.categoryName?.trim();
    const subCategoryName = spProfile?.subCategoryName?.trim();
    
    console.log(`[BROADCAST] Filtering for: Category="${categoryName || 'All'}", SubCategory="${subCategoryName || 'All'}"`);

    // Construct query using Prisma.sql
    // We join both Category and SubCategory to ensure we match correctly
    // We use ::geography for accurate distance search in meters
    const query = Prisma.sql`
      SELECT 
        sr.*, 
        a."addressLine", 
        a.label, 
        c.name as "categoryName", 
        sc.name as "subCategoryName",
        ST_Distance(
          a.coordinates::geography, 
          ST_SetSRID(ST_Point(${parseFloat(lng as string)}, ${parseFloat(lat as string)}), 4326)::geography
        ) as distance_meters
      FROM "ServiceRequest" sr
      JOIN "Address" a ON sr."locationId" = a.id
      JOIN "ServiceCategory" c ON sr."categoryId" = c.id
      LEFT JOIN "ServiceSubcategory" sc ON sr."subCategoryId" = sc.id
      WHERE sr.status = 'PENDING'
      -- Exclude requests rejected by THIS SP
      AND NOT EXISTS (
        SELECT 1 FROM "ServiceRequestRejection" srr 
        WHERE srr."requestId" = sr.id 
        AND srr."spId" = ${userId}
      )
      AND ST_DWithin(
        a.coordinates::geography, 
        ST_SetSRID(ST_Point(${parseFloat(lng as string)}, ${parseFloat(lat as string)}), 4326)::geography, 
        ${radiusMeters}
      )
      ${(categoryName || subCategoryName) ? Prisma.sql`
        AND (
          ${categoryName ? Prisma.sql`(c.name = ${categoryName})` : Prisma.empty}
          ${(categoryName && subCategoryName) ? Prisma.sql` OR ` : Prisma.empty}
          ${subCategoryName ? Prisma.sql`(sc.name = ${subCategoryName} OR c.name = ${subCategoryName})` : Prisma.empty}
        )
      ` : Prisma.empty}
      ORDER BY distance_meters ASC
    `;

    const requests: any[] = await prisma.$queryRaw(query);
    
    if (requests.length > 0) {
      console.log(`[BROADCAST] Found ${requests.length} matches within ${radiusMeters}m`);
      requests.forEach(r => {
        console.log(` -> Mission ${r.id.substring(0,8)}: ${r.categoryName}/${r.subCategoryName} at ${Math.round(r.distance_meters/1000)}km`);
      });
    } else {
      console.log(`[BROADCAST] Found 0 missions for SP ${userId} within ${radiusMeters}m`);
    }

    // Sign the audio URLs
    const processedRequests = await Promise.all(requests.map(async (r: any) => {
      return {
        ...r,
        audioMessageUrl: await getSignedAssetUrl(r.audioMessageUrl)
      };
    }));

    res.status(200).json({ success: true, data: processedRequests });
    } catch (error: any) {
      console.error('[SP_CONTROLLER] getBroadcasts FATAL ERROR:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        debug: error.message,
        stack: error.stack 
      });
    }
  };

/**
 * Dashboard Statistics for Service Provider
 */
export const getDashboardStats = async (req: any, res: Response) => {
    const userId = req.userId;

    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        // 1. Immediate Missions (Accepted for today or immediate)
        const immediateTasks = await prisma.serviceRequest.count({
            where: {
                spId: userId,
                status: 'ACCEPTED',
                OR: [
                    { scheduledAt: null },
                    { scheduledAt: { lte: todayEnd } }
                ]
            }
        });

        // 2. Later Missions (Accepted for future dates)
        const laterTasks = await prisma.serviceRequest.count({
            where: {
                spId: userId,
                status: 'ACCEPTED',
                scheduledAt: { gt: todayEnd }
            }
        });

        // 3. Ongoing/Current Job (Actually in progress)
        const currentJob = await prisma.serviceRequest.findFirst({
            where: {
                spId: userId,
                status: { in: ['TEMP_WORK_STARTED', 'WORK_STARTED', 'TEMP_COMPLETED'] }
            },
            include: {
                category: true,
                subCategory: true,
                location: true,
                customer: {
                    include: { profile: true }
                }
            }
        });

        // 4. Fallback Active Job for UI gating (if no currentJob, take the first ACCEPTED)
        const activeJob = currentJob || await prisma.serviceRequest.findFirst({
            where: {
                spId: userId,
                status: 'ACCEPTED'
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
            orderBy: { createdAt: 'asc' }
        });

        // 5. Lifetime Completions
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

        const spProfile = await prisma.serviceProviderProfile.findUnique({
            where: { userId },
            select: { dutyStatus: true } as any
        });

        res.status(200).json({
            success: true,
            data: {
                immediate: immediateTasks,
                later: laterTasks,
                activeJobsCount: activeJob ? 1 : 0,
                activeJob: activeJob || null,
                isCurrentlyWorking: !!currentJob,
                totalCompleted,
                rating: parseFloat(avgRating),
                dutyStatus: true // FORCE ALWAYS ONLINE
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

/**
 * Get all feedbacks for a specific Service Provider
 */
export const getSPFeedbacks = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const feedbacks = await prisma.feedback.findMany({
            where: {
                request: {
                    spId: id
                }
            },
            include: {
                request: {
                    include: {
                        customer: {
                            include: { profile: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Sign any audio feedback URLs if they exist
        const processedFeedbacks = await Promise.all(feedbacks.map(async (f: any) => {
            return {
                ...f,
                audioFeedbackUrl: await getSignedAssetUrl(f.audioFeedbackUrl)
            };
        }));

        res.status(200).json({ success: true, data: processedFeedbacks });
    } catch (error) {
        console.error('Get SP Feedbacks Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

/**
 * Toggle Duty Status for Service Provider
 */
export const updateDutyStatus = async (req: any, res: Response) => {
    const userId = req.userId;
    const { dutyStatus } = req.body;

    if (dutyStatus === undefined) {
        return res.status(400).json({ success: false, message: 'dutyStatus is required' });
    }

    try {
        // FORCE ALWAYS ONLINE: Ignoring incoming dutyStatus and setting to true
        const updatedProfile = await prisma.serviceProviderProfile.update({
            where: { userId },
            data: { dutyStatus: true } as any
        });

        res.status(200).json({ 
            success: true, 
            message: `Duty status is forced to ON`,
            data: updatedProfile 
        });
    } catch (error) {
        console.error('Update Duty Status Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

/**
 * Update Live Location for Service Provider (Real-time tracking)
 */
export const updateLiveLocation = async (req: any, res: Response) => {
    const userId = req.userId;
    const { lat, lng } = req.body;

    if (lat === undefined || lng === undefined) {
        return res.status(400).json({ success: false, message: 'Latitude and Longitude are required' });
    }

    try {
        await prisma.serviceProviderProfile.update({
            where: { userId },
            data: { 
                latitude: parseFloat(lat),
                longitude: parseFloat(lng),
                locationUpdatedAt: new Date()
            } as any
        });

        res.status(200).json({ success: true, message: 'Location updated' });
    } catch (error) {
        console.error('Update Live Location Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

/**
 * Reject a Broadcast (Will never show again for this SP)
 */
export const rejectBroadcast = async (req: any, res: Response) => {
    const userId = req.userId;
    const { requestId } = req.body;

    if (!requestId) {
        return res.status(400).json({ success: false, message: 'Request ID is required' });
    }

    try {
        await (prisma as any).serviceRequestRejection.upsert({
            where: {
                requestId_spId: {
                    requestId,
                    spId: userId
                }
            },
            update: {},
            create: {
                requestId,
                spId: userId
            }
        });

        res.status(200).json({ success: true, message: 'Mission rejected' });
    } catch (error) {
        console.error('Reject Broadcast Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
