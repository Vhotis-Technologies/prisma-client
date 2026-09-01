import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPlacePredictions,
  isPlacesAvailable,
  placeIdToBusinessAddress,
  type PlacePrediction,
} from "../lib/googlePlaces";
import type { BusinessAddress } from "../types/user";

const DEBOUNCE_MS = 300;

type AddressSearchInputProps = {
  label?: string;
  placeholder?: string;
  value: BusinessAddress | null;
  onSelect: (result: BusinessAddress) => void;
  onClear?: () => void;
};

function emptyAddress(): BusinessAddress {
  return { address: "", post_code: "", city: "", country: "" };
}

export default function AddressSearchInput({
  label = "Address",
  placeholder = "Start typing your address",
  value,
  onSelect,
  onClear,
}: AddressSearchInputProps) {
  const [searchText, setSearchText] = useState("");
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placesReady, setPlacesReady] = useState<boolean | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void isPlacesAvailable().then(setPlacesReady);
  }, []);

  const searchAddresses = useCallback(
    async (input: string) => {
      if (!placesReady || input.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const predictions = await getPlacePredictions(input.trim());
        setSuggestions(predictions);
      } catch {
        setError("Failed to search addresses");
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    },
    [placesReady],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchText.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void searchAddresses(searchText);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText, searchAddresses]);

  function patch(partial: Partial<BusinessAddress>) {
    onSelect({ ...(value ?? emptyAddress()), ...partial });
  }

  async function handleSelect(prediction: PlacePrediction) {
    setIsLoading(true);
    setError(null);
    setSuggestions([]);
    try {
      const result = await placeIdToBusinessAddress(prediction.place_id);
      if (!result) {
        setError("Could not fetch address details");
        return;
      }
      setSearchText("");
      onSelect(result);
    } catch {
      setError("Failed to get address details");
    } finally {
      setIsLoading(false);
    }
  }

  if (placesReady === false) {
    return (
      <div className="field">
        <span>{label}</span>
        <p className="field-error">
          Address search is not available. The server Places API key may not be configured.
        </p>
      </div>
    );
  }

  return (
    <div className="address-form">
      <div className="field address-search">
        <span>{label}</span>
        <div className="address-search-input">
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder={placeholder}
            autoComplete="off"
            disabled={placesReady === null}
          />
          {isLoading ? <span className="address-search-status">Searching…</span> : null}
        </div>
        <p className="field-hint">Pick a suggestion to fill the fields below.</p>
        {error ? <p className="field-error">{error}</p> : null}
        {suggestions.length > 0 ? (
          <ul className="address-suggestions">
            {suggestions.map((item) => (
              <li key={item.place_id}>
                <button type="button" onClick={() => void handleSelect(item)}>
                  {item.description}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <label className="field">
        <span>Street address</span>
        <input
          value={value?.address ?? ""}
          onChange={(e) => patch({ address: e.target.value })}
          autoComplete="address-line1"
        />
      </label>

      <div className="field-grid">
        <label className="field">
          <span>City</span>
          <input
            value={value?.city ?? ""}
            onChange={(e) => patch({ city: e.target.value })}
            autoComplete="address-level2"
          />
        </label>
        <label className="field">
          <span>Postcode</span>
          <input
            value={value?.post_code ?? ""}
            onChange={(e) => patch({ post_code: e.target.value })}
            autoComplete="postal-code"
          />
        </label>
      </div>

      <label className="field">
        <span>Country</span>
        <input
          value={value?.country ?? ""}
          onChange={(e) => patch({ country: e.target.value })}
          autoComplete="country-name"
        />
      </label>

      {value && onClear ? (
        <button
          type="button"
          className="text-btn text-btn-inline"
          onClick={() => {
            onClear();
            setSearchText("");
            setSuggestions([]);
          }}
        >
          Clear address
        </button>
      ) : null}
    </div>
  );
}
