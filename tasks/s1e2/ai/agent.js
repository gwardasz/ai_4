import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

import { chat, extractToolCalls, extractText } from './api.js'; 
import { tools, executeTool } from '../tools/index.js';
import { agentConfig } from './agentConfig.js';

// 1. Inicjalizacja interfejsu do czytania z konsoli (Human-in-the-Loop)
const rl = readline.createInterface({ input, output });

/**
 * Funkcja pomocnicza: Wyświetla payload i prosi o zgodę
 */
async function confirmExecution(iterations, messages) {
    console.log("\n==================================================");
    console.log(`⏳ OCZEKIWANIE NA POTWIERDZENIE (Iteracja: ${iterations})`);
    console.log("==================================================");
    
    // Pokazujemy tylko najnowszą wiadomość dodaną do historii (żeby nie śmiecić w konsoli)
    const latestMessage = messages[messages.length - 1];
    console.log("Ostatnia dodana wiadomość do kontekstu:\n", JSON.stringify(latestMessage, null, 2));
    
    const answer = await rl.question(`\n❓ Czy chcesz wysłać zapytanie do API LLM? (y/n): `);
    
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log("🛑 Zatrzymano agenta przez użytkownika.");
        process.exit(0); // Natychmiastowe, bezpieczne ubicie procesu
    }
    console.log("🚀 Wysyłam zapytanie...\n");
}

export async function runAgent() {
    // We don't need the "system" prompt in the messages array anymore 
    // because api.js passes it as `instructions` in the body!
    let messages = [
        { role: "user", content: "Find me person from suspects who was nearby any power plant. WHen you find him, send report it to verify." }
    ];

    let iterations = 0;
    const MAX_ITERATIONS = 10; 

    while (iterations < MAX_ITERATIONS) {
        iterations++;
        console.log(`\n🤖 [Agent Loop] Rozpoczynam krok ${iterations}/${MAX_ITERATIONS}...`);

        try {
            await confirmExecution(iterations, messages);

            // ==========================================
            // NEW: Use abstract chat() from api.js
            // ==========================================
            const response = await chat({
                model: agentConfig.model,
                input: messages, // Send conversation history
                tools: tools,
                instructions: agentConfig.instructions // System prompt goes here
            });

            // ==========================================
            // NEW: Parse response using api.js helpers
            // ==========================================
            const toolCalls = extractToolCalls(response);
            const textResponse = extractText(response);

            if (toolCalls && toolCalls.length > 0) {
                // Add the tool calls to the history so the model remembers making them
                messages.push(...toolCalls);

                for (const toolCall of toolCalls) {
                    const functionName = toolCall.name;
                    const args = JSON.parse(toolCall.arguments || "{}");
                    
                    console.log(`🔧 [Tool Call] Model używa narzędzia: ${functionName}`);
                    console.log(`📦 Z argumentami:`, args);

                    try {
                        const result = await executeTool(functionName, args);
                        
                        // Add tool result to history
                        messages.push({
                            type: "function_call_output", 
                            call_id: toolCall.call_id,
                            output: JSON.stringify(result)
                        });

                        if (functionName === 'submit_task') {
                            console.log("🎉 [Sukces] Agent pomyślnie wysłał raport!");
                            rl.close();
                            return; 
                        }

                    } catch (error) {
                        console.error(`❌ [Tool Error] Błąd:`, error.message);
                        messages.push({
                            type: "function_call_output",
                            call_id: toolCall.call_id,
                            output: JSON.stringify({ error: error.message })
                        });
                    }
                }
            } else {
                console.log(`💬 [Agent Odpowiada Tekstem]:\n${textResponse}`);
                rl.close();
                break;
            }

        } catch (error) {
            console.error("Krytyczny błąd w pętli agenta:", error);
            rl.close();
            break;
        }
    }

    if (iterations >= MAX_ITERATIONS) {
        console.warn("\n⚠️ UWAGA: Pętla została przerwana automatycznie.");
    }
    rl.close();
}