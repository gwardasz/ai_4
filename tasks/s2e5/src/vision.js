import { AI_API_KEY, EXTRA_API_HEADERS, RESPONSES_API_ENDPOINT } from "../../../config.js";
import { visionModel } from "./config.js";
import { extractText } from "./llm.js";

export const vision = async ({ question, images, imageBase64, mimeType = "image/png" }) => {
  const list =
    images ??
    (imageBase64 ? [{ base64: imageBase64, mimeType }] : []);

  if (list.length === 0) {
    throw new Error("vision() requires images[] or imageBase64.");
  }

  const content = [
    { type: "input_text", text: question },
    ...list.map((img) => ({
      type: "input_image",
      image_url: `data:${img.mimeType ?? "image/png"};base64,${img.base64}`
    }))
  ];

  const response = await fetch(RESPONSES_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_API_KEY}`,
      ...EXTRA_API_HEADERS
    },
    body: JSON.stringify({
      model: visionModel,
      input: [{ role: "user", content }]
    })
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data?.error?.message || `Vision request failed (${response.status})`);
  }

  return extractText(data) || "";
};
