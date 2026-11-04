import { type FormEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';

import { Banner, Button, Field, Input, Loading, Page } from '../dino';
import type { CodeFlow } from './auth-api';
import { isServerPage, safeNextPath } from './safe-next-path';
import { useSession } from './session-api';
import {
  useConfirmCode,
  useConfirmTwoFactorCode,
  useGoogleSignIn,
  useRequestCode,
  useSignInState
} from './sign-in-api';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_PATTERN = /^\d{6}$/;
// An authenticator app's code, or a recovery code.
const TWO_FACTOR_CODE_PATTERN = /^(\d{6}|\d{8})$/;

const NOT_AN_ADDRESS = 'Enter your email address, like sam@example.com.';
const NOT_A_CODE = 'Enter the 6-digit code from the email, like 123456.';
const WRONG_CODE = "That code isn't right. Check the email and try again.";
const STOPPED = 'That code has stopped working. Use a different email or send a new code from step 1.';
const NOT_A_TWO_FACTOR_CODE =
  'Enter the 6-digit code from your authenticator app, like 123456, or an 8-digit recovery code.';
const WRONG_TWO_FACTOR_CODE = "That code isn't right. Check the app and try again.";
const TOO_MANY_TWO_FACTOR_CODES = "You've tried too many codes. Wait a few minutes and try again.";
const TIMED_OUT = 'That sign-in has timed out. Start again from step 1.';

const minutes = (seconds: number): string => {
  const count = Math.ceil(seconds / 60);
  return count === 1 ? '1 minute' : `${count} minutes`;
};

const tooManyCodes = (retryAfterSeconds: number | undefined): string =>
  `You've asked for too many codes. Try again in ${retryAfterSeconds === undefined ? 'a few minutes' : minutes(retryAfterSeconds)}.`;

// No action of its own: the form's main button is the retry.
const Unreachable = () => (
  <Banner tone="danger" title="Couldn't reach Tastebook">
    Check your connection and try again.
  </Banner>
);

// allauth sends someone back from Google with ?error= when signing in there didn't work, cancelled included.
const GoogleRefused = () => (
  <Banner tone="danger" title="Couldn't sign in with Google">
    Try again, or use an email code instead.
  </Banner>
);

const actions = 'flex flex-wrap items-start gap-2';

type EmailStepProps = {
  email: string;
  onEmailChange: (email: string) => void;
  emailRef: RefObject<HTMLInputElement | null>;
  onCodeSent: (email: string, flow: CodeFlow) => void;
  next: string;
  isGoogleRefused: boolean;
  onDismissGoogleRefused: () => void;
};

const EmailStep = ({
  email,
  onEmailChange,
  emailRef,
  onCodeSent,
  next,
  isGoogleRefused,
  onDismissGoogleRefused
}: EmailStepProps) => {
  const requestCode = useRequestCode();
  const google = useGoogleSignIn();
  const [error, setError] = useState<string>();
  const [isUnreachable, setIsUnreachable] = useState(false);

  const refuse = (message: string) => {
    setError(message);
    emailRef.current?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    setIsUnreachable(false);
    onDismissGoogleRefused();
    google.reset();
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) {
      refuse(NOT_AN_ADDRESS);
      return;
    }
    try {
      const result = await requestCode.mutateAsync(address);
      if (result.kind === 'code-sent') {
        onCodeSent(address, result.flow);
        return;
      }
      if (result.kind === 'limited') {
        refuse(tooManyCodes(result.retryAfterSeconds));
        return;
      }
      refuse(result.errors[0]?.message ?? NOT_AN_ADDRESS);
    } catch {
      setIsUnreachable(true);
    }
  };

  const goToGoogle = () => {
    setIsUnreachable(false);
    onDismissGoogleRefused();
    google.goToGoogle(`/sign-in?next=${encodeURIComponent(next)}&via=google`);
  };

  return (
    <>
      <h1>Sign in</h1>
      <p>We'll email you a 6-digit code. New to Tastebook? The same code makes your account.</p>
      {(isUnreachable || google.isUnreachable) && <Unreachable />}
      {isGoogleRefused && <GoogleRefused />}
      <form noValidate onSubmit={submit} className="flex flex-col gap-6">
        <Field label="Email address" error={error}>
          {(control) => (
            <Input
              {...control}
              ref={emailRef}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
            />
          )}
        </Field>
        <div className={actions}>
          <Button type="submit" loading={requestCode.isPending} loadingLabel="Sending…">
            Send code
          </Button>
        </div>
      </form>
      {google.isOffered && (
        <div className={actions}>
          <Button variant="secondary" loading={google.isGoing} loadingLabel="Going to Google…" onClick={goToGoogle}>
            Continue with Google
          </Button>
        </div>
      )}
    </>
  );
};

