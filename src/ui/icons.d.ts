import type { SearchResult } from '../core/contracts.js';

export type IconKey =
  | 'search'
  | 'ask'
  | 'packages'
  | 'notes'
  | 'back'
  | 'forward'
  | 'close'
  | 'download'
  | 'unload'
  | 'retry'
  | 'spinner'
  | 'import'
  | 'graph'
  | 'list'
  | 'document'
  | 'pdf'
  | 'concept'
  | 'statement'
  | 'model'
  | 'respiratory'
  | 'medications'
  | 'pediatrics'
  | 'dentistry'
  | 'infections'
  | 'nephrology'
  | 'reference'
  | 'personal'
  | 'placeholder';

export function iconName(name: IconKey | string): string;
export function iconNameForCategory(category: unknown): string;
export function iconNameForSearchResult(result: Partial<SearchResult>): string;
export function Icon(options?: {
  name?: IconKey | string;
  category?: unknown;
  label?: string;
  className?: string;
  size?: string | number;
}): HTMLElement;

export const icons: Readonly<Record<IconKey, string>>;
export const categoryIconAliases: Readonly<Record<string, string>>;
