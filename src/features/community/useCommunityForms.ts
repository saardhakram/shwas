import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { isValidJoinCode, type CommunityGroup } from '../../lib/community';
import {
  createCommunityGroup,
  joinCommunityGroupByCode,
  joinDemoGreenParkSociety,
} from '../../lib/communityService';

export function useGroupForms(
  defaultFamilyLabel: string,
  onJoined: (group: CommunityGroup) => void,
) {
  const { t } = useTranslation();
  const [groupNameInput, setGroupNameInput] = useState<string>('');
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [familyNameInput, setFamilyNameInput] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  const resolvedFamilyName = familyNameInput.trim() || defaultFamilyLabel;

  const handleCreateGroup = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (groupNameInput.trim().length < 2) {
      setFormError(
        t('community.errGroupName', 'Enter a society or school name (at least 2 characters).'),
      );
      return;
    }
    onJoined(await createCommunityGroup(groupNameInput, resolvedFamilyName));
    setGroupNameInput('');
  };

  const handleJoinGroup = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!isValidJoinCode(joinCodeInput)) {
      setFormError(
        t('community.errJoinCode', 'Enter a valid 6-character join code (e.g. GRNPK6).'),
      );
      return;
    }
    const res = await joinCommunityGroupByCode(joinCodeInput, resolvedFamilyName);
    if (res.group) {
      onJoined(res.group);
      setJoinCodeInput('');
    } else {
      setFormError(
        res.error || t('community.errGroupNotFound', 'Could not find a group with that code.'),
      );
    }
  };

  const handleJoinDemo = async () => {
    setFormError(null);
    onJoined(await joinDemoGreenParkSociety(resolvedFamilyName));
  };

  return {
    groupNameInput,
    setGroupNameInput,
    joinCodeInput,
    setJoinCodeInput,
    familyNameInput,
    setFamilyNameInput,
    formError,
    handleCreateGroup,
    handleJoinGroup,
    handleJoinDemo,
  };
}
