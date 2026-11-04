import { supabase } from "../integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

const db = supabase as unknown as SupabaseClient;

export interface WebsiteMediaItem {
  id: string;
  section: string;
  title: string;
  imageUrl: string;
  storagePath?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface WebsiteMediaRow {
  id: string;
  section: string;
  title: string;
  image_url: string;
  storage_path: string | null;
  display_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

const DEFAULT_MEDIA_SECTION = "where_the_work_happens";
const BUCKET_NAME = "website-media";

/**
 * Fetches media items for a section (defaulting to 'where_the_work_happens').
 * Public and Admin can call this.
 */
export async function fetchWebsiteMedia(
  section = DEFAULT_MEDIA_SECTION
): Promise<WebsiteMediaItem[]> {
  try {
    const { data, error } = await db
      .from("website_media")
      .select("*")
      .eq("section", section)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[websiteMediaService] Failed to fetch media from Supabase:", error);
      return [];
    }

    const rows = (data || []) as unknown as WebsiteMediaRow[];
    return rows.map((row) => ({
      id: row.id,
      section: row.section,
      title: row.title || "Gym Floor",
      imageUrl: row.image_url,
      storagePath: row.storage_path || undefined,
      displayOrder: row.display_order ?? 0,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (err) {
    console.warn("[websiteMediaService] Error fetching media:", err);
    return [];
  }
}

/**
 * Fetches the currently active media item for a section.
 * Falls back to default local image if none active.
 */
export async function fetchActiveWebsiteMedia(
  section = DEFAULT_MEDIA_SECTION
): Promise<WebsiteMediaItem | null> {
  const items = await fetchWebsiteMedia(section);
  const active = items.find((i) => i.isActive);
  return active || items[0] || null;
}

/**
 * Uploads an image to the 'website-media' bucket.
 */
export async function uploadWebsiteMediaImage(
  file: File
): Promise<{ publicUrl: string; storagePath: string }> {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const filePath = `showcase/${timestamp}-${randomStr}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || "image/jpeg",
    });

  if (uploadError) {
    console.error("[websiteMediaService] Upload failed:", uploadError);
    throw new Error(uploadError.message || "Failed to upload image file.");
  }

  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);

  return {
    publicUrl: data.publicUrl,
    storagePath: filePath,
  };
}

/**
 * Creates or updates a website media record.
 */
export async function saveWebsiteMediaItem(item: {
  id?: string;
  section?: string;
  title: string;
  imageUrl: string;
  storagePath?: string;
  displayOrder?: number;
  isActive?: boolean;
}): Promise<WebsiteMediaItem> {
  const payload = {
    section: item.section || DEFAULT_MEDIA_SECTION,
    title: item.title.trim() || "Gym Showcase Image",
    image_url: item.imageUrl,
    storage_path: item.storagePath || null,
    display_order: item.displayOrder ?? 1,
    is_active: item.isActive !== undefined ? item.isActive : true,
    updated_at: new Date().toISOString(),
  };

  let query;
  if (item.id) {
    query = db
      .from("website_media")
      .update(payload)
      .eq("id", item.id)
      .select()
      .single();
  } else {
    query = db
      .from("website_media")
      .insert([payload])
      .select()
      .single();
  }

  const { data, error } = await query;
  if (error) {
    console.error("[websiteMediaService] Save media error:", error);
    throw new Error(error.message || "Failed to save media record.");
  }

  // Trigger cross-component refresh event
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("powerplus:media-updated"));
  }

  const saved = data as unknown as WebsiteMediaRow;
  return {
    id: saved.id,
    section: saved.section,
    title: saved.title,
    imageUrl: saved.image_url,
    storagePath: saved.storage_path || undefined,
    displayOrder: saved.display_order,
    isActive: saved.is_active,
    createdAt: saved.created_at,
    updatedAt: saved.updated_at,
  };
}

/**
 * Sets a specific image as the active image for its section (deactivating others).
 */
export async function setActiveWebsiteMedia(
  id: string,
  section = DEFAULT_MEDIA_SECTION
): Promise<void> {
  // 1. Deactivate all in section
  await db
    .from("website_media")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("section", section);

  // 2. Activate target item
  const { error } = await db
    .from("website_media")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[websiteMediaService] Failed to set active media:", error);
    throw new Error(error.message || "Failed to activate image.");
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("powerplus:media-updated"));
  }
}

/**
 * Deletes a media item and its storage asset if present.
 */
export async function deleteWebsiteMediaItem(
  id: string,
  storagePath?: string
): Promise<void> {
  if (storagePath) {
    try {
      await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
    } catch (e) {
      console.warn("[websiteMediaService] Failed to remove storage file:", e);
    }
  }

  const { error } = await db
    .from("website_media")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[websiteMediaService] Delete media error:", error);
    throw new Error(error.message || "Failed to delete media item.");
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("powerplus:media-updated"));
  }
}
