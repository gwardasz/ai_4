import fs from 'fs/promises';
import path from 'path';

// Upewnij się, że te ścieżki zgadzają się z Twoją strukturą katalogów!
import { hqService } from '../services/hqService.js';
import { sandbox } from '../utils/sandbox.js';

// ==========================================
// FUNKCJE POMOCNICZE
// ==========================================

/**
 * Funkcja pomocnicza: Pobiera współrzędne dla nazwy miasta z użyciem bezpiecznego obiektu URL
 */
async function getCoordinatesForCity(cityName) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.append('q', cityName);
    url.searchParams.append('format', 'json');
    url.searchParams.append('limit', '1');
    
    const response = await fetch(url.toString(), {
        headers: { 'User-Agent': 'AI_Devs_Agent_Script/1.0' }
    });

    if (!response.ok) {
        console.warn(`[Geocoding] Nie udało się pobrać współrzędnych dla: ${cityName}`);
        return null;
    }

    const data = await response.json();
    if (data && data.length > 0) {
        return {
            latitude: parseFloat(data[0].lat),
            longitude: parseFloat(data[0].lon)
        };
    }
    return null;
}

/**
 * Wzór Haversine'a - oblicza odległość w linii prostej między dwoma punktami na kuli ziemskiej.
 * @returns {number} Odległość w kilometrach
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Promień Ziemi w km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}


// ==========================================
// HANDLERY NARZĘDZI (Eksportowane dla Agenta)
// ==========================================

export async function handleGetSuspects() {
    console.log("[Tool] Wywołano get_suspects...");
    try {
        const dataPath = path.resolve(process.cwd(), 'data', 'suspects.json');
        const fileContent = await fs.readFile(dataPath, 'utf-8');
        return { status: "success", suspects: JSON.parse(fileContent) };
    } catch (error) {
        return { status: "error", message: `Nie udało się wczytać podejrzanych: ${error.message}` };
    }
}

export async function handleGetPowerPlants() {
    console.log("[Tool] Wywołano get_power_plants...");
    
    const rawData = await hqService.getPowerPlants();
    const enrichedPlants = {};
    // Jeśli format to { "message": { "Zabrze": {...} } } lub bezpośrednio obiekt
    const sourceData = rawData.message || rawData;
    const cityNames = Object.keys(sourceData);

    for (const city of cityNames) {
        console.debug(`[Geocoding] Szukam koordynatów dla: ${city}...`);
        
        const coords = await getCoordinatesForCity(city);
        const plantData = sourceData[city];

        enrichedPlants[city] = {
            ...plantData,
            latitude: coords ? coords.latitude : null,
            longitude: coords ? coords.longitude : null
        };

        // Opóźnienie 1 sekundy chroniące przed banem IP (Rate limit Nominatim)
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    await sandbox.writeJson('enriched_power_plants.json', enrichedPlants);

    return {
        status: "success",
        message: `Pobrano i wzbogacono dane dla ${cityNames.length} elektrowni.`,
        power_plants_data: enrichedPlants
    };
}

export async function handleDownloadPeopleLocations(args) {
    console.log("[Tool] Wywołano download_people_locations dla:", args.people?.length, "osób");

    const { people } = args;
    
    if (!people || !Array.isArray(people) || people.length === 0) {
        return { 
            status: "error", 
            message: "Nie podano listy osób do sprawdzenia. Wymagany format: { people: [{name, surname}] }" 
        };
    }

    const generatedFilenames = [];

    const fetchPromises = people.map(async (person) => {
        try {
            const { name, surname } = person;
            console.debug(`[Location API] Pobieram ślady dla: ${name} ${surname}...`);
            
            const locations = await hqService.getPersonLocations(name, surname);
            
            const safeName = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            const safeSurname = surname.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            const filename = `loc_${safeName}_${safeSurname}.json`;

            await sandbox.writeJson(filename, { 
                name, 
                surname, 
                locations 
            });
            
            generatedFilenames.push(filename);
        } catch (error) {
            console.error(`[Location API] ❌ Błąd dla ${person.name} ${person.surname}:`, error.message);
        }
    });

    await Promise.all(fetchPromises);

    return {
        status: "success",
        message: `Pomyślnie pobrano dane dla ${generatedFilenames.length} osób.`,
        locations_filenames: generatedFilenames 
    };
}

export async function handleAnalyzeProximity(args) {
    console.log("[Tool] Wywołano analyze_proximity...");

    const { locations_filenames, power_plants_data } = args;

    if (!locations_filenames || !power_plants_data) {
        return { status: "error", message: "Brak wymaganych plików/danych wejściowych." };
    }

    let closestMatch = null;
    let minDistance = Infinity;

    for (const filename of locations_filenames) {
        try {
            const personData = await sandbox.readJson(filename); 
            const { name, surname, locations } = personData;

            // Zabezpieczenie: jeśli API zwróciło np. błąd 404 jako obiekt, omijamy mapowanie
            if (!locations || !Array.isArray(locations)) continue;

            for (const loc of locations) {
                for (const [cityName, plantInfo] of Object.entries(power_plants_data)) {
                    if (!plantInfo.latitude || !plantInfo.longitude) continue;

                    const distance = calculateDistance(
                        loc.latitude, loc.longitude,
                        plantInfo.latitude, plantInfo.longitude
                    );

                    if (distance < minDistance) {
                        minDistance = distance;
                        closestMatch = {
                            name,
                            surname,
                            distanceKm: parseFloat(distance.toFixed(3)),
                            powerPlant: plantInfo.code,
                            city: cityName
                        };
                    }
                }
            }
        } catch (error) {
            console.error(`[Proximity] Nie udało się przetworzyć pliku ${filename}:`, error.message);
        }
    }

    if (!closestMatch) {
        return { status: "success", message: "Nie znaleziono żadnej osoby w pobliżu znanych elektrowni." };
    }

    console.log(`[Proximity] 🏆 Znaleziono kandydata! ${closestMatch.name} ${closestMatch.surname} przy elektrowni ${closestMatch.powerPlant}`);

    return {
        status: "success",
        closest_person: closestMatch
    };
}

export async function handleGetAccessLevel(args) {
    console.log(`[Tool] Wywołano get_access_level dla ${args.name} ${args.surname}...`);
    const level = await hqService.getAccessLevel(args.name, args.surname, args.birthYear);
    return { status: "success", accessLevel: level };
}

export async function handleSubmitTask(args) {
    console.log(`[Tool] 🚀 WYSYŁAM OSTATECZNY RAPORT DO CENTRALI!`);
    const result = await hqService.submitReport(args);
    return { status: "success", result: result };
}