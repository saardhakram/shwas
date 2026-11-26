import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import { STORAGE_KEYS, storage } from './lib/storage';

const TodayPage = lazy(() => import('./pages/TodayPage'));
const ScanPage = lazy(() => import('./pages/ScanPage'));
const RoutesPage = lazy(() => import('./pages/RoutesPage'));
const CommunityPage = lazy(() => import('./pages/CommunityPage'));
const AskPage = lazy(() => import('./pages/AskPage'));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'));

const RouteFallback: React.FC = () => (
  <div
    aria-busy="true"
    className="min-h-screen w-full bg-[#0B0F17] flex items-center justify-center"
  >
    <div
      aria-hidden="true"
      className="h-8 w-8 rounded-full border-2 border-teal-400/25 border-t-teal-400 animate-spin"
    />
  </div>
);

/**
 * Root route redirect handler:
 * If a profile exists in storage, redirect to /today;
 * otherwise redirect to /onboarding for first-time profile creation.
 */
const RootRedirect: React.FC = () => {
  const profileRaw = storage.getItem(STORAGE_KEYS.PROFILE);
  const hasProfile = Boolean(profileRaw);

  return hasProfile ? <Navigate to="/today" replace /> : <Navigate to="/onboarding" replace />;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
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
      </Suspense>
    </BrowserRouter>
  );
};

export default App;
