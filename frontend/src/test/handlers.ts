import { HttpResponse, http } from 'msw';

import type { components } from '../api/schema';

type Course = components['schemas']['Course'];
type Cuisine = components['schemas']['Cuisine'];
type CurrentAccount = components['schemas']['CurrentAccount'];
type Equipment = components['schemas']['Equipment'];
type Health = components['schemas']['Health'];
type IngredientOption = components['schemas']['IngredientOption'];
type Lists = components['schemas']['Lists'];
type NewIngredient = components['schemas']['NewIngredient'];
type RecipeLists = components['schemas']['RecipeLists'];
type Recipe = components['schemas']['Recipe'];
type RecipeSummary = components['schemas']['RecipeSummary'];
type SavedList = components['schemas']['SavedList'];

const cuisines: Cuisine[] = [
  { slug: 'french', name: 'French' },
  { slug: 'italian', name: 'Italian' },
  { slug: 'japanese', name: 'Japanese' }
];

const courses: Course[] = [
  { slug: 'dessert', name: 'Dessert' },
  { slug: 'main', name: 'Main' }
];

const equipment: Equipment[] = [
  { slug: 'hob', name: 'Hob' },
  { slug: 'oven', name: 'Oven' }
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
    author: null,
    title: 'Apple tart',
    description: 'Sharp apples on buttery pastry.',
    cuisines: [{ slug: 'french', name: 'French' }],
    adapted_from: null,
    is_copy: false,
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
    original_source: '',
    original_source_url: '',
    ingredient_lines: [],
    ingredient_groups: [],
    steps: [],
    diet_tag_conflicts: [],
    can_delete: false,
    can_edit: false,
    can_publish: false,
    will_wait_for_review: false,
    save_count: null,
    can_share: false,
    share_token: null,
    hidden_for_review: false,
    waiting_for_review: false,
    can_report: false,
    reported: false
  },
  {
    id: 2,
    slug: 'banana-bread',
    visibility: 'public',
    author: null,
    title: 'Banana bread',
    description: '',
    cuisines: [],
    adapted_from: null,
    is_copy: false,
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
    original_source: '',
    original_source_url: '',
    ingredient_lines: [],
    ingredient_groups: [],
    steps: [],
    diet_tag_conflicts: [],
    can_delete: false,
    can_edit: false,
    can_publish: false,
    will_wait_for_review: false,
    save_count: null,
    can_share: false,
    share_token: null,
    hidden_for_review: false,
    waiting_for_review: false,
    can_report: false,
    reported: false
  }
];

const toSummary = ({
  id,
  slug,
  visibility,
  author,
  title,
  description,
  cuisines,
  difficulty,
  total_minutes,
  photo,
  diet_tags,
  hidden_for_review,
  waiting_for_review
}: Recipe): RecipeSummary => ({
  id,
  slug,
  visibility,
  author,
  title,
  description,
  cuisines,
  difficulty,
  total_minutes,
  photo,
  diet_tags,
  hidden_for_review,
  waiting_for_review
});

export const handlers = [
  http.get('/api/_allauth/browser/v1/config', () =>
    HttpResponse.json({ status: 200, data: { socialaccount: { providers: [] } } })
  ),
  http.get('/api/account/', () => HttpResponse.json<CurrentAccount>({ account: null })),
  http.get('/api/health/', () => HttpResponse.json<Health>({ status: 'ok', database: 'ok', version: '0.1.0' })),
  http.get('/api/courses/', () => HttpResponse.json<Course[]>(courses)),
  http.get('/api/cuisines/', () => HttpResponse.json<Cuisine[]>(cuisines)),
  http.get('/api/equipment/', () => HttpResponse.json<Equipment[]>(equipment)),
  http.get('/api/ingredients/', () => HttpResponse.json<IngredientOption[]>(ingredients)),
  // Adds every name as a new ingredient awaiting review.
  http.post('/api/ingredients/', async ({ request }) => {
    const { name } = (await request.json()) as NewIngredient;
    return HttpResponse.json<IngredientOption>(
      { slug: name.toLowerCase().replaceAll(' ', '-'), name, synonyms: [] },
      { status: 201 }
    );
  }),
  // Every account has Favourites, empty until it saves something, and a household of one with no lists yet.
  http.get('/api/lists/', () =>
    HttpResponse.json<Lists>({
      household_name: "Milo's household",
      household_members: 1,
      lists: [{ slug: 'favourites', name: 'Favourites', scope: 'personal', recipe_count: 0, covers: [] }]
    })
  ),
  http.get('/api/lists/recipes/:slug/', () =>
    HttpResponse.json<RecipeLists>({
      household_name: "Milo's household",
      lists: [{ slug: 'favourites', name: 'Favourites', scope: 'personal', recipe_count: 0, saved_id: null }]
    })
  ),
  http.get('/api/lists/favourites/', () =>
    HttpResponse.json<SavedList>({
      slug: 'favourites',
      name: 'Favourites',
      scope: 'personal',
      household_name: null,
      saved_recipes: []
    })
  ),
  http.get('/api/recipes/', () => HttpResponse.json<RecipeSummary[]>(recipes.map(toSummary))),
  http.get('/api/recipes/:slug/', ({ params }) => {
    const recipe = recipes.find(({ slug }) => slug === params.slug);
    return recipe === undefined ? new HttpResponse(null, { status: 404 }) : HttpResponse.json<Recipe>(recipe);
  })
];
