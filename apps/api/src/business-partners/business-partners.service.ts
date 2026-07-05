import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  appendAuditRecordTx,
  createBusinessPartnerTx,
  getBusinessPartnerTx,
  listBusinessPartnersTx,
  listMembershipsTx,
  Prisma,
  updateBusinessPartnerTx,
  withScope,
  type BusinessPartnerEntity,
  type TxClient,
} from '@my-erp/db';
import type { Identity } from '@my-erp/platform';

const PARTY_TYPES = new Set(['organization', 'individual']);
/** D1: multi-select system roles — hints for filtering/defaults, never a mandatory primary kind. */
const PARTNER_ROLES = new Set([
  'customer',
  'supplier',
  'employee',
  'reimbursee',
  'contractor',
  'shareholder',
  'other',
]);

export interface CreateBusinessPartnerDto {
  partyType: string;
  name: string;
  roles?: string[];
  tags?: string[];
  memberUserId?: string | null;
  wechat?: string;
  remark?: string;
  /** D2: a non-member individual is a manual entry and needs explicit confirmation. */
  confirmNonMember?: boolean;
}

export interface UpdateBusinessPartnerDto {
  expectedVersion: number;
  partyType?: string;
  name?: string;
  roles?: string[];
  tags?: string[];
  memberUserId?: string | null;
  wechat?: string;
  remark?: string;
  active?: boolean;
}

const iso = (d: Date): string => d.toISOString();
function toDto(p: BusinessPartnerEntity) {
  return { ...p, createdAt: iso(p.createdAt), updatedAt: iso(p.updatedAt) };
}

function assertPartyType(partyType: string): void {
  if (!PARTY_TYPES.has(partyType))
    throw new BadRequestException('partyType must be organization|individual');
}
function normalizeRoles(roles: string[] | undefined): string[] | undefined {
  if (roles === undefined) return undefined;
  const unique = [...new Set(roles)];
  for (const role of unique) {
    if (!PARTNER_ROLES.has(role))
      throw new BadRequestException(
        'roles must be customer|supplier|employee|reimbursee|contractor|shareholder|other',
      );
  }
  return unique;
}
function normalizeTags(tags: string[] | undefined): string[] | undefined {
  if (tags === undefined) return undefined;
  return [...new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0))];
}

@Injectable()
export class BusinessPartnersService {
  private audit(
    tx: TxClient,
    identity: Identity,
    action: string,
    entityId: string,
    ledgerBookId: string,
    metadata: Prisma.InputJsonValue,
  ): Promise<void> {
    return appendAuditRecordTx(tx, {
      actorId: identity.userId,
      action,
      entityType: 'BusinessPartner',
      entityId,
      ledgerBookId,
      metadata,
    });
  }

  /** D2: the member link must point at an actual org member (convenience/dedup only). */
  private async assertMember(tx: TxClient, memberUserId: string): Promise<void> {
    const members = await listMembershipsTx(tx);
    if (!members.some((m) => m.userId === memberUserId))
      throw new BadRequestException('memberUserId 不是本组织成员');
  }

  async list(
    identity: Identity,
    ledgerBookId: string,
    filters: { active?: boolean; partyType?: string; role?: string; q?: string },
  ) {
    return withScope(identity.orgId, ledgerBookId, async (tx) =>
      (await listBusinessPartnersTx(tx, filters)).map(toDto),
    );
  }

  async get(identity: Identity, ledgerBookId: string, id: string) {
    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const partner = await getBusinessPartnerTx(tx, id);
      if (!partner) throw new NotFoundException('business partner not found');
      return toDto(partner);
    });
  }

  async create(identity: Identity, ledgerBookId: string, input: CreateBusinessPartnerDto) {
    assertPartyType(input.partyType);
    if (!input.name?.trim()) throw new BadRequestException('name is required');
    const roles = normalizeRoles(input.roles) ?? [];
    const tags = normalizeTags(input.tags) ?? [];
    const memberUserId = input.memberUserId?.trim() || null;
    if (memberUserId && input.partyType !== 'individual')
      throw new BadRequestException('memberUserId 仅适用于个人往来单位');
    // D2: joined employees are quick-selectable; anyone else must be explicitly confirmed.
    if (input.partyType === 'individual' && !memberUserId && input.confirmNonMember !== true)
      throw new BadRequestException('非组织成员的个人需显式确认后才能保存（confirmNonMember）');

    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      if (memberUserId) await this.assertMember(tx, memberUserId);
      const partner = await createBusinessPartnerTx(tx, {
        ledgerBookId,
        partyType: input.partyType,
        name: input.name.trim(),
        roles,
        tags,
        memberUserId,
        wechat: input.wechat?.trim() ?? '',
        remark: input.remark?.trim() ?? '',
        createdBy: identity.userId,
      });
      await this.audit(tx, identity, 'CREATE_BUSINESS_PARTNER', partner.id, ledgerBookId, {
        partyType: partner.partyType,
        roles: partner.roles,
        memberLinked: memberUserId != null,
      });
      return toDto(partner);
    });
  }

  async update(
    identity: Identity,
    ledgerBookId: string,
    id: string,
    input: UpdateBusinessPartnerDto,
  ) {
    if (input.partyType !== undefined) assertPartyType(input.partyType);
    if (input.name !== undefined && !input.name.trim())
      throw new BadRequestException('name cannot be empty');
    const roles = normalizeRoles(input.roles);
    const tags = normalizeTags(input.tags);
    const memberUserId =
      input.memberUserId === undefined ? undefined : input.memberUserId?.trim() || null;

    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const existing = await getBusinessPartnerTx(tx, id);
      if (!existing) throw new NotFoundException('business partner not found');
      const partyType = input.partyType ?? existing.partyType;
      const nextMemberUserId = memberUserId === undefined ? existing.memberUserId : memberUserId;
      if (nextMemberUserId && partyType !== 'individual')
        throw new BadRequestException('memberUserId 仅适用于个人往来单位');
      if (memberUserId) await this.assertMember(tx, memberUserId);

      const updated = await updateBusinessPartnerTx(tx, id, {
        expectedVersion: input.expectedVersion,
        partyType: input.partyType,
        name: input.name?.trim(),
        roles,
        tags,
        memberUserId,
        wechat: input.wechat?.trim(),
        remark: input.remark?.trim(),
        active: input.active,
      });
      if (!updated) throw new ConflictException('往来单位已变化，请刷新');
      await this.audit(tx, identity, 'UPDATE_BUSINESS_PARTNER', id, ledgerBookId, {
        active: updated.active,
        renamed: input.name !== undefined && input.name.trim() !== existing.name,
      });
      return toDto(updated);
    });
  }
}
