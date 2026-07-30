export interface RoutedDialogController {
  readonly dialog: HTMLDialogElement;
  readonly heading: Element;
  readonly body: Element;
  readonly backButton: Element | null;
  readonly closeButton: Element | null;
  show(): void;
  close(): void;
  setBackAvailable(value: boolean): void;
  replaceHeading(children?: Node | string | number | Array<Node | string | number | null | undefined>): void;
  replaceBody(children?: Node | string | number | Array<Node | string | number | null | undefined>): void;
  appendBody(children?: Node | string | number | Array<Node | string | number | null | undefined>): void;
  scrollTo(selector: string, options?: ScrollIntoViewOptions): boolean;
}

export function createRoutedDialogController(options: {
  dialog: HTMLDialogElement;
  heading: Element;
  body: Element;
}): RoutedDialogController;

export function closeRoutedDialogs(controllers?: readonly RoutedDialogController[]): void;
