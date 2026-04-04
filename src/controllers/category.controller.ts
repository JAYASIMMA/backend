import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { getCache, setCache, deleteCache } from '../services/redis.service';
import { getPresignedUrl, uploadFile } from '../services/s3.service';

const prisma = new PrismaClient();
const CATEGORIES_CACHE_KEY = 'service_categories';

export const getCategories = async (req: Request, res: Response) => {
  try {
    const cachedData = await getCache(CATEGORIES_CACHE_KEY);
    if (cachedData) {
      console.log('[Redis] Categories Cache Hit');
      return res.status(200).json({ success: true, data: JSON.parse(cachedData) });
    }

    console.log('[Redis] Categories Cache Miss. Fetching from Database...');
    const categories = await prisma.serviceCategory.findMany({
      include: {
        subCategories: true,
      },
      orderBy: { name: 'asc' },
    });

    // Generate Presigned URLs for icons if they are stored as S3 links
    const enrichedCategories = await Promise.all(categories.map(async (cat) => {
       if (cat.iconUrl && cat.iconUrl.includes('amazonaws.com')) {
          try {
             // Extract key: everything after the domain
             const key = cat.iconUrl.split('.com/')[1];
             if (key) {
                cat.iconUrl = await getPresignedUrl(key, 3600); // Valid for 1 hour
             }
          } catch (e) {
             console.error('Presigning failed for:', cat.name);
          }
       }
       
       // Also handle subcategories
       if (cat.subCategories) {
          cat.subCategories = await Promise.all(cat.subCategories.map(async (sub) => {
             if (sub.iconUrl && sub.iconUrl.includes('amazonaws.com')) {
                try {
                   const key = sub.iconUrl.split('.com/')[1];
                   if (key) sub.iconUrl = await getPresignedUrl(key, 3600);
                } catch (e) {}
             }
             return sub;
          }));
       }
       return cat;
    }));

    await setCache(CATEGORIES_CACHE_KEY, enrichedCategories, 3600);
    res.status(200).json({ success: true, data: enrichedCategories });
  } catch (error) {
    console.error('Error fetching categories:', error);
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

    await setCache(cacheKey, subcategories, 3600);
    res.status(200).json({ success: true, data: subcategories });
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
