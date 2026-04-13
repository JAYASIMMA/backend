import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getCache, setCache, deleteCache } from '../services/redis.service';
import { uploadFile, getSignedAssetUrl } from '../services/s3.service';

// Cache profiles for 10 minutes (600 seconds)
const PROFILE_CACHE_TTL = 600;

/**
 * Get User Profile
 * Fetch from Redis first, then Database.
 */
export const getProfile = async (req: any, res: Response) => {
  const userId = req.userId;
  
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const PROFILE_CACHE_KEY = `profile:${userId}`;

  try {
    // 1. Try to fetch from Redis
    const cachedData = await getCache(PROFILE_CACHE_KEY);
    if (cachedData) {
      console.log(`[Redis] Profile Cache Hit for userID: ${userId}`);
      const profile = JSON.parse(cachedData);
      
      // Still need to refresh signed URL periodically even if metadata is cached
      if (profile.profilePictureUrl) {
        profile.profilePictureUrl = await getSignedAssetUrl(profile.profilePictureUrl);
      }
      
      return res.status(200).json({ success: true, data: profile });
    }

    // 2. If not in Redis, fetch from PostgreSQL using Prisma
    console.log(`[Redis] Profile Cache Miss. Fetching from Database for userID: ${userId}...`);
    const profile: any = await prisma.profile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            mobile: true,
            role: true,
          },
        },
      },
    });

    if (!profile) {
      console.log(`[Profile] No profile found for userId: ${userId}, returning default.`);
      const defaultProfile = {
        fullName: 'Valued Client',
        profilePictureUrl: null,
        bio: '',
        user: {
          mobile: '...',
          role: 'CUSTOMER'
        }
      };
      return res.status(200).json({ success: true, data: defaultProfile });
    }

    // 3. Store in Redis (store the RAW KEY from DB, before signing)
    await setCache(PROFILE_CACHE_KEY, profile, PROFILE_CACHE_TTL);

    // 4. Return with Signed URL
    if (profile.profilePictureUrl) {
      profile.profilePictureUrl = await getSignedAssetUrl(profile.profilePictureUrl);
    }

    res.status(200).json({ success: true, data: profile });
  } catch (error: any) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

/**
 * Update User Profile
 */
export const updateProfile = async (req: any, res: Response) => {
  const userId = req.userId;
  const { fullName } = req.body;
  
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const PROFILE_CACHE_KEY = `profile:${userId}`;

  try {
    let profilePictureUrl = req.body.profilePictureUrl;

    // Handle File Upload if present
    if (req.file) {
      profilePictureUrl = await uploadFile(req.file, 'profiles');
    }

    // 1. Update/Upsert in PostgreSQL
    const profile = await prisma.profile.upsert({
      where: { userId },
      update: {
        fullName,
        ...(profilePictureUrl && { profilePictureUrl }),
      },
      create: {
        userId,
        fullName,
        profilePictureUrl: profilePictureUrl || "",
      },
    });

    // 2. Invalidate the Redis cache
    await deleteCache(PROFILE_CACHE_KEY);
    console.log(`[Redis] Profile Cache Invalidated for userID: ${userId}`);

    // Return with Signed URL for immediate UI update
    const signedUrl = await getSignedAssetUrl(profile.profilePictureUrl);
    
    res.status(200).json({ 
      success: true, 
      message: 'Profile updated successfully', 
      data: { 
        ...profile, 
        profilePictureUrl: signedUrl 
      } 
    });
  } catch (error: any) {
    console.error('Error updating profile:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

/**
 * Upload and update profile picture via S3
 */
export const uploadProfilePicture = async (req: any, res: Response) => {
  const userId = req.userId;
  const file = req.file;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  if (!file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  try {
    const profilePictureUrl = await uploadFile(file, 'profiles');

    // Update in database
    const profile = await prisma.profile.upsert({
      where: { userId },
      update: { profilePictureUrl },
      create: { userId, profilePictureUrl },
    });

    // Invalidate Cache
    await deleteCache(`profile:${userId}`);

    // Generate signed URL for response
    const signedUrl = await getSignedAssetUrl(profilePictureUrl);

    res.status(200).json({
      success: true,
      message: 'Profile picture uploaded successfully',
      url: signedUrl,
      data: { ...profile, profilePictureUrl: signedUrl }
    });
  } catch (error: any) {
    console.error('S3 Upload Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to upload to S3', 
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};