type CodeStepProps = {
  email: string;
  flow: CodeFlow;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onSignedIn: () => void;
  onTwoFactor: () => void;
  onDifferentEmail: () => void;
};

const CodeStep = ({ email, flow, headingRef, onSignedIn, onTwoFactor, onDifferentEmail }: CodeStepProps) => {
  const confirmCode = useConfirmCode();
  const codeRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [isUnreachable, setIsUnreachable] = useState(false);

  const refuse = (message: string) => {
    setError(message);
    codeRef.current?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    setIsUnreachable(false);
    if (!CODE_PATTERN.test(code)) {
      refuse(NOT_A_CODE);
      return;
    }
    try {
      const result = await confirmCode.mutateAsync({ flow, code });
      if (result.kind === 'signed-in') {
        onSignedIn();
        return;
      }
      if (result.kind === 'two-factor') {
        onTwoFactor();
        return;
      }
      if (result.status === 409) {
        refuse(STOPPED);
        return;
      }
      refuse(result.errors[0]?.code === 'incorrect_code' ? WRONG_CODE : (result.errors[0]?.message ?? WRONG_CODE));
    } catch {
      setIsUnreachable(true);
    }
  };

  return (
    <>
      <h1 ref={headingRef} tabIndex={-1}>
        Check your email
      </h1>
      <p>
        We sent a 6-digit code to <span className="font-extrabold [overflow-wrap:anywhere]">{email}</span>. It works for
        10 minutes.
      </p>
      {isUnreachable && <Unreachable />}
      <form noValidate onSubmit={submit} className="flex flex-col gap-6">
        <Field label="Code" error={error}>
          {(control) => (
            <Input
              {...control}
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          )}
        </Field>
        <div className={actions}>
          <Button type="submit" loading={confirmCode.isPending} loadingLabel="Signing in…">
            Sign in
          </Button>
          <Button variant="secondary" onClick={onDifferentEmail}>
            Use a different email
          </Button>
        </div>
      </form>
    </>
  );
};

type TwoFactorStepProps = {
  headingRef: RefObject<HTMLHeadingElement | null>;
  onSignedIn: () => void;
  onStartAgain: () => void;
};

const twoFactorRefusal = (status: 400 | 409, error: { code: string; message: string } | undefined): string => {
  if (status === 409) {
    return TIMED_OUT;
  }
  if (error?.code === 'incorrect_code') {
    return WRONG_TWO_FACTOR_CODE;
  }
  if (error?.code === 'too_many_login_attempts') {
    return TOO_MANY_TWO_FACTOR_CODES;
  }
  return error?.message ?? WRONG_TWO_FACTOR_CODE;
};

