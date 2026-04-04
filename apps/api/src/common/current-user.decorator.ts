import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { User } from "@flcbi/contracts";
import type { AuthenticatedRequest } from "./auth.types.js";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User | undefined => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
