const EPIC_RADIUS_M = 50;
const EPIC_WINDOW_MS = 3 * 60 * 60 * 1000;
const EPIC_MIN_USERS = 5;

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildProximityCluster(pins, seedId, radiusM) {
  const seed = pins.find((p) => p.id === seedId);
  if (!seed) return [];

  const cluster = [seed];
  const inCluster = new Set([seedId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const pin of pins) {
      if (inCluster.has(pin.id)) continue;
      const near = cluster.some((p) => haversineMeters(
        parseFloat(p.lat),
        parseFloat(p.lng),
        parseFloat(pin.lat),
        parseFloat(pin.lng),
      ) <= radiusM);
      if (near) {
        cluster.push(pin);
        inCluster.add(pin.id);
        changed = true;
      }
    }
  }

  return cluster;
}

async function promoteEpicMomentIfEligible(client, newPin) {
  const lat = parseFloat(newPin.lat);
  const lng = parseFloat(newPin.lng);
  const createdAt = new Date(newPin.created_at);
  const windowStart = new Date(createdAt.getTime() - EPIC_WINDOW_MS);
  const delta = 0.0005;

  const { rows } = await client.query(
    `SELECT id, user_id, lat, lng, created_at, is_permanent, epic_moment_id
     FROM pins
     WHERE created_at >= $1 AND created_at <= $2
       AND lat BETWEEN $3 AND $4
       AND lng BETWEEN $5 AND $6`,
    [windowStart, createdAt, lat - delta, lat + delta, lng - delta, lng + delta],
  );

  const cluster = buildProximityCluster(rows, newPin.id, EPIC_RADIUS_M);
  if (!cluster.length) return null;

  const times = cluster.map((p) => new Date(p.created_at).getTime());
  if (Math.max(...times) - Math.min(...times) > EPIC_WINDOW_MS) return null;

  const distinctUsers = new Set(cluster.map((p) => p.user_id));
  if (distinctUsers.size < EPIC_MIN_USERS) return null;

  const existingEpicId = cluster.find((p) => p.epic_moment_id)?.epic_moment_id;
  let epicId = existingEpicId;

  if (!epicId) {
    const centerLat = cluster.reduce((s, p) => s + parseFloat(p.lat), 0) / cluster.length;
    const centerLng = cluster.reduce((s, p) => s + parseFloat(p.lng), 0) / cluster.length;
    const { rows: epicRows } = await client.query(
      `INSERT INTO epic_moments (center_lat, center_lng) VALUES ($1, $2) RETURNING id`,
      [centerLat, centerLng],
    );
    epicId = epicRows[0].id;
  }

  const pinIds = cluster.map((p) => p.id);
  await client.query(
    `UPDATE pins SET is_permanent = true, epic_moment_id = $1
     WHERE id = ANY($2::uuid[])`,
    [epicId, pinIds],
  );

  return epicId;
}

module.exports = {
  EPIC_RADIUS_M,
  EPIC_WINDOW_MS,
  EPIC_MIN_USERS,
  promoteEpicMomentIfEligible,
};
