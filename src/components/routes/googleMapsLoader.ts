/**
 * Google Maps JS script loader & dark Shwas map styles.
 */

export const DARK_GOOGLE_MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b0f17' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#cbd5e1' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#64748b' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#112224' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#1e293b' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#0f172a' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#2b3b55' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#16253b' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#081220' }],
  },
];

let googleMapsScriptPromise: Promise<boolean> | null = null;
let googleMapsAuthFailed = false;

export function hasGoogleMapsAuthFailed(): boolean {
  return googleMapsAuthFailed;
}

export function markGoogleMapsAuthFailed(): void {
  googleMapsAuthFailed = true;
}

export function loadGoogleMapsScript(apiKey: string): Promise<boolean> {
  if (!apiKey || googleMapsAuthFailed) return Promise.resolve(false);
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.google?.maps?.Map) return Promise.resolve(true);

  if (googleMapsScriptPromise) return googleMapsScriptPromise;

  googleMapsScriptPromise = new Promise<boolean>((resolve) => {
    const prevAuthFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      googleMapsAuthFailed = true;
      if (typeof prevAuthFailure === 'function') prevAuthFailure();
      resolve(false);
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-shwas-gmaps="true"]');
    if (existing) {
      const checkTimer = setTimeout(
        () => resolve(Boolean(window.google?.maps?.Map && !googleMapsAuthFailed)),
        4000,
      );
      existing.addEventListener('load', () => {
        clearTimeout(checkTimer);
        resolve(Boolean(window.google?.maps?.Map && !googleMapsAuthFailed));
      });
      existing.addEventListener('error', () => {
        clearTimeout(checkTimer);
        resolve(false);
      });
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&libraries=places,routes&v=weekly`;
    script.async = true;
    script.defer = true;
    script.dataset.shwasGmaps = 'true';

    const timeout = setTimeout(() => resolve(false), 6000);

    script.onload = () => {
      clearTimeout(timeout);
      setTimeout(() => {
        resolve(Boolean(window.google?.maps?.Map && !googleMapsAuthFailed));
      }, 250);
    };
    script.onerror = () => {
      clearTimeout(timeout);
      resolve(false);
    };

    document.head.appendChild(script);
  });

  return googleMapsScriptPromise;
}
