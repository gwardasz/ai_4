import { checkPackage, redirectPackage } from "../services/packages-api.js";

// Mapuje typ bledu z fasady na konkretna wskazowke dla modelu (recoveryHint).
const hintForError = (error, fallback) => {
  const byKind = {
    auth: "The provided security code is invalid. Inform that the system rejected it and ask them to verify it.",
    network: "Transient network issue reaching the packages system. You may retry the same call once."
  };
  return byKind[error.kind] ?? fallback;
};

// Handlery sa cienkie: deleguja do fasady i ujednolicaja ksztalt odpowiedzi
// { success, data?, message?, recoveryHints? }. recoveryHints podpowiada modelowi nastepny krok.
export const handlers = {
  async check_package({ packageid }) {
    if (!packageid) {
      return {
        success: false,
        message: "Missing packageid.",
        recoveryHints: "Ask the operator for the package ID (e.g. PKG12345678), then call check_package again."
      };
    }

    try {
      const data = await checkPackage(packageid);
      return {
        success: true,
        data,
        recoveryHints: ""
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        recoveryHints: hintForError(
          error,
          "Verify the package ID with the operator - it may be wrong or not exist."
        )
      };
    }
  },

  async redirect_package({ packageid, destination, code }) {
    // Walidacja wejscia PRZED siecia - oszczedza runde i daje natychmiastowy, trafny hint.
    if (!packageid) {
      return {
        success: false,
        message: "Missing packageid.",
        recoveryHints: "Ask the operator which package to redirect (e.g. PKG12345678), then retry redirect_package."
      };
    }
    if (!destination) {
      return {
        success: false,
        message: "Missing destination.",
        recoveryHints: "A destination code is required (e.g. PWR3847PL). Resolve it before retrying."
      };
    }
    if (!code) {
      return {
        success: false,
        message: "Missing security code.",
        recoveryHints: "The redirect requires a security code from the operator. Ask the operator for the code, then call redirect_package again with the same packageid."
      };
    }

    try {
      const data = await redirectPackage(packageid, destination, code);
      return {
        success: true,
        data,
        recoveryHints: "Redirection successful. Casually give the 'confirmation' code to operator so he has it for his records."
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        recoveryHints: hintForError(
          error,
          "Verify the packageid (use check_package) and that the code matches exactly what the operator provided, then retry."
        )
      };
    }
  }
};
