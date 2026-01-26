/**
 * Country Name to Flag Emoji Mapping
 * Based on common OpenSky Network country names.
 */

const FLAG_MAP: Record<string, string> = {
  "United States": "🇺🇸",
  "China": "🇨🇳",
  "United Kingdom": "🇬🇧",
  "Germany": "🇩🇪",
  "France": "🇫🇷",
  "Canada": "🇨🇦",
  "Japan": "🇯🇵",
  "South Korea": "🇰🇷",
  "Russia": "🇷🇺",
  "Italy": "🇮🇹",
  "Spain": "🇪🇸",
  "Brazil": "🇧🇷",
  "India": "🇮🇳",
  "Australia": "🇦🇺",
  "Mexico": "🇲🇽",
  "Netherlands": "🇳🇱",
  "Switzerland": "🇨🇭",
  "Turkey": "🇹🇷",
  "Sweden": "🇸🇪",
  "Saudi Arabia": "🇸🇦",
  "Poland": "🇵🇱",
  "Belgium": "🇧🇪",
  "Argentina": "🇦🇷",
  "Norway": "🇳🇴",
  "Austria": "🇦🇹",
  "Thailand": "🇹🇭",
  "United Arab Emirates": "🇦🇪",
  "Ireland": "🇮🇪",
  "Denmark": "🇩🇰",
  "Singapore": "🇸🇬",
  "Malaysia": "🇲🇾",
  "South Africa": "🇿🇦",
  "Israel": "🇮🇱",
  "Finland": "🇫🇮",
  "Hong Kong": "🇭🇰",
  "Greece": "🇬🇷",
  "Portugal": "🇵🇹",
  "New Zealand": "🇳🇿",
  "Qatar": "🇶🇦",
  "Czech Republic": "🇨🇿",
  "Hungary": "🇭🇺",
  "Ukraine": "🇺🇦",
  "Indonesia": "🇮🇩",
  "Vietnam": "🇻🇳",
  "Philippines": "🇵🇭",
  "Chile": "🇨🇱",
  "Colombia": "🇨🇴",
  "Egypt": "🇪🇬",
  "Iran": "🇮🇷",
  "Pakistan": "🇵🇰",
  "Romania": "🇷🇴",
  "Kazakhstan": "🇰🇿",
  "Peru": "🇵🇪",
  "Iraq": "🇮🇶",
  "Algeria": "🇩🇿",
  "Morocco": "🇲🇦",
  "Uzbekistan": "🇺🇿",
  "Venezuela": "🇻🇪",
  "Bangladesh": "🇧🇩",
  "Nigeria": "🇳🇬",
  "Kuwait": "🇰🇼",
  "Luxembourg": "🇱🇺",
  "Iceland": "🇮🇸",
  "Liberia": "🇱🇷",
  "Panama": "🇵🇦",
  "Marshall Islands": "🇲🇭",
  "Bahamas": "🇧🇸",
  "Malta": "🇲🇹",
  "Cyprus": "🇨🇾",
  "Bermuda": "🇧🇲",
  "Cayman Islands": "🇰🇾",
  "Belize": "🇧🇿",
  "Antigua and Barbuda": "🇦🇬",
  "Saint Vincent and the Grenadines": "🇻🇨",
  "Unknown": "",
};

export function getCountryFlag(countryName: string): string {
  if (!countryName || countryName === "Unknown") return "";
  // Check direct match
  if (FLAG_MAP[countryName]) return FLAG_MAP[countryName];
  
  // Basic substring fallback (e.g. "United States of America" -> "United States")
  for (const [key, flag] of Object.entries(FLAG_MAP)) {
    if (countryName.includes(key) && flag) return flag;
  }
  
  return ""; // Return empty if unknown
}