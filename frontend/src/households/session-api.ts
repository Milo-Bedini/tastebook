import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import { type Account, signOut } from './auth-api';
import { forgetHousehold } from './household-api';

export const SESSION_KEY = ['households', 'session'];

// Null is signed out; undefined while the session is being checked or couldn't be.
export const useSession = () => {
  const { data, isPending, isError, errorUpdatedAt, refetch } = useQuery({
    queryKey: SESSION_KEY,
    queryFn: async (): Promise<Account | null> => {
      const { data: current, error } = await api.GET('/api/account/');
      if (error || !current) {
        throw new Error('Session check failed');
      }
      return current.account;
    }
  });
  return { account: data, isPending, isError, errorUpdatedAt, refetch };
};

// The `enabled` of a query only someone signed in may make. Signing out resets every query before the page re-renders
// signed out, so it reads the session again when the query would be fetched; the account the page rendered with is
// what makes the query fetch once someone signs in.
export const useSignedInOnly = () => {
  const { account } = useSession();
  const queryClient = useQueryClient();
  return () => Boolean(account) && Boolean(queryClient.getQueryData<Account | null>(SESSION_KEY));
};

// What every other area fetched depends on who's signed in (a household's private recipes), so it's fetched again.
export const forgetSignedInData = (queryClient: QueryClient) => {
  forgetHousehold(queryClient);
  return queryClient.resetQueries({ predicate: ({ queryKey }) => queryKey[0] !== 'households' });
};

export const useSignOut = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signOut,
    // allauth's signed-in user has no name, so a sign out that left someone signed in asks the account again.
    onSuccess: async (result) => {
      if (result.kind === 'signed-in') {
        return queryClient.invalidateQueries({ queryKey: SESSION_KEY });
      }
      queryClient.setQueryData<Account | null>(SESSION_KEY, null);
      return forgetSignedInData(queryClient);
    }
  });
};
