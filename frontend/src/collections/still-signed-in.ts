import { useLocation, useNavigate } from 'react-router';

import { useSession } from '../households';

// Signed out, a heart's press goes through sign-in and comes back with save= on the address, which SaveOnReturn reads.
export const SAVE_PARAM = 'save';

const signInPath = (pathname: string, search: string, slug?: string) => {
  const params = new URLSearchParams(search);
  params.delete(SAVE_PARAM);
  if (slug !== undefined) {
    params.set(SAVE_PARAM, slug);
  }
  const query = params.toString();
  return `/sign-in?next=${encodeURIComponent(`${pathname}${query === '' ? '' : `?${query}`}`)}`;
};

// A 403 means signed out, unless the session says otherwise (a refused CSRF token), when it failed like any other.
export const useStillSignedIn = () => {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { refetch: checkSession } = useSession();

  // Signed out, it goes to sign in and back, with the recipe to save when there is one.
  const stillSignedIn = async (slug?: string) => {
    const { data: account } = await checkSession();
    if (account === null) {
      await navigate(signInPath(pathname, search, slug));
      return false;
    }
    return true;
  };

  return { stillSignedIn, signIn: (slug: string) => navigate(signInPath(pathname, search, slug)) };
};
