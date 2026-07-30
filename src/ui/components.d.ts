import type { IconKey } from './icons.js';

export type ControlVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';
export type CardKind = 'surface' | 'result' | 'package' | 'note' | string;

export function controlClassName(variant?: ControlVariant | string, className?: string, withIcon?: boolean): string;
export function cardClassName(kind?: CardKind, className?: string, interactive?: boolean): string;

export function Button(options?: {
  variant?: ControlVariant;
  icon?: IconKey | string;
  iconLabel?: string;
  text?: unknown;
  className?: string;
  children?: Node | string | number | Array<Node | string | number | null | undefined>;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (event: MouseEvent) => void;
  [attribute: string]: unknown;
}): HTMLButtonElement;

export function Card(options?: {
  kind?: CardKind;
  className?: string;
  interactive?: boolean;
  ariaLabel?: string;
  onActivate?: (event: Event) => void;
  children?: Node | string | number | Array<Node | string | number | null | undefined>;
  [attribute: string]: unknown;
}): HTMLElement;

export function bindRoutedDialog(
  dialog: HTMLDialogElement,
  onFullClose: (reason: 'escape' | 'backdrop') => void,
  options?: { closeOnBackdrop?: boolean },
): () => void;

export const controlVariants: Readonly<Record<ControlVariant, string>>;
