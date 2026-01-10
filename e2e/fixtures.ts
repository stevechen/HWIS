import { test as base, expect } from '@playwright/test';

interface AuthFixtures {
	authenticatedPage: boolean;
}

export const test = base.extend<AuthFixtures>({
	authenticatedPage: [false, { option: true }]
});

export { expect };
