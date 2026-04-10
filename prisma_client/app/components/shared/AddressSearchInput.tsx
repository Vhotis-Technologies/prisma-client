import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "../helpers/StyledText";
import { Ionicons } from "@expo/vector-icons";
import {
  getPlacePredictions,
  getPlaceDetails,
  placeDetailsToRoutePoint,
  parseAddressComponents,
  PlacePrediction,
} from "@/app/app-hooks/useGooglePlaces";
import { KEY_CONFIGS } from "@/constants/Config";

export interface AddressSearchResult {
  address: string;
  post_code: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface AddressSearchInputProps {
  onSelect: (result: AddressSearchResult) => void;
  placeholder?: string;
  label?: string;
  initialValue?: string;
  /** Pre-selected address (e.g. when editing) - shows as selected and user can click Change */
  initialSelectedAddress?: AddressSearchResult | null;
}

const DEBOUNCE_MS = 300;

const AddressSearchInput: React.FC<AddressSearchInputProps> = ({
  onSelect,
  placeholder = "Search for an address...",
  label = "Address",
  initialValue = "",
  initialSelectedAddress = null,
}) => {
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const backgroundColor = useThemeColor({}, "background");

  const [searchText, setSearchText] = useState<string>();
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<AddressSearchResult | null>(
    initialSelectedAddress ?? null
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSelectedAddress(initialSelectedAddress ?? null);
  }, [initialSelectedAddress]);

  const hasApiKey = !!KEY_CONFIGS.googleApiKeys;

  const searchAddresses = useCallback(async (input: string) => {
    if (!hasApiKey || !input || input.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const predictions = await getPlacePredictions(input.trim());
      setSuggestions(predictions);
    } catch (err) {
      console.error("Error searching addresses:", err);
      setError("Failed to search addresses");
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [hasApiKey]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (searchText && searchText.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      if (searchText) {
        searchAddresses(searchText);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchText, searchAddresses]);

  const handleSelectPrediction = useCallback(
    async (prediction: PlacePrediction) => {
      if (!hasApiKey) return;

      setIsLoading(true);
      setError(null);
      setSuggestions([]);

      try {
        const placeDetails = await getPlaceDetails(prediction.place_id);
        if (!placeDetails) {
          setError("Could not fetch address details");
          return;
        }

        const coords = placeDetailsToRoutePoint(placeDetails);
        const parsed = parseAddressComponents(placeDetails);

        const result: AddressSearchResult = {
          address: parsed.address,
          post_code: parsed.post_code,
          city: parsed.city,
          country: parsed.country,
          latitude: coords.latitude,
          longitude: coords.longitude,
        };

        setSelectedAddress(result);
        setSearchText(placeDetails.formatted_address);
        onSelect(result);
      } catch (err) {
        console.error("Error fetching place details:", err);
        setError("Failed to get address details");
      } finally {
        setIsLoading(false);
      }
    },
    [hasApiKey, onSelect]
  );

  const handleChange = useCallback(() => {
    setSelectedAddress(null);
    setSearchText("");
    setSuggestions([]);
  }, []);

  if (!hasApiKey) {
    return (
      <View style={[styles.container, { borderColor }]}>
        <StyledText variant="bodySmall" style={{ color: textColor }}>
          Google Places API key not configured. Address search unavailable.
        </StyledText>
      </View>
    );
  }

  if (selectedAddress) {
    return (
      <View style={[styles.selectedContainer, { borderColor }]}>
        <View style={styles.selectedContent}>
          <Ionicons name="location" size={20} color={textColor} />
          <View style={styles.selectedText}>
            <StyledText variant="bodyMedium" style={{ color: textColor }}>
              {selectedAddress.address}
            </StyledText>
            <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
              {[selectedAddress.city, selectedAddress.post_code, selectedAddress.country]
                .filter(Boolean)
                .join(", ")}
            </StyledText>
          </View>
        </View>
        <TouchableOpacity onPress={handleChange} style={styles.changeButton}>
          <StyledText variant="labelMedium" style={{ color: textColor }}>
            Change
          </StyledText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {label && (
        <StyledText variant="labelMedium" style={[styles.label, { color: textColor }]}>
          {label}
        </StyledText>
      )}
      <View style={[styles.inputRow, { borderColor }]}>
        <TextInput
          style={[styles.input, { color: textColor }]}
          placeholder={placeholder}
          placeholderTextColor="#999999"
          value={searchText}
          onChangeText={(text) => setSearchText(text)}
        />
        {isLoading && (
          <ActivityIndicator size="small" color={textColor} style={styles.loader} />
        )}
      </View>
      {error && (
        <StyledText variant="bodySmall" style={[styles.error, { color: "#FF3B30" }]}>
          {error}
        </StyledText>
      )}
      {suggestions.length > 0 && (
        <ScrollView
          style={[styles.suggestionsList, { backgroundColor, borderColor }]}
          nestedScrollEnabled
          scrollEnabled={suggestions.length > 3}
        >
          {suggestions.map((item) => (
            <TouchableOpacity
              key={item.place_id}
              style={[styles.suggestionItem, { borderColor }]}
              onPress={() => handleSelectPrediction(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="location-outline" size={18} color={textColor} />
              <StyledText
                variant="bodyMedium"
                style={[styles.suggestionText, { color: textColor }]}
                numberOfLines={2}
              >
                {item.description}
              </StyledText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

export default AddressSearchInput;

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
  },
  loader: {
    marginLeft: 8,
  },
  error: {
    marginTop: 8,
  },
  suggestionsList: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: 200,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
  suggestionText: {
    flex: 1,
  },
  selectedContainer: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  selectedContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  selectedText: {
    flex: 1,
  },
  changeButton: {
    marginTop: 12,
    alignSelf: "flex-start",
  },
});
