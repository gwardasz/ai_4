const BASE_URL = "https://nominatim.openstreetmap.org";

/**
 * CORE WRAPPER
 * Handles URL formatting, JSON parsing, and mandatory User-Agent headers.
 */
const apiCall = async (endpoint) => {
  const url = `${BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "User-Agent": 'AI_Devs_Agent_Script/1.0', 
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Nominatim API Error (${response.status}): ${response.statusText}`);
  }

  return data;
};

/**
 * DOMAIN METHODS
 */
export const getCityCoordinates = async (city) => {
  // Always encode user/LLM input when putting it into a URL query string!
  const query = encodeURIComponent(city);
  return apiCall(`/search?q=${query}&format=json`);
};