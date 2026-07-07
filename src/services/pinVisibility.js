const PIN_TTL_MS = 24 * 60 * 60 * 1000;

const PIN_VISIBLE_WHERE = `(p.is_permanent = true OR p.created_at > NOW() - INTERVAL '24 hours')`;

function pinExpiresAt(pin) {
  if (pin.is_permanent) return null;
  return new Date(new Date(pin.created_at).getTime() + PIN_TTL_MS).toISOString();
}

function pinVisibilityFields(pin) {
  return {
    is_permanent: !!pin.is_permanent,
    is_epic: !!pin.epic_moment_id,
    expires_at: pinExpiresAt(pin),
  };
}

function isPinVisible(pin) {
  if (pin.is_permanent) return true;
  return Date.now() - new Date(pin.created_at).getTime() < PIN_TTL_MS;
}

module.exports = {
  PIN_VISIBLE_WHERE,
  pinExpiresAt,
  pinVisibilityFields,
  isPinVisible,
};
