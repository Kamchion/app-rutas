import { RouteStop, Location } from '../types';

// Función para calcular distancia entre dos puntos (Haversine)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Algoritmo del vecino más cercano para optimizar ruta
export function optimizeRoute(stops: RouteStop[], startLocation?: Location): RouteStop[] {
  if (stops.length <= 1) return stops;

  const unvisited = [...stops];
  const optimized: RouteStop[] = [];
  
  let currentLocation: Location = startLocation || {
    latitude: stops[0].latitude,
    longitude: stops[0].longitude
  };

  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    // Encontrar la parada más cercana
    unvisited.forEach((stop, index) => {
      const distance = calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        stop.latitude,
        stop.longitude
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    // Agregar la parada más cercana a la ruta optimizada
    const nearest = unvisited.splice(nearestIndex, 1)[0];
    optimized.push(nearest);
    currentLocation = {
      latitude: nearest.latitude,
      longitude: nearest.longitude
    };
  }

  return optimized;
}

// Generar URL de Google Maps con múltiples waypoints
export function generateGoogleMapsUrl(stops: RouteStop[], startLocation?: Location): string {
  if (stops.length === 0) return '';

  const origin = startLocation 
    ? `${startLocation.latitude},${startLocation.longitude}`
    : `${stops[0].latitude},${stops[0].longitude}`;

  const destination = `${stops[stops.length - 1].latitude},${stops[stops.length - 1].longitude}`;

  // Google Maps soporta hasta 9 waypoints en la URL
  const waypoints = stops.slice(startLocation ? 0 : 1, -1)
    .slice(0, 9)
    .map(stop => `${stop.latitude},${stop.longitude}`)
    .join('|');

  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;

  if (waypoints) {
    url += `&waypoints=${waypoints}`;
  }

  return url;
}

// Calcular distancia total de la ruta
export function calculateTotalDistance(stops: RouteStop[], startLocation?: Location): number {
  if (stops.length === 0) return 0;

  let total = 0;
  let current: Location = startLocation || {
    latitude: stops[0].latitude,
    longitude: stops[0].longitude
  };

  stops.forEach(stop => {
    total += calculateDistance(
      current.latitude,
      current.longitude,
      stop.latitude,
      stop.longitude
    );
    current = { latitude: stop.latitude, longitude: stop.longitude };
  });

  return total;
}
