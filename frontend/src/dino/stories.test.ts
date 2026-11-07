import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Parts no area imports (index.ts doesn't export them), each drawn in full by the stories of the component built on it.
const drawnByAnotherComponentsStories: Record<string, string> = {
  'alert-dialog.tsx': "ConfirmDialog's dialog parts: its Open, Keep Label and Pending stories show them",
  'checkbox.tsx': "CheckboxRow's box: its stories show it off, on, hovered, pressed and focused",
  'photo-filler.tsx': "RecipePhoto's drawing when there's no photo: its Place Setting and Rug stories show both"
};

const files = readdirSync(import.meta.dirname);
const components = files.filter((file) => file.endsWith('.tsx') && !/\.(stories|test)\.tsx$/.test(file));
const withoutStories = components.filter((file) => !files.includes(file.replace(/\.tsx$/, '.stories.tsx')));

describe('Dino components', () => {
  it('each have a *.stories.tsx beside them', () => {
    const missing = withoutStories.filter((file) => !(file in drawnByAnotherComponentsStories));

    expect(missing, 'Add stories beside these, or say in this test which stories draw them').toEqual([]);
  });

  it('are excused only while they have no stories of their own', () => {
    const stale = Object.keys(drawnByAnotherComponentsStories).filter((file) => !withoutStories.includes(file));

    expect(stale, 'These have stories now, or are gone: remove them from this test').toEqual([]);
  });
});
