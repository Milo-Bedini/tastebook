// Ingredient names can begin in lower case, but a row, a sheet's title or a heading starts with a capital.
export const capitalise = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
