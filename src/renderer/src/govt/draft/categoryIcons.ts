import type { SchemeCategory } from '@shared/govt/schemes';

/** The first version marked each scheme group with an emoji. Skeemo proper uses SVG icons instead. */
export const CATEGORY_EMOJI: Record<SchemeCategory, string> = {
  agriculture: '🌾', health: '🏥', housing: '🏠', education: '🎓',
  women_child: '👩', pension_insurance: '🛡', business: '💼', employment: '🛠',
};
