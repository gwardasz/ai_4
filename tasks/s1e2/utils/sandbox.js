import fs from 'fs/promises';
import path from 'path';

// 1. Custom Error - żebyśmy wiedzieli, gdy model wyhalucynuje złą ścieżkę
export class SecurityViolationError extends Error {
    constructor(attemptedPath) {
        super(`Security Violation: Attempted to access outside workspace: ${attemptedPath}`);
        this.name = "SecurityViolationError";
    }
}

// 2. Klasa Workspace - nasz menadżer plików
export class Workspace {
    /**
     * @param {string} baseDir - Względna ścieżka do folderu roboczego (np. './workspace')
     */
    constructor(baseDir = './workspace') {
        // Zapisujemy absolutną ścieżkę do workspace'u, żeby mieć punkt odniesienia
        this.baseDir = path.resolve(process.cwd(), baseDir);
    }

    /**
     * Główny mechanizm obronny (Czysta funkcja)
     * @param {string} filename 
     * @returns {string} Bezpieczna, absolutna ścieżka
     */
    _getSafePath(filename) {
        // Łączymy ścieżkę bazową z podaną nazwą pliku
        const resolvedPath = path.resolve(this.baseDir, filename);
        
        // Sprawdzamy, czy wynikowa ścieżka nadal zaczyna się od naszego baseDir
        // To blokuje ataki typu: sandbox.read('../../../etc/passwd') lub nadpisanie .env
        if (!resolvedPath.startsWith(this.baseDir)) {
            throw new SecurityViolationError(filename);
        }
        
        return resolvedPath;
    }

    /**
     * Bezpiecznie odczytuje i parsuje plik JSON
     * @param {string} filename 
     * @returns {Promise<any>}
     */
    async readJson(filename) {
        try {
            const safePath = this._getSafePath(filename);
            const data = await fs.readFile(safePath, 'utf-8');
            console.debug(`[Sandbox] 📖 Odczytano: ${filename}`); // Prosty log debugujący
            return JSON.parse(data);
        } catch (error) {
            console.error(`[Sandbox] ❌ Błąd odczytu ${filename}:`, error.message);
            throw error; // Rzucamy dalej, żeby Agent wiedział, że narzędzie zawiodło
        }
    }

    /**
     * Bezpiecznie zapisuje obiekt do pliku JSON
     * @param {string} filename 
     * @param {Object} data 
     * @returns {Promise<string>} Zwraca nazwę pliku, żeby przekazać ją do LLM
     */
    async writeJson(filename, data) {
        try {
            const safePath = this._getSafePath(filename);
            // Zapewniamy, że folder istnieje (jeśli np. tworzymy pliki w /workspace/locations/)
            await fs.mkdir(path.dirname(safePath), { recursive: true });
            
            await fs.writeFile(safePath, JSON.stringify(data, null, 2), 'utf-8');
            console.debug(`[Sandbox] 💾 Zapisano: ${filename}`);
            return filename; // Zwracamy samą nazwę, żeby LLM miał krótki kontekst
        } catch (error) {
            console.error(`[Sandbox] ❌ Błąd zapisu ${filename}:`, error.message);
            throw error;
        }
    }
}

// Eksportujemy gotową instancję (Singleton), żeby wszystkie narzędzia używały tego samego folderu
export const sandbox = new Workspace('./workspace');