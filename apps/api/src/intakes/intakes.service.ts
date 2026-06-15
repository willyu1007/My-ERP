import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  createAttachmentTx,
  createIntakeTx,
  getAttachmentTx,
  getIntakeTx,
  listIntakesTx,
  updateIntakeTx,
  withScope,
  type IntakeEntity,
} from '@my-erp/db';
import {
  ExtractionResultSchema,
  IntakeKindSchema,
  IntakeSchema,
  IntakeSourceSchema,
  IntakeStatusSchema,
  type Intake,
  type IntakeKind,
  type IntakeSource,
} from '@my-erp/contracts';
import type { Extractor, Identity, ObjectStore } from '@my-erp/platform';
import { draftVoucherFromIntakeTx, shouldAutoDraft } from './draft';
import { appendIntakeOutboxEventTx } from './intake-outbox';
import { EXTRACTOR, OBJECT_STORE } from './tokens';

const MAX_BYTES = 10 * 1024 * 1024;

interface ParsedCapture {
  source: IntakeSource;
  kind: IntakeKind;
  contentType: string;
  bytes: Uint8Array;
  channelRef: string | null;
}

function parseCapture(body: unknown): ParsedCapture {
  const b = (body ?? {}) as Record<string, unknown>;
  const kind = IntakeKindSchema.safeParse(b.kind);
  if (!kind.success) throw new BadRequestException('invalid or missing kind');
  let source: IntakeSource = 'web';
  if (b.source !== undefined) {
    const parsed = IntakeSourceSchema.safeParse(b.source);
    if (!parsed.success) throw new BadRequestException('invalid source');
    source = parsed.data;
  }
  if (typeof b.contentType !== 'string' || b.contentType === '') {
    throw new BadRequestException('contentType is required');
  }
  if (typeof b.contentBase64 !== 'string' || b.contentBase64 === '') {
    throw new BadRequestException('contentBase64 is required');
  }
  const bytes = new Uint8Array(Buffer.from(b.contentBase64, 'base64'));
  if (bytes.byteLength === 0) throw new BadRequestException('attachment is empty');
  if (bytes.byteLength > MAX_BYTES) throw new BadRequestException('attachment exceeds 10MB');
  return {
    source,
    kind: kind.data,
    contentType: b.contentType,
    bytes,
    channelRef: typeof b.channelRef === 'string' ? b.channelRef : null,
  };
}

function toIntakeDto(intake: IntakeEntity): Intake {
  return IntakeSchema.parse({
    id: intake.id,
    orgId: intake.orgId,
    ledgerBookId: intake.ledgerBookId,
    source: intake.source,
    kind: intake.kind,
    status: intake.status,
    attachmentId: intake.attachmentId,
    extraction: intake.extraction ?? null,
    confidence: intake.confidence,
    needsReview: intake.needsReview,
    targetType: intake.targetType,
    targetId: intake.targetId,
    createdBy: intake.createdBy,
    version: intake.version,
    createdAt: intake.createdAt.toISOString(),
    updatedAt: intake.updatedAt.toISOString(),
  });
}

@Injectable()
export class IntakeService {
  constructor(
    @Inject(OBJECT_STORE) private readonly objectStore: ObjectStore,
    @Inject(EXTRACTOR) private readonly extractor: Extractor,
  ) {}

