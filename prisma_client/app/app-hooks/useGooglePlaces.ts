/**
 * Google Places autocomplete and place details via the Prisma server proxy.
 * The API key stays server-side; clients never call Google directly.
 */
// @expo-router-ignore - This is a utility file, not a route
import { useState, useCallback } from "react";
import { API_CONFIG } from "../../constants/Config";

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

type PlacesStatusResponse = {
  configured: boolean;
};

let configuredCache: boolean | null = null;

function apiBase(): string {
  return String(API_CONFIG.customerAppUrl || "").replace(/\/$/, "");
}

/** Whether the server has Google Places configured. */
export async function isPlacesAvailable(): Promise<boolean> {
  if (configuredCache !== null) return configuredCache;
  const base = apiBase();
  if (!base) {
    configuredCache = false;
    return false;
  }
  try {
    const response = await fetch(`${base}/api/v1/places/status/`);
    if (!response.ok) {
      configuredCache = false;
      return false;
    }
    const data = (await response.json()) as PlacesStatusResponse;
    configuredCache = Boolean(data.configured);
    return configuredCache;
  } catch {
    configuredCache = false;
    return false;
  }
}

async function placesGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const base = apiBase();
  if (!base) {
    throw new Error("API URL is not configured");
  }
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${base}/api/v1/places/${path}/?${query}`);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "Address search failed");
  }
  return response.json() as Promise<T>;
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
  if (!input || input.length < 2) {
    return [];
  }

  try {
    const params: Record<string, string> = { input };
    if (location) {
      params.latitude = String(location.latitude);
      params.longitude = String(location.longitude);
      params.radius = String(radius);
    }
    const data = await placesGet<PlacesApiResponse>("autocomplete", params);
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
  if (!placeId) {
    return null;
  }

  try {
    const data = await placesGet<PlaceDetailsApiResponse>("details", {
      place_id: placeId,
    });
    if (data.status !== "OK" || !data.result) {
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
  const postalTownComponent = findComponent("postal_town");
  const sublocalityComponent =
    findComponent("sublocality") || findComponent("sublocality_level_1");
  const neighborhoodComponent = findComponent("neighborhood");
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
      postalTownComponent ||
      sublocalityComponent ||
      neighborhoodComponent ||
      adminLevel2 ||
      adminLevel1;
  }
  let city = cityComponent?.long_name || "";

  // Irish forms use the postal district (D12, D15) as city, not "Dublin".
  const DUBLIN_COUNTIES = [
    "South Dublin",
    "Dún Laoghaire-Rathdown",
    "Dun Laoghaire-Rathdown",
    "Fingal",
    "Dublin City",
    "County Dublin",
  ];
  const DUBLIN_ROUTING_KEY = /^D(?:6W|0[1-9]|1[0-8]|20|22|24)$/;
  const dublinFromEircode = (() => {
    const routing = post_code.trim().toUpperCase().replace(/\s+/g, "").slice(0, 3);
    return DUBLIN_ROUTING_KEY.test(routing) ? routing : null;
  })();
  const dublinFromText = (text: string) => {
    if (!text) return null;
    if (/Dublin\s*6W\b/i.test(text)) return "D6W";
    const match = text.match(/Dublin\s+(\d{1,2})\b/i);
    if (!match) return null;
    const key = `D${String(Number(match[1])).padStart(2, "0")}`;
    return DUBLIN_ROUTING_KEY.test(key) ? key : null;
  };
  const cityLooksDublin =
    city.toLowerCase() === "dublin" ||
    DUBLIN_COUNTIES.some((c) => city.toLowerCase().includes(c.toLowerCase()));
  if (country === "Ireland" || country === "IE") {
    const district =
      dublinFromEircode ||
      dublinFromText(placeDetails.formatted_address) ||
      dublinFromText(sublocalityComponent?.long_name || "") ||
      dublinFromText(neighborhoodComponent?.long_name || "") ||
      dublinFromText(postalTownComponent?.long_name || "");
    if (district && (cityLooksDublin || !city)) {
      city = district;
    } else if (cityLooksDublin) {
      city = "Dublin";
    }
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
    } catch {
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
