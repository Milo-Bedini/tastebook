import { useQuery } from '@tanstack/react-query';

import { api } from '../api/client';

// The shared lists a recipe picks from, each fetched once and kept under its own key.
const useChoices = (path: '/api/cuisines/' | '/api/courses/' | '/api/equipment/', key: string) =>
  useQuery({
    queryKey: [key],
    queryFn: async () => {
      const { data, error } = await api.GET(path);
      if (error || !data) {
        throw new Error(`${key} request failed`);
      }
      return data;
    }
  });

export const useCuisines = () => useChoices('/api/cuisines/', 'cuisines');

export const useCourses = () => useChoices('/api/courses/', 'courses');

export const useEquipment = () => useChoices('/api/equipment/', 'equipment');