  async capture(identity: Identity, ledgerBookId: string, body: unknown): Promise<Intake> {
    const input = parseCapture(body);
    const occurredAt = new Date().toISOString();
    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const stored = await this.objectStore.put({
        orgId: identity.orgId,
        ledgerBookId,
        bytes: input.bytes,
        contentType: input.contentType,
      });
      const attachment = await createAttachmentTx(tx, {
        orgId: identity.orgId,
        ledgerBookId,
        storageKey: stored.storageKey,
        contentType: input.contentType,
        byteSize: stored.byteSize,
        sha256: stored.sha256,
        createdBy: identity.userId,
      });
      const intake = await createIntakeTx(tx, {
        orgId: identity.orgId,
        ledgerBookId,
        source: input.source,
        kind: input.kind,
        attachmentId: attachment.id,
        channelRef: input.channelRef,
        createdBy: identity.userId,
      });
      await appendIntakeOutboxEventTx(tx, intake, 'intake.received', occurredAt);
      return toIntakeDto(intake);
    });
  }

  async list(identity: Identity, ledgerBookId: string, rawStatus?: string): Promise<Intake[]> {
    let status: string | undefined;
    if (rawStatus) {
      const parsed = IntakeStatusSchema.safeParse(rawStatus);
      if (!parsed.success) throw new BadRequestException('invalid status');
      status = parsed.data;
    }
    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const rows = await listIntakesTx(tx, status ? { status } : undefined);
      return rows.map(toIntakeDto);
    });
  }

  async detail(identity: Identity, ledgerBookId: string, id: string): Promise<Intake> {
    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const intake = await getIntakeTx(tx, id);
      if (!intake) throw new NotFoundException('intake not found');
      return toIntakeDto(intake);
    });
  }

  async extract(identity: Identity, ledgerBookId: string, id: string): Promise<Intake> {
    const occurredAt = new Date().toISOString();
    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const intake = await getIntakeTx(tx, id);
      if (!intake) throw new NotFoundException('intake not found');
      if (!intake.attachmentId) throw new BadRequestException('intake has no attachment to extract');
      if (intake.status !== 'received' && intake.status !== 'failed') {
        throw new BadRequestException(`cannot extract a ${intake.status} intake`);
      }
      const attachment = await getAttachmentTx(tx, intake.attachmentId);
      if (!attachment) throw new NotFoundException('attachment not found');

      const raw = await this.extractor.extract({ storageKey: attachment.storageKey, kind: intake.kind });
      const parsed = ExtractionResultSchema.safeParse(raw);
      if (!parsed.success) {
        await updateIntakeTx(tx, id, { status: 'failed', expectedVersion: intake.version });
        throw new BadRequestException('extraction produced an invalid result');
      }
      const updated = await updateIntakeTx(tx, id, {
        status: 'extracted',
        extraction: parsed.data,
        confidence: parsed.data.confidence,
        needsReview: parsed.data.needsReview,
        expectedVersion: intake.version,
      });
      if (!updated) throw new ConflictException('intake changed concurrently');
      await appendIntakeOutboxEventTx(tx, updated, 'intake.extracted', occurredAt);
      // G1: high-confidence + template-matched captures auto-draft inline.
      if (shouldAutoDraft(parsed.data)) {
        const drafted = await draftVoucherFromIntakeTx(tx, {
          identity,
          ledgerBookId,
          intake: updated,
          occurredAt,
        });
        return toIntakeDto(drafted);
      }
      return toIntakeDto(updated);
    });
  }

  /** Build a voucher draft from an already-extracted intake (manual/retry path). */
  async draft(identity: Identity, ledgerBookId: string, id: string): Promise<Intake> {
    const occurredAt = new Date().toISOString();
    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const intake = await getIntakeTx(tx, id);
      if (!intake) throw new NotFoundException('intake not found');
      if (intake.status !== 'extracted') {
        throw new BadRequestException(`cannot draft a ${intake.status} intake`);
      }
      const drafted = await draftVoucherFromIntakeTx(tx, {
        identity,
        ledgerBookId,
        intake,
        occurredAt,
      });
      return toIntakeDto(drafted);
    });
  }

  async discard(identity: Identity, ledgerBookId: string, id: string): Promise<Intake> {
    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const intake = await getIntakeTx(tx, id);
      if (!intake) throw new NotFoundException('intake not found');
      if (intake.status === 'confirmed') {
        throw new BadRequestException('cannot discard a confirmed intake');
      }
      const updated = await updateIntakeTx(tx, id, { status: 'discarded' });
      if (!updated) throw new ConflictException('intake changed concurrently');
      return toIntakeDto(updated);
    });
  }
}
