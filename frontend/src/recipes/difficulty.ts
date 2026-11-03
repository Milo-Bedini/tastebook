import type { components } from '../api/schema';

type Difficulty = components['schemas']['DifficultyEnum'];

export const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

export const difficultyLabels: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

// A household's recipe may have no difficulty, which the API sends as ''.
export const difficultyLabel = (difficulty: Difficulty | '') => (difficulty === '' ? '' : difficultyLabels[difficulty]);
