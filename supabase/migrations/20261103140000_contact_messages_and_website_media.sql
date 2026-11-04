-- ============================================================================
-- PowerPlus Gym: Contact Messages & Website Media Management
-- Migration: 20261103140000_contact_messages_and_website_media.sql
-- ============================================================================

-- 1. Contact Messages Table (for public contact form submissions)
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'READ', 'RESOLVED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for reception filtering
CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON public.contact_messages(status);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON public.contact_messages(created_at DESC);

-- Enable RLS on contact_messages
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Public (anon & authenticated) can INSERT contact messages
DROP POLICY IF EXISTS "contact_messages_public_insert" ON public.contact_messages;
CREATE POLICY "contact_messages_public_insert" ON public.contact_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Only staff / admin / reception can read contact messages
DROP POLICY IF EXISTS "contact_messages_staff_select" ON public.contact_messages;
CREATE POLICY "contact_messages_staff_select" ON public.contact_messages
  FOR SELECT TO authenticated
  USING (public.powerplus_is_staff(FALSE));

-- Only staff / admin / reception can update status/notes on contact messages
DROP POLICY IF EXISTS "contact_messages_staff_update" ON public.contact_messages;
CREATE POLICY "contact_messages_staff_update" ON public.contact_messages
  FOR UPDATE TO authenticated
  USING (public.powerplus_is_staff(FALSE))
  WITH CHECK (public.powerplus_is_staff(FALSE));

-- 2. Website Media Table (for "Where the Work Happens" & dynamic site images)
CREATE TABLE IF NOT EXISTS public.website_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section TEXT NOT NULL DEFAULT 'where_the_work_happens',
  title TEXT,
  image_url TEXT NOT NULL,
  storage_path TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_media_section ON public.website_media(section, is_active);

-- Enable RLS on website_media
ALTER TABLE public.website_media ENABLE ROW LEVEL SECURITY;

-- Public can view active media
DROP POLICY IF EXISTS "website_media_public_select" ON public.website_media;
CREATE POLICY "website_media_public_select" ON public.website_media
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.powerplus_is_staff(FALSE));

-- Staff / Admin can insert, update, delete media
DROP POLICY IF EXISTS "website_media_staff_insert" ON public.website_media;
CREATE POLICY "website_media_staff_insert" ON public.website_media
  FOR INSERT TO authenticated
  WITH CHECK (public.powerplus_is_staff(FALSE));

DROP POLICY IF EXISTS "website_media_staff_update" ON public.website_media;
CREATE POLICY "website_media_staff_update" ON public.website_media
  FOR UPDATE TO authenticated
  USING (public.powerplus_is_staff(FALSE))
  WITH CHECK (public.powerplus_is_staff(FALSE));

DROP POLICY IF EXISTS "website_media_staff_delete" ON public.website_media;
CREATE POLICY "website_media_staff_delete" ON public.website_media
  FOR DELETE TO authenticated
  USING (public.powerplus_is_staff(FALSE));

-- 3. Storage Bucket for website media
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'website-media',
  'website-media',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Storage RLS policies for website-media bucket
DROP POLICY IF EXISTS "website_media_storage_select" ON storage.objects;
CREATE POLICY "website_media_storage_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'website-media');

DROP POLICY IF EXISTS "website_media_storage_insert" ON storage.objects;
CREATE POLICY "website_media_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'website-media' AND public.powerplus_is_staff(FALSE));

DROP POLICY IF EXISTS "website_media_storage_update" ON storage.objects;
CREATE POLICY "website_media_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'website-media' AND public.powerplus_is_staff(FALSE));

DROP POLICY IF EXISTS "website_media_storage_delete" ON storage.objects;
CREATE POLICY "website_media_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'website-media' AND public.powerplus_is_staff(FALSE));

-- Seed initial default media record for 'where_the_work_happens' if none exists
INSERT INTO public.website_media (section, title, image_url, storage_path, display_order, is_active)
SELECT
  'where_the_work_happens',
  'Main Gym Training Floor',
  '/images/powerplus-wall.jpg',
  NULL,
  1,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.website_media WHERE section = 'where_the_work_happens'
);

