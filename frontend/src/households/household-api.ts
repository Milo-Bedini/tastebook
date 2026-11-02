import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import type { components } from '../api/schema';

export type Household = components['schemas']['Household'];

export type Member = components['schemas']['Member'];

export const HOUSEHOLD_KEY = ['households', 'household'];

// The household belongs to whoever is signed in, so it goes whenever the session changes hands.
export const forgetHousehold = (queryClient: QueryClient) => queryClient.removeQueries({ queryKey: HOUSEHOLD_KEY });

export const HOUSEHOLD_NAME_MAX_LENGTH = 100;

export const NOT_A_HOUSEHOLD_NAME = 'Enter a name for your household, like The Bedinis.';

export type HouseholdRename = { kind: 'saved'; household: Household } | { kind: 'refused'; message: string };

// DRF answers a refused field as {"name": ["…"]}.
const refusal = (body: unknown): string => {
  const messages = typeof body === 'object' && body !== null && 'name' in body ? body.name : undefined;
  return Array.isArray(messages) && typeof messages[0] === 'string' ? messages[0] : NOT_A_HOUSEHOLD_NAME;
};

export const useHousehold = () => {
  const { data, errorUpdatedAt, refetch } = useQuery({
    queryKey: HOUSEHOLD_KEY,
    queryFn: async (): Promise<Household> => {
      const { data: household, response } = await api.GET('/api/household/');
      if (household === undefined) {
        throw new Error(`Getting the household failed with ${response.status}`);
      }
      return household;
    }
  });
  return { household: data, errorUpdatedAt, refetch };
};

export const useRenameHousehold = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<HouseholdRename> => {
      const { data, error, response } = await api.PATCH('/api/household/', { body: { name } });
      if (data !== undefined) {
        return { kind: 'saved', household: data };
      }
      if (response.status === 400) {
        return { kind: 'refused', message: refusal(error) };
      }
      throw new Error(`Renaming the household failed with ${response.status}`);
    },
    onSuccess: (result) =>
      result.kind === 'saved' ? queryClient.setQueryData<Household>(HOUSEHOLD_KEY, result.household) : undefined
  });
};

// A 404 means they'd already gone, or the caller had: either way the household has changed under the page.
export type MemberRemoval = { kind: 'removed'; household: Household } | { kind: 'gone' };

export const useRemoveMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (member: Member): Promise<MemberRemoval> => {
      const { data, response } = await api.DELETE('/api/household/members/{member_id}/', {
        params: { path: { member_id: member.id } }
      });
      if (data !== undefined) {
        return { kind: 'removed', household: data };
      }
      if (response.status === 404) {
        return { kind: 'gone' };
      }
      throw new Error(`Removing a member failed with ${response.status}`);
    },
    onSuccess: (result) =>
      result.kind === 'removed'
        ? queryClient.setQueryData<Household>(HOUSEHOLD_KEY, result.household)
        : queryClient.invalidateQueries({ queryKey: HOUSEHOLD_KEY })
  });
};

export const useLeaveHousehold = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<Household> => {
      const { data, response } = await api.POST('/api/household/leave/');
      if (data === undefined) {
        throw new Error(`Leaving the household failed with ${response.status}`);
      }
      return data;
    },
    onSuccess: (household) => queryClient.setQueryData<Household>(HOUSEHOLD_KEY, household)
  });
};
