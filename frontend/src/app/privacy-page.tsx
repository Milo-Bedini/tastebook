import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { Page } from '../dino';

const PRIVACY_ADDRESS = 'milobedini64@gmail.com';

const section = 'flex flex-col gap-3';
const list = 'flex list-disc flex-col gap-2 pl-6';

const Section = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <section aria-labelledby={id} className={section}>
    <h2 id={id}>{title}</h2>
    {children}
  </section>
);

const WriteTo = () => <a href={`mailto:${PRIVACY_ADDRESS}`}>{PRIVACY_ADDRESS}</a>;

export const PrivacyPage = () => (
  <Page>
    <title>Privacy · Tastebook</title>
    <h1>Privacy</h1>
    <div className="flex max-w-prose flex-col gap-8">
      <p>
        Tastebook keeps only what it needs to run your household's recipe book. This page says what that is, who handles
        it, how long it's kept and how to have it back or deleted.
      </p>
      <Section id="privacy-keeps" title="What Tastebook keeps">
        <ul className={list}>
          <li>Your email address, to sign you in and to send you sign-in codes and notices about your recipes.</li>
          <li>Your name, shown on the recipes you write.</li>
          <li>Which household you're in, and who else is in it.</li>
          <li>Your recipes, lists and photos.</li>
          <li>Your sessions: which browsers are signed in as you.</li>
          <li>Your unit system: metric or US customary.</li>
          <li>
            If you sign in with Google: your Google account's ID, its email address and your first name. Nothing else
            from your Google profile.
          </li>
          <li>
            When you ask for a sign-in code: your IP address and a scrambled copy of your email address, for 10 minutes,
            so nobody can send too many codes. They're cleared that night.
          </li>
        </ul>
      </Section>
      <Section id="privacy-handles" title="Who handles it">
        <p>These companies handle it for Tastebook, only to run it:</p>
        <ul className={list}>
          <li>Vercel hosts Tastebook.</li>
          <li>Neon holds the database, in London.</li>
          <li>Resend sends sign-in codes and notices by email, from Ireland.</li>
          <li>Google, only if you sign in with Google.</li>
          <li>Sentry receives error reports, in the EU, without your IP address, cookies or what you typed.</li>
          <li>Wikimedia Commons serves recipe photos, so it sees your IP address when a photo loads.</li>
        </ul>
      </Section>
      <Section id="privacy-how-long" title="How long it's kept">
        <ul className={list}>
          <li>A session ends after 30 days without use.</li>
          <li>Everything else is kept for as long as your account exists.</li>
          <li>
            Deleting your account removes your email address, name, sessions, Favourites, personal lists and the private
            recipes you wrote. Public recipes you wrote stay, credited to "a former member", so links to them keep
            working. Your household carries on if anyone is left in it.
          </li>
          <li>Nightly backups keep a copy for up to 30 days.</li>
        </ul>
      </Section>
      <Section id="privacy-choices" title="Your choices">
        <ul className={list}>
          <li>
            Change your name and unit system on your <Link to="/account">account page</Link>.
          </li>
          <li>
            Download your account details, recipes and lists as one file from your{' '}
            <Link to="/account">account page</Link>.
          </li>
          <li>
            To have a copy of anything else Tastebook keeps about you, such as your sessions, or to have your account
            deleted, write to <WriteTo />. Your account page will offer deleting soon.
          </li>
          <li>
            Write to <WriteTo /> with any question about your data. If you're unhappy with the answer, you can complain
            to the <a href="https://ico.org.uk/make-a-complaint/">Information Commissioner's Office</a>.
          </li>
        </ul>
      </Section>
      <Section id="privacy-no-tracking" title="No tracking">
        <ul className={list}>
          <li>No advertising.</li>
          <li>No analytics cookies. The only cookies keep you signed in and protect your forms.</li>
          <li>No open or click tracking in emails.</li>
        </ul>
      </Section>
    </div>
  </Page>
);
