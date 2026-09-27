import { investorProfiles } from '../data/content';
import { PROFILE_IDS } from '../engine/profile-engine';
import { canBuyForProfile } from '../engine/policy-engine';
import { allowedDefaultOptions } from '../engine/default-option';
import type { DefaultOptionId, ProductId, ProfileId } from '../types';

function requirement(allowed: ProfileId[]): string {
  const first = PROFILE_IDS.findIndex(id => allowed.includes(id));
  if (first < 0) return '선택 가능한 성향 없음';
  if (first === 0 && allowed.length === PROFILE_IDS.length) return '모든 성향 선택 가능';
  const name = (id: ProfileId) => investorProfiles.find(p => p.id === id)!.name;
  return PROFILE_IDS.slice(first).every(id => allowed.includes(id))
    ? `${name(PROFILE_IDS[first])} 이상 선택 가능`
    : `${allowed.map(name).join('·')} 선택 가능`;
}
export const productRequirement = (id: ProductId) => requirement(PROFILE_IDS.filter(p => canBuyForProfile(p,id).ok));
export const defaultRequirement = (id: DefaultOptionId, modern = false) => requirement(PROFILE_IDS.filter(p => allowedDefaultOptions(p,modern).some(o => o.id === id)));
