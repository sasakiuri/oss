import type { ReactNode } from 'react';

interface InlineErrorProps {
  readonly children: ReactNode;
  /** Element panels used for this banner; kept so the document structure does not change. */
  readonly as?: 'p' | 'div';
  readonly size?: 'xs' | '13px';
  readonly role?: 'alert';
}

/** Error text with the left error border used by panels. */
export function InlineError({ children, as: Element = 'p', size = 'xs', role }: InlineErrorProps) {
  return (
    <Element
      role={role}
      className={`border-l-2 border-vscode-error pl-3 ${size === 'xs' ? 'text-xs' : 'text-[13px]'} text-vscode-error`}
    >
      {children}
    </Element>
  );
}
