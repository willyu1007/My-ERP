import jwt from 'jsonwebtoken';

/** Finance roles (邀请制授予；账套级 + 操作级权限在 ability.ts 展开)。 */
export type Role = 'accountant' | 'cashier' | 'supervisor' | 'admin' | 'viewer';

export const ROLE_LABELS: Record<Role, string> = {
  accountant: '会计',
  cashier: '出纳',
  supervisor: '主管',
  admin: '管理员',
  viewer: '查看者',
};

const ROLES: ReadonlySet<Role> = new Set<Role>(['accountant', 'cashier', 'supervisor', 'admin', 'viewer']);

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.has(value as Role);
}

/**
 * Tenant context carried by the bearer token. Roles are NOT here — they are the
 * single source of truth in Membership and resolved per request (see api auth).
 * `ledgerBookId` is the active financial scope (optional; org-level operations
 * such as accepting an invitation don't need one). Financial endpoints (P2+)
 * require it explicitly.
 */
export interface Principal {
  readonly userId: string;
  readonly orgId: string;
  readonly ledgerBookId?: string;
  readonly email?: string;
}

/** A {@link Principal} plus the roles resolved from its Membership (RBAC). */
export interface Identity extends Principal {
  readonly roles: readonly Role[];
}

/**
 * Verifies a bearer token into a {@link Principal}. Mock today (HS256 dev
 * secret); real Logto (OIDC/JWKS) swaps in later without changing callers.
 */
export interface IdentityProvider {
  verify(token: string): Promise<Principal>;
}

export class IdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentityError';
  }
}

function parsePrincipal(payload: unknown): Principal {
  if (typeof payload !== 'object' || payload === null) {
    throw new IdentityError('token payload is not an object');
  }
  const p = payload as Record<string, unknown>;
  const userId = typeof p.sub === 'string' ? p.sub : p.userId;
  if (typeof userId !== 'string' || userId === '') throw new IdentityError('missing sub/userId');
  if (typeof p.orgId !== 'string' || p.orgId === '') throw new IdentityError('missing orgId');
  return {
    userId,
    orgId: p.orgId,
    ...(typeof p.ledgerBookId === 'string' && p.ledgerBookId !== '' ? { ledgerBookId: p.ledgerBookId } : {}),
    ...(typeof p.email === 'string' ? { email: p.email } : {}),
  };
}

export class MockIdentityProvider implements IdentityProvider {
  constructor(private readonly secret: string) {}

  async verify(token: string): Promise<Principal> {
    let payload: unknown;
    try {
      payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] });
    } catch {
      throw new IdentityError('invalid or expired token');
    }
    return parsePrincipal(payload);
  }
}

/** Dev/test helper: mint a token the {@link MockIdentityProvider} accepts. */
export function signDevToken(
  principal: Principal,
  secret: string,
  expiresIn: jwt.SignOptions['expiresIn'] = '1h',
): string {
  const claims: Record<string, unknown> = { sub: principal.userId, orgId: principal.orgId };
  if (principal.ledgerBookId !== undefined) claims.ledgerBookId = principal.ledgerBookId;
  if (principal.email !== undefined) claims.email = principal.email;
  const options: jwt.SignOptions = { algorithm: 'HS256', expiresIn };
  return jwt.sign(claims, secret, options);
}
