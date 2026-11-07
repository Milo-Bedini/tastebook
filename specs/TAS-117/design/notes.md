# TAS-117: Add method steps and equipment to the recipe form

Canvas: https://claude.ai/artifact/SNLdJeYFSJwnHDfkSzZMkS

## Boards

- **Write each step in place** (`Main.dc.html`, 1370 × 1820): the Method section at phone width (390 px), after Ingredients and before Times, on `/recipes/new` and `/recipes/:slug/edit`: as it opens (no equipment chosen, one blank step), filled in (Hob and Oven chosen, three steps, typing in step 2), and Reorder mode after a move.
- **Method: removing, pasting, checking and loading** (`method-states.dc.html`, 1800 × 1340): after removing a step, a pasted method split into steps, Save finding a step the API refuses, and the equipment list loading and failing to load.
- **Text area and filter chip, as they are** (`components.dc.html`, 980 × 1100): Dino's TextArea as a step (rest, hover, focus, error) and FilterChip as equipment (off, hover, focus, on, on and focused), both unchanged.

## Decisions

- Equipment is a fieldset with the legend "Equipment" and the eleven tools from the shared list as untilted filter chips, as Cuisines and Courses are; it loads and fails as those chip groups do. Editing a recipe keeps its chosen equipment while the list loads, and Save keeps it if the list never does.
- A step is a number and a Dino text area. The number (Instrument Serif italic, Pop, 32 px) is the text area's label: "Step 2" to a screen reader, with "Step" visually hidden. Hairlines in Line between steps.
- Steps are typed in place, with no sheet. Enter makes a new line inside a step; "Add a step" appends a blank step and moves focus into it. Blank steps are left out on Save.
- Remove (icon button, "Remove step N") shows on each step once there are two. Removing renumbers the steps after it and moves focus to the step now in its place; removing the last step moves focus to "Add a step". Nothing is asked first.
- Reorder sits at the heading's end once there are two steps and works as Ingredients' does: the button turns into "Done reordering"; each step shows its number, its first two lines, and Move up and Move down (named by number). Every move button stays enabled; a move that can't happen says why ("Step 1 is already first.").
- Pasting text with blank lines into an empty step splits it into one step per paragraph, with focus at the end of the last. A paste into a step with text, or with no blank line, goes in as typed; typing a blank line never splits.
- Every change is announced through the section's one status line: "Removed step 2.", "Pasted 4 steps.", "Moved step 3 up. It's now step 2.", "Step 3 is already last."
- A step the API refuses on Save gets focus and its error under it in Danger, saying how to fix it ("Keep a step to 2,000 characters. Split this one in two."). The limit drawn is a stand-in: the build sets the real one and the message names it.
- A recipe saved with no steps still shows "No method yet" on its page.
- Tablet and laptop keep this shape: the form is one 640 px column from tablets up, so the steps get wider.

## Proposed rule changes

None.

## Components

- TextArea: no change. Its three-line minimum, growth with the text and wrapping are what a step needs.
- FilterChip: no change. Used exactly as for Cuisines and Courses; its "filter" name is a rename for its own change.
