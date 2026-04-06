import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

@Injectable()
export class SupabaseAdminService {
  private adminClient?: SupabaseClient;
  private publicClient?: SupabaseClient;

  private get url() {
    return process.env.SUPABASE_URL;
  }

  private get publishableKey() {
    return process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  }

  private get serviceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  isConfigured() {
    return Boolean(this.url && this.publishableKey && this.serviceRoleKey);
  }

  getAdminClient() {
    if (!this.url || !this.serviceRoleKey) {
      throw new ServiceUnavailableException("Supabase admin credentials are not configured");
    }

    if (!this.adminClient) {
      this.adminClient = createClient(this.url, this.serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      });
    }

    return this.adminClient;
  }

  createPublicClient() {
    if (!this.url || !this.publishableKey) {
      throw new ServiceUnavailableException("Supabase publishable credentials are not configured");
    }

    if (!this.publicClient) {
      this.publicClient = createClient(this.url, this.publishableKey, {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      });
    }

    return this.publicClient;
  }

  createUserScopedClient(accessToken: string) {
    if (!this.url || !this.publishableKey) {
      throw new ServiceUnavailableException("Supabase publishable credentials are not configured");
    }

    return createClient(this.url, this.publishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }

  async checkHealth() {
    if (!this.isConfigured()) {
      return "not_configured" as const;
    }

    try {
      const client = this.getAdminClient();
      const { error } = await client
        .schema("app")
        .from("companies")
        .select("id")
        .limit(1);

      return error ? "down" as const : "up" as const;
    } catch {
      return "down" as const;
    }
  }

  getImportBucket() {
    return process.env.SUPABASE_STORAGE_IMPORT_BUCKET ?? "flcbi-imports";
  }

  getExportBucket() {
    return process.env.SUPABASE_STORAGE_EXPORT_BUCKET ?? "flcbi-exports";
  }
}
