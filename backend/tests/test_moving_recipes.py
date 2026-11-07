from collections.abc import Callable
from decimal import Decimal
from typing import Any

import pytest

from households.models import Household, User
from recipes.models import Equipment, IngredientGroup, IngredientLine, Recipe, Step
from tests.test_accounts import BrowserClient
from tests.test_household import join, leave, make_link, member, remove, signed_up
from tests.test_join import join_through, lookup
from tests.test_private_recipes import RECIPES, add
from tests.test_recipes import ingredient

MILO = 'milo@example.com'
ANN = 'ann@example.com'
JO = 'jo@example.com'


def write_curry(milo: BrowserClient) -> None:
    """Grandma's curry, with a cuisine, a course, equipment, lines in and out of a group, and steps."""
    slug = add(milo, {'title': "Grandma's curry", 'cuisines': ['indian'], 'courses': ['main'], 'prep_minutes': 15})
    curry = Recipe.objects.get(slug=slug.json()['slug'])
    curry.equipment.set([Equipment.objects.create(name='Wok', slug='wok')])
    IngredientLine.objects.create(recipe=curry, ingredient=ingredient('onion'), amount=Decimal(2), note='sliced')
    sauce = IngredientGroup.objects.create(recipe=curry, name='For the sauce')
    IngredientLine.objects.create(recipe=curry, group=sauce, ingredient=ingredient('tomato'), amount=Decimal(400))
    Step.objects.create(recipe=curry, position=0, text='Fry the onions.')
    Step.objects.create(recipe=curry, position=1, text='Add the sauce.')


def private_titles(browser: BrowserClient) -> list[str]:
    return [recipe['title'] for recipe in browser.client.get(RECIPES).json() if recipe['visibility'] == 'private']


def detail(browser: BrowserClient, title: str) -> dict[str, Any]:
    slug = next(recipe['slug'] for recipe in browser.client.get(RECIPES).json() if recipe['title'] == title)
    return browser.client.get(f'{RECIPES}{slug}/').json()


def the_curry_as_written(recipe: dict[str, Any]) -> tuple[Any, ...]:
    return (
        [cuisine['slug'] for cuisine in recipe['cuisines']],
        [course['slug'] for course in recipe['courses']],
        [equipment['name'] for equipment in recipe['equipment']],
        recipe['prep_minutes'],
        [(line['ingredient']['name'], line['amount'], line['note']) for line in recipe['ingredient_lines']],
        [
            (group['name'], [(line['ingredient']['name'], line['amount']) for line in group['lines']])
            for group in recipe['ingredient_groups']
        ],
        [step['text'] for step in recipe['steps']],
    )


CURRY_AS_WRITTEN = (
    ['indian'],
    ['main'],
    ['Wok'],
    15,
    [('onion', 2, 'sliced')],
    [('For the sauce', [('tomato', 400)])],
    ['Fry the onions.', 'Add the sauce.'],
)


def leaves(milo: BrowserClient, ann: BrowserClient) -> None:
    leave(milo)


def is_removed(milo: BrowserClient, ann: BrowserClient) -> None:
    remove(ann, member(MILO))


def joins_jo(milo: BrowserClient, ann: BrowserClient) -> None:
    jo = signed_up(JO, 'Jo')
    add(jo, {'title': "Jo's dal"})
    join_through(milo, make_link(jo).json()['invite']['token'])


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('move', 'milos_titles'),
    [
        pytest.param(leaves, ['Flatbreads', "Grandma's curry"], id='leaving'),
        pytest.param(is_removed, ['Flatbreads', "Grandma's curry"], id='being removed'),
        pytest.param(joins_jo, ['Flatbreads', "Grandma's curry", "Jo's dal"], id='joining another household'),
    ],
)
def test_moving_out_copies_the_recipes_you_wrote_and_the_household_keeps_its_own(
    move: Callable[[BrowserClient, BrowserClient], None], milos_titles: list[str]
) -> None:
    milo = signed_up(MILO, 'Milo')
    ann = signed_up(ANN, 'Ann')
    join(ANN, MILO)
    write_curry(milo)
    add(milo, {'title': 'Flatbreads'})
    add(ann, {'title': "Ann's soup"})
    kept = set(Recipe.objects.values_list('pk', 'slug'))

    move(milo, ann)

    assert private_titles(ann) == ["Ann's soup", 'Flatbreads', "Grandma's curry"]
    assert private_titles(milo) == milos_titles
    assert the_curry_as_written(detail(milo, "Grandma's curry")) == CURRY_AS_WRITTEN
    assert the_curry_as_written(detail(ann, "Grandma's curry")) == CURRY_AS_WRITTEN
    account = User.objects.get(email=MILO)
    copies = Recipe.objects.exclude(pk__in=[pk for pk, _ in kept]).exclude(title="Jo's dal")
    assert sorted((copy.title, copy.household_id, copy.created_by) for copy in copies) == [
        ('Flatbreads', account.household_id, account),
        ("Grandma's curry", account.household_id, account),
    ]
    # New rows and new addresses: nothing in a copy is shared with the recipe it was copied from.
    assert {copy.slug for copy in copies}.isdisjoint(slug for _, slug in kept)
    assert IngredientLine.objects.count() == 4
    assert Step.objects.count() == 4


