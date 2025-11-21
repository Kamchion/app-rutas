import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Route, RouteStop } from '../types';

const API_URL = 'https://manus-store-production.up.railway.app';

class ApiService {
  private token: string | null = null;

  async setToken(token: string) {
    this.token = token;
    await AsyncStorage.setItem('auth_token', token);
  }

  async getToken() {
    if (!this.token) {
      this.token = await AsyncStorage.getItem('auth_token');
    }
    return this.token;
  }

  async clearToken() {
    this.token = null;
    await AsyncStorage.removeItem('auth_token');
  }

  private async getHeaders() {
    const token = await this.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Cookie': `session=${token}` }),
    };
  }

  async login(phoneNumber: string, password: string) {
    try {
      console.log('Intentando login con:', phoneNumber);
      
      const response = await axios.post(
        `${API_URL}/api/trpc/driver.login`,
        { json: { phoneNumber, password } },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );

      console.log('Respuesta del servidor:', response.data);

      // TRPC devuelve los datos en result.data
      const data = response.data?.result?.data;
      
      if (data?.success && data?.token) {
        await this.setToken(data.token);
        return data;
      }

      throw new Error('Credenciales inválidas');
    } catch (error: any) {
      console.error('Error en login:', error.response?.data || error.message);
      
      // Extraer mensaje de error de TRPC
      const errorMessage = error.response?.data?.error?.json?.message 
        || error.response?.data?.error?.message
        || error.message 
        || 'Error al iniciar sesión';
      
      throw new Error(errorMessage);
    }
  }

  async getMyRoutes() {
    try {
      const token = await this.getToken();
      const response = await axios.get(
        `${API_URL}/api/trpc/route.getRoutes`,
        {
          headers: await this.getHeaders(),
          params: {
            input: JSON.stringify({
              json: {}
            })
          }
        }
      );

      return response.data?.result?.data?.json || [];
    } catch (error: any) {
      console.error('Error fetching routes:', error);
      throw new Error('Error al obtener rutas');
    }
  }

  async getRouteDetails(routeId: string): Promise<Route> {
    try {
      const response = await axios.get(
        `${API_URL}/api/trpc/route.getRouteDetails`,
        {
          headers: await this.getHeaders(),
          params: {
            input: JSON.stringify({
              json: { routeId }
            })
          }
        }
      );

      return response.data?.result?.data?.json;
    } catch (error: any) {
      console.error('Error fetching route details:', error);
      throw new Error('Error al obtener detalles de ruta');
    }
  }

  async updateRouteStatus(routeId: string, status: string) {
    try {
      await axios.post(
        `${API_URL}/api/trpc/route.updateRouteStatus`,
        {
          json: { routeId, status }
        },
        {
          headers: await this.getHeaders()
        }
      );
    } catch (error: any) {
      console.error('Error updating route status:', error);
      throw new Error('Error al actualizar estado de ruta');
    }
  }

  async completeStop(stopId: string, notes?: string) {
    try {
      await axios.post(
        `${API_URL}/api/trpc/route.completeStop`,
        {
          json: { stopId, notes }
        },
        {
          headers: await this.getHeaders()
        }
      );
    } catch (error: any) {
      console.error('Error completing stop:', error);
      throw new Error('Error al completar parada');
    }
  }

  async saveOptimizedRoute(routeId: string, optimizedOrder: Array<{ stopId: string; order: number }>) {
    try {
      await axios.post(
        `${API_URL}/api/trpc/route.saveOptimizedRoute`,
        {
          json: { routeId, optimizedOrder }
        },
        {
          headers: await this.getHeaders()
        }
      );
    } catch (error: any) {
      console.error('Error saving optimized route:', error);
      throw new Error('Error al guardar ruta optimizada');
    }
  }
}

export default new ApiService();
