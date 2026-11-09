import { useMutation } from '@tanstack/react-query';

import { api } from '../api/client';

export type DownloadedFile = { blob: Blob; filename: string };

// The server names the file for the day; this is only for a response whose header the browser hides.
const FALLBACK_FILENAME = 'tastebook.json';

const FILENAME = /filename="([^"]+)"/;

// Fetches everything the account has as one file in the Tastebook format, for the page to save.
export const useDownloadEverything = () =>
  useMutation({
    mutationFn: async (): Promise<DownloadedFile> => {
      const { data, response } = await api.GET('/api/account/download/', { parseAs: 'blob' });
      if (data === undefined) {
        throw new Error(`Downloading everything failed with ${response.status}`);
      }
      const filename = FILENAME.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? FALLBACK_FILENAME;
      return { blob: data, filename };
    }
  });
