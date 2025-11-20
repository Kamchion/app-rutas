import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import RoutesListScreen from './src/screens/RoutesListScreen';
import RouteMapScreen from './src/screens/RouteMapScreen';
import apiService from './src/services/apiService';
import { Route } from './src/types';

type Screen = 'login' | 'routes' | 'map';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('login');
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = await apiService.getToken();
    if (token) {
      setIsAuthenticated(true);
      setCurrentScreen('routes');
    }
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setCurrentScreen('routes');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentScreen('login');
  };

  const handleSelectRoute = (route: Route) => {
    setSelectedRoute(route);
    setCurrentScreen('map');
  };

  const handleBackToRoutes = () => {
    setSelectedRoute(null);
    setCurrentScreen('routes');
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {currentScreen === 'login' && (
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      )}
      {currentScreen === 'routes' && (
        <RoutesListScreen
          onSelectRoute={handleSelectRoute}
          onLogout={handleLogout}
        />
      )}
      {currentScreen === 'map' && selectedRoute && (
        <RouteMapScreen
          route={selectedRoute}
          onBack={handleBackToRoutes}
        />
      )}
    </SafeAreaProvider>
  );
}
