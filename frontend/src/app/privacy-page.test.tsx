import { screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import type { components } from '../api/schema';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type CurrentAccount = components['schemas']['CurrentAccount'];

const answerAccount = (account: CurrentAccount['account']) =>
  server.use(http.get('/api/account/', () => HttpResponse.json<CurrentAccount>({ account })));

describe('PrivacyPage', () => {
  it('says what Tastebook keeps, who handles it, how long, your choices and that nothing tracks you', async () => {
    answerAccount(null);
    renderRoute('/privacy');

    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'What Tastebook keeps',
      'Who handles it',
      "How long it's kept",
      'Your choices',
      'No tracking'
    ]);
    expect(screen.getByText('Neon holds the database, in London.')).toBeInTheDocument();
    expect(screen.getByText('A session ends after 30 days without use.')).toBeInTheDocument();
    expect(screen.getByText('Nightly backups keep a copy for up to 30 days.')).toBeInTheDocument();
    expect(screen.getByText('No open or click tracking in emails.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'milobedini64@gmail.com' })[0]).toHaveAttribute(
      'href',
      'mailto:milobedini64@gmail.com'
    );
    expect(
      screen.getByText((_, element) =>
        element?.tagName === 'LI'
          ? element.textContent ===
            'Download your account details, recipes and lists as one file from your account page.'
          : false
      )
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'account page' }).map((link) => link.getAttribute('href'))).toEqual([
      '/account',
      '/account'
    ]);
    await waitFor(() => expect(document.title).toBe('Privacy · Tastebook'));
  });

  it.each([
    ['signed out', null],
    ['signed in', { email: 'sam@example.com', name: 'Sam', unit_system: 'metric' as const }],
    ['signed in before giving a name', { email: 'sam@example.com', name: '', unit_system: 'metric' as const }]
  ])('opens %s, without going to the name page', async (_, account) => {
    answerAccount(account);
    const { router, queryClient } = renderRoute('/privacy');

    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/privacy');
  });
});
