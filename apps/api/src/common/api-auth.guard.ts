import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedRequest } from "./auth.types.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";
import { AUTH_SESSION_SERVICE, type AuthSessionService } from "../auth/auth-session.service.js";

@Injectable()
export class ApiAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(AUTH_SESSION_SERVICE)
    private readonly tokenService: AuthSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    const session = await this.tokenService.verify(token);
    if (!session.user) {
      throw new UnauthorizedException("Unknown user");
    }

    request.user = session.user;
    request.session = session;
    return true;
  }
}
