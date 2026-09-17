import { timingSafeEqual } from "node:crypto";

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)/i.exec(header.trim());
  return match?.[1] ?? null;
}

export function tokensEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  const size = Math.max(a.length, b.length, 1);
  const aa = Buffer.alloc(size);
  const bb = Buffer.alloc(size);
  a.copy(aa);
  b.copy(bb);
  return timingSafeEqual(aa, bb) && a.length === b.length;
}

export function authorize(
  authorizationHeader: string | undefined,
  expectedApiKey: string,
): boolean {
  if (!expectedApiKey) {
    return false;
  }
  const token = extractBearerToken(authorizationHeader);
  return token !== null && tokensEqual(token, expectedApiKey);
}
