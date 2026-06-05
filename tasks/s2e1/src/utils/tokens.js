import { getEncoding } from "js-tiktoken";
import { PROMPT_TOKEN_LIMIT } from "../config.js";

// Uzywamy enkodowania o200k_base (rodzina GPT-5) - najblizej tokenizacji mini-modelu huba
// ("tokeny liczone troche jak w GPT-5.2"). Hub pozostaje ostatecznym zrodlem prawdy.
let encoder = null;
const getEncoder = () => (encoder ??= getEncoding("o200k_base"));

export const estimateTokens = (text) => getEncoder().encode(text ?? "").length;

/**
 * Pre-walidacja limitu tokenow dla wypelnionych promptow (po podstawieniu {id}/{description}).
 * Zwraca raport, na podstawie ktorego cykl moze odmowic wyslania (bez przepalania budzetu huba).
 */
export const validatePrompts = (filledPrompts, limit = PROMPT_TOKEN_LIMIT) => {
  const perItem = filledPrompts.map(({ id, prompt }) => {
    const tokens = estimateTokens(prompt);
    return { id, tokens, withinLimit: tokens <= limit };
  });

  const maxTokens = perItem.reduce((max, item) => Math.max(max, item.tokens), 0);
  const allWithinLimit = perItem.every((item) => item.withinLimit);

  return { perItem, maxTokens, allWithinLimit, limit };
};
