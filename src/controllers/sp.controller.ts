import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

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
    return res.status(400).json({ success: false, message: 'Latitude and Longitude are required' });
  }

  try {
    // 1. Find all PENDING service requests
    // 2. Filter by distance using raw PostGIS query
    // NOTE: This is a simplified version. A more robust implementation would use raw SQL for spatial filters.
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
      ORDER BY sr."createdAt" DESC
    `;

    res.status(200).json({ success: true, data: requests });
  } catch (error) {
    console.error('Broadcast Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
