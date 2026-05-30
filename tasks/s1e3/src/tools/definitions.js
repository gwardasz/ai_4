// Schematy narzedzi widoczne dla modelu. Dokladnie tyle, ile handlerow w handlers.js.
export const tools = [
  {
    type: "function",
    name: "check_package",
    description: "Check the current status, contents and location of a package by its ID.",
    parameters: {
      type: "object",
      properties: {
        packageid: {
          type: "string",
          description: "Package identifier, e.g. PKG12345678."
        }
      },
      required: ["packageid"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "redirect_package",
    description: "Redirect a package to a destination power plant. Requires the security code provided by the operator.",
    parameters: {
      type: "object",
      properties: {
        packageid: {
          type: "string",
          description: "Package identifier to redirect."
        },
        destination: {
          type: "string",
          description: "Destination power plant code, e.g. PWR3847PL."
        },
        code: {
          type: "string",
          description: "Security code required to authorize the redirect."
        }
      },
      required: ["packageid", "destination", "code"],
      additionalProperties: false
    },
    strict: true
  }
];
