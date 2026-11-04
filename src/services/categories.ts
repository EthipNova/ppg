import { supabase } from "../integrations/supabase/client";
import { CATEGORY_LABELS } from "../constants";
import type { CategoryLabel, CustomerCategory } from "../types";

const STORAGE_KEY = "powerplus_customer_categories";
export const PROTECTED_SYSTEM_CATEGORIES: string[] = ["REGULAR", "STUDENT", "MUSLIM", "AEROBICS"];

export function getLocalCategories(): CategoryLabel[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return CATEGORY_LABELS;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure default categories exist in case of partial list
        const missingDefaults = CATEGORY_LABELS.filter(
          def => !parsed.some((p: CategoryLabel) => p.category === def.category)
        );
        return [...parsed, ...missingDefaults];
      }
    }
  } catch (err) {
    console.warn("Unable to read categories from local storage", err);
  }
  return CATEGORY_LABELS;
}

export function saveLocalCategories(categories: CategoryLabel[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
  } catch (err) {
    console.warn("Unable to save categories to local storage", err);
  }
}

export async function fetchCategories(): Promise<CategoryLabel[]> {
  try {
    const { data, error } = await supabase
      .from("customer_categories")
      .select("key, label, description, is_system, is_active")
      .order("created_at", { ascending: true });

    if (!error && data && data.length > 0) {
      const mapped: CategoryLabel[] = (data as Array<{ key: string; label: string; description?: string | null; is_system?: boolean | null; is_active?: boolean | null }>).map(row => ({
        category: row.key as CustomerCategory,
        label: row.label,
        description: row.description || "",
        isSystem: Boolean(row.is_system),
        isActive: row.is_active !== false,
      }));

      // Ensure all 4 core categories exist
      const missingDefaults = CATEGORY_LABELS.filter(
        def => !mapped.some(m => m.category === def.category)
      );
      const combined = [...mapped, ...missingDefaults];
      saveLocalCategories(combined);
      return combined;
    }
  } catch (err) {
    console.warn("Error querying customer_categories from Supabase, using local store:", err);
  }

  return getLocalCategories();
}

export async function createCategory(input: {
  label: string;
  description?: string;
  key?: string;
}): Promise<CategoryLabel> {
  const label = input.label.trim();
  if (!label) {
    throw new Error("Category name is required.");
  }

  const current = getLocalCategories();

  // Generate a clean uppercase key if not explicitly given
  const candidateKey = input.key?.trim()
    ? input.key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_")
    : label.toUpperCase().replace(/[^A-Z0-9]/g, "_").replace(/^_+|_+$/g, "") || `CAT_${Date.now()}`;

  // Validate duplicate name or key
  const duplicateName = current.find(c => c.label.toLowerCase() === label.toLowerCase());
  if (duplicateName) {
    throw new Error(`A customer category with the name "${label}" already exists.`);
  }

  const duplicateKey = current.find(c => c.category.toUpperCase() === candidateKey);
  if (duplicateKey) {
    throw new Error(`A category with identifier "${candidateKey}" already exists.`);
  }

  const newCategory: CategoryLabel = {
    category: candidateKey,
    label,
    description: (input.description || "").trim(),
    isSystem: false,
  };

  // Attempt Supabase insert
  try {
    const { error } = await (supabase.from("customer_categories") as any).insert([{
      key: newCategory.category,
      label: newCategory.label,
      description: newCategory.description,
      is_system: false,
    }]);
    if (error) {
      console.warn("Supabase category insert note:", error.message);
    }
  } catch (err) {
    console.warn("Supabase category insert offline/error, using persistent local store:", err);
  }

  const updated = [...current, newCategory];
  saveLocalCategories(updated);
  return newCategory;
}

export async function updateCategory(
  categoryKey: string,
  updates: { label: string; description: string }
): Promise<CategoryLabel> {
  const label = updates.label.trim();
  if (!label) throw new Error("Category label is required.");

  const current = getLocalCategories();
  const existing = current.find(c => c.category === categoryKey);
  if (!existing) throw new Error(`Category "${categoryKey}" not found.`);

  // Check duplicate label if changing label
  const duplicate = current.find(
    c => c.category !== categoryKey && c.label.toLowerCase() === label.toLowerCase()
  );
  if (duplicate) {
    throw new Error(`Another category with the name "${label}" already exists.`);
  }

  const updatedCategory: CategoryLabel = {
    ...existing,
    label,
    description: updates.description.trim(),
  };

  // Attempt database update
  try {
    await (supabase.from("customer_categories") as any).update({
      label: updatedCategory.label,
      description: updatedCategory.description,
      updated_at: new Date().toISOString(),
    }).eq("key", categoryKey);
  } catch (err) {
    console.warn("Supabase category update error:", err);
  }

  const updated = current.map(c => c.category === categoryKey ? updatedCategory : c);
  saveLocalCategories(updated);
  return updatedCategory;
}

export async function deleteCategory(
  categoryKey: string,
  usageCheck: {
    members: { category?: string }[];
    plans: { applicableCategories: string[] | "ALL"; name: string }[];
  }
): Promise<void> {
  // 1. Check protected system categories
  if (PROTECTED_SYSTEM_CATEGORIES.includes(categoryKey.toUpperCase())) {
    throw new Error(
      `The default category "${categoryKey}" cannot be deleted because it is a core system requirement.`
    );
  }

  // 2. Check if in use by active plans
  const assignedPlans = usageCheck.plans.filter(p =>
    p.applicableCategories !== "ALL" && p.applicableCategories.includes(categoryKey)
  );
  if (assignedPlans.length > 0) {
    const names = assignedPlans.map(p => `"${p.name}"`).join(", ");
    throw new Error(
      `Cannot delete category "${categoryKey}": it is currently assigned to ${assignedPlans.length} plan(s) (${names}). Reassign or delete those plans first.`
    );
  }

  // 3. Check if in use by customers/members
  const memberCount = usageCheck.members.filter(m => (m.category || "REGULAR") === categoryKey).length;
  if (memberCount > 0) {
    throw new Error(
      `Cannot delete category "${categoryKey}": ${memberCount} member(s) are currently assigned to this category. Reassign them first.`
    );
  }

  // 4. Attempt database delete
  try {
    const { error } = await (supabase.from("customer_categories") as any).delete().eq("key", categoryKey);
    if (error) {
      console.warn("Supabase category delete note:", error.message);
    }
  } catch (err) {
    console.warn("Supabase category delete error:", err);
  }

  // 5. Update local store
  const current = getLocalCategories();
  const updated = current.filter(c => c.category !== categoryKey);
  saveLocalCategories(updated);
}
