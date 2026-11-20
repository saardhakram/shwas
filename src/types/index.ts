export type AqiCategory = 'good' | 'moderate' | 'poor' | 'veryPoor' | 'severe' | 'hazardous';

export interface HealthFlags {
  asthma?: boolean;
  heart?: boolean;
  pregnancy?: boolean;
}

export interface MemberRoutine {
  hoursOutside: number; // Commute, market, outdoors
  hoursAway: number;    // School or office
  awayPlace?: string;   // 'office' | 'school' | 'other'
}

export interface ProfileFamilyMember {
  id: string;
  name: string;
  age: number;
  flags: HealthFlags;
  routine: MemberRoutine;
  relation?: 'self' | 'spouse' | 'child' | 'parent' | 'other';
}

export interface ProfileLocation {
  lat: number;
  lon: number;
  name: string;
}

export interface ProfileHome {
  windowsFacingRoad: boolean;
  purifier: boolean;
  chimney: boolean;
  cookingFuel: 'lpg' | 'wood' | 'electric' | string;
  commuteMode: 'metro' | 'auto' | 'bus' | 'bike' | 'car' | 'walk' | string;
  windowsShut?: boolean;
}

export interface UserProfile {
  id?: string;
  language: string;
  location: ProfileLocation;
  family: ProfileFamilyMember[];
  home: ProfileHome;
  onboardingCompleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface RawPlanItem {
  time: string;
  action: string;
  reason: string;
  category: 'seal' | 'ventilate' | 'commute' | 'purify' | 'routine' | string;
  before_pm25: number;
  after_pm25: number;
}

export interface AirPlanItem extends RawPlanItem {
  id: string;
  cigarettesSaved: number;
  completed: boolean;
}
