'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';

interface AddressResult {
  address: string;
  city: string;
  state: string;
  zip: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
}

export function AddressAutocomplete({ value, onChange, onSelect, placeholder }: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dummyDiv = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const loadGoogleMaps = () => {
      if (window.google?.maps?.places) {
        autocompleteService.current = new google.maps.places.AutocompleteService();
        if (dummyDiv.current) {
          placesService.current = new google.maps.places.PlacesService(dummyDiv.current);
        }
        return;
      }

      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
      if (!apiKey) return;

      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) return;

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.onload = () => {
        autocompleteService.current = new google.maps.places.AutocompleteService();
        if (dummyDiv.current) {
          placesService.current = new google.maps.places.PlacesService(dummyDiv.current);
        }
      };
      document.head.appendChild(script);
    };

    loadGoogleMaps();
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = useCallback((input: string) => {
    if (!autocompleteService.current || input.length < 3) {
      setSuggestions([]);
      return;
    }

    autocompleteService.current.getPlacePredictions(
      {
        input,
        types: ['address'],
        componentRestrictions: { country: 'us' },
      },
      (predictions, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
          setSuggestions(predictions);
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
        }
      }
    );
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    fetchSuggestions(val);
  };

  const handleSelect = (prediction: google.maps.places.AutocompletePrediction) => {
    if (!placesService.current) return;

    placesService.current.getDetails(
      { placeId: prediction.place_id, fields: ['address_components', 'formatted_address'] },
      (place, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place?.address_components) return;

        const components = place.address_components;
        const get = (type: string) => components.find(c => c.types.includes(type));

        const streetNumber = get('street_number')?.long_name || '';
        const route = get('route')?.long_name || '';
        const address = `${streetNumber} ${route}`.trim();
        const city = get('locality')?.long_name || get('sublocality')?.long_name || '';
        const state = get('administrative_area_level_1')?.short_name || '';
        const zip = get('postal_code')?.long_name || '';

        onChange(address);
        onSelect({ address, city, state, zip });
        setShowSuggestions(false);
        setSuggestions([]);
      }
    );
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div ref={dummyDiv} style={{ display: 'none' }} />
      <Input
        value={value}
        onChange={handleInputChange}
        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
        placeholder={placeholder || 'Start typing an address...'}
        autoComplete="off"
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.place_id}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 border-b last:border-b-0"
              onClick={() => handleSelect(suggestion)}
              type="button"
            >
              {suggestion.description}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
