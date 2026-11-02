import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import type { components } from '../api/schema';
import { HOUSEHOLD_KEY, type Household } from './household-api';

export type Invite = components['schemas']['Invite'];

// The join page (TAS-110) answers at /join/<token>.
export const inviteAddress = (token: string): string => `${window.location.origin}/join/${token}`;

// A 404 means the caller was moved out of the household meanwhile, so the page is showing one that isn't theirs.
export type InviteChange = { kind: 'changed'; household: Household } | { kind: 'moved' };

export const useMakeInvite = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<InviteChange> => {
      const { data, response } = await api.POST('/api/household/invite/');
      if (data !== undefined) {
        return { kind: 'changed', household: data };
      }
      if (response.status === 404) {
        return { kind: 'moved' };
      }
      throw new Error(`Making an invite link failed with ${response.status}`);
    },
    onSuccess: (result) =>
      result.kind === 'changed'
        ? queryClient.setQueryData<Household>(HOUSEHOLD_KEY, result.household)
        : queryClient.invalidateQueries({ queryKey: HOUSEHOLD_KEY })
  });
};

export const useCancelInvite = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<InviteChange> => {
      const { data, response } = await api.DELETE('/api/household/invite/');
      if (data !== undefined) {
        return { kind: 'changed', household: data };
      }
      if (response.status === 404) {
        return { kind: 'moved' };
      }
      throw new Error(`Cancelling the invite link failed with ${response.status}`);
    },
    onSuccess: (result) =>
      result.kind === 'changed'
        ? queryClient.setQueryData<Household>(HOUSEHOLD_KEY, result.household)
        : queryClient.invalidateQueries({ queryKey: HOUSEHOLD_KEY })
  });
};
