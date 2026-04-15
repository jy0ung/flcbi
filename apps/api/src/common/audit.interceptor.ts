import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import type { AuthenticatedRequest } from "./auth.types.js";
import { PLATFORM_REPOSITORY, type PlatformRepository } from "../platform/platform.repository.js";

export function shouldSkipGenericAudit(method: string, path: string) {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = `/${path}`.replace(/\/+/g, "/");

  return normalizedMethod === "PATCH"
    && /^\/(?:v1\/)?aging\/vehicles\/[^/]+\/corrections$/.test(normalizedPath);
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly store: PlatformRepository) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const method = request.method.toUpperCase();
    const shouldAudit = ["POST", "PATCH", "PUT", "DELETE"].includes(method);

    return next.handle().pipe(
      tap(() => {
        if (!shouldAudit || !request.user || shouldSkipGenericAudit(method, request.path)) return;
        void Promise.resolve(this.store.addAuditEvent({
          action: `${method.toLowerCase()}_${request.path.replace(/\//g, "_").replace(/^_+/, "")}`,
          entity: "http_request",
          entityId: request.path,
          userId: request.user.id,
          userName: request.user.name,
          details: `${method} ${request.path}`,
        })).catch(() => undefined);
      }),
    );
  }
}
