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
  
  // Basic parsing logic - simplified for demo
  // In a real app, this would need robust recursive traversing
  const links = doc.querySelectorAll('a');
  links.forEach(link => {
      bookmarks.push({
          id: Math.random().toString(36).substr(2, 9),
          title: link.textContent || 'Untitled',
          url: link.getAttribute('href') || '',
          addDate: link.getAttribute('add_date') || undefined,
          icon: link.getAttribute('icon') || undefined,
          folder: undefined // Flat for now unless we traverse DL/DT structure
      });
  });

  return { bookmarks, folders };
}

function escapeHtml(unsafe: string): string {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

export function exportToHTML(library: BookmarkLibrary): string {
  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;

  // Map to build hierarchy
  const renderItems = (parentId?: string, indent: number = 4) => {
      const space = ' '.repeat(indent);

      // Render folders
      library.folders.filter(f => f.parentId === parentId).forEach(f => {
          html += `${space}<DT><H3>${escapeHtml(f.name)}</H3>
${space}<DL><p>
`;
          renderItems(f.id, indent + 4);
          html += `${space}</DL><p>
`;
      });

      // Render bookmarks
      library.bookmarks.filter(b => b.folder === parentId).forEach(b => {
          html += `${space}<DT><A HREF="${escapeHtml(b.url)}"${b.addDate ? ` ADD_DATE="${escapeHtml(b.addDate)}"` : ''}${b.icon ? ` ICON="${escapeHtml(b.icon)}"` : ''}>${escapeHtml(b.title)}</A>
`;
      });
  };

  renderItems(undefined);
  html += `</DL><p>`;
  return html;
}
