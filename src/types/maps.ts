/**
 * Typed ambient interfaces for Google Maps JS API, OSRM, Nominatim, and Web Speech API.
 */

export interface GoogleLatLngLiteral {
  lat: number;
  lng: number;
}

export interface GoogleLatLngLike {
  lat: number | (() => number);
  lng: number | (() => number);
}

export interface GoogleLatLngBoundsInstance {
  extend(point: GoogleLatLngLiteral): void;
}

export interface GoogleGeocoderResult {
  formatted_address?: string;
  geometry: {
    location: {
      lat(): number;
      lng(): number;
    };
  };
}

export interface GoogleGeocoderRequest {
  address: string;
  region?: string;
  bounds?: GoogleLatLngBoundsInstance;
}

export interface GoogleGeocoderInstance {
  geocode(
    request: GoogleGeocoderRequest,
    callback: (results: GoogleGeocoderResult[] | null, status: string) => void,
  ): void;
}

export interface GoogleMvcArray {
  getArray?: () => GoogleLatLngLike[];
}

export interface GooglePolylineInstance {
  setMap(map: GoogleMapInstance | null): void;
  addListener(eventName: string, handler: () => void): void;
  getPath?: () => GoogleMvcArray;
}

export interface GoogleMapInstance {
  fitBounds(bounds: GoogleLatLngBoundsInstance, padding?: number): void;
  setCenter(latLng: GoogleLatLngLiteral): void;
  setZoom(zoom: number): void;
}

export interface GoogleRoutesComputeRequest {
  origin: GoogleLatLngLiteral;
  destination: GoogleLatLngLiteral;
  travelMode: 'DRIVING' | 'TWO_WHEELER' | 'WALKING';
  computeAlternativeRoutes?: boolean;
  fields: string[];
  departureTime?: Date;
}

export interface GoogleRouteInstance {
  distanceMeters?: number;
  durationMillis?: number;
  path?: GoogleLatLngLike[];
  createPolylines?: () => GooglePolylineInstance[];
}

export interface GoogleRoutesLibrary {
  Route?: {
    computeRoutes?: (
      request: GoogleRoutesComputeRequest,
    ) => Promise<{ routes?: GoogleRouteInstance[] }>;
  };
}

export interface GoogleMapsNamespace {
  Map?: new (container: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
  LatLngBounds?: new (
    sw?: GoogleLatLngLiteral,
    ne?: GoogleLatLngLiteral,
  ) => GoogleLatLngBoundsInstance;
  Polyline?: new (options: Record<string, unknown>) => GooglePolylineInstance;
  Geocoder?: new () => GoogleGeocoderInstance;
  SymbolPath?: { CIRCLE: number };
  importLibrary?: (name: string) => Promise<GoogleRoutesLibrary>;
  routes?: GoogleRoutesLibrary;
  DirectionsService?: unknown;
}

export interface GoogleNamespace {
  maps?: GoogleMapsNamespace;
}

export interface NominatimSearchResult {
  display_name?: string;
  lat: string;
  lon: string;
}

export interface OsrmRouteItem {
  distance?: number;
  duration?: number;
  geometry?: { coordinates?: number[][] };
  legs?: Array<{ summary?: string }>;
}

export interface OsrmResponse {
  code?: string;
  routes?: OsrmRouteItem[];
}

export interface SpeechRecognitionResultEvent {
  results?: ArrayLike<ArrayLike<{ transcript?: string }>>;
}

export interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  start(): void;
  stop(): void;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    google?: GoogleNamespace;
    gm_authFailure?: () => void;
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}
