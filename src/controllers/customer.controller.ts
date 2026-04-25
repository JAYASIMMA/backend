import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import * as s3Service from '../services/s3.service';
import crypto from 'crypto';

/**
 * Complete customer profile setup after initial OTP verification
 */
export const setupProfile = async (req: any, res: Response) => {
  const { fullName, addressLine, city, pincode, initial, lat, lng } = req.body;
  const userId = req.userId;

  if (!fullName || !addressLine || !pincode) {
    return res.status(400).json({ success: false, message: 'Required fields are missing' });
  }

  try {
    // 1. Create or Update Profile
    const displayFullName = initial ? `${fullName} ${initial}` : fullName;

    // We use a transaction to ensure both Profile and Address are created
    await prisma.$transaction(async (tx) => {
      // Handle Profile Picture if uploaded
      let profilePictureUrl = undefined;
      if (req.file) {
        profilePictureUrl = await s3Service.uploadFile(req.file, 'profiles');
      }

      await tx.profile.upsert({
        where: { userId },
        update: { 
          fullName: displayFullName,
          profilePictureUrl: profilePictureUrl 
        },
        create: { 
          userId, 
          fullName: displayFullName,
          profilePictureUrl: profilePictureUrl
        }
      });

      // 2. Create Address using Raw SQL for PostGIS field
      const addressId = crypto.randomUUID();
      const currentCity = city || 'City';
      const latitude = lat ? parseFloat(lat) : 13.0827; // Fallback to Chennai if truly missing
      const longitude = lng ? parseFloat(lng) : 80.2707;
      
      await tx.$executeRaw`
        INSERT INTO "Address" (id, "customerId", label, "addressLine", city, pincode, coordinates, "isDefault", "updatedAt")
        VALUES (
          ${addressId}, 
          ${userId}, 
          'Home', 
          ${addressLine}, 
          ${currentCity}, 
          ${pincode}, 
          ST_GeographyFromText(${`POINT(${longitude} ${latitude})`}), 
          true, 
          NOW()
        )
      `;
    });

    res.status(200).json({ 
      success: true, 
      message: 'Profile and address setup successfully' 
    });
  } catch (error: any) {
    console.error('Setup Profile Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      debug: error.message 
    });
  }
};
