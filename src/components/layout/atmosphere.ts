import type { TFunction } from 'i18next';
import type { FamilyMemberOption } from '../ui/FamilyChips';
import type { ProfileFamilyMember, UserProfile } from '../../types';

export interface AtmosphereTheme {
  bg: string;
  glow: string;
  badgeVariant: 'danger' | 'warning' | 'mint';
  label: string;
}

/**
 * Computes the dynamic atmospheric haze gradient based on real live AQI:
 * Severe (300+): Murky brown-grey smog haze
 * Very Poor (200-300): Deep smoky orange/brown
 * Poor (100-200): Amber dusk
 * Good/Moderate (<100): Clear dawn teal
 */
export function getAtmosphereGradient(currentAqi: number, t: TFunction): AtmosphereTheme {
  if (currentAqi >= 300) {
    return {
      bg: 'from-[#2a1711] via-[#1c1615] to-[#0c0d12]',
      glow: 'rgba(180, 83, 9, 0.18)',
      badgeVariant: 'danger',
      label: t('aqi.severe', 'Severe Smog'),
    };
  }
  if (currentAqi >= 200) {
    return {
      bg: 'from-[#2b1810] via-[#1c1417] to-[#0c0d12]',
      glow: 'rgba(239, 68, 68, 0.14)',
      badgeVariant: 'danger',
      label: t('aqi.veryPoor', 'Very Poor'),
    };
  }
  if (currentAqi >= 100) {
    return {
      bg: 'from-[#241a0d] via-[#16171c] to-[#0c0d12]',
      glow: 'rgba(245, 158, 11, 0.12)',
      badgeVariant: 'warning',
      label: t('aqi.poor', 'Poor'),
    };
  }
  return {
    bg: 'from-[#052222] via-[#091b22] to-[#0a0f18]',
    glow: 'rgba(45, 212, 191, 0.18)',
    badgeVariant: 'mint',
    label: t('aqi.good', 'Clean Dawn Teal'),
  };
}

function classifyFamilyMemberTag(
  member: ProfileFamilyMember,
  t: TFunction,
): { tag?: string; tagType: 'asthma' | 'senior' | 'child' | 'default' } {
  if (member.flags?.asthma) {
    return { tag: t('family.asthmaTag', 'Asthma'), tagType: 'asthma' };
  }
  if (member.flags?.heart) {
    return { tag: t('family.seniorTag', 'Heart'), tagType: 'senior' };
  }
  if (member.flags?.pregnancy) {
    return { tag: 'Pregnant', tagType: 'child' };
  }
  if (member.age >= 65) {
    return { tag: t('family.seniorTag', 'Senior'), tagType: 'senior' };
  }
  if (member.age <= 10) {
    return { tag: t('family.childTag', 'Child'), tagType: 'child' };
  }
  return { tagType: 'default' };
}

export function buildFamilyChips(
  userProfile: UserProfile | null,
  t: TFunction,
): FamilyMemberOption[] {
  const list: FamilyMemberOption[] = [{ id: 'all', name: t('family.all', 'All Family') }];

  if (userProfile?.family && userProfile.family.length > 0) {
    userProfile.family.forEach((m) => {
      const { tag, tagType } = classifyFamilyMemberTag(m, t);
      list.push({ id: m.id, name: `${m.name} (${m.age})`, tag, tagType });
    });
    return list;
  }

  list.push(
    { id: 'me', name: t('family.me', 'Me (32)') },
    {
      id: 'grandpa',
      name: t('family.grandpa', 'Grandpa (72)'),
      tag: t('family.seniorTag', 'Senior'),
      tagType: 'senior',
    },
    {
      id: 'child',
      name: t('family.child', 'Aarav (8)'),
      tag: t('family.asthmaTag', 'Asthma'),
      tagType: 'asthma',
    },
  );
  return list;
}
