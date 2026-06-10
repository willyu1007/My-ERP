/**
 * @my-erp/platform — module registry, RBAC (CASL), auth/identity, structured
 * logging. Fleshed out from P0b; approval engine + module registry land later.
 */
export * from './identity';
export * from './ability';
export * from './invitation';
export * from './logging';

export const PLATFORM_PACKAGE = '@my-erp/platform' as const;
