// Ingredient names and labels are stored in lower case; a list or a heading shows them capitalised.
export const capitalise = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
