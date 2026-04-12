import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import * as admin from 'firebase-admin';

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
      include: { 
        profile: true, 
        addresses: { 
          select: {
            id: true,
            addressLine: true,
            pincode: true,
            label: true,
            city: true,
            isDefault: true
          },
          take: 1 
        } 
      },
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
      role: user.role,
      userId: user.id
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

    res.status(200).json({ success: true, token, role: user.role, userId: user.id });
  } catch (error: any) {
    console.error('❌ Password Login Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const checkUserRole = async (req: Request, res: Response) => {
  const { mobile } = req.body;

  if (!mobile) {
    return res.status(400).json({ success: false, message: 'Mobile number is required' });
  }

  try {
    let mobileStr = mobile.toString().trim();
    if (mobileStr.length === 10 && !mobileStr.startsWith('+')) {
      mobileStr = `+91${mobileStr}`;
    }

    const user = await prisma.user.findUnique({
      where: { mobile: mobileStr },
      select: { role: true, mobile: true }
    });

    if (!user) {
      return res.status(200).json({ 
        success: true, 
        exists: false, 
        role: 'NONE' 
      });
    }

    res.status(200).json({ 
      success: true, 
      exists: true, 
      role: user.role 
    });
  } catch (error: any) {
    console.error('❌ Check User Role Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
