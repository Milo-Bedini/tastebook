import { HttpResponse, http } from 'msw';

import type { components } from '../api/schema';

type Course = components['schemas']['Course'];
type Cuisine = components['schemas']['Cuisine'];
type CurrentAccount = components['schemas']['CurrentAccount'];
type Health = components['schemas']['Health'];
type IngredientOption = components['schemas']['IngredientOption'];
type NewIngredient = components['schemas']['NewIngredient'];
type Recipe = components['schemas']['Recipe'];
type RecipeSummary = components['schemas']['RecipeSummary'];

const cuisines: Cuisine[] = [
  { slug: 'french', name: 'French' },
  { slug: 'italian', name: 'Italian' },
  { slug: 'japanese', name: 'Japanese' }
];

const courses: Course[] = [
  { slug: 'dessert', name: 'Dessert' },
  { slug: 'main', name: 'Main' }
];

const ingredients: IngredientOption[] = [
  { slug: 'aubergine', name: 'aubergine', synonyms: ['eggplant'] },
  { slug: 'creme-fraiche', name: 'crème fraîche', synonyms: [] },
  { slug: 'peanuts', name: 'peanuts', synonyms: ['groundnuts'] }
];

const recipes: Recipe[] = [
  {
    id: 1,
    slug: 'apple-tart',
    visibility: 'public',
    title: 'Apple tart',
    description: 'Sharp apples on buttery pastry.',
    cuisines: [{ slug: 'french', name: 'French' }],
    courses: [{ slug: 'dessert', name: 'Dessert' }],
    difficulty: 'medium',
    prep_minutes: 30,
    cook_minutes: 40,
    extra_minutes: 30,
    extra_label: 'chilling',
    total_minutes: 100,
    photo: null,
    diet_tags: [],
    servings: 8,
    yield_amount: null,
    yield_unit: '',
    equipment: [{ slug: 'oven', name: 'Oven' }],
    one_pot: false,
    source: 'Tastebook',
    source_url: '',
    ingredient_lines: [],
    ingredient_groups: [],
    steps: [],
    diet_tag_conflicts: []
  },
  {
    id: 2,
    slug: 'banana-bread',
    visibility: 'public',
    title: 'Banana bread',
    description: '',
    cuisines: [],
    courses: [],
    difficulty: 'easy',
    prep_minutes: 15,
    cook_minutes: 60,
    extra_minutes: 0,
    extra_label: '',
    total_minutes: 75,
    photo: null,
    diet_tags: [],
    servings: null,
    yield_amount: 1,
    yield_unit: 'loaf',
    equipment: [],
    one_pot: false,
    source: '',
    source_url: '',
    ingredient_lines: [],
    ingredient_groups: [],
    steps: [],
    diet_tag_conflicts: []
  }
];

const toSummary = ({
  id,
  slug,
  visibility,
  title,
  description,
  cuisines,
  difficulty,
  total_minutes,
  photo,
  diet_tags
}: Recipe): RecipeSummary => ({
  id,
  slug,
  visibility,
  title,
  description,
  cuisines,
  difficulty,
  total_minutes,
  photo,
  diet_tags
});

export const handlers = [
  http.get('/api/_allauth/browser/v1/config', () =>
    HttpResponse.json({ status: 200, data: { socialaccount: { providers: [] } } })
  ),
  http.get('/api/account/', () => HttpResponse.json<CurrentAccount>({ account: null })),
  http.get('/api/health/', () => HttpResponse.json<Health>({ status: 'ok', database: 'ok', version: '0.1.0' })),
  http.get('/api/courses/', () => HttpResponse.json<Course[]>(courses)),
  http.get('/api/cuisines/', () => HttpResponse.json<Cuisine[]>(cuisines)),
  http.get('/api/ingredients/', () => HttpResponse.json<IngredientOption[]>(ingredients)),
  // Adds every name as a new ingredient awaiting review.
  http.post('/api/ingredients/', async ({ request }) => {
    const { name } = (await request.json()) as NewIngredient;
    return HttpResponse.json<IngredientOption>(
      { slug: name.toLowerCase().replaceAll(' ', '-'), name, synonyms: [] },
      { status: 201 }
    );
  }),
  http.get('/api/recipes/', () => HttpResponse.json<RecipeSummary[]>(recipes.map(toSummary))),
  http.get('/api/recipes/:slug/', ({ params }) => {
    const recipe = recipes.find(({ slug }) => slug === params.slug);
    return recipe === undefined ? new HttpResponse(null, { status: 404 }) : HttpResponse.json<Recipe>(recipe);
  })
];
