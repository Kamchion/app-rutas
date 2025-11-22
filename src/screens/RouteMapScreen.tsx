import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Linking,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Route, RouteStop, Location as LocationType } from '../types';
import apiService from '../services/apiService';
import { optimizeRoute, generateGoogleMapsUrl, calculateTotalDistance } from '../services/routeOptimizer';

interface RouteMapScreenProps {
  route: Route;
  onBack: () => void;
}

export default function RouteMapScreen({ route: initialRoute, onBack }: RouteMapScreenProps) {
  const [route, setRoute] = useState<Route>(initialRoute);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [optimizedStops, setOptimizedStops] = useState<RouteStop[]>([]);
  const [currentLocation, setCurrentLocation] = useState<LocationType | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOptimized, setIsOptimized] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [locationSubscription, setLocationSubscription] = useState<Location.LocationSubscription | null>(null);

  useEffect(() => {
    loadRouteDetails();
    getCurrentLocation();
    
    return () => {
      // Cleanup: detener seguimiento de ubicación al desmontar
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);

  // Efecto para actualizar la parada actual basado en la ubicación
  useEffect(() => {
    if (!isNavigating || !currentLocation) return;
    
    const stopsToUse = isOptimized ? optimizedStops : stops;
    if (stopsToUse.length === 0) return;
    
    // Calcular distancia a la parada actual
    const currentStop = stopsToUse[currentStopIndex];
    if (!currentStop) return;
    
    const distance = calculateDistanceToStop(currentLocation, currentStop);
    
    // Si está a menos de 100 metros de la parada actual, avanzar a la siguiente
    if (distance < 0.1 && currentStopIndex < stopsToUse.length - 1) {
      Alert.alert(
        'Llegaste a la parada',
        `Has llegado a ${currentStop.clientName}. ¿Marcar como completada?`,
        [
          {
            text: 'No',
            style: 'cancel',
            onPress: () => setCurrentStopIndex(currentStopIndex + 1)
          },
          {
            text: 'Completar',
            onPress: async () => {
              await handleCompleteStop(currentStop);
              setCurrentStopIndex(currentStopIndex + 1);
            }
          }
        ]
      );
    }
  }, [currentLocation, isNavigating, currentStopIndex]);

  const calculateDistanceToStop = (from: LocationType, stop: RouteStop): number => {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (stop.latitude - from.latitude) * Math.PI / 180;
    const dLon = (stop.longitude - from.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(from.latitude * Math.PI / 180) * Math.cos(stop.latitude * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso Denegado', 'Se necesita acceso a la ubicación');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setCurrentLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const loadRouteDetails = async () => {
    try {
      console.log('[RouteMapScreen] Loading route details for:', initialRoute.id);
      const details = await apiService.getRouteDetails(initialRoute.id);
      console.log('[RouteMapScreen] Received details:', JSON.stringify(details, null, 2));
      
      // Validar que las paradas tengan coordenadas válidas
      const validStops = (details.stops || []).filter((stop: RouteStop) => {
        const hasValidCoords = stop.latitude && stop.longitude && 
                               !isNaN(stop.latitude) && !isNaN(stop.longitude) &&
                               stop.latitude !== 0 && stop.longitude !== 0;
        if (!hasValidCoords) {
          console.warn('[RouteMapScreen] Invalid stop coords:', stop.id, stop.latitude, stop.longitude);
        }
        return hasValidCoords;
      });
      
      console.log('[RouteMapScreen] Valid stops:', validStops.length);
      
      if (validStops.length === 0) {
        Alert.alert('Error', 'Esta ruta no tiene paradas con coordenadas válidas');
        onBack();
        return;
      }
      
      setRoute(details);
      setStops(validStops);
      setLoading(false);
    } catch (error: any) {
      console.error('[RouteMapScreen] Error loading route:', error);
      Alert.alert('Error', error.message || 'Error al cargar detalles de la ruta');
      setLoading(false);
    }
  };

  const handleOptimizeRoute = () => {
    if (stops.length === 0) return;

    const optimized = optimizeRoute(stops, currentLocation || undefined);
    setOptimizedStops(optimized);
    setIsOptimized(true);

    const distance = calculateTotalDistance(optimized, currentLocation || undefined);
    Alert.alert(
      'Ruta Optimizada',
      `Distancia estimada: ${distance.toFixed(2)} km\n\n¿Deseas guardar esta optimización?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Guardar',
          onPress: async () => {
            const optimizedOrder = optimized.map((stop, index) => ({
              stopId: stop.id,
              order: index + 1,
            }));
            try {
              await apiService.saveOptimizedRoute(route.id, optimizedOrder);
              Alert.alert('Éxito', 'Ruta optimizada guardada');
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  const handleStartNavigation = () => {
    // Abrir Google Maps para navegar
    const stopsToUse = isOptimized ? optimizedStops : stops;
    if (stopsToUse.length === 0) {
      Alert.alert('Sin paradas', 'No hay paradas para navegar');
      return;
    }

    const url = generateGoogleMapsUrl(stopsToUse, currentLocation || undefined);
    Linking.openURL(url).catch(err => {
      Alert.alert('Error', 'No se pudo abrir Google Maps. Asegúrate de tenerlo instalado.');
      console.error('Error opening maps:', err);
    });
  };

  const handleCompleteStop = async (stop: RouteStop) => {
    Alert.alert(
      'Completar Parada',
      `¿Marcar como completada la entrega en ${stop.clientName}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Completar',
          onPress: async () => {
            try {
              await apiService.completeStop(stop.id);
              await loadRouteDetails();
              Alert.alert('Éxito', 'Parada completada');
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  const handleStartRoute = async () => {
    try {
      await apiService.updateRouteStatus(route.id, 'in_progress');
      setRoute({ ...route, status: 'in_progress' });
      
      // Iniciar navegación interna automáticamente (tracking GPS silencioso)
      startInternalNavigation();
      
      // Preguntar si desea abrir Google Maps
      Alert.alert(
        'Ruta Iniciada',
        '¿Deseas abrir Google Maps para navegar?',
        [
          { 
            text: 'Más tarde', 
            style: 'cancel'
          },
          {
            text: 'Navegar',
            onPress: () => handleStartNavigation()
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const startInternalNavigation = async () => {
    setIsNavigating(true);
    setCurrentStopIndex(0);
    
    // Solicitar permisos de ubicación en segundo plano
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      Alert.alert('Permiso Denegado', 'Se necesita acceso a la ubicación para navegar');
      setIsNavigating(false);
      return;
    }
    
    // Iniciar seguimiento de ubicación en tiempo real
    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 5000, // Actualizar cada 5 segundos
        distanceInterval: 10, // O cada 10 metros
      },
      (location) => {
        setCurrentLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }
    );
    
    setLocationSubscription(subscription);
  };

  const stopInternalNavigation = () => {
    setIsNavigating(false);
    if (locationSubscription) {
      locationSubscription.remove();
      setLocationSubscription(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const stopsToShow = isOptimized ? optimizedStops : stops;
  
  // Calcular región del mapa con validación
  console.log('[RouteMapScreen] Calculating region from stops:', stops.length);
  if (stops.length > 0) {
    console.log('[RouteMapScreen] First stop:', stops[0].clientName, stops[0].latitude, stops[0].longitude);
  }
  
  const region = stops.length > 0 && stops[0].latitude && stops[0].longitude
    ? {
        latitude: Number(stops[0].latitude),
        longitude: Number(stops[0].longitude),
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      }
    : undefined;
  
  console.log('[RouteMapScreen] Region:', region);
  
  // Si no hay región válida, mostrar error
  if (!loading && !region) {
    return (
      <View style={styles.centerContainer}>
        <Text style={{ fontSize: 16, color: '#666', marginBottom: 16 }}>No hay coordenadas válidas para mostrar el mapa</Text>
        <TouchableOpacity onPress={onBack} style={styles.primaryButton}>
          <Text style={styles.buttonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{route.name}</Text>
        <View style={styles.headerRight} />
      </View>

      {region && (
        <MapView
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={region}
          showsUserLocation
          showsMyLocationButton
        >
          {currentLocation && (
            <Marker
              coordinate={currentLocation}
              title="Mi Ubicación"
              pinColor="blue"
            />
          )}

          {stopsToShow.map((stop, index) => {
            const isCurrentStop = isNavigating && index === currentStopIndex;
            const isCompleted = stop.status === 'completed';
            
            return (
              <Marker
                key={stop.id}
                coordinate={{
                  latitude: stop.latitude,
                  longitude: stop.longitude,
                }}
                title={`${index + 1}. ${stop.clientName}`}
                description={stop.address}
                pinColor={
                  isCompleted ? 'green' : 
                  isCurrentStop ? 'orange' : 
                  'red'
                }
                opacity={isCurrentStop ? 1 : 0.7}
              />
            );
          })}

          {stopsToShow.length > 1 && (
            <Polyline
              coordinates={stopsToShow.map(stop => ({
                latitude: stop.latitude,
                longitude: stop.longitude,
              }))}
              strokeColor="#007AFF"
              strokeWidth={3}
            />
          )}
        </MapView>
      )}

      <View style={styles.bottomSheet}>
        {/* Información de navegación activa */}
        {isNavigating && (
          <View style={styles.navigationInfo}>
            <View style={styles.navigationHeader}>
              <Text style={styles.navigationTitle}>🧭 Navegando</Text>
              <Text style={styles.navigationSubtitle}>
                Parada {currentStopIndex + 1} de {stopsToShow.length}
              </Text>
            </View>
            {stopsToShow[currentStopIndex] && (
              <View style={styles.currentStopInfo}>
                <Text style={styles.currentStopName}>
                  {stopsToShow[currentStopIndex].clientName}
                </Text>
                <Text style={styles.currentStopAddress}>
                  {stopsToShow[currentStopIndex].address}
                </Text>
                {currentLocation && (
                  <Text style={styles.distanceText}>
                    📍 {calculateDistanceToStop(currentLocation, stopsToShow[currentStopIndex]).toFixed(2)} km
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        <View style={styles.actions}>
          {route.status === 'pending' ? (
            <TouchableOpacity style={styles.startButton} onPress={handleStartRoute}>
              <Text style={styles.buttonText}>🚀 Iniciar Ruta</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={styles.navigationButton} 
              onPress={handleStartNavigation}
            >
              <Text style={styles.buttonText}>🧭 Navegar</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.secondaryButton} onPress={handleOptimizeRoute}>
            <Text style={styles.buttonText}>
              {isOptimized ? '✓ Optimizada' : '📍 Optimizar'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.stopsList}>
          {stopsToShow.map((stop, index) => (
            <TouchableOpacity
              key={stop.id}
              style={[
                styles.stopCard,
                stop.status === 'completed' && styles.stopCompleted,
              ]}
              onPress={() => handleCompleteStop(stop)}
            >
              <View style={styles.stopNumber}>
                <Text style={styles.stopNumberText}>{index + 1}</Text>
              </View>
              <View style={styles.stopInfo}>
                <Text style={styles.stopName}>{stop.clientName}</Text>
                <Text style={styles.stopAddress}>{stop.address}</Text>
                <Text style={styles.stopSku}>SKU: {stop.clientSku}</Text>
              </View>
              {stop.status === 'completed' && (
                <Text style={styles.completedBadge}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    paddingTop: 45,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 8,
  },
  backText: {
    color: '#007AFF',
    fontSize: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  headerRight: {
    width: 60,
  },
  map: {
    flex: 1,
  },
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 12,
    maxHeight: '35%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  startButton: {
    flex: 1,
    backgroundColor: '#FF3B30',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  navigationButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  stopNavigationButton: {
    flex: 1,
    backgroundColor: '#FF9500',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  externalNavButton: {
    flex: 0.8,
    backgroundColor: '#5856D6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#34C759',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  navigationInfo: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  navigationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  navigationTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#007AFF',
  },
  navigationSubtitle: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  currentStopInfo: {
    marginTop: 8,
  },
  currentStopName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  currentStopAddress: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
    marginTop: 2,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  stopsList: {
    maxHeight: 200,
  },
  stopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
    marginBottom: 6,
  },
  stopCompleted: {
    backgroundColor: '#e8f5e9',
  },
  stopNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  stopNumberText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  stopInfo: {
    flex: 1,
  },
  stopName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 1,
  },
  stopAddress: {
    fontSize: 11,
    color: '#666',
    marginBottom: 1,
  },
  stopSku: {
    fontSize: 10,
    color: '#999',
  },
  completedBadge: {
    fontSize: 20,
    color: '#34C759',
  },
});
