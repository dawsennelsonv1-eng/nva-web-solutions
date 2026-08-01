import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * lib/ai/authz.ts — who is allowed to spend money from the panel.
 *
 * WHY A TOKEN AND NOT JUST THE ADMIN SESSION: /admin is gated by the Phase 8
 * middleware, but /api/ai/* is a different path and inherits nothing from it.
 * An endpoint that spends real money on an unauthenticated POST is the single
 * worst thing this phase could ship, so the API route authorizes itself
 * instead of trusting where the request claims to come from.
 *
 * HOW IT WORKS: the /admin/ai page renders on the server, behind the existing
 * admin gate. It mints a short-lived HMAC token there and hands it to the
 * panel. The API route verifies signature and expiry. Nothing here replaces
 * the admin session — it is the second lock, and the reason a leaked panel URL
 * is not a leaked spending endpoint.
 *
 * VERIFY — AI_ADMIN_TOKEN_SECRET must be set (any long random string; generate
 * one with `openssl rand -hex 32`). With it unset, minting returns null, the
 * panel renders a clear configuration message, and every AI route refuses.
 * That is deliberate: no secret, no spending.
 */

const TTL_SECONDS = 900;
const HEADER = 'x-nva-ai-token';

export const AI_TOKEN_HEADER = HEADER;

interface TokenPayload {
  sub: string;
  exp: number;
}

function secret(): string | null {
  const value = process.env.AI_ADMIN_TOKEN_SECRET;
  return value && value.length >= 16 ? value : null;
}

function sign(data: string, key: string): string {
  return createHmac('sha256', key).update(data).digest('base64url');
}

/**
 * Returns null when no secret is configured. Callers surface that as a setup
 * problem with a fix, never as a mysterious failure.
 */
export function mintAdminToken(adminId: string): string | null {
  const key = secret();
  if (!key) return null;
  const payload: TokenPayload = {
    sub: adminId,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body, key)}`;
}

export type TokenCheck =
  | { ok: true; adminId: string }
  | { ok: false; message: string; action: string };

export function verifyAdminToken(token: string | null): TokenCheck {
  const key = secret();
  if (!key) {
    return {
      ok: false,
      message: 'AI access is not configured on this deployment.',
      action: 'Set AI_ADMIN_TOKEN_SECRET in Vercel and redeploy.',
    };
  }
  if (!token) {
    return {
      ok: false,
      message: 'This request carried no AI access token.',
      action: 'Reload the AI workspace and try again.',
    };
  }

  const [body, mac] = token.split('.');
  if (!body || !mac) {
    return {
      ok: false,
      message: 'The AI access token is malformed.',
      action: 'Reload the AI workspace to get a fresh one.',
    };
  }

  const expected = sign(body, key);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return {
      ok: false,
      message: 'The AI access token failed its signature check.',
      action: 'Reload the AI workspace. If this repeats, AI_ADMIN_TOKEN_SECRET was rotated.',
    };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
  } catch {
    return {
      ok: false,
      message: 'The AI access token could not be read.',
      action: 'Reload the AI workspace to get a fresh one.',
    };
  }

  if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
    return {
      ok: false,
      message: 'The AI access token is missing fields.',
      action: 'Reload the AI workspace to get a fresh one.',
    };
  }

  if (payload.exp * 1000 < Date.now()) {
    return {
      ok: false,
      message: 'The AI access token expired.',
      action: 'Reload the AI workspace — tokens last 15 minutes.',
    };
  }

  return { ok: true, adminId: payload.sub };
}

export function tokenFromRequest(req: Request): string | null {
  return req.headers.get(HEADER);
}
