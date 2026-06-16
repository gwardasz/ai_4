# Preliminary assumptions regarding the agent tool
## Tool definition proposal:
```json
{
  "type": "function",
  "function": {
    "name": "find_components_availability_by_city",
    "description": "Searches the database for multiple electronic components and determines which cities have ALL requested items in stock. The tool returns matching product proposals grouped by available cities. IMPORTANT: All extracted components and keywords MUST be in Polish.",
    "parameters": {
      "type": "object",
      "properties": {
        "queries": {
          "type": "array",
          "description": "List of distinct components the user is looking for.",
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
## Error Handling & Recovery Hints

* **Over-constrained search (0 results for an item)**
  * **Error:** No component matches all requested parameters.
  * **recoveryHint:** "Item not found. Ask user to drop a constraint (e.g., package type) or suggest finding an alternative."

* **Scattered cart (No common city)**
  * **Error:** All items exist, but not in a single location.
  * **recoveryHint:** "No common city for all items. List available locations per item and ask user to split the order or drop the blocking item."

* **Too many results (Vague query)**
  * **Error:** Query too broad, results truncated.
  * **recoveryHint:** "Too many matches. Show a few examples and ask user to provide specific parameters (e.g., voltage, size) to narrow down results."

* **Exclusions conflict (All available stock filtered out)**
  * **Error:** Negative filters removed all available items.
  * **recoveryHint:** "Exclusions blocked all available stock. Inform user what variants are actually in stock and ask if they accept them."