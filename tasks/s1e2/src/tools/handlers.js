import { 
  getLocation, 
  getAccessLevel, 
  getPowerPlants, 
  verifyFindHim 
} from "../../services/ag3nts-api.js";
import { readFile, writeFile } from "fs/promises";
import { resolveSandboxPath } from "../utils/sandbox.js";
import { calculateDistance } from "../utils/helpers.js"; 
import { getCityCoordinates } from "../../services/nominatim-api.js";


const cityCoordinatesCache = {};


export const handlers = {

async get_suspects() {
    console.log("🛠️ Tool executed: get_suspects");
    try {
      const filePath = resolveSandboxPath("suspects.json");
      const fileContent = await readFile(filePath, "utf-8");
      const suspects = JSON.parse(fileContent);
      
      return { 
        success: true, 
        suspects: suspects 
      };
    } catch (error) {
      console.error("❌ Error in get_suspects:", error.message);
      return { 
        success: false, 
        message: `The list of suspects could not be retrieved: ${error.message}` 
      };
    }
  },

  async get_power_plants_locations() {
    console.log("🛠️ Tool executed: get_power_plants_locations");
    try {
      const powerPlantsData = await getPowerPlants();
      const fileName = "powerplants.json";
      const filePath = resolveSandboxPath(fileName);
      await writeFile(filePath, JSON.stringify(powerPlantsData, null, 2), "utf-8");
      console.log(`✅ Saved power plant data to: ${fileName}`);

      return { 
        success: true, 
        powerplant_filename: fileName 
      };
    } catch (error) {
      console.error("❌ Error in get_power_plants_locations:", error.message);
      return { 
        success: false, 
        message: `Failed to retrieve power plant data: ${error.message}` 
      };
    }
  },

  async who_approached_power_plant({ suspects }) {
    console.log("🛠️ Tool executed: who_approached_power_plant");
    try {
      // Step 3a: Read power plants from sandbox
      const filePath = resolveSandboxPath("powerplants.json");
      const fileContent = await readFile(filePath, "utf-8");
      const powerPlantsData = JSON.parse(fileContent);

      // --- NOWA LOGIKA NORMALIZACJI ---
      let powerPlants = [];
      
      // Wyciągamy właściwe dane, jeśli są zagnieżdżone pod kluczem "power_plants"
      const sourceData = powerPlantsData.power_plants ? powerPlantsData.power_plants : powerPlantsData;

      if (Array.isArray(sourceData)) {
        powerPlants = sourceData;
      } else if (typeof sourceData === 'object') {
        for (const [key, value] of Object.entries(sourceData)) {
          // Jeśli struktura to np. "Zabrze": { "code": "PWR3847PL", ... }
          if (value && typeof value === 'object' && value.code) {
            powerPlants.push({ 
              id: value.code, 
              city: key
            });
          } 
          // Fallback, gdyby w innych przypadkach API zwracało "PWR1234PL": "Warszawa"
          else {
            powerPlants.push({ 
              id: key, 
              city: typeof value === 'string' ? value : value.city 
            });
          }
        }
      } else {
        // Scenario 3: Data came in a completely unrecognized format
        console.error("❌ Critical error: Unrecognized power plant data format!", typeof sourceData);
        throw new Error("Power plant data from API has an invalid format (expected array or object).");
      }

      // Step 3b: Resolve coordinates for each power plant city using Nominatim API
      for (const plant of powerPlants) {
        const cityName = plant.city;
        if (!cityName) continue;

        // Use cache to prevent unnecessary API calls
        if (!cityCoordinatesCache[cityName]) {
          console.log(`🌍 Fetching coordinates for city: ${cityName}`);
          const results = await getCityCoordinates(cityName);
          
          if (results && results.length > 0) {
            cityCoordinatesCache[cityName] = {
              lat: parseFloat(results[0].lat),
              lon: parseFloat(results[0].lon)
            };
          } else {
            console.warn(`⚠️ Could not find coordinates for ${cityName}`);
          }
          // Add a 1-second delay to strictly respect OpenStreetMap API guidelines
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        plant.coords = cityCoordinatesCache[cityName];
      }

      // Filter out any power plants that couldn't be mapped to coordinates
      const validPowerPlants = powerPlants.filter(p => p.coords);

      // Step 3c: Iterate over suspects, fetch locations, and find the absolute minimum distance
      let closestMatch = {
        suspect: null,
        powerPlant: null,
        distance: Infinity
      };

      for (const suspect of suspects) {
        console.log(`🕵️ Checking locations for: ${suspect.name} ${suspect.surname}`);
        const response = await getLocation(suspect.name, suspect.surname);
        
        // Handle different possible API response structures gracefully
        const locations = Array.isArray(response) ? response : (response.message || response.locations || []);

        for (const loc of locations) {
          // Support string "lat,lon", object {lat: X, lon: Y}, AND object {latitude: X, longitude: Y}
          let lat, lon;

          if (typeof loc === 'string') {
            const parts = loc.split(',');
            lat = parseFloat(parts[0]);
            lon = parseFloat(parts[1]);
          } else if (loc && typeof loc === 'object') {
            // Check for both 'lat' and 'latitude' naming conventions
            lat = parseFloat(loc.lat !== undefined ? loc.lat : loc.latitude);
            lon = parseFloat(loc.lon !== undefined ? loc.lon : loc.longitude);
          }

          if (isNaN(lat) || isNaN(lon)) {
            console.warn(`⚠️ Warning: Could not parse coordinates from location:`, loc);
            continue;
          }

          for (const plant of validPowerPlants) {
            const dist = calculateDistance(lat, lon, plant.coords.lat, plant.coords.lon);
            
            if (dist < closestMatch.distance) {
              closestMatch = {
                suspect,
                powerPlant: plant,
                distance: dist
              };
            }
          }
        }
      }

      // Step 3d: Return the best candidate to the LLM
      if (closestMatch.suspect) {
        console.log(`✅ Closest suspect found: ${closestMatch.suspect.name} ${closestMatch.suspect.surname} (${closestMatch.distance.toFixed(2)} km from ${closestMatch.powerPlant.id})`);
        
        return {
          success: true,
          message: "Candidate found successfully.",
          candidate: closestMatch.suspect,
          power_plant_id: closestMatch.powerPlant.id,
          distance_km: closestMatch.distance
        };
      } else {
        return { success: false, message: "No suspect found near any power plant." };
      }

    } catch (error) {
      console.error("❌ Error in who_approached_power_plant:", error.message);
      return { success: false, message: error.message };
    }
  },

  // 4. Tool: get_user_access_level
  async get_user_access_level({ name, surname, birthYear }) {
    console.log(`🛠️ Tool executed: get_user_access_level for ${name} ${surname}`);
    try {
      const data = await getAccessLevel(name, surname, birthYear);
      // Account for variations in API responses
      const level = data.message !== undefined ? data.message : data.accessLevel;
      
      return { success: true, accessLevel: level };
    } catch (error) {
      console.error("❌ Error in get_user_access_level:", error.message);
      return { success: false, message: error.message };
    }
  },

  // 5. Tool: report_user
  async report_user({ name, surname, power_plant_id, user_access_level }) {
    console.log(`🛠️ Tool executed: report_user for ${name} ${surname}`);
    try {
      // Prepare the payload exactly as expected by the verifyFindHim helper
      const answerPayload = {
        name: name,
        surname: surname,
        accessLevel: parseInt(user_access_level, 10), // Ensure it's passed as an integer
        powerPlant: power_plant_id
      };

      // Call the central API helper
      const data = await verifyFindHim(answerPayload);
      
      console.log(`🎯 Report submission result:`, data);
      
      // Return the server's response to the LLM (which will contain the FLAG if correct)
      return { 
        success: true, 
        server_response: data 
      };
    } catch (error) {
      console.error("❌ Error in report_user:", error.message);
      return { success: false, message: error.message };
    }
  },

  async get_suspect_location({ name, surname }) {
    const locations = await getLocation(name, surname);
    return { success: true, locations };
  },

  async get_suspect_access_level({ name, surname, birthYear }) {
    const data = await getAccessLevel(name, surname, birthYear);
    return { success: true, accessLevel: data.accessLevel };
  },

  async get_power_plants() {
    const data = await getPowerPlants();
    return { success: true, powerPlants: data.power_plants };
  },

  async submit_find_him_solution({ name, surname, accessLevel, powerPlant }) {
    const result = await verifyFindHim({ name, surname, accessLevel, powerPlant });
    return { success: true, result };
  }, 
  async get_city_coordinates({ city }) {
    const results = await getCityCoordinates(city);
    
    if (!results || results.length === 0) {
      return { success: false, message: `No coordinates found for city: ${city}` };
    }
    
    const bestMatch = results[0];

    return { 
      success: true, 
      city_queried: city,
      latitude: bestMatch.lat, 
      longitude: bestMatch.lon
    };
  }
};