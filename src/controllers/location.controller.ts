import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

export const getAddresses = async (req: any, res: Response) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { customerId: req.userId },
      orderBy: { isDefault: 'desc' },
    });
    res.status(200).json({ success: true, data: addresses });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const createAddress = async (req: any, res: Response) => {
  const { label, addressLine, city, pincode, lat, lng, isDefault } = req.body;

  if (!label || !addressLine || !city || !pincode || !lat || !lng) {
    return res.status(400).json({ success: false, message: 'Required fields missing' });
  }

  try {
    const existing = await prisma.address.findFirst({
        where: { customerId: req.userId, label: label, addressLine: addressLine }
    });

    if (existing) {
        return res.status(400).json({ success: false, message: 'Address already exists' });
    }
    // PostGIS coordinate mapping (Prisma raw query for Unsupported geography type)
    const result: any = await prisma.$executeRawUnsafe(
      `INSERT INTO "Address" (id, "customerId", label, "addressLine", city, pincode, coordinates, "isDefault", "updatedAt") 
       VALUES ($1, $2, $3, $4, $5, $6, ST_GeographyFromText($7), $8, NOW())`,
      crypto.randomUUID(),
      req.userId,
      label,
      addressLine,
      city,
      pincode,
      `POINT(${lng} ${lat})`,
      isDefault || false
    );

    const newAddress = await prisma.address.findFirst({
        where: { customerId: req.userId },
        orderBy: { createdAt: 'desc' }
    });

    res.status(201).json({ success: true, message: 'Address created successfully', address: newAddress });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const setDefaultAddress = async (req: any, res: Response) => {
  const { id } = req.params;

  try {
    // Reset all addresses for this user to not default
    await prisma.address.updateMany({
      where: { customerId: req.userId },
      data: { isDefault: false },
    });

    // Set the selected one as default
    await prisma.address.update({
      where: { id, customerId: req.userId },
      data: { isDefault: true },
    });

    res.status(200).json({ success: true, message: 'Default address updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
