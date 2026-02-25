import { GoogleGenAI, ThinkingLevel, Type, GenerateContentResponse, FunctionDeclaration } from "@google/genai";
import { BookmarkLibrary, Bookmark, Folder } from "../utils/bookmarkParser";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const MODELS = {
  THINKING: "gemini-3.1-pro-preview",
  SEARCH: "gemini-3-flash-preview",
  LITE: "gemini-flash-lite-latest"
};

export async function suggestStructure(library: BookmarkLibrary, userPrompt?: string) {
  // Extract domains and truncate titles to minimize payload size while maximizing bookmark count
  const sampleBookmarks = library.bookmarks.slice(0, 150).map(b => {
    let domain = b.url.substring(0, 50);
    try { domain = new URL(b.url).hostname; } catch (e) {}
    return {
      id: b.id,
      title: b.title.substring(0, 60),
      domain
    };
  });

  const response = await ai.models.generateContent({
    model: MODELS.LITE,
    contents: [
      {
        role: "user",
        parts: [{
          text: `You are an expert data architect. Transform this chaotic list of bookmarks into a pristine, logical folder hierarchy.

          Tasks:
          1. Group by clear, broad semantic themes (e.g., 'Development', 'Design', 'Finance', 'Reading').
          2. Identify likely dead, obsolete, or temporary links (e.g., localhost, test domains) and place them in an 'Archive' folder.
          3. Sort EVERY provided bookmark into the most appropriate folder.

          Bookmarks to sort:
          ${JSON.stringify(sampleBookmarks)}

          ${userPrompt ? `User Refinement Request: ${userPrompt}` : ""}

          Return a JSON object with:
          1. 'folders': An array of objects with 'path' (e.g., "Work/Projects/AI") and 'description'.
          2. 'assignments': An array of objects with 'bookmarkId' and 'folderPath'.
          3. 'reasoning': A brief explanation of the transformation.`
        }]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          folders: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                path: { type: Type.STRING, description: "Full path of the folder, e.g. 'Tech/AI/Tools'" },
                description: { type: Type.STRING }
              },
              required: ["path", "description"]
            }
          },
          assignments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                bookmarkId: { type: Type.STRING },
                folderPath: { type: Type.STRING }
              },
              required: ["bookmarkId", "folderPath"]
            }
          },
          reasoning: { type: Type.STRING }
        },
        required: ["folders", "assignments", "reasoning"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
}

const moveBookmarksTool: FunctionDeclaration = {
  name: "move_bookmarks",
  description: "Moves multiple bookmarks to a specific folder.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      bookmarkIds: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of bookmark IDs to move" },
      targetFolderId: { type: Type.STRING, description: "The ID of the folder to move them to" }
    },
    required: ["bookmarkIds", "targetFolderId"]
  }
};

const createFolderTool: FunctionDeclaration = {
  name: "create_folder",
  description: "Creates a new folder in the library.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "Name of the new folder" },
      parentId: { type: Type.STRING, description: "Optional parent folder ID" }
    },
    required: ["name"]
  }
};

const searchWebContextTool: FunctionDeclaration = {
  name: "search_web_context",
  description: "Uses Google Search to find more information about a bookmark's content to help categorize it.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "The search query (e.g. the bookmark title or URL)" }
    },
    required: ["query"]
  }
};

export async function processCommand(
  library: BookmarkLibrary,
  command: string,
  onUpdate: (action: { type: string; payload: any }) => void
) {
  const response = await ai.models.generateContent({
    model: MODELS.LITE,
    contents: [
      {
        role: "system",
        parts: [{ text: `You are a bookmark organization assistant. Use the provided tools to help the user organize their library.
        Current Library State:
        Folders: ${JSON.stringify(library.folders)}
        Bookmarks Sample: ${JSON.stringify(library.bookmarks.slice(0, 50))}` }]
      },
      {
        role: "user",
        parts: [{ text: command }]
      }
    ],
    config: {
      tools: [{ functionDeclarations: [moveBookmarksTool, createFolderTool, searchWebContextTool] }]
    }
  });

  const calls = response.functionCalls;
  if (calls) {
    for (const call of calls) {
      if (call.name === "move_bookmarks") {
        onUpdate({ type: "MOVE_BOOKMARKS", payload: call.args });
      } else if (call.name === "create_folder") {
        onUpdate({ type: "CREATE_FOLDER", payload: call.args });
      } else if (call.name === "search_web_context") {
        // For search, we'd call the SEARCH model and feed back
        const searchRes = await ai.models.generateContent({
          model: MODELS.SEARCH,
          contents: [{ parts: [{ text: `Find context for: ${call.args.query}` }] }],
          config: { tools: [{ googleSearch: {} }] }
        });
        // Recursively call with search results
        return processCommand(library, `Based on this search info: "${searchRes.text}", proceed with the user's original request: "${command}"`, onUpdate);
      }
    }
  }

  return response.text;
}
