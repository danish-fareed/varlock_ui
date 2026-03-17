// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { isSensitiveKey } from './utils';
import { deleteEnvValue } from './envFile';
import { deleteSchemaEntry } from './schemaParser';

describe('deleteEnvValue', () => {
  it('removes a simple key-value pair', () => {
    const input = `FOO=bar\nTEST=123\nBAZ=456`;
    const result = deleteEnvValue(input, 'TEST');
    expect(result).toBe(`FOO=bar\nBAZ=456`);
  });

  it('removes a key with a multiline value', () => {
    const input = `FOO=bar
MULTILINE="this is
a multiline
value"
BAZ=456`;
    const result = deleteEnvValue(input, 'MULTILINE');
    expect(result).toBe(`FOO=bar\nBAZ=456`);
  });

  it('removes the last key with a trailing newline', () => {
    const input = `FOO=bar\nBAZ="123"\n`;
    const result = deleteEnvValue(input, 'BAZ');
    expect(result).toBe(`FOO=bar\n`);
  });
});

describe('deleteSchemaEntry', () => {
  it('removes a schema entry along with its comments and decorators', () => {
    const input = `FOO=bar

# A test description
# @type=number
# @sensitive
TEST=123

BAZ=456
`;
    const result = deleteSchemaEntry(input, 'TEST');
    expect(result).toBe(`FOO=bar\n\nBAZ=456\n`);
  });

  it('returns empty string if schema is single entry and gets deleted', () => {
    const input = `# @type=string\nONLY_ONE=val\n`;
    const result = deleteSchemaEntry(input, 'ONLY_ONE');
    expect(result).toBe(``);
  });
});

describe('isSensitiveKey', () => {
  it('identifies keys ending with _KEY', () => {
    expect(isSensitiveKey('AWS_ACCESS_KEY')).toBe(true);
    expect(isSensitiveKey('MY_KEY')).toBe(true);
    expect(isSensitiveKey('KEYBOARD')).toBe(false);
  });

  it('identifies keys ending with _SECRET', () => {
    expect(isSensitiveKey('STRIPE_SECRET')).toBe(true);
    expect(isSensitiveKey('CLIENT_SECRET')).toBe(true);
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
