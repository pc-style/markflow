/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  addDate?: string;
  icon?: string;
  tags?: string[];
  folder?: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string;
}

export interface BookmarkLibrary {
  bookmarks: Bookmark[];
  folders: Folder[];
}

export function parseBookmarksHTML(html: string): BookmarkLibrary {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const bookmarks: Bookmark[] = [];
  const folders: Folder[] = [];

  // Simple recursive parser for Netscape format
  const processNode = (node: Element, currentFolderId?: string) => {
    const links = node.querySelectorAll(':scope > dt > a');
    links.forEach(link => {
      bookmarks.push({
        id: Math.random().toString(36).substr(2, 9),
        title: link.textContent || 'Untitled',
        url: link.getAttribute('href') || '',
        addDate: link.getAttribute('add_date') || undefined,
        icon: link.getAttribute('icon') || undefined,
        folder: currentFolderId
      });
    });

    const folderNodes = node.querySelectorAll(':scope > dt > h3');
    folderNodes.forEach(h3 => {
      const folderId = Math.random().toString(36).substr(2, 9);
      folders.push({
        id: folderId,
        name: h3.textContent || 'New Folder',
        parentId: currentFolderId
      });

      const nextDl = h3.parentElement?.querySelector('dl');
      if (nextDl) {
        processNode(nextDl, folderId);
      }
    });
  };

  const rootDl = doc.querySelector('dl');
  if (rootDl) {
    processNode(rootDl);
  } else {
    // Fallback for flat lists or just links
    doc.querySelectorAll('a').forEach(link => {
      bookmarks.push({
        id: Math.random().toString(36).substr(2, 9),
        title: link.textContent || 'Untitled',
        url: link.getAttribute('href') || '',
        folder: undefined
      });
    });
  }

  return { bookmarks, folders };
}

export function exportToHTML(library: BookmarkLibrary): string {
  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>\n`;

  const renderFolder = (folderId?: string, indent = 4) => {
    const space = ' '.repeat(indent);
    const subFolders = library.folders.filter(f => f.parentId === folderId);
    const folderBookmarks = library.bookmarks.filter(b => b.folder === folderId);

    subFolders.forEach(f => {
      html += `${space}<DT><H3>${f.name}</H3>\n${space}<DL><p>\n`;
      renderFolder(f.id, indent + 4);
      html += `${space}</DL><p>\n`;
    });

    folderBookmarks.forEach(b => {
      html += `${space}<DT><A HREF="${b.url}"${b.addDate ? ` ADD_DATE="${b.addDate}"` : ''}${b.icon ? ` ICON="${b.icon}"` : ''}>${b.title}</A>\n`;
    });
  };

  renderFolder(undefined);
  html += `</DL><p>`;
  return html;
}
