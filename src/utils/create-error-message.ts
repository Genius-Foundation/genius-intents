import { AxiosError } from 'axios';
import { ProtocolEnum } from '../types/enums';

type ErrorPayload = {
  protocol: ProtocolEnum;
  message: string;
  error: string; // concise, user-facing
};

// ---- per-aggregator parsers ----
function extractOdosError(data: unknown): string | undefined {
  // Odos typically returns: { detail: string, traceId?: string, errorCode?: number }
  if (!data) return undefined;
  if (typeof data === 'string') return data;

  try {
    const obj = typeof data === 'object' ? (data as unknown) : JSON.parse(String(data));
    if (typeof obj?.detail === 'string' && obj.detail.trim()) return obj.detail.trim();
    if (typeof obj?.message === 'string' && obj.message.trim()) return obj.message.trim();
    if (typeof obj?.error === 'string' && obj.error.trim()) return obj.error.trim();
  } catch {
    /* ignore JSON parse errors */
  }

  return undefined;
}

// Add more extractors as you integrate other aggregators
const protocolExtractors: Record<string, (data: unknown) => string | undefined> = {
  odos: extractOdosError,
  // 'kyberswap': extractKyberError,
  // '0x': extractZeroXError,
  // etc.
};

// ---- generic helpers ----
function stringifyDataCompact(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export function createErrorMessage(error: unknown, protocol: ProtocolEnum): ErrorPayload {
  // default scaffold
  const payload: ErrorPayload = {
    protocol,
    message: `Failed to fetch swap price from ${protocol}`,
    error: 'Unknown error',
  };

  // Axios branch: try protocol-specific first
  if (error instanceof AxiosError) {
    const data = error.response?.data;
    const protoKey = (protocol || '').toLowerCase();

    // 1) Try a protocol-specific concise message
    const extractor = protocolExtractors[protoKey];
    const concise = (extractor && extractor(data)) || error.response?.statusText || error.message;

    payload.error = concise?.trim() || 'Unknown error';

    return payload;
  }

  // Non-Axios fallbacks
  if (error instanceof Error) {
    payload.error = error.message;
    return payload;
  }
  if (typeof error === 'string') {
    payload.error = error;
    return payload;
  }

  payload.error = stringifyDataCompact(error);
  return payload;
}
