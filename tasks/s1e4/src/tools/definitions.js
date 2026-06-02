import { DOC_ENTRY_URL } from "../config.js";

// Schematy narzedzi widoczne dla modelu. Dokladnie tyle, ile handlerow w handlers.js.
export const tools = [
  {
    type: "function",
    name: "http_fetch",
    description:
      "Download a documentation file from the SPK documentation site into the local workspace. " +
      "Accepts a full URL or a path/filename relative to the documentation base. " +
      "Returns the saved local path; for text files also returns the content; for images, use understand_image next.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: `Full URL (e.g. ${DOC_ENTRY_URL}) or relative path (e.g. 'index.md', 'attachments/foo.png').`
        }
      },
      required: ["url"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "fs_read",
    description:
      "Read a file or list a directory inside the workspace. " +
      "For directories returns entries; for text files returns content with line numbers. Large files are paginated via 'lines'.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: 'Path relative to the workspace. Use "." to list everything downloaded so far.'
        },
        mode: {
          type: "string",
          enum: ["auto", "list", "content"],
          description: 'Optional. "auto" (default) detects file vs directory, "list" lists a directory, "content" reads a file.'
        },
        lines: {
          type: "string",
          description: 'Optional. Limit file reading to specific lines. Format: "10" (single line) or "10-50" (range).'
        }
      },
      required: ["path"],
      additionalProperties: false
    },
    strict: false
  },
  {
    type: "function",
    name: "fs_search",
    description: "Search downloaded files in the workspace by filename and by content (case-insensitive). Returns filename matches and content matches with line numbers.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Text to look for in file names and file contents."
        },
        inContent: {
          type: "boolean",
          description: "Optional. Also search inside file contents (default true)."
        }
      },
      required: ["query"],
      additionalProperties: false
    },
    strict: false
  },
  {
    type: "function",
    name: "fs_write",
    description: "Write a file inside the workspace (creates or overwrites). Useful for keeping working notes or draft versions of the declaration.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to the workspace, e.g. 'notes/draft.md'." },
        content: { type: "string", description: "Full text content to write." }
      },
      required: ["path", "content"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "understand_image",
    description: "Analyze a local image file in the workspace using a vision model and answer a specific question about it. Use this for documentation pages delivered as images.",
    parameters: {
      type: "object",
      properties: {
        image_path: { type: "string", description: "Path to the image relative to the workspace, e.g. 'attachments/regulamin.png'." },
        question: { type: "string", description: "Precise question about the image content (e.g. 'Transcribe all text, tables and codes in this image verbatim')." }
      },
      required: ["image_path", "question"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "submit_declaration",
    description:
      "Submit the finished declaration text to the verification service (task 'sendit'). " +
      "Returns the service response. On success it contains a flag {FLG:...}; on rejection it contains an error message with hints about what to fix.",
    parameters: {
      type: "object",
      properties: {
        declaration: { type: "string", description: "The full declaration text, formatted exactly as the template requires." }
      },
      required: ["declaration"],
      additionalProperties: false
    },
    strict: true
  }
];
