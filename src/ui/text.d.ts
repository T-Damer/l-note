export type TextVariant = 'eyebrow' | 'display' | 'title' | 'heading' | 'body' | 'muted' | 'caption' | 'label';

export interface TextOptions {
  variant?: TextVariant;
  as?: keyof HTMLElementTagNameMap;
  text?: unknown;
  children?: Node | string | number | Array<Node | string | number | null | undefined>;
  className?: string;
  [attribute: string]: unknown;
}

export function textVariant(name?: TextVariant | string): Readonly<{ tag: string; className: string }>;
export function textClassName(variant?: TextVariant | string, extraClassName?: string): string;
export function Text(options?: TextOptions): HTMLElement;
export const textVariants: Readonly<Record<TextVariant, Readonly<{ tag: string; className: string }>>>;
