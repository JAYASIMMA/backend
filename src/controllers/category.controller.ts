import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getCache, setCache, deleteCache } from '../services/redis.service';
import { getPresignedUrl, uploadFile, getSignedAssetUrl } from '../services/s3.service';
const CATEGORIES_CACHE_KEY = 'service_categories';

export const getCategories = async (req: Request, res: Response) => {
  try {
    const cachedData = await getCache(CATEGORIES_CACHE_KEY);
    if (cachedData) {
      console.log('[Redis] Categories Cache Hit');
      const cats = JSON.parse(cachedData);
      // Still need to re-sign URLs even if from cache because they expire!
      const signedCats = await Promise.all(cats.map(async (cat: any) => ({
          ...cat,
          iconUrl: await getSignedAssetUrl(cat.iconUrl),
          subCategories: cat.subCategories ? await Promise.all(cat.subCategories.map(async (sub: any) => ({
              ...sub,
              iconUrl: await getSignedAssetUrl(sub.iconUrl)
          }))) : []
      })));
      return res.status(200).json({ success: true, data: signedCats });
    }

    console.log('[Redis] Categories Cache Miss. Fetching from Database...');
    const categories = await prisma.serviceCategory.findMany({
      include: { subCategories: true },
      orderBy: { name: 'asc' },
    });

    await setCache(CATEGORIES_CACHE_KEY, categories, 3600);
    
    // Sign for response
    const enrichedCategories = await Promise.all(categories.map(async (cat: any) => ({
        ...cat,
        iconUrl: await getSignedAssetUrl(cat.iconUrl),
        subCategories: cat.subCategories ? await Promise.all(cat.subCategories.map(async (sub: any) => ({
            ...sub,
            iconUrl: await getSignedAssetUrl(sub.iconUrl)
        }))) : []
    })));

    res.status(200).json({ success: true, data: enrichedCategories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getCategoryById = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const category = await prisma.serviceCategory.findUnique({
      where: { id },
      include: { subCategories: true }
    });

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const enriched = {
      ...category,
      iconUrl: await getSignedAssetUrl(category.iconUrl),
      subCategories: await Promise.all(category.subCategories.map(async (sub) => ({
        ...sub,
        iconUrl: await getSignedAssetUrl(sub.iconUrl)
      })))
    };

    res.status(200).json({ success: true, data: enriched });
  } catch (error) {
    console.error('Error fetching category by ID:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getSubcategories = async (req: Request, res: Response) => {
  const { categoryId } = req.query;
  const cacheKey = categoryId ? `subcategories_${categoryId}` : 'all_subcategories';

  try {
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      console.log(`[Redis] Subcategories Cache Hit (${cacheKey})`);
      return res.status(200).json({ success: true, data: JSON.parse(cachedData) });
    }

    console.log(`[Redis] Subcategories Cache Miss (${cacheKey}). Fetching from database...`);
    const subcategories = await prisma.serviceSubcategory.findMany({
      where: categoryId ? { categoryId: String(categoryId) } : {},
      orderBy: { name: 'asc' },
    });

    const signedSubcategories = await Promise.all(subcategories.map(async (sub: any) => ({
      ...sub,
      iconUrl: await getSignedAssetUrl(sub.iconUrl)
    })));

    await setCache(cacheKey, signedSubcategories, 3600);
    res.status(200).json({ success: true, data: signedSubcategories });
  } catch (error) {
    console.error('Error fetching subcategories:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};



// Create Category
export const createCategory = async (req: Request, res: Response) => {
  const { name } = req.body;
  let iconUrl = null;

  try {
    if (req.file) {
      iconUrl = await uploadFile(req.file as any, 'icons');
    }

    const category = await prisma.serviceCategory.upsert({
      where: { name },
      update: { iconUrl },
      create: { name, iconUrl }
    });
    // Invalidate Cache
    await deleteCache(CATEGORIES_CACHE_KEY); 
    res.status(201).json({ success: true, data: category });
  } catch (error: any) {
    console.error('Create Category Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Create Subcategory
export const createSubcategory = async (req: Request, res: Response) => {
  const { name, categoryId } = req.body;
  let iconUrl = null;

  try {
    if (req.file) {
      iconUrl = await uploadFile(req.file as any, 'subcategories');
    }

    // Subcategory doesn't have a global unique constraint on Name, so we use create.
    // If you want to prevent duplicates per category, we would check existence first.
    const subcategory = await prisma.serviceSubcategory.create({
      data: { name, categoryId, iconUrl }
    });
    // Invalidate Cache
    await deleteCache(CATEGORIES_CACHE_KEY); 
    res.status(201).json({ success: true, data: subcategory });
  } catch (error: any) {
    console.error('Create Subcategory Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Update Category
export const updateCategory = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name } = req.body;
  let iconUrl = req.body.iconUrl;

  try {
    if (req.file) {
      iconUrl = await uploadFile(req.file as any, 'icons');
    }

    const category = await prisma.serviceCategory.update({
      where: { id },
      data: { name, iconUrl }
    });
    await deleteCache(CATEGORIES_CACHE_KEY);
    res.status(200).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Update failed' });
  }
};

// Delete Category
export const deleteCategory = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await prisma.serviceCategory.delete({ where: { id } });
    await deleteCache(CATEGORIES_CACHE_KEY);
    res.status(200).json({ success: true, message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
};

// Update Subcategory
export const updateSubcategory = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name } = req.body;
  let iconUrl = req.body.iconUrl;

  try {
    if (req.file) {
      iconUrl = await uploadFile(req.file as any, 'subcategories');
    }

    const subcategory = await prisma.serviceSubcategory.update({
      where: { id },
      data: { name, iconUrl }
    });
    
    // Invalidate main categories cache
    await deleteCache(CATEGORIES_CACHE_KEY);
    // Invalidate specific subcategory caches
    const categoryId = subcategory.categoryId;
    await deleteCache(`subcategories_${categoryId}`);
    await deleteCache('all_subcategories');

    res.status(200).json({ success: true, data: subcategory });
  } catch (error) {
    console.error('Update Subcategory Error:', error);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
};

// Delete Subcategory
export const deleteSubcategory = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const sub = await prisma.serviceSubcategory.delete({ where: { id } });
    
    // Invalidate caches
    await deleteCache(CATEGORIES_CACHE_KEY);
    await deleteCache(`subcategories_${sub.categoryId}`);
    await deleteCache('all_subcategories');
    
    res.status(200).json({ success: true, message: 'Subcategory deleted' });
  } catch (error) {
    console.error('Delete Subcategory Error:', error);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
};

/**
 * Get Nearby Service Providers for a Category (within radius)
 */
export const getNearbySPs = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { lat, lng, radius = 5000 } = req.query;

  try {
    const category = await prisma.serviceCategory.findUnique({
      where: { id },
    });

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const radiusMeters = parseFloat(radius as string);
    
    let sps: any[];
    if (lat && lng) {
      const latitude = parseFloat(lat as string);
      const longitude = parseFloat(lng as string);
      
      // Use raw query for distance calculation between Address coordinates and SP Float coordinates
      // We use geography for accurate distance in meters
      sps = await prisma.$queryRaw`
        SELECT 
          u.id,
          u.mobile,
          p."fullName",
          p."profilePictureUrl",
          sp.latitude,
          sp.longitude,
          (
            SELECT COALESCE(AVG(f.rating), 5.0)
            FROM "Feedback" f 
            JOIN "ServiceRequest" sr ON f."requestId" = sr.id 
            WHERE sr."spId" = u.id
          ) as rating,
          (
            SELECT COUNT(sr.id)::int
            FROM "ServiceRequest" sr 
            WHERE sr."spId" = u.id AND sr.status = 'COMPLETED'
          ) as "workCount",
          ST_Distance(
            ST_SetSRID(ST_Point(sp.longitude, sp.latitude), 4326)::geography,
            ST_SetSRID(ST_Point(${longitude}, ${latitude}), 4326)::geography
          ) as distance
        FROM "User" u
        JOIN "Profile" p ON u.id = p."userId"
        JOIN "ServiceProviderProfile" sp ON u.id = sp."userId"
        WHERE LOWER(sp."categoryName") = LOWER(${category.name})
        AND sp."dutyStatus" = true
        AND sp."locationUpdatedAt" >= NOW() - INTERVAL '60 seconds'
        AND ST_DWithin(
          ST_SetSRID(ST_Point(sp.longitude, sp.latitude), 4326)::geography,
          ST_SetSRID(ST_Point(${longitude}, ${latitude}), 4326)::geography,
          ${radiusMeters}
        )
        ORDER BY distance ASC
      `;
    } else {
      // Fallback: return all SPs in category if no location provided
      const users = await prisma.user.findMany({
        where: {
          role: 'SP',
          spProfile: {
            categoryName: { equals: category.name, mode: 'insensitive' },
            dutyStatus: true,
            locationUpdatedAt: { gte: new Date(Date.now() - 60000) } // 60 seconds online window
          }
        },
        include: {
          profile: true,
          spProfile: true
        }
      });
      
      sps = await Promise.all(users.map(async (u: any) => {
          const ratingData: any[] = await prisma.$queryRaw`
            SELECT COALESCE(AVG(rating), 5.0) as avg_rating 
            FROM "Feedback" f 
            JOIN "ServiceRequest" sr ON f."requestId" = sr.id 
            WHERE sr."spId" = ${u.id}
          `;
          const workCountData: any[] = await prisma.$queryRaw`
            SELECT COUNT(id) as work_count 
            FROM "ServiceRequest" 
            WHERE "spId" = ${u.id} AND status = 'COMPLETED'
          `;
          return {
            id: u.id,
            mobile: u.mobile,
            fullName: u.profile?.fullName,
            profilePictureUrl: u.profile?.profilePictureUrl,
            latitude: u.spProfile?.latitude,
            longitude: u.spProfile?.longitude,
            rating: ratingData.length > 0 ? parseFloat(ratingData[0].avg_rating) : 5.0,
            workCount: workCountData.length > 0 ? Number(workCountData[0].work_count) : 0,
            distance: 0
          };
      }));
    }

    // Sign URLs and process ratings
    const processedSPs = await Promise.all(sps.map(async (sp) => ({
      ...sp,
      profilePictureUrl: sp.profilePictureUrl ? await getSignedAssetUrl(sp.profilePictureUrl) : null,
      rating: parseFloat(sp.rating || 5.0)
    })));

    res.status(200).json({ success: true, data: processedSPs });
  } catch (error) {
    console.error('Error fetching nearby SPs:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
