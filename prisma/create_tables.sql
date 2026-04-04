-- PostgreSQL Schema Creation Script for Fix-it Backend
-- This script creates the tables and types required for the updated schema.

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create Enums
DO $$ BEGIN
    CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'SP', 'ADMIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'WORK_STARTED', 'COMPLETED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create Users table
CREATE TABLE IF NOT EXISTS "User" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "mobile" TEXT UNIQUE NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create Generic Profiles table (For Everyone)
CREATE TABLE IF NOT EXISTS "Profile" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID UNIQUE NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "fullName" TEXT,
    "profilePictureUrl" TEXT
);

-- Create Service Provider Detailed Profile
CREATE TABLE IF NOT EXISTS "ServiceProviderProfile" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID UNIQUE NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "aadharNumber" TEXT,
    "aadharCardUrl" TEXT,
    "address" TEXT,
    "bio" TEXT,
    "categoryName" TEXT,
    "subCategoryName" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT FALSE
);

-- Create Addresses table
CREATE TABLE IF NOT EXISTS "Address" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "customerId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "label" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "coordinates" GEOGRAPHY(Point, 4326) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "address_coordinates_idx" ON "Address" USING GIST ("coordinates");

-- Create Service Categories table
CREATE TABLE IF NOT EXISTS "ServiceCategory" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" TEXT UNIQUE NOT NULL,
    "iconUrl" TEXT
);

-- Create Service Subcategories table
CREATE TABLE IF NOT EXISTS "ServiceSubcategory" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "iconUrl" TEXT,
    "categoryId" UUID NOT NULL REFERENCES "ServiceCategory"("id") ON DELETE CASCADE
);

-- Create Service Requests table
CREATE TABLE IF NOT EXISTS "ServiceRequest" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "customerId" UUID NOT NULL REFERENCES "User"("id"),
    "spId" UUID REFERENCES "User"("id"),
    "categoryId" UUID NOT NULL REFERENCES "ServiceCategory"("id"),
    "subCategoryId" UUID REFERENCES "ServiceSubcategory"("id"),
    "locationId" UUID NOT NULL REFERENCES "Address"("id"),
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "audioMessageUrl" TEXT,
    "messageText" TEXT,
    "startOtp" TEXT,
    "completionOtp" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create Feedback table
CREATE TABLE IF NOT EXISTS "Feedback" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "requestId" UUID UNIQUE NOT NULL REFERENCES "ServiceRequest"("id") ON DELETE CASCADE,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "audioFeedbackUrl" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create Request Cancellation Reasons table
CREATE TABLE IF NOT EXISTS "RequestCancellationReason" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "requestId" UUID UNIQUE NOT NULL REFERENCES "ServiceRequest"("id") ON DELETE CASCADE,
    "spId" UUID REFERENCES "User"("id"),
    "customerId" UUID REFERENCES "User"("id"),
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create OTP Records table
CREATE TABLE IF NOT EXISTS "OtpRecord" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "mobile" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
