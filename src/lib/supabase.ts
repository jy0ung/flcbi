import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function isConfiguredValue(value: string | undefined) {
  return Boolean(value && !value.startsWith("replace-with-"));
}

const browserOrigin =
  typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : undefined;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? browserOrigin;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured =
  isConfiguredValue(supabaseUrl) &&
  isConfiguredValue(supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    })
  : null;

export async function getSupabaseAccessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
