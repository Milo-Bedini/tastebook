import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';

import { useSession } from '../households';
import { SAVE_PARAM, useHeart } from './use-heart';

// A heart pressed signed out went through sign-in with save=<slug> on its way back; arriving signed in, the save it
// asked for happens once and the address drops it. An effect, as arriving at an address is no event of the app's.
export const SaveOnReturn = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { account } = useSession();
  const heart = useHeart();
  const slug = searchParams.get(SAVE_PARAM);
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (slug === null || !account || asked.current === slug) {
      return;
    }
    asked.current = slug;
    setSearchParams(
      (params) => {
        params.delete(SAVE_PARAM);
        return params;
      },
      { replace: true }
    );
    void heart.add(slug, 'Signed in. ');
  }, [slug, account, heart, setSearchParams]);

  return null;
};
