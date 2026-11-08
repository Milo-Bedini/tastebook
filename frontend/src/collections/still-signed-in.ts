import { useLocation, useNavigate } from 'react-router';

import { useSession } from '../households';

// Signed out, a heart's press goes through sign-in and comes back with save= on the address, which SaveOnReturn reads.
export const SAVE_PARAM = 'save';

// Signed out, Save to list goes through sign-in and comes back with its sheet open, as no list is chosen yet.
export const SAVE_TO_LIST_PARAM = 'save-to-list';

// What the page is asked to do on the way back: [SAVE_PARAM, slug] or [SAVE_TO_LIST_PARAM, 'open'].
export type Asked = [name: string, value: string];

const signInPath = (pathname: string, search: string, asked?: Asked) => {
  const params = new URLSearchParams(search);
  params.delete(SAVE_PARAM);
  params.delete(SAVE_TO_LIST_PARAM);
  if (asked !== undefined) {
    params.set(...asked);
  }
  const query = params.toString();
  return `/sign-in?next=${encodeURIComponent(`${pathname}${query === '' ? '' : `?${query}`}`)}`;
};

// A 403 means signed out, unless the session says otherwise (a refused CSRF token), when it failed like any other.
export const useStillSignedIn = () => {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { refetch: checkSession } = useSession();

  const signIn = (asked?: Asked) => navigate(signInPath(pathname, search, asked));

  // Signed out, it goes to sign in and back, asking for what was pressed again when it can.
  const stillSignedIn = async (asked?: Asked) => {
    const { data: account } = await checkSession();
    if (account === null) {
      await signIn(asked);
      return false;
    }
    return true;
  };

  return { stillSignedIn, signIn };
};
