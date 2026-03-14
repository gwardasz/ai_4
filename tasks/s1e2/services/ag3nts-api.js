import { AI_DEVS_API_KEY } from "../../../config.js";

const BASE_URL = "https://hub.ag3nts.org";

/**
 * CORE WRAPPER
 * Handles URL resolution, JSON parsing, and standard error handling.
 */
const apiCall = async (endpoint, options = {}) => {
  const url = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`ag3nts API Error (${response.status}): ${data?.message || "Unknown error"}`);
  }

  return data;
};

/**
 * DOMAIN METHODS
 * These abstract away the specific endpoints and automatically inject the API key.
 */

export const getLocation = async (name, surname) => {
  return apiCall("/api/location", {
    method: "POST",
    body: JSON.stringify({
      apikey: AI_DEVS_API_KEY,
      name,
      surname
    }),
  });
};

export const getAccessLevel = async (name, surname, birthYear) => {
  return apiCall("/api/accesslevel", {
    method: "POST",
    body: JSON.stringify({
      apikey: AI_DEVS_API_KEY,
      name,
      surname,
      birthYear
    }),
  });
};

export const getPowerPlants = async () => {
  return apiCall(`/data/${AI_DEVS_API_KEY}/findhim_locations.json`, {
    method: "GET",
  });
};

export const verifyFindHim = async (answerPayload) => {
  return apiCall("/verify", {
    method: "POST",
    body: JSON.stringify({
      apikey: AI_DEVS_API_KEY,
      task: "findhim",
      answer: answerPayload // { name, surname, accessLevel, powerPlant }
    }),
  });
};