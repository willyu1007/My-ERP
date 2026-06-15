/** DI tokens for the swappable capture seams (T-004). The local/mock adapters
 *  are provided in `app.module`; real object-storage + OCR adapters drop in later. */
export const OBJECT_STORE = Symbol('OBJECT_STORE');
export const EXTRACTOR = Symbol('EXTRACTOR');
