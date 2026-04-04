import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as s3Service from '../services/s3.service';

const prisma = new PrismaClient();

/**
 * Complete customer profile setup after initial OTP verification
 */
export const setupProfile = async (req: any, res: Response) => {
  const { fullName, addressLine, city, pincode, initial } = req.body;
  const userId = req.userId; // Corrected from req.user.userId

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
      // Prisma's "Unsupported" fields for PostGIS MUST be handled via raw queries
      // This solves the "list type list is not configured as a subtype of type pg" error
      // which occurs when Prisma tries to map the ST_GeogFromText results incorrectly.
      
      const addressId = crypto.randomUUID();
      const currentCity = city || 'Chennai';
      
      await tx.$executeRaw`
        INSERT INTO "Address" (id, "customerId", label, "addressLine", city, pincode, coordinates, "isDefault", "updatedAt")
        VALUES (
          ${addressId}, 
          ${userId}, 
          'Home', 
          ${addressLine}, 
          ${currentCity}, 
          ${pincode}, 
          ST_GeogFromText('POINT(80.2707 13.0827)'), 
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
