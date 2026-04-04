import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { LoginResponse, MeResponse } from "@flcbi/contracts";
import { Public } from "../common/public.decorator.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import type { User } from "@flcbi/contracts";
import type { AuthenticatedRequest } from "../common/auth.types.js";
import { SupabaseAdminService } from "../supabase/supabase-admin.service.js";

@ApiTags("auth")
@Controller()
export class AuthController {
  constructor(
    @Inject(SupabaseAdminService)
    private readonly supabase: SupabaseAdminService,
  ) {}

  @Public()
  @Post("auth/login")
  async login(): Promise<LoginResponse> {
    if (this.supabase.isConfigured()) {
      throw new BadRequestException("Use Supabase Auth from the frontend when Supabase is enabled");
    }

    throw new ServiceUnavailableException("Direct API login is disabled. Configure Supabase Auth to sign in.");
  }

  @ApiBearerAuth()
  @Get("me")
  async me(
    @CurrentUser() _user: User,
    @Req() request: AuthenticatedRequest,
  ): Promise<MeResponse> {
    if (!request.session) {
      throw new UnauthorizedException("Session not found");
    }
    return { session: request.session };
  }

  @ApiBearerAuth()
  @Post("auth/logout")
  logout() {
    return { success: true };
  }
}
