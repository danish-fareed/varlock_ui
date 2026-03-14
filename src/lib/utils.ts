/**
 * Checks if a variable key matches common patterns for sensitive information.
 */
export function isSensitiveKey(key: string): boolean {
  if (!key) return false;
  const sensitivePatterns = [
    /_KEY$/i,
    /_SECRET$/i,
    /_TOKEN$/i,
    /PASSWORD/i,
    /DATABASE_URL/i,
    /API_KEY/i,
    /AUTH_SECRET/i,
    /JWT_SECRET/i,
    /PRIVATE_KEY/i,
    /SECRET_KEY/i,
  ];
  return sensitivePatterns.some((pattern) => pattern.test(key));
}
