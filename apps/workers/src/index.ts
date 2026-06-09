/**
 * @my-erp/workers — BullMQ background jobs (async audit, imports; later OCR /
 * report generation / outbox event dispatch). Queues are wired from M2 onward.
 * P0a ships a buildable placeholder so the app exists in the structure.
 */
export function describeWorkers(): string {
  return 'my-erp workers — placeholder (BullMQ queues land in M2+).';
}

if (require.main === module) {
  console.log(describeWorkers());
}
