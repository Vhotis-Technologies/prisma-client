import type { BusinessAddress } from "../types/user";
import { getApiBaseUrl } from "./api";

type AddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

export type PlaceDetails = {
  place_id?: string;
  formatted_address: string;
  geometry?: { location: { lat: number; lng: number } };
  name?: string;
  address_components?: AddressComponent[];
};

export type PlacePrediction = {
  description: string;
  place_id: string;
  structured_formatting?: {
    main_text: string;
    secondary_text: string;
  };
  types?: string[];
};

type AutocompleteResponse = {
  predictions: PlacePrediction[];
  status: string;
};

type DetailsResponse = {
  result: PlaceDetails | null;
  status: string;
};

type PlacesStatusResponse = {
  configured: boolean;
};

let configuredCache: boolean | null = null;

/** Whether the server has a Google Places API key configured. */
export async function isPlacesAvailable(): Promise<boolean> {
  if (configuredCache !== null) return configuredCache;
  try {
    const base = getApiBaseUrl().replace(/\/$/, "");
    const res = await fetch(`${base}/api/v1/places/status/`);
    if (!res.ok) {
      configuredCache = false;
      return false;
    }
    const data = (await res.json()) as PlacesStatusResponse;
    configuredCache = Boolean(data.configured);
    return configuredCache;
  } catch {
    configuredCache = false;
    return false;
  }
}

/** @deprecated Use ``isPlacesAvailable()`` — keys are server-side now. */
export function hasGooglePlacesKey(): boolean {
  return true;
}

async function placesGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const base = getApiBaseUrl().replace(/\/$/, "");
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${base}/api/v1/places/${path}/?${query}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "Address search failed");
  }
  return res.json() as Promise<T>;
}

export async function getPlacePredictions(input: string): Promise<PlacePrediction[]> {
  if (!input || input.length < 2) return [];
  const data = await placesGet<AutocompleteResponse>("autocomplete", { input });
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") return [];
  return data.predictions || [];
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  if (!placeId) return null;
  const data = await placesGet<DetailsResponse>("details", { place_id: placeId });
  if (data.status !== "OK" || !data.result) return null;
  return data.result;
}

const DUBLIN_COUNTIES = [
  "South Dublin",
  "Dún Laoghaire-Rathdown",
  "Dun Laoghaire-Rathdown",
  "Fingal",
  "Dublin City",
  "County Dublin",
];

/** Dublin eircode routing keys: D01–D18, D20, D22, D24, D6W. */
const DUBLIN_ROUTING_KEY = /^D(?:6W|0[1-9]|1[0-8]|20|22|24)$/;

function dublinDistrictFromEircode(postcode: string): string | null {
  const routing = postcode.trim().toUpperCase().replace(/\s+/g, "").slice(0, 3);
  return DUBLIN_ROUTING_KEY.test(routing) ? routing : null;
}

function dublinDistrictFromText(text: string): string | null {
  if (!text) return null;
  if (/Dublin\s*6W\b/i.test(text)) return "D6W";
  const match = text.match(/Dublin\s+(\d{1,2})\b/i);
  if (!match) return null;
  const key = `D${String(Number(match[1])).padStart(2, "0")}`;
  return DUBLIN_ROUTING_KEY.test(key) ? key : null;
}

function isDublinNamedCity(city: string): boolean {
  const lower = city.toLowerCase();
  return lower === "dublin" || DUBLIN_COUNTIES.some((c) => lower.includes(c.toLowerCase()));
}

/**
 * Irish forms use the postal district (D12, D15) as city, not "Dublin".
 * Same field order as the time-tracker Places fill: street, city, postcode, country.
 */
function applyDublinCityPattern(
  country: string,
  city: string,
  postcode: string,
  extraTexts: string[],
): string {
  if (country !== "Ireland" && country !== "IE") return city;
  const district =
    dublinDistrictFromEircode(postcode) ||
    extraTexts.map(dublinDistrictFromText).find((value): value is string => Boolean(value)) ||
    null;
  if (district && (isDublinNamedCity(city) || !city)) {
    return district;
  }
  if (isDublinNamedCity(city)) return "Dublin";
  return city;
}

/** Same component parsing as the mobile `useGooglePlaces.parseAddressComponents`. */
export function parseAddressComponents(placeDetails: PlaceDetails): Omit<
  BusinessAddress,
  "latitude" | "longitude"
> {
  const components = placeDetails.address_components || [];
  const findComponent = (type: string) =>
    components.find((component) => component.types.includes(type));

  const streetNumber = findComponent("street_number");
  const route = findComponent("route");
  const subpremise = findComponent("subpremise");
  const premise = findComponent("premise");

  const addressParts: string[] = [];
  if (streetNumber) addressParts.push(streetNumber.long_name);
  if (route) addressParts.push(route.long_name);
  if (subpremise) addressParts.push(subpremise.long_name);
  if (premise) addressParts.push(premise.long_name);

  const address =
    addressParts.length > 0
      ? addressParts.join(" ")
      : placeDetails.formatted_address.split(",")[0]?.trim() || "";

  const postalCodeComponent = findComponent("postal_code");
  const postcodeComponent = findComponent("postal_code_prefix");
  const post_code = postalCodeComponent?.long_name || postcodeComponent?.long_name || "";

  const countryComponent = findComponent("country");
  const country = countryComponent?.long_name || "";

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
    localityName.toLowerCase().includes(ind.toLowerCase()),
  );

  const cityComponent = isLikelyNeighborhood
    ? adminLevel2 || adminLevel1 || localityComponent
    : localityComponent ||
      postalTownComponent ||
      sublocalityComponent ||
      neighborhoodComponent ||
      adminLevel2 ||
      adminLevel1;
  const city = applyDublinCityPattern(country, cityComponent?.long_name || "", post_code, [
    placeDetails.formatted_address,
    sublocalityComponent?.long_name || "",
    neighborhoodComponent?.long_name || "",
    postalTownComponent?.long_name || "",
  ]);

  return { address, post_code, city, country };
}

export async function placeIdToBusinessAddress(placeId: string): Promise<BusinessAddress | null> {
  const details = await getPlaceDetails(placeId);
  const location = details?.geometry?.location;
  if (!details || location == null) return null;
  const parsed = parseAddressComponents(details);
  return {
    ...parsed,
    latitude: location.lat,
    longitude: location.lng,
  };
}
