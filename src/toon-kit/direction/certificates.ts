import { directionFail } from './types';
/**
 * Exact visibility certificates with shared storage.
 *
 * A frame's certificate is the ordered list of JSON pieces of its visibility data:
 * one piece per top-level field, and one per item of a top-level array field (with
 * the item count recorded). Equal piece lists are equivalent to equal
 * JSON.stringify(data), so comparison stays exact. Identical pieces (static scenery
 * proxies, zone, unchanged actor regions) are stored once and shared by reference.
 *
 * Accounting: each distinct piece counts length * 2 bytes (UTF-16, as before), plus
 * 8 bytes per stored reference. The budget therefore bounds what is actually retained.
 */
export const CERTIFICATE_REFERENCE_BYTES = 8;
export function certificatePieces(data: unknown): string[] {
  const pieces: string[] = [];
  const add = (key: string, value: unknown) => {
    if (Array.isArray(value)) {
      pieces.push(key + '#' + value.length);
      for (const item of value) pieces.push(JSON.stringify(item));
    } else pieces.push(key + '=' + JSON.stringify(value));
  };
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) for (const [k, v] of Object.entries(value)) add(key + '.' + k, v);
      else if (Array.isArray(value) && value.every(v => v && typeof v === 'object' && !Array.isArray(v))) {
        pieces.push(key + '#' + value.length);
        value.forEach((item, i) => {
          for (const [k, v] of Object.entries(item as object)) add(key + '[' + i + '].' + k, v);
        });
      } else add(key, value);
    }
  } else add('', data);
  return pieces;
}
export function createCertificateStore(limitBytes: number) {
  const pool = new Map<string, string>(),
    frames = new Map<number, readonly string[]>();
  let bytes = 0;
  return {
    /** Store a frame's certificate; rejects with PREPARATION_BUDGET when retained bytes exceed the limit. */
    add(frame: number, data: unknown) {
      const pieces = certificatePieces(data).map(piece => {
        const shared = pool.get(piece);
        if (shared !== undefined) return shared;
        pool.set(piece, piece);
        bytes += piece.length * 2;
        return piece;
      });
      bytes += pieces.length * CERTIFICATE_REFERENCE_BYTES;
      if (bytes > limitBytes) directionFail('PREPARATION_BUDGET', 'Visibility certificates exceed memory budget', {
        frame,
        details: {
          retainedBytes: bytes,
          limitBytes,
          certifiedFrames: frames.size,
          uniquePieces: pool.size
        }
      });
      frames.set(frame, Object.freeze(pieces));
    },
    /** Exact comparison with the certified frame. */
    matches(frame: number, data: unknown) {
      const stored = frames.get(frame);
      if (!stored) return false;
      const current = certificatePieces(data);
      return current.length === stored.length && current.every((piece, i) => piece === stored[i]);
    },
    stats() {
      return {
        bytes,
        frames: frames.size,
        uniquePieces: pool.size
      };
    },
    clear() {
      pool.clear();
      frames.clear();
      bytes = 0;
    }
  };
}
