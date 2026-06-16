# Wstępna propozycja definicji narzędzia:
v1.0 - pojedynczy obiekt 
```json
{
  "type": "function",
  "function": {
    "name": "search_inventory",
    "description": "Searches the database for electronic components based on user criteria. IMPORTANT: All extracted components and keywords MUST be in Polish.",
    "parameters": {
      "type": "object",
      "properties": {
        "component": {
          "type": "string",
          "description": "Base component name in Polish (e.g., 'Tranzystor', 'Dioda')."
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
}
```