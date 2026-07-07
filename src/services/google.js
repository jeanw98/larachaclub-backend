const config = require('../config/env');

const API_KEY = config.googleApiKey;
const PLACES_BASE = 'https://places.googleapis.com/v1';

async function googleFetch(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    const msg = data.error?.message || data.status || 'Google API error';
    throw new Error(msg);
  }
  return data;
}

async function reverseGeocode(lat, lng) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${API_KEY}`;
  const data = await googleFetch(url);

  if (data.status !== 'OK' || !data.results?.length) {
    return { formatted_address: null, place_id: null, place_name: null, components: [] };
  }

  const result = data.results[0];
  const locality = result.address_components?.find((c) => c.types.includes('locality'));
  const country = result.address_components?.find((c) => c.types.includes('country'));

  return {
    formatted_address: result.formatted_address,
    place_id: result.place_id,
    place_name: locality?.long_name || result.formatted_address?.split(',')[0],
    components: result.address_components,
    location: result.geometry?.location,
  };
}

async function autocomplete(input, { lat, lng } = {}) {
  const body = { input, languageCode: 'en' };
  if (lat && lng) {
    body.locationBias = {
      circle: { center: { latitude: parseFloat(lat), longitude: parseFloat(lng) }, radius: 50000 },
    };
  }

  const data = await googleFetch(`${PLACES_BASE}/places:autocomplete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
    },
    body: JSON.stringify(body),
  });

  return (data.suggestions || []).map((s) => ({
    place_id: s.placePrediction?.placeId,
    description: s.placePrediction?.text?.text,
    main_text: s.placePrediction?.structuredFormat?.mainText?.text,
    secondary_text: s.placePrediction?.structuredFormat?.secondaryText?.text,
  })).filter((p) => p.place_id);
}

async function getPlaceDetails(placeId) {
  const data = await googleFetch(`${PLACES_BASE}/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,types',
    },
  });

  return {
    place_id: data.id || placeId,
    place_name: data.displayName?.text,
    formatted_address: data.formattedAddress,
    lat: data.location?.latitude,
    lng: data.location?.longitude,
    types: data.types,
  };
}

async function nearbyPlaces(lat, lng, radius = 1000) {
  const data = await googleFetch(`${PLACES_BASE}/places:searchNearby`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types',
    },
    body: JSON.stringify({
      locationRestriction: {
        circle: {
          center: { latitude: parseFloat(lat), longitude: parseFloat(lng) },
          radius: parseFloat(radius),
        },
      },
      maxResultCount: 10,
    }),
  });

  return (data.places || []).map((p) => ({
    place_id: p.id,
    place_name: p.displayName?.text,
    formatted_address: p.formattedAddress,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    types: p.types,
  }));
}

module.exports = { reverseGeocode, autocomplete, getPlaceDetails, nearbyPlaces };
