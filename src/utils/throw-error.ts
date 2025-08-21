// sdkError.ts
import { SdkErrorEnum } from '../types/enums';

export type SdkErrorPayload = {
  protocol?: string;
  message?: string; // short, human-readable
  error?: string; // raw/concrete cause (from API or thrown error)
  [k: string]: unknown; // allow extra fields per protocol
};

export class GeniusError extends Error {
  override readonly name = 'GeniusError';
  readonly type: SdkErrorEnum;
  readonly payload?: SdkErrorPayload;
  readonly cause?: unknown;

  constructor(type: SdkErrorEnum, payload?: unknown, opts?: { message?: string; cause?: unknown }) {
    const norm = normalizePayload(payload);
    const concise =
      opts?.message ??
      norm?.message ??
      // fall back on error string if present
      (typeof norm?.error === 'string' ? norm.error : undefined) ??
      'An error occurred';

    // Keep the message human-readable and short
    super(`${type}: ${concise}`);

    this.type = type;
    this.payload = norm;

    if (opts?.cause) {
      this.cause = opts?.cause;
    }

    // V8 stack cleanup
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GeniusError);
    }
  }

  toJSON(): {
    type: SdkErrorEnum;
    message: string;
    payload: SdkErrorPayload | undefined;
  } {
    return {
      type: this.type,
      message: this.message, // concise, single-line
      payload: this.payload, // full structured context
    };
  }
}

function normalizePayload(payload: unknown): SdkErrorPayload | undefined {
  if (payload == null) return undefined;

  if (typeof payload === 'string') {
    // Try to parse JSON strings that callers passed previously
    try {
      const parsed = JSON.parse(payload);
      return typeof parsed === 'object' && parsed
        ? (parsed as SdkErrorPayload)
        : { error: payload };
    } catch {
      return { error: payload };
    }
  }

  if (payload instanceof Error) {
    return {
      message: payload.message,
      error: payload.stack || payload.message,
    };
  }

  if (typeof payload === 'object') {
    return payload as SdkErrorPayload;
  }

  // numbers/booleans/etc.
  return { error: String(payload) };
}

// Backward compatible wrapper
export function sdkError(
  errorType: SdkErrorEnum,
  payloadOrMessage?: unknown,
  opts?: { message?: string; cause?: unknown },
): GeniusError {
  return new GeniusError(errorType, payloadOrMessage, opts);
}
