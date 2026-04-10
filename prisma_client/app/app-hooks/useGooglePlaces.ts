/**
 * Google Places autocomplete and place details for address search. Uses KEY_CONFIGS and fetch; not a route.
 */
// @expo-router-ignore - This is a utility file, not a route
import { useState, useCallback } from "react";
import { KEY_CONFIGS } from "../../constants/Config";

export interface PlacePrediction {
  description: string;
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
  types?: string[];
}

export interface PlaceDetails {
  place_id: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  name?: string;
  address_components?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
}

export interface PlacesApiResponse {
  predictions: PlacePrediction[];
  status: string;
}

export interface PlaceDetailsApiResponse {
  result: PlaceDetails;
  status: string;
}

/**
 * Get place predictions (autocomplete) as user types
 * @param input - User input text
 * @param location - Optional bias location (lat, lng) to prioritize results near user
 * @param radius - Optional radius in meters for location bias (default: 50000 = 50km)
 * @returns Array of place predictions
 */
export async function getPlacePredictions(
  input: string,
  location?: { latitude: number; longitude: number },
  radius: number = 50000
): Promise<PlacePrediction[]> {
  if (!KEY_CONFIGS.googleApiKeys) {
    console.error("Google Maps API key not configured");
    return [];
  }

  if (!input || input.length < 2) {
    return [];
  }

  try {
    let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
      input
    )}&key=${KEY_CONFIGS.googleApiKeys}`;

    // Add location bias if provided (helps prioritize results near user)
    if (location) {
      url += `&location=${location.latitude},${location.longitude}&radius=${radius}`;
    }

    const response = await fetch(url);
    const data: PlacesApiResponse = await response.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return [];
    }

    return data.predictions || [];
  } catch (error) {
    console.error("Error fetching place predictions:", error);
    return [];
  }
}

/**
 * Get place details by place_id
 * @param placeId - Place ID from prediction
 * @returns Place details including coordinates and formatted address
 */
export async function getPlaceDetails(
  placeId: string
): Promise<PlaceDetails | null> {
  if (!KEY_CONFIGS.googleApiKeys) {
    return null;
  }

  try {
    const fields = [
      "place_id",
      "formatted_address",
      "geometry",
      "name",
      "address_components",
    ].join(",");

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${KEY_CONFIGS.googleApiKeys}`;

    const response = await fetch(url);
    const data: PlaceDetailsApiResponse = await response.json();

    if (data.status !== "OK") {
      return null;
    }

    return data.result;
  } catch (error) {
    console.error("Error fetching place details:", error);
    return null;
  }
}

/**
 * Convert place details to RoutePoint format
 * @param placeDetails - Place details from getPlaceDetails
 * @returns RoutePoint with latitude, longitude, and address
 */
export function placeDetailsToRoutePoint(placeDetails: PlaceDetails): {
  latitude: number;
  longitude: number;
  address: string;
} {
  return {
    latitude: placeDetails.geometry.location.lat,
    longitude: placeDetails.geometry.location.lng,
    address: placeDetails.formatted_address,
  };
}

/**
 * Parse address components from PlaceDetails to extract structured address fields
 * @param placeDetails - Place details from getPlaceDetails
 * @returns Object with address, post_code, city, and country
 */
