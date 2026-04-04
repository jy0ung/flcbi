import type { AuthSession, User } from "@flcbi/contracts";
import type { Request } from "express";

export interface AuthenticatedRequest extends Request {
  user?: User;
  session?: AuthSession;
}
