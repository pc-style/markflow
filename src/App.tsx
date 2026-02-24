/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, Folder as FolderIcon, Link as LinkIcon, Download,
  Terminal, Sparkles, Check, X, RefreshCw, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseBookmarksHTML, exportToHTML, BookmarkLibrary, Folder, Bookmark } from './utils/bookmarkParser';
import { suggestStructure } from './services/gemini';

type AppState = 'upload' | 'processing' | 'review' | 'final';

const FolderPreview = ({ folder, depth }: { folder: any, depth: number }) => (
  <div className="space-y-1" style={{ marginLeft: `${depth * 16}px` }}>
    <div className="py-2 px-3 rounded-md bg-white/[0.02] border border-border hover:bg-white/5 transition-colors flex items-center justify-between group">
      <div className="flex items-center gap-3">
        <FolderIcon size={14} className="text-accent" />
        <span className="text-sm font-medium text-text-main">{folder.name}</span>
      </div>
      <span className="text-[10px] font-mono text-text-muted bg-black/50 px-2 py-1 rounded-full">
        {folder.bookmarkCount || 0} items
      </span>
    </div>
    {folder.children && Object.values(folder.children).map((child: any, i: number) => (
      <FolderPreview key={i} folder={child} depth={depth + 1} />
    ))}
  </div>
);

