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

/** Authenticated principal + tenant scope resolved from a bearer token. */
export interface Identity {
  readonly userId: string;
  readonly orgId: string;
  readonly ledgerBookId: string;
  readonly roles: readonly Role[];
}

/**
 * Verifies a bearer token into an {@link Identity}. Mock today (HS256 dev
 * secret); real Logto (OIDC/JWKS) swaps in later without changing callers.
 */
export interface IdentityProvider {
  verify(token: string): Promise<Identity>;
}

export class IdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentityError';
  }
}

const ROLES: ReadonlySet<Role> = new Set<Role>(['accountant', 'cashier', 'supervisor', 'admin', 'viewer']);

function parseIdentity(payload: unknown): Identity {
  if (typeof payload !== 'object' || payload === null) {
    throw new IdentityError('token payload is not an object');
  }
  const p = payload as Record<string, unknown>;
  const userId = typeof p.sub === 'string' ? p.sub : p.userId;
  if (typeof userId !== 'string' || userId === '') throw new IdentityError('missing sub/userId');
  if (typeof p.orgId !== 'string' || p.orgId === '') throw new IdentityError('missing orgId');
  if (typeof p.ledgerBookId !== 'string' || p.ledgerBookId === '') throw new IdentityError('missing ledgerBookId');
  if (!Array.isArray(p.roles) || p.roles.length === 0 || p.roles.some((r) => !ROLES.has(r as Role))) {
    throw new IdentityError('missing or invalid roles');
  }
  return { userId, orgId: p.orgId, ledgerBookId: p.ledgerBookId, roles: p.roles as Role[] };
}

export class MockIdentityProvider implements IdentityProvider {
  constructor(private readonly secret: string) {}

  async verify(token: string): Promise<Identity> {
    let payload: unknown;
    try {
      payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] });
    } catch {
      throw new IdentityError('invalid or expired token');
    }
    return parseIdentity(payload);
  }
}

/** Dev/test helper: mint a token the {@link MockIdentityProvider} accepts. */
export function signDevToken(
  identity: Identity,
  secret: string,
  expiresIn: jwt.SignOptions['expiresIn'] = '1h',
): string {
  const options: jwt.SignOptions = { algorithm: 'HS256', expiresIn };
  return jwt.sign(
    { sub: identity.userId, orgId: identity.orgId, ledgerBookId: identity.ledgerBookId, roles: identity.roles },
    secret,
    options,
  );
}
