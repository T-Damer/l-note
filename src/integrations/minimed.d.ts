import type { SearchResult } from '../core/contracts.js';

export interface MiniMedResult<T> {
  ok: boolean;
  value?: T;
  error?: unknown;
}

export interface MiniMedMedicalCoreLike {
  search(request: Record<string, unknown>): Promise<MiniMedResult<unknown> | unknown>;
  analyzeQuery?(request: Record<string, unknown>): Promise<MiniMedResult<unknown> | unknown>;
  getCapabilities?(): Promise<MiniMedResult<unknown> | unknown>;
}

export interface MiniMedAdapterOptions {
  packId?: string;
  packTitle?: string;
  sourceTitle?: string;
  mode?: string;
  includeSuggestions?: boolean;
}

export interface AsyncMiniMedSearchAdapter {
  readonly id: 'minimed-medical-core';
  readonly kind: string;
  readonly asynchronous: true;
  search(query: string, options?: Record<string, unknown>): Promise<readonly SearchResult[]>;
  suggest(query: string, limit?: number): Promise<readonly string[]>;
  capabilities(): Promise<Record<string, unknown>>;
}

export function mapMiniMedSearchResponse(response: unknown, options?: MiniMedAdapterOptions): readonly SearchResult[];
export function createMiniMedMedicalCoreAdapter(
  medicalCore: MiniMedMedicalCoreLike,
  options?: MiniMedAdapterOptions,
): AsyncMiniMedSearchAdapter;
