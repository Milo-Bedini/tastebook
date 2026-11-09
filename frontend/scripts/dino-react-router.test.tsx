import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NavLink } from './dino-react-router.ts';

type Case = { location: string; to: string; end?: boolean; caseSensitive?: boolean; current: boolean };

describe('the Dino bundle’s NavLink', () => {
  it.each<Case>([
    { location: '/lists', to: '/lists', current: true },
    { location: '/lists/favourites', to: '/lists', current: true },
    { location: '/lists/favourites', to: '/lists', end: true, current: false },
    { location: '/lists', to: '/lists', end: true, current: true },
    { location: '/listings', to: '/lists', current: false },
    { location: '/recipes', to: '/lists', current: false },
    { location: '/recipes', to: '/', current: false },
    { location: '/', to: '/', current: true },
    { location: '/lists/favourites', to: '/lists/', current: true },
    { location: '/Lists', to: '/lists', current: true },
    { location: '/Lists', to: '/lists', caseSensitive: true, current: false }
  ])(
    'at $location, a link to $to (end: $end, caseSensitive: $caseSensitive) is current: $current',
    ({ location, to, end, caseSensitive, current }) => {
      window.history.replaceState(null, '', location);

      render(
        <NavLink
          to={to}
          end={end}
          caseSensitive={caseSensitive}
          className={({ isActive }) => (isActive ? 'current' : 'other')}
        >
          {({ isActive }) => (isActive ? 'Lists (current)' : 'Lists')}
        </NavLink>
      );

      const link = screen.getByRole('link');
      expect([link.textContent, link.className, link.getAttribute('aria-current')]).toEqual(
        current ? ['Lists (current)', 'current', 'page'] : ['Lists', 'other', null]
      );
      expect(link.getAttribute('href')).toBe(to);
    }
  );

  it('keeps a plain className and never shows pending', () => {
    window.history.replaceState(null, '', '/lists');

    render(
      <NavLink
        to="/lists"
        className="tab"
        style={({ isPending, isTransitioning }) => ({ opacity: isPending || isTransitioning ? 0.5 : 1 })}
      >
        Lists
      </NavLink>
    );

    const link = screen.getByRole('link', { name: 'Lists' });
    expect([link.className, link.style.opacity]).toEqual(['tab', '1']);
  });
});
