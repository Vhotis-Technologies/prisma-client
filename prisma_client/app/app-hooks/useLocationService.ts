/**
 * Device location: get current position, watch position, permission handling via usePermissions.
 */
import { useState, useEffect, useRef } from "react";
import * as Location from "expo-location";
import { usePermissions } from "./usePermissions";

/**
 * Location data interface
 */
export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

/**
 * Location service hook that handles location functionality
 *
 * Features:
 * - Get current location
 * - Watch location changes
 * - Calculate distance between points
 * - Handle location errors gracefully
 * - Integrates with permission system
 */
export const useLocationService = () => {
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(
    null
  );
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocationLoading, setIsLocationLoading] = useState(false);
  const locationSubscription = useRef<Location.LocationSubscription | null>(
    null
  );
  const { permissionStatus } = usePermissions();

  /**
   * Get current location once
   */
  const getCurrentLocation = async (): Promise<LocationData | null> => {
    if (!permissionStatus.location.granted) {
      setLocationError("Location permission not granted");
      return null;
    }

    setIsLocationLoading(true);
    setLocationError(null);

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000,
        distanceInterval: 10,
      });

      const locationData: LocationData = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy || undefined,
        altitude: location.coords.altitude || undefined,
        heading: location.coords.heading || undefined,
        speed: location.coords.speed || undefined,
        timestamp: location.timestamp,
      };

      setCurrentLocation(locationData);
      return locationData;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get location";
      setLocationError(errorMessage);
      console.error("Error getting current location:", error);
      return null;
    } finally {
      setIsLocationLoading(false);
    }
  };

  /**
   * Start watching location changes
   */
  const startLocationUpdates = async (
    options: {
      accuracy?: Location.Accuracy;
      timeInterval?: number;
      distanceInterval?: number;
    } = {}
  ) => {
    if (!permissionStatus.location.granted) {
      setLocationError("Location permission not granted");
      return false;
    }

    try {
      // Stop any existing subscription
      if (locationSubscription.current) {
        await stopLocationUpdates();
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: options.accuracy || Location.Accuracy.Balanced,
          timeInterval: options.timeInterval || 5000,
          distanceInterval: options.distanceInterval || 10,
        },
        (location) => {
          const locationData: LocationData = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy || undefined,
            altitude: location.coords.altitude || undefined,
            heading: location.coords.heading || undefined,
            speed: location.coords.speed || undefined,
            timestamp: location.timestamp,
          };

          setCurrentLocation(locationData);
          setLocationError(null);
        }
      );

      locationSubscription.current = subscription;
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to start location updates";
      setLocationError(errorMessage);
      console.error("Error starting location updates:", error);
      return false;
    }
  };

  /**
   * Stop watching location changes
   */
  const stopLocationUpdates = async () => {
    if (locationSubscription.current) {
      await locationSubscription.current.remove();
      locationSubscription.current = null;
    }
  };

  /**
   * Calculate distance between two points using Haversine formula
   */
  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in kilometers
    return distance;
  };

  /**
   * Calculate distance from current location to a point
   */
  const getDistanceFromCurrentLocation = (
    targetLat: number,
    targetLon: number
  ): number | null => {
    if (!currentLocation) {
      return null;
    }

    return calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      targetLat,
      targetLon
    );
  };

  /**
   * Get location name from coordinates (reverse geocoding)
   */
  const getLocationName = async (
    latitude: number,
    longitude: number
  ): Promise<string | null> => {
    try {
      const results = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (results.length > 0) {
        const address = results[0];
        const parts = [
          address.street,
          address.city,
          address.postalCode,
          address.region,
          address.country,
        ].filter(Boolean);
        return parts.join(", ");
      }

      return null;
    } catch (error) {
      console.error("Error getting location name:", error);
      return null;
    }
  };

  /**
   * Get coordinates from address (geocoding)
   */
  const getCoordinatesFromAddress = async (
    address: string
  ): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      const results = await Location.geocodeAsync(address);

      if (results.length > 0) {
        return {
          latitude: results[0].latitude,
          longitude: results[0].longitude,
        };
      }

      return null;
    } catch (error) {
      console.error("Error getting coordinates from address:", error);
      return null;
    }
  };

  /**
   * Check if location services are enabled
   */
  const checkLocationServicesEnabled = async (): Promise<boolean> => {
    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        setLocationError("Location services are disabled");
      }
      return enabled;
    } catch (error) {
      console.error("Error checking location services:", error);
      return false;
    }
  };

  /**
   * Initialize location service
   */
  const initializeLocationService = async () => {
    if (permissionStatus.location.granted) {
      const servicesEnabled = await checkLocationServicesEnabled();
      if (servicesEnabled) {
        await getCurrentLocation();
      }
    }
  };

  // Initialize on mount and when permission changes
  useEffect(() => {
    initializeLocationService();

    return () => {
      stopLocationUpdates();
    };
  }, [permissionStatus.location.granted]);

  return {
    currentLocation,
    locationError,
    isLocationLoading,
    getCurrentLocation,
    startLocationUpdates,
    stopLocationUpdates,
    calculateDistance,
    getDistanceFromCurrentLocation,
    getLocationName,
    getCoordinatesFromAddress,
    checkLocationServicesEnabled,
    initializeLocationService,
  };
};
