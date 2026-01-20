/// <reference types="vite/client" />

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const modules = import.meta.glob('./**/*.ts') as any;
