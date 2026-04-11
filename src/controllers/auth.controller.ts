import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import * as admin from 'firebase-admin';

const prisma = new PrismaClient();

/**
 * Verify Firebase ID Token with our backend and generate a local JWT
 */
export const verifyFirebaseToken = async (req: Request, res: Response) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ success: false, message: 'ID Token is required' });
  }

  try {
    // 1. Verify token with Firebase Admin SDK
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, phone_number } = decodedToken;
    console.log(`Firebase Auth Sync: Token verified for UID: ${uid}, Phone: ${phone_number}`);

    if (!phone_number) {
      return res.status(401).json({ success: false, message: 'Invalid token: No phone number found in Firebase token' });
    }

    // 2. Find or create user in our DB
    let user = await prisma.user.findUnique({
      where: { mobile: phone_number },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          mobile: phone_number,
          role: 'CUSTOMER',
          profile: {
            create: {
              fullName: 'Valued Client'
            }
          }
        },
      });
    }

    // Check profile completeness
    const userWithDetails = await prisma.user.findUnique({
      where: { id: user.id },
      include: { profile: true, addresses: { take: 1 } },
    });
    
    const isProfileComplete = !!(userWithDetails?.profile?.fullName && userWithDetails.addresses.length > 0);

    // 3. Generate our OWN backend JWT for session management
    const token = jwt.sign(
      { userId: user.id, mobile: user.mobile, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '30d' }
    );

    res.status(200).json({ 
      success: true, 
      token, 
      isProfileComplete,
      role: user.role 
    });
  } catch (error: any) {
    console.error('Firebase Auth Verification Error:', error);
    res.status(401).json({ success: false, message: 'Invalid or expired Firebase token' });
  }
};

export const loginPassword = async (req: Request, res: Response) => {
  const { mobile, password } = req.body;

  if (!mobile || !password) {
    return res.status(400).json({ success: false, message: 'Mobile and password are required' });
  }

  try {
    let mobileStr = mobile.toString().trim();
    
    // Normalize: If 10 digits, assume +91 prefix for India
    if (mobileStr.length === 10 && !mobileStr.startsWith('+')) {
      mobileStr = `+91${mobileStr}`;
    }

    const user = await prisma.user.findUnique({
      where: { mobile: mobileStr },
      include: { spProfile: true },
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Role-specific check: Service Providers must be verified by admin
    if (user.role === 'SP' && !user.spProfile?.isVerified) {
      return res.status(403).json({ 
        success: false, 
        message: 'Your account is pending admin verification. Please try again later.' 
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, mobile: user.mobile, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.status(200).json({ success: true, token, role: user.role });
  } catch (error) {
    console.error('Password Login Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