export function parseAddressComponents(placeDetails: PlaceDetails): {
  address: string;
  post_code: string;
  city: string;
  country: string;
} {
  const components = placeDetails.address_components || [];

  // Helper function to find component by type
  const findComponent = (type: string) => {
    return components.find((component) => component.types.includes(type));
  };

  // Extract street number and route for address
  const streetNumber = findComponent("street_number");
  const route = findComponent("route");
  const subpremise = findComponent("subpremise"); // For apartment numbers, etc.
  const premise = findComponent("premise"); // For building names

  const addressParts = [];
  if (streetNumber) addressParts.push(streetNumber.long_name);
  if (route) addressParts.push(route.long_name);
  if (subpremise) addressParts.push(subpremise.long_name);
  if (premise) addressParts.push(premise.long_name);

  // If we have address parts, use them; otherwise use the first part of formatted_address
  const address =
    addressParts.length > 0
      ? addressParts.join(" ")
      : placeDetails.formatted_address.split(",")[0]?.trim() || "";

  // Extract postal code
  const postalCodeComponent = findComponent("postal_code");
  const postcodeComponent = findComponent("postal_code_prefix"); // Some countries use this
  const post_code =
    postalCodeComponent?.long_name || postcodeComponent?.long_name || "";

  // Extract country first (needed for Ireland normalization)
  const countryComponent = findComponent("country");
  const country = countryComponent?.long_name || "";

  // Extract city with neighborhood-aware logic for service area matching
  // When locality is a neighborhood (e.g. Ballentree Village), prefer admin areas for broader city
  const NEIGHBORHOOD_INDICATORS = [
    "Village",
    "Park",
    "Gardens",
    "Heights",
    "Lodge",
    "Wood",
    "Green",
    "Estate",
    "Meadow",
  ];
  const localityComponent = findComponent("locality");
  const sublocalityComponent = findComponent("sublocality");
  const adminLevel1 = findComponent("administrative_area_level_1");
  const adminLevel2 = findComponent("administrative_area_level_2");
  const localityName = localityComponent?.long_name || "";
  const isLikelyNeighborhood = NEIGHBORHOOD_INDICATORS.some((ind) =>
    localityName.toLowerCase().includes(ind.toLowerCase())
  );

  let cityComponent;
  if (isLikelyNeighborhood) {
    // Prefer administrative area for neighborhoods (broader service area)
    cityComponent = adminLevel2 || adminLevel1 || localityComponent;
  } else {
    cityComponent =
      localityComponent ||
      sublocalityComponent ||
      adminLevel2 ||
      adminLevel1;
  }
  let city = cityComponent?.long_name || "";

  // Normalize Irish Dublin counties to "Dublin" for matching
  const DUBLIN_COUNTIES = [
    "South Dublin",
    "Dún Laoghaire-Rathdown",
    "Dun Laoghaire-Rathdown",
    "Fingal",
    "Dublin City",
    "County Dublin",
  ];
  if (
    country === "Ireland" &&
    DUBLIN_COUNTIES.some((c) => city.toLowerCase().includes(c.toLowerCase()))
  ) {
    city = "Dublin";
  }

  return {
    address,
    post_code,
    city,
    country,
  };
}

/**
 * React hook for managing Google Places autocomplete suggestions
 * @returns Object with suggestions, loading state, error, and functions to search and get details
 */
export function useGooglePlaces() {
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Search for address suggestions based on user input
   * @param input - User input text
   * @param location - Optional location bias (lat, lng)
   */
  const searchAddresses = useCallback(
    async (
      input: string,
      location?: { latitude: number; longitude: number }
    ) => {
      if (!input || input.trim().length < 2) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const predictions = await getPlacePredictions(input, location);
        setSuggestions(predictions);
      } catch (err) {
        console.error("Error searching addresses:", err);
        setError("Failed to search addresses");
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Get place details by place_id and parse address components
   * @param placeId - Place ID from prediction
   * @returns Parsed address components or null if error
   */
  const getPlaceDetailsParsed = useCallback(async (placeId: string) => {
    try {
      const placeDetails = await getPlaceDetails(placeId);
      if (!placeDetails) {
        return null;
      }

      const parsed = parseAddressComponents(placeDetails);
      return parsed;
    } catch (err) {
      return null;
    }
  }, []);

  /**
   * Clear suggestions
   */
  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setError(null);
  }, []);

  return {
    suggestions,
    isLoading,
    error,
    searchAddresses,
    getPlaceDetails: getPlaceDetailsParsed,
    clearSuggestions,
  };
}
