import { AI_DEVS_API_KEY } from "../../../../config.js";

const ENDPOINT = "https://hub.ag3nts.org/api/packages";

// Rdzen: jedno miejsce na fetch, parsowanie JSON, obsluge bledow i wstrzykniecie klucza API.
// Bledy niosa strukture (kind/status/body), zeby handler mogl zbudowac trafny recoveryHint.
const apiCall = async (payload) => {
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: AI_DEVS_API_KEY, ...payload })
    });
  } catch {
    const error = new Error("Network error reaching packages API.");
    error.kind = "network";
    throw error;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message ?? `HTTP ${response.status}`);
    error.kind = response.status === 401 || response.status === 403 ? "auth" : "http";
    error.status = response.status;
    error.body = data;
    throw error;
  }

  return data;
};

// Metody domenowe - ukrywaja ksztalt zapytania przed reszta aplikacji.
export const checkPackage = (packageid) => apiCall({ action: "check", packageid });

export const redirectPackage = (packageid, destination, code) =>
  apiCall({ action: "redirect", packageid, destination, code });
