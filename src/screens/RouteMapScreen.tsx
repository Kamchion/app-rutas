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

  useEffect(() => {
    loadRouteDetails();
    getCurrentLocation();
  }, []);

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
    const stopsToUse = isOptimized ? optimizedStops : stops;
    if (stopsToUse.length === 0) return;

    const url = generateGoogleMapsUrl(stopsToUse, currentLocation || undefined);
    Linking.openURL(url);
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
      
      // Iniciar navegación automáticamente
      const stopsToUse = isOptimized ? optimizedStops : stops;
      if (stopsToUse.length > 0) {
        const url = generateGoogleMapsUrl(stopsToUse, currentLocation || undefined);
        
        Alert.alert(
          'Ruta Iniciada',
          '¿Deseas abrir la navegación en Google Maps?',
          [
            { 
              text: 'Más tarde', 
              style: 'cancel'
            },
            {
              text: 'Navegar Ahora',
              onPress: () => Linking.openURL(url)
            },
          ]
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
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

          {stopsToShow.map((stop, index) => (
            <Marker
              key={stop.id}
              coordinate={{
                latitude: stop.latitude,
                longitude: stop.longitude,
              }}
              title={`${index + 1}. ${stop.clientName}`}
              description={stop.address}
              pinColor={stop.status === 'completed' ? 'green' : 'red'}
            />
          ))}

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
        <View style={styles.actions}>
          {route.status === 'pending' ? (
            <TouchableOpacity style={styles.startButton} onPress={handleStartRoute}>
              <Text style={styles.buttonText}>🚀 Iniciar Ruta</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.navigationButton} onPress={handleStartNavigation}>
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
    padding: 16,
    paddingTop: 60,
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
    fontSize: 18,
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '50%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
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
  secondaryButton: {
    flex: 1,
    backgroundColor: '#34C759',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  stopsList: {
    maxHeight: 300,
  },
  stopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 8,
  },
  stopCompleted: {
    backgroundColor: '#e8f5e9',
  },
  stopNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stopNumberText: {
    color: '#fff',
    fontWeight: '600',
  },
  stopInfo: {
    flex: 1,
  },
  stopName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  stopAddress: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  stopSku: {
    fontSize: 11,
    color: '#999',
  },
  completedBadge: {
    fontSize: 24,
    color: '#34C759',
  },
});
