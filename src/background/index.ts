import { Storage } from "@plasmohq/storage"
import { processCommand } from "../services/gemini"
import { BookmarkLibrary, Folder } from "../utils/bookmarkParser"

const storage = new Storage()

console.log("MarkFlow Background Service Started");

chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  // Only process actual bookmarks (with URL), not folders
  if (!bookmark.url) return;

  const autoSort = await storage.get("auto_sort_enabled")
  const apiKey = await storage.get("gemini_api_key")

  if (!autoSort || !apiKey) {
    console.log("Auto-sort disabled or no API key.");
    return;
  }

  console.log("Auto-sorting new bookmark:", bookmark.title);

  // Get current folder structure
  const tree = await chrome.bookmarks.getTree();

  const folders: Folder[] = [];
  // Map folder names to IDs for easier lookup if AI uses names
  const folderNameMap: Record<string, string> = {};

  const traverse = (node: chrome.bookmarks.BookmarkTreeNode, parentId?: string) => {
    // Only collect folders
    if (!node.url && node.id !== "0") {
        folders.push({
            id: node.id,
            name: node.title,
            parentId: parentId
        });
        folderNameMap[node.title] = node.id;
        if (node.children) {
            node.children.forEach(child => traverse(child, node.id === "0" ? undefined : node.id));
        }
    }
  };
  tree.forEach(node => traverse(node));

  // Construct context library
  const library: BookmarkLibrary = {
    bookmarks: [{
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        addDate: bookmark.dateAdded?.toString() || "",
        folder: bookmark.parentId
    }],
    folders: folders
  };

  try {
    const command = `I just added a new bookmark: "${bookmark.title}" (${bookmark.url}). Move it to the most appropriate existing folder from the list. If no strictly relevant folder exists, create one and move it there.`

    // Track created folders in this session to resolve names to IDs
    const createdFolders: Record<string, string> = {};

    await processCommand(apiKey, library, command, async (action) => {
        if (action.type === 'CREATE_FOLDER') {
            const { name, parentId } = action.payload;
            const safeParentId = parentId || "1";
            const newFolder = await chrome.bookmarks.create({ title: name, parentId: safeParentId });
            console.log(`Created folder ${name} with ID ${newFolder.id}`);
            createdFolders[name] = newFolder.id;
        } else if (action.type === 'MOVE_BOOKMARKS') {
            const { bookmarkIds, targetFolderId } = action.payload;

            // Resolve targetFolderId: might be an ID, or a name of a just-created folder, or a name of an existing folder
            let resolvedTargetId = targetFolderId;

            if (createdFolders[targetFolderId]) {
                resolvedTargetId = createdFolders[targetFolderId];
            } else if (folderNameMap[targetFolderId]) {
                resolvedTargetId = folderNameMap[targetFolderId];
            }

            if (bookmarkIds.includes(bookmark.id)) {
                // Check if target exists (simple check: valid ID usually numeric)
                // chrome.bookmarks.move will throw if ID is invalid.
                try {
                    await chrome.bookmarks.move(bookmark.id, { parentId: resolvedTargetId });
                    console.log(`Moved bookmark ${bookmark.title} to folder ${resolvedTargetId}`);
                } catch (e) {
                    console.error(`Failed to move bookmark to ${resolvedTargetId}: ${e}`);
                }
            }
        }
    });

  } catch (error) {
    console.error("Error auto-sorting bookmark:", error);
  }
});

export {}
