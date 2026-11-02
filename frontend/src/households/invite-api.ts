import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import type { components } from '../api/schema';
import { HOUSEHOLD_KEY, type Household } from './household-api';

export type Invite = components['schemas']['Invite'];

// The join page (TAS-110) answers at /join/<token>.
export const inviteAddress = (token: string): string => `${window.location.origin}/join/${token}`;

export const useMakeInvite = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<Household> => {
      const { data, response } = await api.POST('/api/household/invite/');
      if (data === undefined) {
        throw new Error(`Making an invite link failed with ${response.status}`);
      }
      return data;
    },
    onSuccess: (household) => queryClient.setQueryData<Household>(HOUSEHOLD_KEY, household)
  });
};

export const useCancelInvite = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<Household> => {
      const { data, response } = await api.DELETE('/api/household/invite/');
      if (data === undefined) {
        throw new Error(`Cancelling the invite link failed with ${response.status}`);
      }
      return data;
    },
    onSuccess: (household) => queryClient.setQueryData<Household>(HOUSEHOLD_KEY, household)
  });
};
