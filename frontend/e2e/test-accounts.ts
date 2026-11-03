import type { APIRequestContext } from '@playwright/test';
import { expect } from '@playwright/test';

import type { components } from '../src/api/schema.js';

// A fresh throwaway address per test, so tests never share an account.
export const newTestAccountEmail = (): string => `cook-${crypto.randomUUID()}@tastebook.test`;

type SignInCode = components['schemas']['SignInCode'];
type Seed = components['schemas']['Seed'];
type Seeded = components['schemas']['Seeded'];

// Reads the code the backend stored for a test account instead of emailing it.
export const readSignInCode = async (request: APIRequestContext, email: string): Promise<string> => {
  // Previews keep the codes behind the bypass secret; locally and in CI it isn't set and isn't needed.
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const response = await request.get('/api/test-accounts/code/', {
    params: { email },
    headers: secret ? { 'X-Test-Account-Secret': secret } : undefined
  });
  expect(response.status(), `reading the sign-in code for ${email}`).toBe(200);
  const { code }: SignInCode = await response.json();
  return code;
};

// Makes the described test accounts, households and recipes, each account with a signed-in session.
export const seedAccounts = async (request: APIRequestContext, seed: Seed): Promise<Seeded> => {
  // Behind the bypass secret on previews, as the sign-in codes are.
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const response = await request.post('/api/test-accounts/seed/', {
    data: seed,
    headers: secret ? { 'X-Test-Account-Secret': secret } : undefined
  });
  expect(response.status(), 'seeding test accounts').toBe(201);
  return response.json();
};
