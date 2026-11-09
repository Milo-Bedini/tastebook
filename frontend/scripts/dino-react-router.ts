// What pnpm dino:bundle puts in place of react-router: it needs React 19, and nothing navigates on a canvas. A link
// is a plain anchor, and a NavLink one that's never active. Stub here anything else from react-router that Dino
// imports, or the bundle fails.
import { type AnchorHTMLAttributes, type CSSProperties, createElement, type ReactNode } from 'react';

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string };

type NavLinkRenderProps = { isActive: boolean; isPending: boolean; isTransitioning: boolean };
type ByState<T> = T | ((state: NavLinkRenderProps) => T);

type NavLinkProps = Omit<LinkProps, 'className' | 'style' | 'children'> & {
  end?: boolean;
  caseSensitive?: boolean;
  className?: ByState<string | undefined>;
  style?: ByState<CSSProperties | undefined>;
  children?: ByState<ReactNode>;
};

export const Link = ({ to, ...props }: LinkProps) => createElement('a', { ...props, href: to });

const inactive: NavLinkRenderProps = { isActive: false, isPending: false, isTransitioning: false };
const resolve = <T>(value: ByState<T>): T =>
  typeof value === 'function' ? (value as (state: NavLinkRenderProps) => T)(inactive) : value;

export const NavLink = ({
  to,
  end: _end,
  caseSensitive: _caseSensitive,
  className,
  style,
  children,
  ...props
}: NavLinkProps) =>
  createElement('a', { ...props, href: to, className: resolve(className), style: resolve(style) }, resolve(children));
