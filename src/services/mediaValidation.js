const exifr = require('exifr');

const DEFAULT_TOLERANCE_M = parseInt(process.env.LOCATION_TOLERANCE_METERS || '800', 10);

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function extractGpsFromMedia(buffer, mimeType) {
  try {
    const gps = await exifr.gps(buffer);
    if (gps?.latitude != null && gps?.longitude != null) {
      return { lat: gps.latitude, lng: gps.longitude };
    }
  } catch { /* sin metadata */ }

  if (mimeType?.startsWith('video/')) {
    try {
      const data = await exifr.parse(buffer, { gps: true, xmp: true, mergeOutput: false });
      const lat = data?.GPSLatitude ?? data?.gps?.latitude;
      const lng = data?.GPSLongitude ?? data?.gps?.longitude;
      if (lat != null && lng != null) return { lat, lng };
    } catch { /* sin metadata en video */ }
  }

  return null;
}

function validateLocationMatch(label, distanceM, toleranceM) {
  if (distanceM > toleranceM) {
    return `${label}: distancia de ${Math.round(distanceM)}m (máx. ${toleranceM}m)`;
  }
  return null;
}

async function validateMediaLocation({
  buffer,
  mimeType,
  pinLat,
  pinLng,
  userLat,
  userLng,
  toleranceM = DEFAULT_TOLERANCE_M,
  cameraCapture = false,
}) {
  if (userLat == null || userLng == null || Number.isNaN(userLat) || Number.isNaN(userLng)) {
    return { ok: false, error: 'Se requiere tu ubicación actual para verificar la foto' };
  }

  let mediaGps = await extractGpsFromMedia(buffer, mimeType);

  if (!mediaGps && cameraCapture) {
    mediaGps = { lat: userLat, lng: userLng };
  }

  if (!mediaGps) {
    return {
      ok: false,
      error: 'La imagen o video no tiene coordenadas GPS en sus metadatos. Usa una foto tomada con el celular en el lugar.',
    };
  }

  const distMediaUser = haversineMeters(mediaGps.lat, mediaGps.lng, userLat, userLng);
  const distMediaPin = haversineMeters(mediaGps.lat, mediaGps.lng, pinLat, pinLng);
  const distUserPin = haversineMeters(userLat, userLng, pinLat, pinLng);

  const failures = [
    validateLocationMatch('La foto no coincide con tu ubicación', distMediaUser, toleranceM),
    validateLocationMatch('La foto no coincide con el pin', distMediaPin, toleranceM),
    validateLocationMatch('El pin está lejos de tu ubicación', distUserPin, toleranceM),
  ].filter(Boolean);

  if (failures.length) {
    return { ok: false, error: failures.join('. ') };
  }

  return {
    ok: true,
    mediaGps,
    distances: {
      media_user_m: Math.round(distMediaUser),
      media_pin_m: Math.round(distMediaPin),
      user_pin_m: Math.round(distUserPin),
    },
  };
}

module.exports = {
  extractGpsFromMedia,
  validateMediaLocation,
  haversineMeters,
  DEFAULT_TOLERANCE_M,
};
