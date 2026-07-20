/**
 * Canonical Digital Estimate room eligibility types.
 * Display names are normalized here — never use raw labels as final authority.
 */

/** @typedef {'kitchen' | 'bar_prep' | 'vanity' | 'laundry_utility' | 'non_plumbing'} CanonicalRoomType */

export const CANONICAL_ROOM_TYPES = Object.freeze([
  "kitchen",
  "bar_prep",
  "vanity",
  "laundry_utility",
  "non_plumbing"
]);

/**
 * Map aliases / Studio labels → canonical room type.
 * @param {{ roomKey?: string, displayName?: string, name?: string, roomType?: string, type?: string } | null | undefined} room
 * @returns {CanonicalRoomType}
 */
export function inferRoomEligibilityType(room) {
  const explicit = String(room?.roomType || room?.type || "")
    .toLowerCase()
    .trim()
    .replace(/-/g, "_");

  if (explicit === "kitchen") return "kitchen";
  if (explicit === "bar_prep" || explicit === "bar" || explicit === "prep" || explicit === "entertainment") {
    return "bar_prep";
  }
  if (
    explicit === "vanity" ||
    explicit === "vanity_bath" ||
    explicit === "bath" ||
    explicit === "bathroom"
  ) {
    return "vanity";
  }
  if (explicit === "laundry_utility" || explicit === "laundry" || explicit === "utility") {
    return "laundry_utility";
  }
  if (explicit === "non_plumbing" || explicit === "none" || explicit === "no_plumbing") {
    return "non_plumbing";
  }

  const label = `${room?.displayName || ""} ${room?.name || ""} ${room?.roomKey || ""}`.toLowerCase();

  if (/\blaundry\b|\butility\b|\bmud\s*room\b/.test(label)) return "laundry_utility";
  if (/\bvanity\b|\bbath(room)?\b|\bpowder\b|\bmaster\s*bath\b|\bguest\s*bath\b/.test(label)) {
    return "vanity";
  }
  if (/\bcoffee\b|\bwet\s*bar\b|\bbar\b|\bprep\b|\bentertainment\b|\bpantry\b/.test(label)) {
    return "bar_prep";
  }
  if (
    /\breception\b|\bfront\s*desk\b|\boffice\b|\blobby\b|\bconference\b|\bhostess\b/.test(label)
  ) {
    return "non_plumbing";
  }
  return "kitchen";
}

/**
 * Product roomEligibility tokens that satisfy a canonical room type.
 * laundry_utility also accepts kitchen-tagged laundry products until catalogs reseed.
 * vanity_bath is an alias for vanity.
 * @param {CanonicalRoomType | string} roomType
 * @returns {string[]}
 */
export function productEligibilityTokensForRoomType(roomType) {
  const t = String(roomType || "").toLowerCase();
  if (t === "vanity" || t === "vanity_bath") return ["vanity", "vanity_bath"];
  if (t === "laundry_utility" || t === "laundry") return ["laundry_utility", "laundry"];
  if (t === "bar_prep") return ["bar_prep"];
  if (t === "kitchen") return ["kitchen"];
  if (t === "non_plumbing") return [];
  return [t];
}

/**
 * Whether a product's roomEligibility list matches the room type.
 * @param {string[]|null|undefined} productRooms
 * @param {CanonicalRoomType | string} roomType
 */
export function productMatchesRoomType(productRooms, roomType) {
  const tokens = productEligibilityTokensForRoomType(roomType);
  if (!tokens.length) return false;
  const rooms = Array.isArray(productRooms) ? productRooms.map(String) : [];
  if (!rooms.length) return roomType === "kitchen";
  return tokens.some((t) => rooms.includes(t));
}

/**
 * Customer-facing cutout label for a room.
 * @param {CanonicalRoomType | string} roomType
 * @param {string|null|undefined} roomDisplayName
 */
export function cutoutDisplayLabelForRoom(roomType, roomDisplayName) {
  const name = String(roomDisplayName || "").trim();
  const t = String(roomType || "");
  let cutout = "Sink cutout";
  if (t === "bar_prep") cutout = "Bar/prep sink cutout";
  else if (t === "vanity" || t === "vanity_bath") cutout = "Vanity sink cutout";
  else if (t === "laundry_utility") cutout = "Laundry sink cutout";
  return name ? `${name} — ${cutout}` : cutout;
}
