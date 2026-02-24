/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  Search, 
  Folder as FolderIcon, 
  Link as LinkIcon, 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Trash2, 
  Download,
  Terminal,
  Sparkles,
  Command,
  Check,
  X,
  Edit3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseBookmarksHTML, exportToHTML, Bookmark, Folder, BookmarkLibrary } from './utils/bookmarkParser';
import { suggestStructure, MODELS } from './services/gemini';

const FolderPreview = ({ folder, depth }: { folder: any, depth: number }) => (
  <div className="space-y-2" style={{ marginLeft: `${depth * 20}px` }}>
    <div className="p-3 border border-brand-white/10 rounded-sm bg-brand-white/[0.02]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-brand-cyan">
          <FolderIcon size={14} />
          <span className="text-xs font-bold uppercase tracking-tight">{folder.name}</span>
        </div>
        <span className="text-[10px] font-mono text-brand-white/20 uppercase">
          {folder.bookmarkCount || 0} Items
        </span>
      </div>
    </div>
    {folder.children && Object.values(folder.children).map((child: any, i: number) => (
      <FolderPreview key={i} folder={child} depth={depth + 1} />
    ))}
  </div>
);

export default function App() {
  const [library, setLibrary] = useState<BookmarkLibrary | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(undefined);
  const [isProcessing, setIsProcessing] = useState(false);
  const [suggestion, setSuggestion] = useState<any>(null);
  const [previewTree, setPreviewTree] = useState<any[]>([]);
  const [userPrompt, setUserPrompt] = useState('');
  const [command, setCommand] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setLibrary(parseBookmarksHTML(content));
      };
      reader.readAsText(file);
    }
  };

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command || !library) return;
    
    const cmd = command;
    setCommand('');
    setLogs(prev => [...prev, `> ${cmd}`]);
    setIsProcessing(true);

    try {
      const { processCommand } = await import('./services/gemini');
      const response = await processCommand(library, cmd, (action) => {
        setLibrary(prev => {
          if (!prev) return prev;
          const next = { ...prev };
          
          if (action.type === 'MOVE_BOOKMARKS') {
            const { bookmarkIds, targetFolderId } = action.payload;
            next.bookmarks = next.bookmarks.map(b => 
              bookmarkIds.includes(b.id) ? { ...b, folder: targetFolderId } : b
            );
            setLogs(l => [...l, `[SYSTEM] Moved ${bookmarkIds.length} items to folder ${targetFolderId}`]);
          } else if (action.type === 'CREATE_FOLDER') {
            const { name, parentId } = action.payload;
            const newFolder = { id: Math.random().toString(36).substr(2, 9), name, parentId };
            next.folders = [...next.folders, newFolder];
            setLogs(l => [...l, `[SYSTEM] Created folder: ${name}`]);
          }
          
          return next;
        });
      });

      if (response) {
        setLogs(prev => [...prev, `AI: ${response}`]);
      }
    } catch (error) {
      console.error(error);
      setLogs(prev => [...prev, `[ERROR] Failed to process command.`]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setLibrary(parseBookmarksHTML(content));
      };
      reader.readAsText(file);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const content = e.clipboardData.getData('text');
    if (content.includes('<DL>') || content.includes('<A HREF=')) {
      setLibrary(parseBookmarksHTML(content));
    }
  };

  const handleSuggest = async () => {
    if (!library) return;
    setIsProcessing(true);
    try {
      const res = await suggestStructure(library, userPrompt);
      setSuggestion(res);
      
      // Reconstruct tree for preview
      const tree: any = {};
      res.folders.forEach((f: any) => {
        const parts = f.path.split('/');
        let current = tree;
        parts.forEach((part: string, idx: number) => {
          if (!current[part]) {
            current[part] = { name: part, children: {}, bookmarkCount: 0 };
          }
          if (idx === parts.length - 1) {
            current[part].bookmarkCount = res.assignments.filter((a: any) => a.folderPath === f.path).length;
          }
          current = current[part].children;
        });
      });
      setPreviewTree(Object.values(tree));
    } catch (error) {
      console.error(error);
      setLogs(l => [...l, `[ERROR] AI Suggestion failed. Try a smaller selection.`]);
    } finally {
      setIsProcessing(false);
    }
  };

  const applySuggestion = () => {
    if (!suggestion || !library) return;
    
    const newFolders: Folder[] = [];
    const updatedBookmarks = [...library.bookmarks];
    const pathMap = new Map<string, string>(); // path -> folderId

    // Create folders from paths
    suggestion.folders.forEach((f: any) => {
      const parts = f.path.split('/');
      let currentParentId: string | undefined = undefined;
      let currentPath = "";

      parts.forEach((part: string) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!pathMap.has(currentPath)) {
          const folderId = Math.random().toString(36).substr(2, 9);
          newFolders.push({
            id: folderId,
            name: part,
            parentId: currentParentId
          });
          pathMap.set(currentPath, folderId);
        }
        currentParentId = pathMap.get(currentPath);
      });
    });

    // Assign bookmarks
    suggestion.assignments.forEach((a: any) => {
      const folderId = pathMap.get(a.folderPath);
      if (folderId) {
        const index = updatedBookmarks.findIndex(b => b.id === a.bookmarkId);
        if (index !== -1) {
          updatedBookmarks[index] = { ...updatedBookmarks[index], folder: folderId };
        }
      }
    });

    setLibrary({
      bookmarks: updatedBookmarks,
      folders: newFolders
    });
    setSuggestion(null);
    setPreviewTree([]);
    setLogs(l => [...l, `[SYSTEM] Applied new hierarchical structure with ${newFolders.length} folders.`]);
  };

  const downloadHTML = () => {
    if (!library) return;
    const html = exportToHTML(library);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'organized_bookmarks.html';
    a.click();
  };

  if (!library) {
    return (
      <div 
        className={`min-h-screen flex flex-col items-center justify-center p-6 transition-colors duration-300 ${isDragging ? 'bg-brand-cyan/5' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl w-full text-center space-y-8"
        >
          <div className="space-y-2">
            <h1 className="text-6xl font-bold tracking-tighter uppercase italic">
              Mark<span className="text-brand-cyan">Flow</span>
            </h1>
            <p className="text-brand-white/40 font-mono text-sm tracking-widest uppercase">
              Architectural Bookmark Reorganization
            </p>
          </div>

          <div 
            onClick={() => fileInputRef.current?.click()}
            className="group relative cursor-pointer terminal-border p-12 rounded-sm transition-all hover:terminal-border-focus overflow-hidden"
          >
            <div className="absolute inset-0 bg-brand-cyan/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10 flex flex-col items-center space-y-4">
              <div className="p-4 rounded-full bg-brand-cyan/10 text-brand-cyan">
                <Upload size={32} />
              </div>
              <div className="space-y-1">
                <p className="text-xl font-medium">Drop your HTML file here</p>
                <p className="text-brand-white/40 text-sm font-mono">OR PASTE CONTENT DIRECTLY</p>
              </div>
            </div>
          </div>

          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept=".html"
          />

          <div className="flex justify-center gap-8 text-brand-white/20 font-mono text-xs uppercase tracking-widest">
            <div className="flex items-center gap-2"><Check size={14} /> Netscape Format</div>
            <div className="flex items-center gap-2"><Check size={14} /> Gemini 2.5 Flash</div>
            <div className="flex items-center gap-2"><Check size={14} /> Tool Calling</div>
          </div>
        </motion.div>
      </div>
    );
  }

  const currentBookmarks = library.bookmarks.filter(b => b.folder === selectedFolderId);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-brand-black">
      {/* Header */}
      <header className="h-16 border-b border-brand-white/10 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold tracking-tighter uppercase italic">
            Mark<span className="text-brand-cyan">Flow</span>
          </h2>
          <div className="h-4 w-[1px] bg-brand-white/10" />
          <div className="flex items-center gap-2 text-brand-white/40 font-mono text-xs uppercase tracking-widest">
            <Terminal size={14} />
            <span>Session: Active</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setLibrary(null)}
            className="px-4 py-2 text-xs font-mono uppercase tracking-widest text-brand-white/40 hover:text-brand-white transition-colors"
          >
            Reset
          </button>
          <button 
            onClick={downloadHTML}
            className="flex items-center gap-2 bg-brand-cyan text-brand-black px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-widest hover:brightness-110 transition-all"
          >
            <Download size={16} />
            Export HTML
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 border-r border-brand-white/10 flex flex-col shrink-0">
          <div className="p-4 border-b border-brand-white/10">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-mono uppercase tracking-widest text-brand-white/40">Library</span>
              <button className="text-brand-cyan hover:brightness-125"><Plus size={16} /></button>
            </div>
            <div className="space-y-1 overflow-y-auto custom-scrollbar max-h-[40vh]">
              <button 
                onClick={() => setSelectedFolderId(undefined)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-sm transition-colors ${!selectedFolderId ? 'bg-brand-cyan/10 text-brand-cyan' : 'hover:bg-brand-white/5 text-brand-white/60'}`}
              >
                <FolderIcon size={16} />
                <span>All Bookmarks</span>
              </button>
              {library.folders.map(folder => (
                <button 
                  key={folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-sm transition-colors ${selectedFolderId === folder.id ? 'bg-brand-cyan/10 text-brand-cyan' : 'hover:bg-brand-white/5 text-brand-white/60'}`}
                >
                  <FolderIcon size={16} />
                  <span className="truncate">{folder.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={16} className="text-brand-cyan" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-brand-white/40">AI Architect</span>
            </div>
            
            <div className="flex-1 flex flex-col space-y-4">
              <textarea 
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="Describe your ideal structure..."
                className="flex-[2] bg-brand-white/5 border border-brand-white/10 p-3 text-sm font-mono rounded-sm focus:outline-none focus:border-brand-cyan/40 resize-none custom-scrollbar"
              />
              <button 
                onClick={handleSuggest}
                disabled={isProcessing}
                className="w-full bg-brand-white/5 border border-brand-cyan/20 text-brand-cyan py-3 rounded-sm text-xs font-bold uppercase tracking-widest hover:bg-brand-cyan/10 transition-all disabled:opacity-50"
              >
                {isProcessing ? 'Thinking...' : 'Propose Structure'}
              </button>

              <div className="flex-1 border-t border-brand-white/10 pt-4 flex flex-col overflow-hidden">
                <div className="flex items-center gap-2 mb-2">
                  <Terminal size={12} className="text-brand-white/20" />
                  <span className="text-[9px] font-mono uppercase tracking-widest text-brand-white/20">System Logs</span>
                </div>
                <div className="flex-1 bg-black/40 p-2 rounded-sm font-mono text-[10px] overflow-y-auto custom-scrollbar space-y-1">
                  {logs.length === 0 && <span className="text-brand-white/10 italic">Waiting for input...</span>}
                  {logs.map((log, i) => (
                    <div key={i} className={log.startsWith('>') ? 'text-brand-cyan' : log.startsWith('[ERROR]') ? 'text-red-400' : 'text-brand-white/40'}>
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          <div className="h-12 border-b border-brand-white/10 flex items-center justify-between px-6 shrink-0 bg-brand-black/50 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <span className="text-xs font-mono text-brand-white/40">
                {selectedFolderId ? library.folders.find(f => f.id === selectedFolderId)?.name : 'Root'}
              </span>
              <span className="text-[10px] font-mono text-brand-white/20">/</span>
              <span className="text-xs font-mono text-brand-white/40">{currentBookmarks.length} Items</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-white/20" />
                <input 
                  type="text" 
                  placeholder="Filter..." 
                  className="bg-brand-white/5 border border-brand-white/10 pl-9 pr-4 py-1 text-xs font-mono rounded-full focus:outline-none focus:border-brand-cyan/40"
                />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <AnimatePresence mode="popLayout">
                {currentBookmarks.map((bookmark) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={bookmark.id}
                    className="group terminal-border p-4 rounded-sm hover:terminal-border-focus transition-all bg-brand-white/[0.02] flex flex-col justify-between min-h-[120px]"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="p-2 rounded-sm bg-brand-cyan/5 text-brand-cyan">
                          <LinkIcon size={14} />
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="p-1 hover:text-brand-cyan"><Edit3 size={14} /></button>
                          <button className="p-1 hover:text-red-400"><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <h3 className="text-sm font-medium line-clamp-2 leading-tight group-hover:text-brand-cyan transition-colors">
                        {bookmark.title}
                      </h3>
                    </div>
                    <div className="pt-4 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-brand-white/20 truncate max-w-[150px]">
                        {new URL(bookmark.url).hostname}
                      </span>
                      <a 
                        href={bookmark.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[10px] font-mono text-brand-cyan uppercase tracking-widest hover:underline"
                      >
                        Open
                      </a>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Suggestion Overlay */}
          <AnimatePresence>
            {suggestion && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 bg-brand-black/80 backdrop-blur-md flex items-center justify-center p-6"
              >
                <motion.div 
                  initial={{ scale: 0.9, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  className="max-w-3xl w-full terminal-border bg-brand-black p-8 rounded-sm space-y-8"
                >
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="text-2xl font-bold tracking-tighter uppercase italic">Proposed Architecture</h3>
                      <p className="text-brand-white/40 font-mono text-xs uppercase tracking-widest">Generated by Gemini 3.1 Pro</p>
                    </div>
                    <button onClick={() => setSuggestion(null)} className="text-brand-white/40 hover:text-brand-white">
                      <X size={24} />
                    </button>
                  </div>

                  <div className="max-h-[50vh] overflow-y-auto custom-scrollbar pr-4 space-y-4">
                    {previewTree.map((f: any, i: number) => (
                      <FolderPreview key={i} folder={f} depth={0} />
                    ))}
                  </div>

                  <div className="p-4 bg-brand-cyan/5 border border-brand-cyan/20 rounded-sm">
                    <p className="text-xs font-mono text-brand-cyan leading-relaxed">
                      <span className="font-bold">Reasoning:</span> {suggestion.reasoning}
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-4">
                    <button 
                      onClick={() => setSuggestion(null)}
                      className="px-6 py-3 text-xs font-bold uppercase tracking-widest text-brand-white/40 hover:text-brand-white"
                    >
                      Discard
                    </button>
                    <button 
                      onClick={applySuggestion}
                      className="bg-brand-cyan text-brand-black px-8 py-3 rounded-sm text-xs font-bold uppercase tracking-widest hover:brightness-110 transition-all flex items-center gap-2"
                    >
                      <Check size={16} />
                      Apply Structure
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Command Stream (Bottom Bar) */}
          <div className="h-16 border-t border-brand-white/10 bg-brand-black/80 backdrop-blur-md flex items-center px-6 gap-4">
            <div className="text-brand-cyan shrink-0">
              <Terminal size={18} />
            </div>
            <form onSubmit={handleCommand} className="flex-1">
              <input 
                type="text" 
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Type a command (e.g. 'Move all coding links to a new Dev folder')..."
                className="w-full bg-transparent border-none focus:outline-none text-sm font-mono text-brand-white placeholder:text-brand-white/20"
              />
            </form>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-brand-cyan animate-pulse' : 'bg-brand-white/20'}`} />
              <span className="text-[10px] font-mono text-brand-white/40 uppercase tracking-widest">
                {isProcessing ? 'Processing...' : 'Ready'}
              </span>
            </div>
          </div>
        </main>
      </div>

      {/* Footer / Command Bar */}
      <footer className="h-10 border-t border-brand-white/10 bg-brand-black flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-[10px] font-mono text-brand-white/40 uppercase tracking-widest">
            <Command size={12} />
            <span>CMD + K for AI</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-brand-white/40 uppercase tracking-widest">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span>Gemini 2.5 Flash Lite</span>
          </div>
        </div>
        <div className="text-[10px] font-mono text-brand-white/20 uppercase tracking-widest">
          v1.0.4-stable // hyper-grid-01
        </div>
      </footer>
    </div>
  );
}