@pytest.mark.django_db
def test_joining_as_the_only_member_takes_your_recipes_and_deletes_the_rest() -> None:
    milo = signed_up(MILO, 'Milo')
    old = User.objects.get(email=MILO).household_id
    write_curry(milo)
    # Written by someone who has since left, so it stays with the household it was written in.
    Recipe.objects.create(title='Old soup', household_id=old, slug='old-soup-abcdef')
    jo = signed_up(JO, 'Jo')

    join_through(milo, make_link(jo).json()['invite']['token'])

    assert Household.objects.filter(pk=old).exists() is False
    assert private_titles(jo) == ["Grandma's curry"]
    assert the_curry_as_written(detail(jo, "Grandma's curry")) == CURRY_AS_WRITTEN
    assert list(Recipe.objects.values_list('title', 'household_id')) == [
        ("Grandma's curry", User.objects.get(email=JO).household_id)
    ]


@pytest.mark.django_db
@pytest.mark.parametrize('written', [0, 1, 4])
def test_a_link_says_how_many_recipes_joining_would_copy(written: int) -> None:
    milo = signed_up(MILO, 'Milo')
    ann = signed_up(ANN, 'Ann')
    join(ANN, MILO)
    for number in range(written):
        add(milo, {'title': f'Recipe {number}'})
    add(ann, {'title': "Ann's soup"})
    # One Milo wrote in a household he has left goes nowhere when he joins.
    Recipe.objects.create(
        title='Left behind', household=Household.objects.create(name='Old'), created_by=User.objects.get(email=MILO)
    )
    jo = signed_up(JO, 'Jo')
    token = make_link(jo).json()['invite']['token']

    assert lookup(milo, token).json()['recipes_to_copy'] == written
    assert lookup(jo, token).json()['recipes_to_copy'] == 0


def publish_the_curry() -> Recipe:
    curry = Recipe.objects.get(title="Grandma's curry")
    Recipe.objects.filter(pk=curry.pk).update(visibility='public')
    return curry


@pytest.mark.django_db
@pytest.mark.parametrize(
    'move',
    [
        pytest.param(leaves, id='leaving'),
        pytest.param(is_removed, id='being removed'),
        pytest.param(joins_jo, id='joining another household'),
    ],
)
def test_a_public_recipe_moves_with_its_author(move: Callable[[BrowserClient, BrowserClient], None]) -> None:
    milo = signed_up(MILO, 'Milo')
    ann = signed_up(ANN, 'Ann')
    join(ANN, MILO)
    write_curry(milo)
    curry = publish_the_curry()
    add(milo, {'title': 'Flatbreads'})

    move(milo, ann)

    moved = Recipe.objects.get(pk=curry.pk)
    assert (moved.slug, moved.household_id, moved.visibility) == (
        curry.slug,
        User.objects.get(email=MILO).household_id,
        'public',
    )
    assert Recipe.objects.filter(title="Grandma's curry").count() == 1
    seen_by_ann = detail(ann, "Grandma's curry")
    assert (seen_by_ann['author'], seen_by_ann['can_edit']) == ('Milo', False)
    assert private_titles(ann) == ['Flatbreads']
    assert 'Flatbreads' in private_titles(milo)


@pytest.mark.django_db
def test_joining_as_the_only_member_keeps_your_public_recipe() -> None:
    milo = signed_up(MILO, 'Milo')
    old = User.objects.get(email=MILO).household_id
    write_curry(milo)
    curry = publish_the_curry()
    jo = signed_up(JO, 'Jo')

    join_through(milo, make_link(jo).json()['invite']['token'])

    assert Household.objects.filter(pk=old).exists() is False
    assert Recipe.objects.get(pk=curry.pk).household_id == User.objects.get(email=JO).household_id


@pytest.mark.django_db
def test_a_link_counts_only_the_private_recipes_joining_would_copy() -> None:
    milo = signed_up(MILO, 'Milo')
    write_curry(milo)
    publish_the_curry()
    add(milo, {'title': 'Flatbreads'})
    jo = signed_up(JO, 'Jo')

    response = lookup(milo, make_link(jo).json()['invite']['token'])

    assert response.json()['recipes_to_copy'] == 1
