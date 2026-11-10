import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import type { components } from '../api/schema';
import { HOUSEHOLD_KEY, type Household } from './household-api';

export type JoinInvite = components['schemas']['JoinInvite'];

// Under HOUSEHOLD_KEY: what an invite shows depends on who's signed in, so signing out or in drops it with the rest.
export const inviteKey = (token: string) => [...HOUSEHOLD_KEY, 'invite', token];

export type InviteLookup = { kind: 'found'; invite: JoinInvite } | { kind: 'unknown' };

export const useInvite = (token: string) => {
  const { data, errorUpdatedAt, refetch } = useQuery({
    queryKey: inviteKey(token),
    queryFn: async (): Promise<InviteLookup> => {
      const { data: invite, response } = await api.GET('/api/invites/{token}/', { params: { path: { token } } });
      if (invite !== undefined) {
        return { kind: 'found', invite };
      }
      if (response.status === 404) {
        return { kind: 'unknown' };
      }
      throw new Error(`Opening the invite link failed with ${response.status}`);
    }
  });
  return { lookup: data, errorUpdatedAt, refetch };
};

// 404 and 409 both mean the link stopped working after the page loaded it.
export type JoinResult = { kind: 'joined'; household: Household } | { kind: 'dead' };

export const useJoinHousehold = (token: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<JoinResult> => {
      const { data, response } = await api.POST('/api/invites/{token}/join/', { params: { path: { token } } });
      if (data !== undefined) {
        return { kind: 'joined', household: data };
      }
      if (response.status === 404 || response.status === 409) {
        return { kind: 'dead' };
      }
      throw new Error(`Joining the household failed with ${response.status}`);
    },
    onSuccess: (result) => {
      if (result.kind === 'dead') {
        return queryClient.invalidateQueries({ queryKey: inviteKey(token), exact: true });
      }
      queryClient.setQueryData<Household>(HOUSEHOLD_KEY, result.household);
      queryClient.removeQueries({ queryKey: inviteKey(token), exact: true });
    }
  });
};
