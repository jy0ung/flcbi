import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { getPermissionsForUser, type AuthSession, type User } from "@flcbi/contracts";
import {
  type AuthSessionContext,
  type AuthSessionService,
} from "./auth-session.service.js";
import { SupabaseAdminService } from "../supabase/supabase-admin.service.js";
import { PLATFORM_REPOSITORY, type PlatformRepository } from "../platform/platform.repository.js";

@Injectable()
export class PlatformAuthSessionService implements AuthSessionService {
  constructor(
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
    @Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository,
  ) {}

  async sign(user: User, context?: AuthSessionContext): Promise<AuthSession> {
    if (!this.supabase.isConfigured()) {
      throw new ServiceUnavailableException("Supabase Auth is not configured");
    }

    if (!context?.token) {
      throw new UnauthorizedException("Supabase access token is required");
    }

    return this.toSupabaseSession(user, context.token, context.expiresAt);
  }

  async verify(token: string): Promise<AuthSession> {
    if (!this.supabase.isConfigured()) {
      throw new ServiceUnavailableException("Supabase Auth is not configured");
    }

    const client = this.supabase.createPublicClient();
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user?.email) {
      throw new UnauthorizedException(error?.message ?? "Invalid Supabase session");
    }

    const user = await this.repository.findUserByEmail(data.user.email);
    if (!user) {
      throw new UnauthorizedException("User profile is not provisioned");
    }
    if (user.status && user.status !== "active") {
      throw new UnauthorizedException("User account is not active");
    }

    return this.toSupabaseSession(user, token, this.expiresAtFromToken(token));
  }

  private toSupabaseSession(user: User, token: string, expiresAt?: string): AuthSession {
    return {
      token,
      user,
      permissions: getPermissionsForUser(user),
      expiresAt: expiresAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      provider: "supabase",
    };
  }

  private expiresAtFromToken(token: string) {
    try {
      const payload = token.split(".")[1];
      if (!payload) return undefined;
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
        exp?: number;
      };
      return decoded.exp ? new Date(decoded.exp * 1000).toISOString() : undefined;
    } catch {
      return undefined;
    }
  }
}
