-- Supabase Database Schema Definition for Nota-Photo App
-- Execute this script in the Supabase SQL Editor if setting up a fresh project.

-- 1. Table: receipts
CREATE TABLE IF NOT EXISTS public.receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "merchantName" TEXT NOT NULL DEFAULT 'Nota / Toko',
    date TEXT NOT NULL,
    "imageUrl" TEXT,
    subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'Cash',
    "paymentStatus" TEXT NOT NULL DEFAULT 'Lunas',
    note TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Table: receipt_items
CREATE TABLE IF NOT EXISTS public.receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "receiptId" UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Lain-lain',
    "subCategory" TEXT DEFAULT 'Umum',
    price DOUBLE PRECISION NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Table: scan_limits
CREATE TABLE IF NOT EXISTS public.scan_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "ipAddress" TEXT UNIQUE NOT NULL,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "lastScanAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "resetAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Table: merchant_dictionaries
CREATE TABLE IF NOT EXISTS public.merchant_dictionaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "rawPattern" TEXT UNIQUE NOT NULL,
    "cleanName" TEXT NOT NULL,
    "verifiedCount" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Table: product_dictionaries
CREATE TABLE IF NOT EXISTS public.product_dictionaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "rawName" TEXT UNIQUE NOT NULL,
    "verifiedName" TEXT NOT NULL,
    category TEXT NOT NULL,
    "subCategory" TEXT DEFAULT 'Umum',
    "lastKnownPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "verifiedCount" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Table: custom_categories
CREATE TABLE IF NOT EXISTS public.custom_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Table: pending_approvals
CREATE TABLE IF NOT EXISTS public.pending_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "receiptId" UUID REFERENCES public.receipts(id) ON DELETE CASCADE,
    "actionType" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    payload TEXT NOT NULL,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Table: admin_accounts
CREATE TABLE IF NOT EXISTS public.admin_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.admin_accounts (username, password, role)
VALUES 
    ('rama', 'adminnota123', 'ADMIN'),
    ('refo', 'adminnota456', 'ADMIN'),
    ('karyawan', 'PerkaraKopi', 'KARYAWAN')
ON CONFLICT (username) DO NOTHING;

-- 9. Table: notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient TEXT NOT NULL,
    sender TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    "receiptId" UUID REFERENCES public.receipts(id) ON DELETE CASCADE,
    "approvalId" UUID REFERENCES public.pending_approvals(id) ON DELETE CASCADE,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance B-Tree Indexes
CREATE INDEX IF NOT EXISTS receipts_createdAt_idx ON public.receipts ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS receipts_date_idx ON public.receipts (date);
CREATE INDEX IF NOT EXISTS receipts_merchantName_idx ON public.receipts ("merchantName");
CREATE INDEX IF NOT EXISTS receipts_paymentStatus_idx ON public.receipts ("paymentStatus");
CREATE INDEX IF NOT EXISTS receipts_paymentMethod_idx ON public.receipts ("paymentMethod");

CREATE INDEX IF NOT EXISTS receipt_items_receiptId_idx ON public.receipt_items ("receiptId");
CREATE INDEX IF NOT EXISTS receipt_items_category_idx ON public.receipt_items (category);
CREATE INDEX IF NOT EXISTS receipt_items_subCategory_idx ON public.receipt_items ("subCategory");
CREATE INDEX IF NOT EXISTS receipt_items_name_idx ON public.receipt_items (name);
CREATE INDEX IF NOT EXISTS receipt_items_cat_sub_idx ON public.receipt_items (category, "subCategory");

CREATE INDEX IF NOT EXISTS scan_limits_ipAddress_idx ON public.scan_limits ("ipAddress");
CREATE INDEX IF NOT EXISTS merchant_dictionaries_verifiedCount_idx ON public.merchant_dictionaries ("verifiedCount" DESC);
CREATE INDEX IF NOT EXISTS product_dictionaries_verifiedCount_idx ON public.product_dictionaries ("verifiedCount" DESC);
CREATE INDEX IF NOT EXISTS custom_categories_parentId_idx ON public.custom_categories ("parentId");
CREATE INDEX IF NOT EXISTS pending_approvals_status_idx ON public.pending_approvals (status);
CREATE INDEX IF NOT EXISTS pending_approvals_receiptId_idx ON public.pending_approvals ("receiptId");
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON public.notifications (recipient);
CREATE INDEX IF NOT EXISTS notifications_isRead_idx ON public.notifications ("isRead");
CREATE INDEX IF NOT EXISTS notifications_createdAt_idx ON public.notifications ("createdAt" DESC);
