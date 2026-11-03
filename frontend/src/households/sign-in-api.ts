import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  type AuthResult,
  type CodeFlow,
  confirmSignInCode,
  confirmTwoFactorCode,
  fetchProviders,
  fetchSignInState,
  goToProvider,
  requestCode,
  signUp,
  verifyEmail
} from './auth-api';
import { forgetSignedInData, SESSION_KEY } from './session-api';

type Rejected = Extract<AuthResult, { kind: 'rejected' }>;

export type CodeRequest = Extract<AuthResult, { kind: 'code-sent' | 'limited' }> | Rejected;

type SignedIn = Extract<AuthResult, { kind: 'signed-in' }>;

export type CodeConfirmation = SignedIn | Extract<AuthResult, { kind: 'two-factor' }> | Rejected;

export type TwoFactorConfirmation = SignedIn | Rejected;

// The page shows only these outcomes; anything else allauth answers is treated like a failed request.
const unexpected = (result: AuthResult): Error => new Error(`Unexpected sign-in answer: ${result.kind}`);

const signedIn = (queryClient: QueryClient) =>
  Promise.all([forgetSignedInData(queryClient), queryClient.invalidateQueries({ queryKey: SESSION_KEY })]);

const isUnknownEmail = (result: AuthResult): boolean =>
  result.kind === 'rejected' && result.status === 400 && result.errors[0]?.code === 'unknown_email';

// One email field for both: an address with no account signs up instead, which emails a code to check it.
export const useRequestCode = () =>
  useMutation({
    mutationFn: async (email: string): Promise<CodeRequest> => {
      const requested = await requestCode(email);
      const result = isUnknownEmail(requested) ? await signUp(email) : requested;
      if (result.kind === 'code-sent' || result.kind === 'limited' || result.kind === 'rejected') {
        return result;
      }
      throw unexpected(result);
    }
  });

export const useConfirmCode = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ flow, code }: { flow: CodeFlow; code: string }): Promise<CodeConfirmation> => {
      const result = flow === 'login_by_code' ? await confirmSignInCode(code) : await verifyEmail(code);
      if (result.kind === 'signed-in' || result.kind === 'two-factor' || result.kind === 'rejected') {
        return result;
      }
      throw unexpected(result);
    },
    onSuccess: (result) => (result.kind === 'signed-in' ? signedIn(queryClient) : undefined)
  });
};

export const useConfirmTwoFactorCode = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string): Promise<TwoFactorConfirmation> => {
      const result = await confirmTwoFactorCode(code);
      if (result.kind === 'signed-in' || result.kind === 'rejected') {
        return result;
      }
      throw unexpected(result);
    },
    onSuccess: (result) => (result.kind === 'signed-in' ? signedIn(queryClient) : undefined)
  });
};

// Back from Google, a staff account is signed in up to its second factor; a failed check counts as not, as with
// the providers below, since the email step is the way in either way.
export const useSignInState = (isBackFromGoogle: boolean) => {
  const { data, isPending } = useQuery({
    queryKey: ['households', 'sign-in-state'],
    queryFn: fetchSignInState,
    enabled: isBackFromGoogle,
    retry: false
  });
  return { isChecking: isBackFromGoogle && isPending, needsTwoFactor: data?.kind === 'two-factor' };
};

// Google is offered only once the server says it's set up; while it's asked, or if asking fails, the email code is
// the way in, so neither has a state of its own.
export const useGoogleSignIn = () => {
  const { data: providers } = useQuery({ queryKey: ['households', 'providers'], queryFn: fetchProviders });
  const { mutate, reset, isPending, isError } = useMutation({
    mutationFn: (callbackUrl: string) => goToProvider('google', callbackUrl)
  });
  return {
    isOffered: providers?.some(({ id }) => id === 'google') ?? false,
    goToGoogle: mutate,
    reset,
    isGoing: isPending,
    isUnreachable: isError
  };
};
