import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { api } from '../api/client';
import type { components } from '../api/schema';
import type { Account } from './auth-api';
import { forgetSignedInData, SESSION_KEY } from './session-api';

export type AccountDeletion = components['schemas']['AccountDeletion'];

export const DELETION_KEY = ['households', 'account-deletion'];

export type DeletionCodeRequest = { kind: 'sent' } | { kind: 'too-many'; retryAfterSeconds: number | undefined };

export type AccountDeletionResult = { kind: 'deleted' } | { kind: 'wrong' } | { kind: 'stopped' };

// Whole seconds from the server's Retry-After; undefined when it's missing or isn't a positive whole number.
const retryAfter = (response: Response): number | undefined => {
  const seconds = Number(response.headers.get('Retry-After'));
  return Number.isInteger(seconds) && seconds > 0 ? seconds : undefined;
};

// What deleting the account would delete and keep, fetched only once the dialog asking is open.
export const useAccountDeletion = (open: boolean) => {
  const { data, errorUpdatedAt, refetch } = useQuery({
    queryKey: DELETION_KEY,
    queryFn: async (): Promise<AccountDeletion> => {
      const { data: deletion, response } = await api.GET('/api/account/deletion/');
      if (deletion === undefined) {
        throw new Error(`Checking what deleting removes failed with ${response.status}`);
      }
      return deletion;
    },
    enabled: open
  });
  return { deletion: data, errorUpdatedAt, refetch };
};

export const useSendDeletionCode = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<DeletionCodeRequest> => {
      const { response } = await api.POST('/api/account/deletion/code/');
      if (response.status === 204) {
        return { kind: 'sent' };
      }
      if (response.status === 429) {
        return { kind: 'too-many', retryAfterSeconds: retryAfter(response) };
      }
      // Signed out, or staff since the dialog opened: the session is asked again.
      if (response.status === 403) {
        void queryClient.invalidateQueries({ queryKey: SESSION_KEY });
      }
      throw new Error(`Sending a deletion code failed with ${response.status}`);
    }
  });
};

export const useDeleteAccount = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (code: string): Promise<AccountDeletionResult> => {
      const { response } = await api.POST('/api/account/deletion/', { body: { code } });
      if (response.status === 204) {
        return { kind: 'deleted' };
      }
      if (response.status === 400) {
        return { kind: 'wrong' };
      }
      if (response.status === 409) {
        return { kind: 'stopped' };
      }
      if (response.status === 403) {
        void queryClient.invalidateQueries({ queryKey: SESSION_KEY });
      }
      throw new Error(`Deleting the account failed with ${response.status}`);
    },
    onSuccess: async (result) => {
      if (result.kind !== 'deleted') {
        return;
      }
      // Home before the session says signed out, or the account page would send them on to sign in.
      await navigate('/', { replace: true, flushSync: true });
      queryClient.setQueryData<Account | null>(SESSION_KEY, null);
      await forgetSignedInData(queryClient);
    }
  });
};
