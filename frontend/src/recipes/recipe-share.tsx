import { Copy } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import type { components } from '../api/schema';
import { Button, ConfirmDialog, Field, Input, Switch, toast } from '../dino';
import { useSession } from '../households';
import { useSetShareLink } from './recipes-api';

type Recipe = components['schemas']['Recipe'];

const sharedAddress = (token: string): string => `${window.location.origin}/shared/${token}`;

const copy = async (address: string) => {
  try {
    await navigator.clipboard.writeText(address);
    toast.success('Link copied');
  } catch {
    toast.error("Couldn't copy the link. Select it and copy it yourself.");
  }
};

const SharedAddress = ({ token }: { token: string }) => {
  const address = sharedAddress(token);
  return (
    <div className="flex flex-col gap-3 px-2">
      <Field label="Share link" help="Turn it off and the link stops working.">
        {(control) => (
          <Input
            {...control}
            readOnly
            value={address}
            // The whole address, so "Select it and copy it yourself" is one tap and a copy.
            onFocus={(event) => event.currentTarget.select()}
          />
        )}
      </Field>
      <div className="flex flex-wrap items-start gap-2">
        <Button variant="secondary" onClick={() => copy(address)}>
          <Copy aria-hidden="true" strokeWidth={2.5} />
          Copy link
        </Button>
      </div>
    </div>
  );
};

// Only its author sees it, while the recipe is private (can_share). Turning it on acts at once, and the link appearing
// confirms it; turning it off asks first, as the link it stops won't come back.
export const RecipeShare = ({ recipe }: { recipe: Recipe }) => {
  const setShareLink = useSetShareLink(recipe.slug);
  const { refetch: checkSession } = useSession();
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);

  const change = async (on: boolean) => {
    const failed = `Couldn't turn ${on ? 'on' : 'off'} the share link. Check your connection and try again.`;
    try {
      const result = await setShareLink.mutateAsync(on);
      // The switch moves only now, so the dialog closes with it and gives focus back to it.
      setAsking(false);
      if (result.kind === 'changed') {
        if (!on) {
          toast.success('Share link turned off');
        }
        return;
      }
      if (result.kind === 'refused') {
        toast.error(result.message);
        return;
      }
      if (result.kind === 'gone') {
        toast.info(`${recipe.title} has been deleted, or you can't change it any more.`);
        return;
      }
      const { data: signedIn } = await checkSession();
      if (signedIn === null) {
        await navigate(`/sign-in?next=${encodeURIComponent(`/recipes/${recipe.slug}`)}`);
        return;
      }
      // Still signed in (a refused CSRF token, or the check failing), so nothing else says it wasn't changed.
      toast.error(failed);
    } catch {
      setAsking(false);
      toast.error(failed);
    }
  };

  const turn = (on: boolean) => {
    if (on) {
      void change(true);
      return;
    }
    setAsking(true);
  };

  const saving = setShareLink.isPending;
  return (
    <div className="flex flex-col gap-3 sm:max-w-100">
      <Switch
        checked={recipe.share_token !== null}
        onCheckedChange={turn}
        description="Anyone you send the link to can see this recipe, without signing in. They see nothing else of your household's."
        disabled={saving}
        disabledReason={saving ? 'Saving…' : ''}
      >
        Share by link
      </Switch>
      {recipe.share_token !== null && <SharedAddress token={recipe.share_token} />}
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        pending={setShareLink.isPending}
        pendingLabel="Turning off…"
        title="Turn off the share link?"
        description="Anyone who opens it will be told the recipe isn't found. Turning it on again makes a new link."
        confirmLabel="Turn off link"
        cancelLabel="Keep link"
        onConfirm={() => void change(false)}
      />
    </div>
  );
};
