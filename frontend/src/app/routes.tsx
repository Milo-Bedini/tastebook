import type { RouteObject } from 'react-router';

import { HouseholdListPage, ListPage, ListsPage } from '../collections';
import { AccountPage, HouseholdPage, JoinPage, NameGate, SignInPage, WelcomePage } from '../households';
import { EditRecipePage, NewRecipePage, RecipePage, RecipesPage } from '../recipes';
import { AppLayout } from './app-layout';
import { HomePage } from './home-page';
import { NotFoundPage } from './not-found-page';
import { PrivacyPage } from './privacy-page';

// The layout route has no path, so every page keeps its address and gets the top bar. The privacy page sits outside
// the name gate, so someone asked for their name can read what it's used for first.
export const routes: RouteObject[] = [
  {
    Component: AppLayout,
    children: [
      {
        Component: NameGate,
        children: [
          { path: '/', Component: HomePage },
          { path: '/recipes', Component: RecipesPage },
          { path: '/recipes/new', Component: NewRecipePage },
          { path: '/recipes/:slug', Component: RecipePage },
          { path: '/recipes/:slug/edit', Component: EditRecipePage },
          { path: '/lists', Component: ListsPage },
          { path: '/lists/household/:slug', Component: HouseholdListPage },
          { path: '/lists/:slug', Component: ListPage },
          { path: '/account', Component: AccountPage },
          { path: '/household', Component: HouseholdPage },
          { path: '/join/:token', Component: JoinPage },
          { path: '/sign-in', Component: SignInPage },
          { path: '/welcome', Component: WelcomePage },
          { path: '*', Component: NotFoundPage }
        ]
      },
      { path: '/privacy', Component: PrivacyPage }
    ]
  }
];
