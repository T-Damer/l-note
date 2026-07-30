import type { IconKey } from './icons.js';

export type ControlVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';
export type CardKind = 'surface' | 'result' | 'package' | 'note' | string;
export type SwitchElement = HTMLLabelElement & { readonly control: HTMLInputElement };

export function controlClassName(variant?: ControlVariant | string, className?: string, withIcon?: boolean): string;
export function cardClassName(kind?: CardKind, className?: string, interactive?: boolean): string;
export function fieldClassName(className?: string): string;
export function switchClassName(className?: string, disabled?: boolean): string;

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

export function Field(options: {
  label?: string;
  hint?: string;
  control: HTMLElement;
  className?: string;
  required?: boolean;
}): HTMLLabelElement;

export function Switch(options?: {
  label?: string;
  hint?: string;
  input?: HTMLInputElement | null;
  id?: string;
  name?: string;
  checked?: boolean;
  disabled?: boolean;
  className?: string;
  onChange?: (event: Event) => void;
}): SwitchElement;

export function SourceCard(options?: {
  sourceId?: string;
  title?: string;
  type?: string;
  excerpt?: string;
  actionText?: string;
  onOpen?: (event: MouseEvent) => void;
}): HTMLButtonElement;

export function bindRoutedDialog(
  dialog: HTMLDialogElement,
  onFullClose: (reason: 'escape' | 'backdrop') => void,
  options?: { closeOnBackdrop?: boolean },
): () => void;

export const controlVariants: Readonly<Record<ControlVariant, string>>;
