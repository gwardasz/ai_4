import { callRailway } from "../services/railway-api.js";
import { noopLogger } from "../utils/logger.js";

// Wykrywa flage {FLG:...} w dowolnym miejscu odpowiedzi serwisu.
const findFlag = (value) => {
  const match = /\{\{?FLG:[^}]+\}?\}/i.exec(JSON.stringify(value ?? ""));
  return match ? match[0] : null;
};

// Fabryka handlerow z wstrzyknietym loggerem - dzieki temu warstwa transportowa moze logowac.
// Handlery sa cienkie: deleguja do transportu i ujednolicaja ksztalt odpowiedzi.
export const createHandlers = (log = noopLogger) => {
  // Zwraca wynik przerwania - agent wykrywa abort:true i konczy petle. Sterowanie jest DETERMINISTYCZNE.
  const abort = (message) => {
    log.warn("railway.abort", { message });
    return { success: false, abort: true, message };
  };

  return {
    async railway_api({ answer }) {
      if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
        return {
          success: false,
          message: "Parameter 'answer' must be a JSON object.",
          recoveryHints: 'Pass the full answer body, e.g. {"action":"help"}.'
        };
      }

      try {
        const { ok, status, data, retriesExhausted } = await callRailway(answer, log);
        const flag = findFlag(data);

        if (flag) {
          return { success: true, data, flag, recoveryHints: "Task solved. Report the flag and stop." };
        }

        // retriesExhausted == true oznacza, ze warstwa transportowa juz odczekala i ponowila
        // (503/429) i sie nie udalo. Nie ma sensu dawac modelowi kolejnych szans - przerywamy.
        if (retriesExhausted) {
          return abort(
            `Railway API stayed unavailable (status ${status}) after the transport layer exhausted its automatic retries/back-off. Stopping deterministically.`
          );
        }

        // Merytoryczna odpowiedz serwera: sukces lub zwykle 4xx z komunikatem (realny feedback dla modelu).
        return {
          success: ok,
          status,
          data,
          recoveryHints: ok
            ? "Read the response. If it is the help documentation, follow the described actions in order. Send the next required action."
            : `Rejected (status ${status}). Read the response message carefully — it indicates the wrong parameter, value, or action order — then send a corrected action.`
        };
      } catch (error) {
        // Blad konfiguracji nie da sie naprawic retry -> deterministyczne przerwanie.
        if (error.kind === "config") {
          return abort(`${error.message} This cannot be fixed by retrying.`);
        }

        // Blad sieci nie jest ponawiany w transporcie - moze byc chwilowy, wiec pozwalamy na jeden retry.
        return {
          success: false,
          message: error.message,
          recoveryHints: "Transient network issue reaching the railway API. You may retry the same action."
        };
      }
    }
  };
};
