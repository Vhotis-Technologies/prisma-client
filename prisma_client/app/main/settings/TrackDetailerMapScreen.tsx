import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "@/app/components/helpers/StyledText";
import { useFetchDetailerLocationQuery } from "@/app/store/api/dashboardApi";

// Shorter interval when tracking detailer (within ~30 min of appointment)
const POLL_INTERVAL_MS = 15000;

export default function TrackDetailerMapScreen() {
  const { booking_reference, address_lat, address_lng, detailer_name } =
    useLocalSearchParams<{
      booking_reference: string;
      address_lat?: string;
      address_lng?: string;
      detailer_name?: string;
    }>();

  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const primaryColor = useThemeColor({}, "primary");

  const serviceLat = address_lat != null ? parseFloat(address_lat) : null;
  const serviceLng = address_lng != null ? parseFloat(address_lng) : null;

  const {
    data: detailerLocation,
    isLoading,
    isError,
  } = useFetchDetailerLocationQuery(booking_reference ?? "", {
    skip: !booking_reference,
    pollingInterval: POLL_INTERVAL_MS,
  });

  const [, setMapReady] = useState(false);

  const markers = useMemo(() => {
    const list: Array<{
      id: string;
      coordinates: { latitude: number; longitude: number };
      title?: string;
    }> = [];
    if (detailerLocation?.latitude != null && detailerLocation?.longitude != null) {
      list.push({
        id: "detailer",
        coordinates: {
          latitude: detailerLocation.latitude,
          longitude: detailerLocation.longitude,
        },
        title: detailer_name || "Detailer",
      });
    }
    if (serviceLat != null && serviceLng != null) {
      list.push({
        id: "service",
        coordinates: { latitude: serviceLat, longitude: serviceLng },
        title: "Service location",
      });
    }
    return list;
  }, [detailerLocation, serviceLat, serviceLng, detailer_name]);

  const cameraCoordinates = useMemo(() => {
    if (markers.length === 0) {
      return { latitude: 53.3498, longitude: -6.2603, zoom: 10 };
    }
    if (markers.length === 1) {
      return {
        latitude: markers[0].coordinates.latitude,
        longitude: markers[0].coordinates.longitude,
        zoom: 14,
      };
    }
    const lat =
      (markers[0].coordinates.latitude + markers[1].coordinates.latitude) / 2;
    const lng =
      (markers[0].coordinates.longitude + markers[1].coordinates.longitude) / 2;
    return { latitude: lat, longitude: lng, zoom: 12 };
  }, [markers]);

  const MapContent = () => {
    if (Platform.OS === "android") {
      const { GoogleMaps } = require("expo-maps");
      return (
        <GoogleMaps.View
          style={styles.map}
          cameraPosition={{
            coordinates: {
              latitude: cameraCoordinates.latitude,
              longitude: cameraCoordinates.longitude,
            },
            zoom: cameraCoordinates.zoom,
          }}
          markers={markers.map((m) => ({
            id: m.id,
            coordinates: m.coordinates,
            title: m.title,
          }))}
          onMapLoaded={() => setMapReady(true)}
        />
      );
    }
    const { AppleMaps } = require("expo-maps");
    return (
      <AppleMaps.View
        style={styles.map}
        cameraPosition={{
          coordinates: {
            latitude: cameraCoordinates.latitude,
            longitude: cameraCoordinates.longitude,
          },
          zoom: cameraCoordinates.zoom,
        }}
        markers={markers.map((m) => ({
          id: m.id,
          coordinates: m.coordinates,
          title: m.title,
        }))}
      />
    );
  };

  if (!booking_reference) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <StyledText style={{ color: textColor }}>Missing booking reference.</StyledText>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <TouchableOpacity
        style={[styles.backButton, { backgroundColor }]}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={24} color={textColor} />
      </TouchableOpacity>

      {isLoading && !detailerLocation && markers.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={primaryColor} />
          <StyledText style={[styles.message, { color: textColor }]}>
            Loading detailer location...
          </StyledText>
        </View>
      ) : markers.length > 0 ? (
        <View style={styles.mapContainer}>
          <MapContent />
          {isError && !detailerLocation && (
            <View style={[styles.banner, { backgroundColor: primaryColor + "20" }]}>
              <StyledText variant="bodySmall" style={{ color: textColor }}>
                Detailer location unavailable. Showing service address.
              </StyledText>
            </View>
          )}
          <View style={[styles.legend, { backgroundColor }]}>
            {detailerLocation && (
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: primaryColor }]} />
                <StyledText variant="bodySmall" style={{ color: textColor }}>
                  {detailer_name || "Detailer"}
                </StyledText>
              </View>
            )}
            {serviceLat != null && serviceLng != null && (
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: "#10B981" }]} />
                <StyledText variant="bodySmall" style={{ color: textColor }}>
                  Service location
                </StyledText>
              </View>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.centered}>
          <Ionicons name="location-outline" size={48} color={textColor} />
          <StyledText style={[styles.message, { color: textColor }]}>
            {isLoading
              ? "Loading detailer location..."
              : "No location data to display. Service address may not have coordinates."}
          </StyledText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    position: "absolute",
    top: 10,
    left: 10,
    zIndex: 10,
    padding: 8,
    borderRadius: 24,
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
    width: "100%",
  },
  legend: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    padding: 12,
    borderRadius: 12,
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    marginTop: 60,
  },
  message: {
    marginTop: 12,
    textAlign: "center",
  },
  banner: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
  },
});