const TwoFactorStep = ({ headingRef, onSignedIn, onStartAgain }: TwoFactorStepProps) => {
  const confirmCode = useConfirmTwoFactorCode();
  const codeRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [isUnreachable, setIsUnreachable] = useState(false);

  const refuse = (message: string) => {
    setError(message);
    codeRef.current?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    setIsUnreachable(false);
    if (!TWO_FACTOR_CODE_PATTERN.test(code)) {
      refuse(NOT_A_TWO_FACTOR_CODE);
      return;
    }
    try {
      const result = await confirmCode.mutateAsync(code);
      if (result.kind === 'signed-in') {
        onSignedIn();
        return;
      }
      refuse(twoFactorRefusal(result.status, result.errors[0]));
    } catch {
      setIsUnreachable(true);
    }
  };

  return (
    <>
      <h1 ref={headingRef} tabIndex={-1}>
        Enter your two-factor code
      </h1>
      <p>
        Open your authenticator app and enter the 6-digit code for Tastebook. Lost your phone? Enter one of your
        recovery codes instead.
      </p>
      {isUnreachable && <Unreachable />}
      <form noValidate onSubmit={submit} className="flex flex-col gap-6">
        <Field label="Code" error={error}>
          {(control) => (
            <Input
              {...control}
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          )}
        </Field>
        <div className={actions}>
          <Button type="submit" loading={confirmCode.isPending} loadingLabel="Signing in…">
            Sign in
          </Button>
          <Button variant="secondary" onClick={onStartAgain}>
            Start again
          </Button>
        </div>
      </form>
    </>
  );
};

// The browser leaves the app for a page Django serves, which is the outside system this effect syncs with.
const LeaveForServerPage = ({ to }: { to: string }) => {
  useEffect(() => window.location.replace(to), [to]);
  return (
    <Page>
      <Loading>Opening the admin…</Loading>
    </Page>
  );
};

type Step = { name: 'email' } | { name: 'code'; email: string; flow: CodeFlow } | { name: 'two-factor' };

export const SignInPage = () => {
  const { account } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const emailRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [email, setEmail] = useState('');
  const [chosenStep, setChosenStep] = useState<Step>();
  const next = safeNextPath(searchParams.get('next'));
  const signInState = useSignInState(searchParams.get('via') === 'google');

  if (account) {
    return isServerPage(next) ? <LeaveForServerPage to={next} /> : <Navigate to={next} replace />;
  }

  if (chosenStep === undefined && signInState.isChecking) {
    return (
      <Page>
        <title>Sign in · Tastebook</title>
        <Loading>Signing you in…</Loading>
      </Page>
    );
  }

  const step: Step = chosenStep ?? (signInState.needsTwoFactor ? { name: 'two-factor' } : { name: 'email' });

  // Focus follows the step, so a screen reader reads the new heading and the address the code went to.
  const showCodeStep = (sentTo: string, flow: CodeFlow) => {
    flushSync(() => setChosenStep({ name: 'code', email: sentTo, flow }));
    headingRef.current?.focus();
  };

  const showTwoFactorStep = () => {
    flushSync(() => setChosenStep({ name: 'two-factor' }));
    headingRef.current?.focus();
  };

  // A server page is left once the session's refetch brings the account, above.
  const goToNext = () => (isServerPage(next) ? undefined : void navigate(next, { replace: true }));

  const dismissGoogleRefused = () => {
    if (searchParams.has('error')) {
      setSearchParams({ next }, { replace: true });
    }
  };

  const showEmailStep = () => {
    flushSync(() => setChosenStep({ name: 'email' }));
    emailRef.current?.focus();
  };

  return (
    <Page>
      <title>Sign in · Tastebook</title>
      <div className="flex max-w-100 flex-col gap-6">
        {step.name === 'email' && (
          <EmailStep
            email={email}
            onEmailChange={setEmail}
            emailRef={emailRef}
            onCodeSent={showCodeStep}
            next={next}
            isGoogleRefused={searchParams.has('error')}
            onDismissGoogleRefused={dismissGoogleRefused}
          />
        )}
        {step.name === 'code' && (
          <CodeStep
            email={step.email}
            flow={step.flow}
            headingRef={headingRef}
            onSignedIn={goToNext}
            onTwoFactor={showTwoFactorStep}
            onDifferentEmail={showEmailStep}
          />
        )}
        {step.name === 'two-factor' && (
          <TwoFactorStep headingRef={headingRef} onSignedIn={goToNext} onStartAgain={showEmailStep} />
        )}
        <p>
          <Link to="/privacy">How Tastebook uses your data</Link>
        </p>
      </div>
    </Page>
  );
};
