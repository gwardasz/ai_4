// src/tools/index.js

import { agentTools } from './definitions.js';
import {
    handleGetSuspects,
    handleGetPowerPlants,
    handleDownloadPeopleLocations,
    handleAnalyzeProximity,
    handleGetAccessLevel,
    handleSubmitTask
} from './handlers.js';

// Eksportujemy definicje (dla API LLM)
export const tools = agentTools;

// Router (Wykonawca)
export const executeTool = async (toolName, args) => {
    switch(toolName) {
        case 'get_suspects': 
            return await handleGetSuspects();
        case 'get_power_plants': 
            return await handleGetPowerPlants();
        case 'download_people_locations': 
            return await handleDownloadPeopleLocations(args);
        case 'analyze_proximity': 
            return await handleAnalyzeProximity(args);
        case 'get_access_level': 
            return await handleGetAccessLevel(args);
        case 'submit_task': 
            return await handleSubmitTask(args);
        default: 
            throw new Error(`Nieznane narzędzie: ${toolName}`);
    }
};