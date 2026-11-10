import { type Query, type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import { type Account, signOut } from './auth-api';

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

// What every other area fetched depends on who's signed in (a household's private recipes).
const signedInData = { predicate: ({ queryKey }: Query) => queryKey[0] !== 'households' };

// Everything else under 'households' belongs to whoever was signed in (the household, the account-deletion numbers),
// so it goes without being listed; the session is the callers' to set or ask again.
const signedInHouseholdsData = {
  predicate: ({ queryKey }: Query) => queryKey[0] === 'households' && queryKey[1] !== SESSION_KEY[1]
};

// Each is fetched again for whoever is signed in now.
export const forgetSignedInData = (queryClient: QueryClient) => {
  queryClient.removeQueries(signedInHouseholdsData);
  return queryClient.resetQueries(signedInData);
};

export const useSignOut = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signOut,
    // A request still on its way would be answered after the session ends, and refused: one whose query takes the
    // signal is dropped first.
    onMutate: () => queryClient.cancelQueries(signedInData),
    // Cancelling put back what they had before; those that had nothing are asked again.
    onError: () => queryClient.refetchQueries({ ...signedInData, type: 'active', stale: true }),
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
