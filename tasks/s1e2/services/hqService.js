// src/services/hqService.js
import { AI_DEVS_API_KEY } from '../../../config.js';

const BASE_URL = 'https://hub.ag3nts.org';

export class HqService {
    async _post(endpoint, payload) {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apikey: AI_DEVS_API_KEY, 
                ...payload
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`[HQ API Error] ${endpoint} zwrócił status ${response.status}: ${errorText}`);
        }

        return response.json();
    }

    async getPowerPlants() {
        const url = `${BASE_URL}/data/${AI_DEVS_API_KEY}/findhim_locations.json`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error(`[HQ API] Nie udało się pobrać elektrowni: ${response.status}`);
        return response.json();
    }

    async getPersonLocations(name, surname) {
    const data = await this._post('/api/location', { name, surname });
    return data.message || data; 
    }

    async getAccessLevel(name, surname, birthYear) {
        const data = await this._post('/api/accesslevel', { 
            name, 
            surname, 
            birthYear: parseInt(birthYear, 10)
        });
        return data.message; 
    }

    async submitReport(answerObj) {
        return this._post('/verify', {
            task: "findhim",
            answer: answerObj
        });
    }
}

export const hqService = new HqService();