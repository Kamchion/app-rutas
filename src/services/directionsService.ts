import axios from 'axios';

const GOOGLE_MAPS_API_KEY = 'AIzaSyAWOHjwNkLIYNB6lfodvH8VM3RtO7pXk28';

export interface NavigationStep {
  instruction: string;
  distance: {
    text: string;
    value: number; // en metros
  };
  duration: {
    text: string;
    value: number; // en segundos
  };
  startLocation: {
    lat: number;
    lng: number;
  };
  endLocation: {
    lat: number;
    lng: number;
  };
  maneuver?: string; // 'turn-left', 'turn-right', 'straight', etc.
  polyline: string;
}

export interface DirectionsResult {
  steps: NavigationStep[];
  totalDistance: string;
  totalDuration: string;
  overviewPolyline: string;
  legs: any[];
}

class DirectionsService {
  /**
   * Obtiene las direcciones desde un origen a un destino con waypoints opcionales
   */
  async getDirections(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
    waypoints?: { latitude: number; longitude: number }[]
  ): Promise<DirectionsResult> {
    try {
      const originStr = `${origin.latitude},${origin.longitude}`;
      const destinationStr = `${destination.latitude},${destination.longitude}`;
      
      let waypointsStr = '';
      if (waypoints && waypoints.length > 0) {
        const waypointCoords = waypoints
          .map(wp => `${wp.latitude},${wp.longitude}`)
          .join('|');
        waypointsStr = `&waypoints=optimize:true|${waypointCoords}`;
      }

      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destinationStr}${waypointsStr}&mode=driving&traffic_model=best_guess&departure_time=now&key=${GOOGLE_MAPS_API_KEY}`;

      const response = await axios.get(url);

      if (response.data.status !== 'OK') {
        throw new Error(`Directions API error: ${response.data.status}`);
      }

      const route = response.data.routes[0];
      const leg = route.legs[0];

      // Extraer todos los pasos de navegación
      const steps: NavigationStep[] = leg.steps.map((step: any) => ({
        instruction: this.cleanHtmlInstructions(step.html_instructions),
        distance: step.distance,
        duration: step.duration,
        startLocation: {
          lat: step.start_location.lat,
          lng: step.start_location.lng,
        },
        endLocation: {
          lat: step.end_location.lat,
          lng: step.end_location.lng,
        },
        maneuver: step.maneuver,
        polyline: step.polyline.points,
      }));

      return {
        steps,
        totalDistance: leg.distance.text,
        totalDuration: leg.duration.text,
        overviewPolyline: route.overview_polyline.points,
        legs: route.legs,
      };
    } catch (error: any) {
      console.error('Error getting directions:', error);
      throw new Error('No se pudieron obtener las direcciones');
    }
  }

  /**
   * Calcula la distancia entre dos puntos en metros
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Encuentra el paso de navegación más cercano a la ubicación actual
   */
  findCurrentStep(
    currentLocation: { latitude: number; longitude: number },
    steps: NavigationStep[]
  ): { step: NavigationStep; index: number } | null {
    if (!steps || steps.length === 0) return null;

    let closestStep = steps[0];
    let closestIndex = 0;
    let minDistance = this.calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      steps[0].startLocation.lat,
      steps[0].startLocation.lng
    );

    for (let i = 1; i < steps.length; i++) {
      const distance = this.calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        steps[i].startLocation.lat,
        steps[i].startLocation.lng
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestStep = steps[i];
        closestIndex = i;
      }
    }

    return { step: closestStep, index: closestIndex };
  }

  /**
   * Limpia las instrucciones HTML de Google Maps
   */
  private cleanHtmlInstructions(html: string): string {
    return html
      .replace(/<[^>]*>/g, '') // Eliminar tags HTML
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .trim();
  }

  /**
   * Obtiene el icono de maniobra según el tipo
   */
  getManeuverIcon(maneuver?: string): string {
    if (!maneuver) return '⬆️';
    
    const icons: { [key: string]: string } = {
      'turn-left': '↰',
      'turn-right': '↱',
      'turn-slight-left': '↖',
      'turn-slight-right': '↗',
      'turn-sharp-left': '⬅',
      'turn-sharp-right': '➡',
      'uturn-left': '↶',
      'uturn-right': '↷',
      'straight': '⬆',
      'ramp-left': '↰',
      'ramp-right': '↱',
      'merge': '⤴',
      'fork-left': '↖',
      'fork-right': '↗',
      'roundabout-left': '↺',
      'roundabout-right': '↻',
    };

    return icons[maneuver] || '⬆️';
  }

  /**
   * Decodifica un polyline de Google Maps
   */
  decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
    const points: { latitude: number; longitude: number }[] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let b;
      let shift = 0;
      let result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      points.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }

    return points;
  }
}

export default new DirectionsService();
