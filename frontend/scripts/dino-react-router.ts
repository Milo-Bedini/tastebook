// What pnpm dino:bundle puts in place of react-router: it needs React 19, and nothing navigates on a canvas. A link
// is a plain anchor. A NavLink is current when its target matches the page's path the way react-router's does, so a
// canvas picks a Dock's or TopBarTabs' current tab with history.replaceState(null, '', '/lists') before it renders;
// it's never pending. Stub here anything else from react-router that Dino imports, or the bundle fails.
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

// react-router's NavLink match: the whole path, or without end a path below it, compared ignoring case unless
// caseSensitive.
const matches = (to: string, end: boolean, caseSensitive: boolean) => {
  const [location, target] = [window.location.pathname, to].map((path) =>
    caseSensitive ? path : path.toLowerCase()
  ) as [string, string];
  const boundary = target !== '/' && target.endsWith('/') ? target.length - 1 : target.length;
  return location === target || (!end && location.startsWith(target) && location.charAt(boundary) === '/');
};

const resolve = <T>(value: ByState<T>, state: NavLinkRenderProps): T =>
  typeof value === 'function' ? (value as (state: NavLinkRenderProps) => T)(state) : value;

export const NavLink = ({
  to,
  end = false,
  caseSensitive = false,
  className,
  style,
  children,
  'aria-current': ariaCurrent = 'page',
  ...props
}: NavLinkProps) => {
  const state = { isActive: matches(to, end, caseSensitive), isPending: false, isTransitioning: false };
  return createElement(
    'a',
    {
      ...props,
      href: to,
      'aria-current': state.isActive ? ariaCurrent : undefined,
      className: resolve(className, state),
      style: resolve(style, state)
    },
    resolve(children, state)
  );
};
