import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import apiService from './apiService';

const LOCATION_TASK_NAME = 'background-location-task';
const UPDATE_INTERVAL = 30000; // 30 segundos
const DISTANCE_INTERVAL = 50; // 50 metros

/**
 * Servicio de rastreo GPS en segundo plano
 * Envía la ubicación del chofer al backend de manera silenciosa
 */
class LocationTracker {
  private isTracking: boolean = false;
  private foregroundSubscription: Location.LocationSubscription | null = null;

  /**
   * Iniciar rastreo de ubicación
   */
  async startTracking() {
    if (this.isTracking) {
      console.log('[LocationTracker] Ya está rastreando');
      return;
    }

    try {
      // Solicitar permisos de ubicación
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      
      if (foregroundStatus !== 'granted') {
        console.log('[LocationTracker] Permiso de ubicación denegado');
        return;
      }

      // Intentar obtener permisos de background (opcional, no bloqueante)
      try {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus === 'granted') {
          console.log('[LocationTracker] Permisos de background concedidos');
          await this.startBackgroundTracking();
        } else {
          console.log('[LocationTracker] Permisos de background no concedidos, usando foreground');
          await this.startForegroundTracking();
        }
      } catch (error) {
        console.log('[LocationTracker] Background no disponible, usando foreground');
        await this.startForegroundTracking();
      }

      this.isTracking = true;
      console.log('[LocationTracker] Rastreo iniciado');
    } catch (error) {
      console.error('[LocationTracker] Error al iniciar rastreo:', error);
    }
  }

  /**
   * Detener rastreo de ubicación
   */
  async stopTracking() {
    if (!this.isTracking) {
      return;
    }

    try {
      // Detener foreground tracking
      if (this.foregroundSubscription) {
        this.foregroundSubscription.remove();
        this.foregroundSubscription = null;
      }

      // Detener background tracking
      const isTaskDefined = await TaskManager.isTaskDefined(LOCATION_TASK_NAME);
      if (isTaskDefined) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }

      this.isTracking = false;
      console.log('[LocationTracker] Rastreo detenido');
    } catch (error) {
      console.error('[LocationTracker] Error al detener rastreo:', error);
    }
  }

  /**
   * Iniciar rastreo en primer plano
   */
  private async startForegroundTracking() {
    this.foregroundSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: UPDATE_INTERVAL,
        distanceInterval: DISTANCE_INTERVAL,
      },
      async (location) => {
        await this.sendLocationUpdate(location);
      }
    );
  }

  /**
   * Iniciar rastreo en segundo plano
   */
  private async startBackgroundTracking() {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: UPDATE_INTERVAL,
      distanceInterval: DISTANCE_INTERVAL,
      foregroundService: {
        notificationTitle: 'Rutas Activas',
        notificationBody: 'Rastreando tu ubicación',
        notificationColor: '#007AFF',
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: false, // No mostrar indicador en iOS
    });
  }

  /**
   * Enviar actualización de ubicación al backend
   */
  private async sendLocationUpdate(location: Location.LocationObject) {
    try {
      const { latitude, longitude, accuracy } = location.coords;
      const timestamp = new Date(location.timestamp).toISOString();

      await apiService.updateLocation({
        latitude,
        longitude,
        accuracy: accuracy || 0,
        timestamp,
      });

      console.log('[LocationTracker] Ubicación enviada:', {
        lat: latitude.toFixed(6),
        lng: longitude.toFixed(6),
        accuracy: accuracy?.toFixed(0),
      });
    } catch (error) {
      console.error('[LocationTracker] Error al enviar ubicación:', error);
    }
  }

  /**
   * Verificar si está rastreando
   */
  isCurrentlyTracking(): boolean {
    return this.isTracking;
  }
}

// Definir la tarea de background
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[LocationTracker] Error en background task:', error);
    return;
  }

  if (data) {
    const { locations } = data as any;
    if (locations && locations.length > 0) {
      const location = locations[0];
      
      try {
        const { latitude, longitude, accuracy } = location.coords;
        const timestamp = new Date(location.timestamp).toISOString();

        await apiService.updateLocation({
          latitude,
          longitude,
          accuracy: accuracy || 0,
          timestamp,
        });

        console.log('[LocationTracker] Background update enviado');
      } catch (error) {
        console.error('[LocationTracker] Error en background update:', error);
      }
    }
  }
});

export default new LocationTracker();
