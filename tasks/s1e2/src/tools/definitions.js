export const tools = [
  {
    type: "function",
    name: "get_suspects",
    description: "Downloads and returns the master list of suspects. Returns a JSON array of objects containing 'name', 'surname', and 'birthYear'.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "get_power_plants_locations",
    description: "Downloads the power plant locations dataset to the sandbox. Returns ONLY the filename where the data is stored to save context space.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "who_approached_power_plant",
    description: "Cross-references a list of suspects against the downloaded power plant data file to find who was present.",
    parameters: {
      type: "object",
      properties: {
        suspects: {
          type: "array",
          description: "List of suspects to check.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              surname: { type: "string" }
            },
            required: ["name", "surname"],
            additionalProperties: false
          }
        },
        powerplant_filename: {
          type: "string",
          description: "The filename returned by get_power_plants_locations."
        }
      },
      required: ["suspects", "powerplant_filename"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "get_user_access_level",
    description: "Fetches the security access level for a specific user. Returns an integer.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string"
        },
        surname: {
          type: "string"
        },
        birthYear: {
          type: "integer"
        }
      },
      required: ["name", "surname", "birthYear"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "report_user",
    description: "Submits the final identified suspect to the server. Returns the server response, which contains the FLAG if correct.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string"
        },
        surname: {
          type: "string"
        },
        power_plant_id: {
          type: "string",
          description: "The ID/code of the power plant the suspect approached."
        },
        user_access_level: {
          type: "integer",
          description: "The security access level of the suspect."
        }
      },
      required: ["name", "surname", "power_plant_id", "user_access_level"],
      additionalProperties: false
    },
    strict: true
  }
];