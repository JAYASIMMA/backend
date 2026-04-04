import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { getCache, setCache, deleteCache } from '../services/redis.service';
import { uploadFile } from '../services/s3.service';

const prisma = new PrismaClient();

// Cache profiles for 10 minutes (600 seconds)
const PROFILE_CACHE_TTL = 600;

export const getProfile = async (req: any, res: Response) => {
  const userId = req.userId; // Corrected from req.user.userId
  const PROFILE_CACHE_KEY = `profile:${userId}`;

  try {
    // 1. Try to fetch from Redis
    const cachedData = await getCache(PROFILE_CACHE_KEY);
    if (cachedData) {
      console.log(`[Redis] Profile Cache Hit for userID: ${userId}`);
      return res.status(200).json({ success: true, data: JSON.parse(cachedData) });
    }

    // 2. If not in Redis, fetch from PostgreSQL using Prisma
    console.log(`[Redis] Profile Cache Miss. Fetching from Database for userID: ${userId}...`);
    const profile = await prisma.profile.findUnique({
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
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }

    // 3. Store in Redis
    await setCache(PROFILE_CACHE_KEY, profile, PROFILE_CACHE_TTL);

    res.status(200).json({ success: true, data: profile });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateProfile = async (req: any, res: Response) => {
  const userId = req.userId; // Corrected from req.user.userId
  const { fullName, profilePictureUrl, bio, aadharNumber } = req.body;
  const PROFILE_CACHE_KEY = `profile:${userId}`;

  try {
    let profilePictureUrl = req.body.profilePictureUrl;

    // Handle File Upload if present
    if (req.file) {
      profilePictureUrl = await uploadFile(req.file, 'profiles');
    }

    // 1. Update in PostgreSQL
    const profile = await prisma.profile.upsert({
      where: { userId },
      update: {
        fullName,
        profilePictureUrl,
      },
      create: {
        userId,
        fullName,
        profilePictureUrl,
      },
    });

    // 2. Invalidate the Redis cache (Force refresh on next fetch)
    await deleteCache(PROFILE_CACHE_KEY);
    console.log(`[Redis] Profile Cache Invalidated for userID: ${userId}`);

    res.status(200).json({ success: true, message: 'Profile updated successfully', data: profile });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Upload and update profile picture via S3
 */
export const uploadProfilePicture = async (req: any, res: Response) => {
  const userId = req.userId;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  try {
    const profilePictureUrl = await uploadFile(file, 'profiles');

    // Update in database
    await prisma.profile.upsert({
      where: { userId },
      update: { profilePictureUrl },
      create: { userId, profilePictureUrl },
    });

    // Invalidate Cache
    await deleteCache(`profile:${userId}`);

    res.status(200).json({
      success: true,
      message: 'Profile picture uploaded successfully',
      url: profilePictureUrl,
    });
  } catch (error: any) {
    console.error('S3 Upload Error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload to S3', debug: error.message });
  }
};
