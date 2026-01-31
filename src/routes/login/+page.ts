// src/routes/login/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = () => {
  return { isLoginPage: true };
};
