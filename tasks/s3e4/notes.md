# Wstępna propozycja definicji narzędzia:
v1.1 - multiple objects
```json
{
  "type": "function",
  "function": {
    "name": "search_inventory",
    "description": "Searches the database for one or multiple electronic components simultaneously. IMPORTANT: All extracted components and keywords MUST be in Polish.",
    "parameters": {
      "type": "object",
      "properties": {
        "queries": {
          "type": "array",
          "description": "List of distinct components the user is looking for. Create a separate object for each requested item.",
          "items": {
            "type": "object",
            "properties": {
              "component": {
                "type": "string",
                "description": "Base component name in Polish (e.g., 'Tranzystor', 'Dioda', 'Układ logiczny')."
              },
              "required_keywords": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "Keywords in Polish that must be present. Use standard spacing, e.g., '1 A', '10 uF', '50 V', '2.4 GHz'."
              },
              "optional_keywords": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "Keywords in Polish that are nice-to-have."
              },
              "excluded_keywords": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "Keywords in Polish that must NOT be present (e.g., if user says 'biały odpada', add 'biały')."
              }
            }
          }
        }
      },
      "required": [
        "queries"
      ]
    }
  }
}
```
