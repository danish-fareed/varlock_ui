import { describe, it, expect } from 'vitest';
import { isSensitiveKey } from './utils';

describe('isSensitiveKey', () => {
  it('identifies keys ending with _KEY', () => {
    expect(isSensitiveKey('AWS_ACCESS_KEY')).toBe(true);
    expect(isSensitiveKey('MY_KEY')).toBe(true);
    expect(isSensitiveKey('KEYBOARD')).toBe(false);
  });

  it('identifies keys ending with _SECRET', () => {
    expect(isSensitiveKey('STRIPE_SECRET')).toBe(true);
    expect(isSensitiveKey('CLIENT_SECRET')).toBe(true);
    expect(isSensitiveKey('SECRET_MESSAGE')).toBe(true); // Matches /SECRET/i
  });

  it('identifies keys ending with _TOKEN', () => {
    expect(isSensitiveKey('GITHUB_TOKEN')).toBe(true);
    expect(isSensitiveKey('AUTH_TOKEN')).toBe(true);
  });

  it('identifies PASSWORD keys', () => {
    expect(isSensitiveKey('DB_PASSWORD')).toBe(true);
    expect(isSensitiveKey('password')).toBe(true);
  });

  it('identifies DATABASE_URL keys', () => {
    expect(isSensitiveKey('DATABASE_URL')).toBe(true);
    expect(isSensitiveKey('PROD_DATABASE_URL')).toBe(true);
  });

  it('identifies API_KEY keys', () => {
    expect(isSensitiveKey('API_KEY')).toBe(true);
    expect(isSensitiveKey('GOOGLE_API_KEY')).toBe(true);
  });

  it('identifies common auth keys', () => {
    expect(isSensitiveKey('AUTH_SECRET')).toBe(true);
    expect(isSensitiveKey('JWT_SECRET')).toBe(true);
    expect(isSensitiveKey('PRIVATE_KEY')).toBe(true);
  });

  it('returns false for non-sensitive keys', () => {
    expect(isSensitiveKey('PORT')).toBe(false);
    expect(isSensitiveKey('NODE_ENV')).toBe(false);
    expect(isSensitiveKey('APP_NAME')).toBe(false);
    expect(isSensitiveKey('USER_ID')).toBe(false);
  });

  it('handles empty or null keys', () => {
    expect(isSensitiveKey('')).toBe(false);
    // @ts-ignore
    expect(isSensitiveKey(null)).toBe(false);
  });
});
