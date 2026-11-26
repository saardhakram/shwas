/**
 * Overlay rendering helpers for Google Maps and Leaflet Clean Routes maps.
 */

import L from 'leaflet';
import type { EvaluatedRouteOption, LatLon } from '../../lib/routeExposure';
import type {
  GoogleMapInstance,
  GoogleMapsNamespace,
  GooglePolylineInstance,
} from '../../types/maps';

function sortRoutesForLayering(
  routes: EvaluatedRouteOption[],
  selectedRouteId: string | null,
): EvaluatedRouteOption[] {
  return [...routes].sort((a, b) =>
    a.id === selectedRouteId ? 1 : b.id === selectedRouteId ? -1 : 0,
  );
}

function createGooglePinOverlay(
  maps: GoogleMapsNamespace,
  map: GoogleMapInstance,
  point: LatLon,
  fillColor: string,
): GooglePolylineInstance {
  const PolylineCtor = maps.Polyline!;
  return new PolylineCtor({
    path: [
      { lat: point.lat, lng: point.lon },
      { lat: point.lat, lng: point.lon },
    ],
    strokeOpacity: 0,
    icons: [
      {
        icon: {
          path: maps.SymbolPath!.CIRCLE,
          scale: 7,
          fillColor,
          fillOpacity: 1,
          strokeColor: '#0B0F17',
          strokeWeight: 2.5,
        },
        offset: '0%',
      },
    ],
    zIndex: 50,
    map,
  });
}

export function drawGoogleMapOverlays(params: {
  maps: GoogleMapsNamespace;
  map: GoogleMapInstance;
  origin: LatLon;
  destination: LatLon | null;
  routes: EvaluatedRouteOption[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
}): GooglePolylineInstance[] {
  const { maps, map, origin, destination, routes, selectedRouteId, onSelectRoute } = params;
  const overlays: GooglePolylineInstance[] = [];
  const bounds = new maps.LatLngBounds!();
  bounds.extend({ lat: origin.lat, lng: origin.lon });

  overlays.push(createGooglePinOverlay(maps, map, origin, '#2DD4BF'));

  if (destination) {
    bounds.extend({ lat: destination.lat, lng: destination.lon });
    overlays.push(createGooglePinOverlay(maps, map, destination, '#F59E0B'));
  }

  const PolylineCtor = maps.Polyline!;
  sortRoutesForLayering(routes, selectedRouteId).forEach((route) => {
    if (!route.path || route.path.length < 2) return;
    const isSelected = route.id === selectedRouteId;
    const pathLatLng = route.path.map((p) => {
      bounds.extend({ lat: p.lat, lng: p.lon });
      return { lat: p.lat, lng: p.lon };
    });

    const metroIcons =
      route.mode === 'metro'
        ? {
            strokeOpacity: 0,
            icons: [
              {
                icon: {
                  path: 'M 0,-1 0,1',
                  strokeOpacity: isSelected ? 0.95 : 0.45,
                  strokeColor: route.strokeColor,
                  scale: isSelected ? 3.5 : 2.5,
                },
                offset: '0',
                repeat: '12px',
              },
            ],
          }
        : {};

    const polyline = new PolylineCtor({
      path: pathLatLng,
      geodesic: true,
      strokeColor: route.strokeColor,
      strokeOpacity: isSelected ? 0.96 : 0.4,
      strokeWeight: isSelected ? 6 : 3.5,
      zIndex: isSelected ? 30 : 10,
      ...metroIcons,
      map,
    });

    polyline.addListener('click', () => onSelectRoute(route.id));
    overlays.push(polyline);
  });

  if (destination || routes.length > 0) {
    map.fitBounds(bounds, 42);
  } else {
    map.setCenter({ lat: origin.lat, lng: origin.lon });
    map.setZoom(12);
  }

  return overlays;
}

export function drawLeafletMapOverlays(params: {
  map: L.Map;
  layerGroup: L.LayerGroup;
  origin: LatLon;
  destination: LatLon | null;
  routes: EvaluatedRouteOption[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
}): void {
  const { map, layerGroup, origin, destination, routes, selectedRouteId, onSelectRoute } = params;
  layerGroup.clearLayers();

  const latLngsForBounds: L.LatLngExpression[] = [[origin.lat, origin.lon]];

  sortRoutesForLayering(routes, selectedRouteId).forEach((route) => {
    if (!route.path || route.path.length < 2) return;
    const isSelected = route.id === selectedRouteId;
    const latlngs: L.LatLngExpression[] = route.path.map((p) => {
      latLngsForBounds.push([p.lat, p.lon]);
      return [p.lat, p.lon];
    });

    const line = L.polyline(latlngs, {
      color: route.strokeColor,
      weight: isSelected ? 6 : 3.5,
      opacity: isSelected ? 0.95 : 0.42,
      dashArray: route.mode === 'metro' ? '7 7' : undefined,
    });

    line.on('click', () => onSelectRoute(route.id));
    line.addTo(layerGroup);
  });

  const originIcon = L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:9999px;background:#2DD4BF;border:2.5px solid #0B0F17;box-shadow:0 0 12px rgba(45,212,191,0.8);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
  L.marker([origin.lat, origin.lon], { icon: originIcon })
    .bindTooltip('Origin', { direction: 'top' })
    .addTo(layerGroup);

  if (destination) {
    latLngsForBounds.push([destination.lat, destination.lon]);
    const destIcon = L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;border-radius:9999px;background:#F59E0B;border:2.5px solid #0B0F17;box-shadow:0 0 12px rgba(245,158,11,0.85);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    L.marker([destination.lat, destination.lon], { icon: destIcon })
      .bindTooltip('Destination', { direction: 'top' })
      .addTo(layerGroup);
  }

  if (latLngsForBounds.length > 1) {
    map.fitBounds(L.latLngBounds(latLngsForBounds), { padding: [36, 36] });
  } else {
    map.setView([origin.lat, origin.lon], 12);
  }
}
