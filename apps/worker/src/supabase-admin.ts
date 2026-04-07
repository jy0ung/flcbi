import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | undefined;

export function getSupabaseAdminClient() {
  if (!cachedClient) {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
      throw new Error("Supabase admin credentials are not configured for the worker");
    }

    cachedClient = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }

  return cachedClient;
}

export function getImportBucket() {
  return process.env.SUPABASE_STORAGE_IMPORT_BUCKET ?? "flcbi-imports";
}

export function getExportBucket() {
  return process.env.SUPABASE_STORAGE_EXPORT_BUCKET ?? "flcbi-exports";
}

export async function runBestEffort(label: string, action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`${label} failed: ${message}`);
  }
}

export function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}
