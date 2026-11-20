export type AqiCategory = 'good' | 'moderate' | 'poor' | 'veryPoor' | 'severe' | 'hazardous';

export interface FamilyMember {
  id: string;
  name: string;
  age: number;
  relation: 'self' | 'spouse' | 'child' | 'parent' | 'other';
  hasAsthma?: boolean;
  isPregnant?: boolean;
  hasHeartCondition?: boolean;
  avatar?: string;
}

export interface UserProfile {
  id?: string;
  cityName: string;
  stateName?: string;
  latitude: number;
  longitude: number;
  home: {
    windowsFacingRoad: boolean;
    purifier: boolean;
    chimney: boolean;
    cookingFuel: 'lpg' | 'wood' | 'electric' | string;
    windowsShut: boolean;
  };
  familyMembers: FamilyMember[];
  onboardingCompleted: boolean;
  createdAt?: string;
}

export interface AirQualityData {
  pm25: number;
  pm10?: number;
  aqi: number;
  category: AqiCategory;
  city: string;
  timestamp: string;
  stationName?: string;
}

export interface AirPlanItem {
  id: string;
  time: string;
  title: string;
  description: string;
  actionType: 'ventilate' | 'seal' | 'purify' | 'commute' | 'avoid';
  cigarettesSaved: number;
  co2SavedKg?: number;
  completed: boolean;
}