export default function App() {
  const [appState, setAppState] = useState<AppState>('upload');
  const [library, setLibrary] = useState<BookmarkLibrary | null>(null);
  const [originalLibrary, setOriginalLibrary] = useState<BookmarkLibrary | null>(null);
  const [originalStats, setOriginalStats] = useState({ total: 0, duplicates: 0 });
  
  const [suggestion, setSuggestion] = useState<any>(null);
  const [previewTree, setPreviewTree] = useState<any[]>([]);
  const [processingText, setProcessingText] = useState('Initializing...');
  
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(undefined);
  const [command, setCommand] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [isVaporizing, setIsVaporizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (appState === 'processing') {
      const texts = [
        "Parsing HTML structure...",
        "Identifying duplicates...",
        "Analyzing semantic themes...",
        "Architecting folder hierarchy...",
        "Crystallizing metadata..."
      ];
      let i = 0;
      setProcessingText(texts[0]);
      const interval = setInterval(() => {
        i = (i + 1) % texts.length;
        setProcessingText(texts[i]);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [appState]);

  const processFile = async (content: string) => {
    const parsed = parseBookmarksHTML(content);
    const initialCount = parsed.bookmarks.length;
    
    // Deduplicate
    const uniqueBookmarks: Bookmark[] = [];
    const seenUrls = new Set();
    parsed.bookmarks.forEach(b => {
       if (!seenUrls.has(b.url)) {
          seenUrls.add(b.url);
          uniqueBookmarks.push(b);
       }
    });
    parsed.bookmarks = uniqueBookmarks;
    const duplicates = initialCount - uniqueBookmarks.length;
    
    setOriginalStats({ total: initialCount, duplicates });
    setOriginalLibrary(parsed);
    setLibrary(parsed);
    
    await runAutoSuggest(parsed);
  };

  const runAutoSuggest = async (lib: BookmarkLibrary, customPrompt?: string) => {
    setAppState('processing');
    try {
      const res = await suggestStructure(lib, customPrompt || "Organize these bookmarks into a clean, logical hierarchy. Group likely dead or obsolete links into an 'Archive' folder.");
      setSuggestion(res);
      
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
      setAppState('review');
    } catch (error) {
      console.error(error);
      setAppState('upload');
      alert("Failed to analyze bookmarks. Please try a smaller file.");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        processFile(content);
      };
      reader.readAsText(file);
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
        processFile(content);
      };
      reader.readAsText(file);
    }
  };

  const applySuggestion = async () => {
    if (!suggestion || !library) return;
    
    setAppState('final');
    setIsVaporizing(true);
    
    await new Promise(resolve => setTimeout(resolve, 600));
    
    const newFolders: Folder[] = [];
    const updatedBookmarks = [...library.bookmarks];
    const pathMap = new Map<string, string>();

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
    setLogs([`[SYSTEM] Applied new hierarchical structure with ${newFolders.length} folders.`]);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsVaporizing(false);
  };

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command || !library) return;
    
    const cmd = command;
    setCommand('');
    setLogs(prev => [...prev, `> ${cmd}`]);

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
    }
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

  if (appState === 'upload') {
    return (
      <div 
        className={`min-h-screen flex flex-col items-center justify-center p-6 bg-bg-base relative overflow-hidden transition-colors duration-500 ${isDragging ? 'bg-accent/5' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/5 blur-[120px] rounded-full pointer-events-none" />
        
        <motion.div 
          initial={{ opacity: 0, filter: "blur(10px)", y: 20 }}
          animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-md w-full z-10"
        >
          <div className="text-center space-y-4 mb-12">
            <h1 className="text-3xl font-medium tracking-tight text-text-main">MarkFlow</h1>
            <p className="text-text-muted text-sm">Chaos to clarity in 60 seconds.</p>
          </div>

          <div 
            onClick={() => fileInputRef.current?.click()}
            className="group relative cursor-pointer panel-border p-10 rounded-xl bg-bg-panel/50 hover:bg-bg-hover transition-all duration-500 overflow-hidden text-center"
          >
            <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <Upload size={24} className="mx-auto mb-4 text-text-muted group-hover:text-accent transition-colors duration-500" />
            <p className="text-sm font-medium text-text-main mb-1">Initialize Workspace</p>
            <p className="text-xs text-text-muted">Drop HTML file or click to browse</p>
          </div>

          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept=".html"
          />
        </motion.div>
      </div>
    );
  }

  if (appState === 'processing') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-bg-base relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-accent/10 blur-[100px] rounded-full pointer-events-none animate-pulse" />
        <div className="z-10 flex flex-col items-center space-y-8">
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 border-t-2 border-accent rounded-full animate-spin w-24 h-24" />
            <div className="absolute inset-2 border-r-2 border-accent/50 rounded-full animate-spin-reverse w-20 h-20" style={{ animationDirection: 'reverse', animationDuration: '3s' }} />
            <Sparkles size={32} className="text-accent animate-pulse" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-medium text-text-main">Architecting Clarity</h2>
            <motion.p 
              key={processingText}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="text-sm font-mono text-text-muted"
            >
              {processingText}
            </motion.p>
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'review') {
    return (
      <div className="h-screen flex flex-col bg-bg-base overflow-hidden">
        <header className="h-16 border-b border-border flex items-center justify-between px-8 shrink-0 bg-bg-base/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <Layers size={18} className="text-accent" />
            <span className="text-sm font-medium tracking-tight text-text-main">Transformation Review</span>
          </div>
          <div className="text-xs font-mono text-text-muted bg-accent/10 text-accent px-3 py-1 rounded-full border border-accent/20">
            Ready to Crystallize
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden p-8 gap-8">
          {/* Left: Chaos */}
          <div className="w-1/2 panel-border bg-bg-panel rounded-2xl flex flex-col overflow-hidden relative">
            <div className="p-5 border-b border-border bg-black/40 flex justify-between items-center">
              <span className="text-text-muted font-mono text-xs uppercase tracking-widest">Original Chaos</span>
              <span className="text-red-400/80 text-xs font-mono bg-red-400/10 px-2 py-1 rounded-md">{originalStats.total} items • {originalStats.duplicates} duplicates removed</span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar opacity-40 grayscale">
              {originalLibrary?.bookmarks.map(b => (
                <div key={b.id} className="flex items-center gap-3 text-sm text-text-muted truncate">
                  <LinkIcon size={14} className="shrink-0" /> 
                  <span className="truncate">{b.title}</span>
                </div>
              ))}
            </div>
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-bg-panel to-transparent pointer-events-none" />
          </div>

          {/* Right: Clarity */}
          <div className="w-1/2 panel-border bg-bg-panel rounded-2xl flex flex-col overflow-hidden relative shadow-[0_0_50px_rgba(138,143,255,0.08)]">
            <div className="p-5 border-b border-border bg-accent/5 flex justify-between items-center">
              <span className="text-accent font-mono text-xs uppercase tracking-widest flex items-center gap-2">
                <Sparkles size={14}/> Architected Clarity
              </span>
              <span className="text-accent text-xs font-mono bg-accent/10 px-2 py-1 rounded-md">{suggestion?.folders?.length || 0} Smart Folders</span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-2">
              {previewTree.map((f: any, i: number) => (
                <FolderPreview key={i} folder={f} depth={0} />
              ))}
            </div>
            <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-bg-panel to-transparent pointer-events-none" />
          </div>
        </div>

        {/* Bottom Command Bar */}
        <div className="h-28 shrink-0 flex items-start justify-center px-8 pb-8">
          <div className="w-full max-w-5xl panel-border bg-bg-panel/90 backdrop-blur-xl rounded-2xl p-2 flex items-center shadow-2xl">
            <button 
              onClick={() => runAutoSuggest(originalLibrary!, "Generate a completely different, alternative structure.")} 
              className="p-3 text-text-muted hover:text-accent hover:bg-accent/10 rounded-xl transition-all" 
              title="Regenerate Alternative"
            >
              <RefreshCw size={20} />
            </button>
            <div className="w-[1px] h-8 bg-border mx-2" />
            <Sparkles size={18} className="text-accent ml-3 shrink-0" />
            <input 
              type="text" 
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runAutoSuggest(originalLibrary!, command); setCommand(''); } }}
              placeholder="Refine structure (e.g. 'Group all AI tools together')..."
              className="flex-1 bg-transparent border-none focus:outline-none text-sm font-medium text-text-main placeholder:text-text-muted px-4 py-3"
            />
            <button 
              onClick={applySuggestion} 
              className="bg-text-main text-bg-base px-8 py-3.5 rounded-xl text-sm font-semibold hover:bg-white transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.2)] ml-2"
            >
              <Check size={18} /> Apply & Crystallize
            </button>
          </div>
        </div>
      </div>
    );
  }

  // FINAL STATE
  const currentBookmarks = library?.bookmarks.filter(b => b.folder === selectedFolderId) || [];

  return (
    <div className="h-screen flex bg-bg-base overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-bg-panel/30 flex flex-col shrink-0 z-10">
        <div className="h-14 flex items-center px-6 border-b border-border">
          <span className="text-sm font-medium tracking-tight text-text-main">MarkFlow</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
          <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-4 px-2 mt-2">Library</div>
          <button 
            onClick={() => setSelectedFolderId(undefined)}
            className={`w-full flex items-center gap-3 px-3 py-2 text-xs rounded-md transition-colors ${!selectedFolderId ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text-main hover:bg-white/5'}`}
          >
            <FolderIcon size={14} />
            <span className="font-medium">All Bookmarks</span>
          </button>
          {library?.folders.map(folder => (
            <button 
              key={folder.id}
              onClick={() => setSelectedFolderId(folder.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-xs rounded-md transition-colors ${selectedFolderId === folder.id ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text-main hover:bg-white/5'}`}
            >
              <FolderIcon size={14} />
              <span className="truncate font-medium">{folder.name}</span>
            </button>
          ))}
        </div>
        
        {/* Logs */}
        <div className="h-40 border-t border-border bg-bg-base/50 p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Terminal size={12} className="text-text-muted" />
            <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider">System Stream</div>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-[10px] custom-scrollbar pr-2">
            {logs.length === 0 && <span className="text-text-muted/50 italic">Awaiting commands...</span>}
            {logs.map((log, i) => (
              <div key={i} className={log.startsWith('>') ? 'text-accent' : log.startsWith('[ERROR]') ? 'text-red-400' : 'text-text-muted'}>
                {log}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        <header className="h-14 border-b border-border flex items-center justify-between px-8 shrink-0 bg-bg-base/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-3 text-xs text-text-muted font-medium">
            <span className="text-text-main">{selectedFolderId ? library?.folders.find(f => f.id === selectedFolderId)?.name : 'Root'}</span>
            <span className="text-border">/</span>
            <span>{currentBookmarks.length} items</span>
          </div>
          <button onClick={downloadHTML} className="bg-text-main text-bg-base px-4 py-2 rounded-md text-xs font-medium hover:bg-white transition-colors flex items-center gap-2 shadow-[0_0_15px_rgba(255,255,255,0.2)]">
            <Download size={14} /> Export HTML
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 relative custom-scrollbar">
          {/* Vaporize Shake Container */}
          <motion.div 
            animate={isVaporizing ? { 
              x: [-8, 8, -8, 8, -4, 4, -2, 2, 0], 
              y: [-4, 4, -4, 4, -2, 2, -1, 1, 0],
              filter: ["blur(0px)", "blur(2px)", "blur(4px)", "blur(8px)"],
              transition: { duration: 0.6 } 
            } : {}}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-32"
          >
            <AnimatePresence mode="popLayout">
              {currentBookmarks.map((bookmark) => (
                <motion.div 
                  layout
                  initial={{ opacity: 0, scale: 0.8, filter: "blur(10px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={isVaporizing ? {
                    opacity: 0,
                    scale: 0.2,
                    filter: "blur(20px)",
                    x: (Math.random() - 0.5) * 800,
                    y: (Math.random() - 0.5) * 800,
                    rotate: (Math.random() - 0.5) * 360,
                    transition: { duration: 0.8, ease: "easeOut" }
                  } : { opacity: 0, scale: 0.95, filter: "blur(4px)" }}
                  key={bookmark.id}
                  className="panel-border p-5 rounded-lg bg-bg-panel hover:bg-bg-hover transition-colors flex flex-col justify-between min-h-[110px] group"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <LinkIcon size={14} className="text-text-muted group-hover:text-accent transition-colors" />
                    </div>
                    <h3 className="text-sm font-medium line-clamp-2 leading-snug text-text-main">
                      {bookmark.title}
                    </h3>
                  </div>
                  <div className="pt-4 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-text-muted truncate max-w-[180px]">
                      {new URL(bookmark.url).hostname}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Central Command Input */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-20">
          <div className="panel-border bg-bg-panel/90 backdrop-blur-xl rounded-xl p-2 flex items-center shadow-2xl glow-focus transition-all duration-300">
            <Sparkles size={16} className="text-accent ml-3 shrink-0" />
            <form onSubmit={handleCommand} className="flex-1 flex items-center">
              <input 
                type="text" 
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Ask AI to organize, or type a command..."
                className="w-full bg-transparent border-none focus:outline-none text-sm font-medium text-text-main placeholder:text-text-muted px-4 py-2.5"
              />
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
