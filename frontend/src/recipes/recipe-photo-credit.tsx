import type { components } from '../api/schema';

type PhotoCredit = components['schemas']['PhotoCredit'];

type RecipePhotoCreditProps = { credit: PhotoCredit };

export const RecipePhotoCredit = ({ credit }: RecipePhotoCreditProps) => (
  <>
    {`Photo by ${credit.author}, ${credit.licence}, via `}
    {/* On the polaroid's Paper frame, where the base link's Ink text, Field underline and Ink ring would vanish. */}
    <a href={credit.source_url} className="text-on-pastel decoration-on-pastel focus-visible:outline-on-pastel">
      Wikimedia Commons
    </a>
  </>
);
