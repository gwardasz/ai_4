// src/app.js

import { runAgent } from './ai/agent.js';

async function main() {
    console.log("=========================================");
    console.log("🕵️‍♂️ Uruchamianie Systemu Śledczego Agenta");
    console.log("=========================================\n");

    try {
        await runAgent();
        console.log("\n✅ Proces całkowicie zakończony.");
    } catch (error) {
        console.error("❌ Aplikacja zakończyła się krytycznym błędem:", error);
        process.exit(1);
    }
}

// Odpalamy!
main();