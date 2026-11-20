import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import TodayPage from './pages/TodayPage';
import ScanPage from './pages/ScanPage';
import RoutesPage from './pages/RoutesPage';
import CommunityPage from './pages/CommunityPage';
import AskPage from './pages/AskPage';
import OnboardingPage from './pages/OnboardingPage';

/**
 * Root route redirect handler:
 * If a profile exists in localStorage, redirect to /today;
 * otherwise redirect to /onboarding for first-time profile creation.
 */
const RootRedirect: React.FC = () => {
  const profileRaw = localStorage.getItem('shwas_profile');
  const hasProfile = Boolean(profileRaw);

  return hasProfile ? (
    <Navigate to="/today" replace />
  ) : (
    <Navigate to="/onboarding" replace />
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Onboarding screen (standalone layout or framed) */}
        <Route path="/onboarding" element={<OnboardingPage />} />

        {/* Core application routes wrapped in AppLayout with BottomNav */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/routes" element={<RoutesPage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/ask" element={<AskPage />} />
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
