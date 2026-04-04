import type { AuthSession, User } from "@flcbi/contracts";

type Awaitable<T> = T | Promise<T>;

export const AUTH_SESSION_SERVICE = Symbol("AUTH_SESSION_SERVICE");

export interface AuthSessionContext {
  token?: string;
  expiresAt?: string;
  provider?: AuthSession["provider"];
}

export interface AuthSessionService {
  sign(user: User, context?: AuthSessionContext): Awaitable<AuthSession>;
  verify(token: string): Awaitable<AuthSession>;
}
