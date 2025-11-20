export interface Driver {
  id: string;
  name: string;
  phoneNumber: string;
  isActive: boolean;
}

export interface RouteStop {
  id: string;
  routeId: string;
  clientId: string;
  clientName: string;
  clientSku: string;
  address: string;
  latitude: number;
  longitude: number;
  stopOrder: number;
  optimizedOrder?: number;
  status: 'pending' | 'completed' | 'skipped';
  completedAt?: string;
  notes?: string;
}

export interface Route {
  id: string;
  name: string;
  driverId: string;
  driverName: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  routeDate: string;
  totalStops: number;
  completedStops: number;
  optimizedRoute?: any;
  stops?: RouteStop[];
}

export interface Location {
  latitude: number;
  longitude: number;
}
