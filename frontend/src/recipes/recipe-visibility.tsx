import { useState } from 'react';
import { useNavigate } from 'react-router';

import type { components } from '../api/schema';
import { ConfirmDialog, Switch, toast } from '../dino';
import { useSession } from '../households';
import { publishingGaps } from './recipe-gaps';
import { useSetVisibility } from './recipes-api';

type Recipe = components['schemas']['Recipe'];
type Visibility = components['schemas']['Visibility'];

// What disables the switch, if anything: a request running, a report being reviewed, or a gap that keeps the recipe
// from going public.
const disabledReasonOf = (recipe: Recipe, saving: boolean) => {
  if (saving) {
    return 'Saving…';
  }
  // Held public while a report is open, so it can't slip out of review and back in.
  if (recipe.hidden_for_review) {
    return 'You can change this once staff have reviewed the report.';
  }
  // A public recipe can always go private, whatever it lacks.
  if (recipe.visibility === 'private' && publishingGaps(recipe).length > 0) {
    return "Add what's missing before making it public.";
  }
  return undefined;
};

// Only its author sees it (can_publish). Publishing asks first; making it private acts at once, and turning it on
// again is the undo.
export const RecipeVisibility = ({ recipe }: { recipe: Recipe }) => {
  const setVisibility = useSetVisibility(recipe.slug);
  const { account, refetch: checkSession } = useSession();
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  const failed = `Couldn't change who can see ${recipe.title}. Check your connection and try again.`;
  const disabledReason = disabledReasonOf(recipe, setVisibility.isPending);

  const change = async (visibility: Visibility) => {
    try {
      const result = await setVisibility.mutateAsync(visibility);
      // The switch moves only now, so the dialog closes with it and gives focus back to it.
      setAsking(false);
      if (result.kind === 'changed') {
        toast.success(
          result.recipe.visibility === 'public' ? `${recipe.title} is public` : `${recipe.title} is private again`
        );
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
      setAsking(true);
      return;
    }
    void change('private');
  };

  return (
    <div className="sm:max-w-100">
      <Switch
        checked={recipe.visibility === 'public'}
        onCheckedChange={turn}
        disabled={disabledReason !== undefined}
        disabledReason={disabledReason ?? ''}
      >
        Public
      </Switch>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        tone="primary"
        pending={setVisibility.isPending}
        pendingLabel="Making public…"
        title="Make this recipe public?"
        description={`Anyone can find ${recipe.title}, credited “by ${account?.name ?? ''}”, and only you will be able to edit it. You can make it private again.`}
        confirmLabel="Make public"
        onConfirm={() => void change('public')}
      />
    </div>
  );
};
