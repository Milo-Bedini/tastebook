import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';

const RECIPES_PATH = '/recipes';

type RecipeSearch = { searchText: string; changeSearchText: (text: string) => void };

// The list's address owns the search text, so a field that outlives the list never holds a stale copy.
export const useRecipeSearch = (): RecipeSearch => {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const onList = pathname === RECIPES_PATH;
  // Off the list the field is empty; typing there opens the list with the search, and Back returns to the page.
  const searchText = onList ? (new URLSearchParams(search).get('q') ?? '') : '';

  const changeSearchText = useCallback(
    (text: string) => {
      // On the list the search keeps the filters, so the two combine, and starts again at the first page.
      const params = new URLSearchParams(onList ? search : '');
      params.delete('page');
      if (text === '') {
        params.delete('q');
      } else {
        params.set('q', text);
      }
      const query = params.toString();
      // flushSync renders the address at once, so the controlled field never lags a keystroke.
      void navigate(
        { pathname: RECIPES_PATH, search: query === '' ? '' : `?${query}` },
        { replace: onList, flushSync: true }
      );
    },
    [navigate, onList, search]
  );

  return { searchText, changeSearchText };
};
