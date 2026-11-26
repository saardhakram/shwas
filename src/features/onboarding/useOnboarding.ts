import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { HealthFlags, ProfileFamilyMember, ProfileHome } from '../../types';
import { upsertProfile } from '../../lib/supabase';
import { STORAGE_KEYS, storage } from '../../lib/storage';
import { DEFAULT_FAMILY, DEFAULT_HOME, LANGUAGE_TILES, POPULAR_CITIES } from './onboardingDefaults';
import { useLocationStep } from './useLocationStep';
import { useRevealCalculation } from './useRevealCalculation';

export { LANGUAGE_TILES, POPULAR_CITIES };

export function useOnboarding() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();

  const [step, setStep] = useState<number>(1);
  const [language, setLanguage] = useState<string>(i18n.language || 'en');
  const loc = useLocationStep();

  const [family, setFamily] = useState<ProfileFamilyMember[]>(DEFAULT_FAMILY);
  const [newMemberName, setNewMemberName] = useState<string>('');
  const [newMemberAge, setNewMemberAge] = useState<number>(25);
  const [newMemberFlags, setNewMemberFlags] = useState<HealthFlags>({});
  const [home, setHome] = useState<ProfileHome>(DEFAULT_HOME);
  const [selectedMemberIdx, setSelectedMemberIdx] = useState<number>(0);

  const reveal = useRevealCalculation(step, language, loc.location, family, home);

  const handleSelectLanguage = (code: string) => {
    setLanguage(code);
    i18n.changeLanguage(code);
    storage.setItem(STORAGE_KEYS.LANGUAGE, code);
  };

  const handleAddMember = () => {
    if (!newMemberName.trim()) return;
    setFamily([
      ...family,
      {
        id: `member_${Date.now()}`,
        name: newMemberName.trim(),
        age: Number(newMemberAge) || 20,
        flags: newMemberFlags,
        routine: { hoursOutside: 2, hoursAway: 6, awayPlace: 'office' },
      },
    ]);
    setNewMemberName('');
    setNewMemberAge(25);
    setNewMemberFlags({});
  };

  const handleRemoveMember = (id: string) => {
    if (family.length <= 1) return;
    setFamily(family.filter((f) => f.id !== id));
    if (selectedMemberIdx >= family.length - 1) setSelectedMemberIdx(0);
  };

  const updateMemberRoutine = (
    memberIdx: number,
    field: 'hoursOutside' | 'hoursAway',
    value: number,
  ) => {
    setFamily((prev) =>
      prev.map((member, idx) =>
        idx === memberIdx ? { ...member, routine: { ...member.routine, [field]: value } } : member,
      ),
    );
  };

  const handleComplete = async () => {
    await upsertProfile({
      language,
      location: loc.location,
      family,
      home,
      onboardingCompleted: true,
      updatedAt: new Date().toISOString(),
    });
    navigate('/today');
  };

  return {
    step,
    setStep,
    language,
    handleSelectLanguage,
    ...loc,
    family,
    newMemberName,
    setNewMemberName,
    newMemberAge,
    setNewMemberAge,
    newMemberFlags,
    setNewMemberFlags,
    handleAddMember,
    handleRemoveMember,
    home,
    setHome,
    selectedMemberIdx,
    setSelectedMemberIdx,
    updateMemberRoutine,
    ...reveal,
    handleComplete,
  };
}
