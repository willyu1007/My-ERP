import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { ObjectStore, PutObjectInput, StoredObject } from '@my-erp/platform';

/**
 * Local-disk ObjectStore (dev/default). Real append-only object-storage archival
 * (accounting archive) is deferred — T-004 decision B. Call sites do not change
 * when the real adapter drops in. Content-addressed by sha256, scoped by
 * org/ledger in the key.
 */
@Injectable()
export class LocalObjectStore implements ObjectStore {
  private readonly root: string;

  constructor() {
    this.root = process.env.OBJECT_STORE_DIR ?? '.data/attachments';
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    const storageKey = `${input.orgId}/${input.ledgerBookId}/${sha256}`;
    await mkdir(join(this.root, input.orgId, input.ledgerBookId), { recursive: true });
    await writeFile(join(this.root, storageKey), input.bytes);
    return { storageKey, sha256, byteSize: input.bytes.byteLength };
  }

  async getUrl(storageKey: string): Promise<string> {
    return `/v1/intakes/attachments/${encodeURIComponent(storageKey)}`;
  }

  async get(storageKey: string): Promise<Uint8Array> {
    // storageKey is always DB-sourced (an Attachment.storageKey), never user input,
    // so the org/ledger/sha256 shape is trusted; still resolve under root only.
    try {
      return new Uint8Array(await readFile(join(this.root, storageKey)));
    } catch {
      throw new NotFoundException('attachment bytes not found');
    }
  }
}
