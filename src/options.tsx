import { useState } from "react"
import { useStorage } from "@plasmohq/storage/hook"
import "./style.css"

function Options() {
  const [apiKey, setApiKey] = useStorage("gemini_api_key", "")
  const [autoSort, setAutoSort] = useStorage("auto_sort_enabled", false)
  const [showKey, setShowKey] = useState(false)

  return (
    <div className="min-h-screen bg-bg-base text-text-main p-8 flex flex-col items-center justify-center font-sans">
      <div className="max-w-md w-full panel-border bg-bg-panel p-8 rounded-xl space-y-6 shadow-2xl">
        <h1 className="text-2xl font-medium tracking-tight text-center mb-8">MarkFlow Settings</h1>

        <div className="space-y-3">
          <label className="text-sm font-medium text-text-muted block">Gemini API Key</label>
          <div className="flex gap-2">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Gemini API Key"
              className="flex-1 bg-black/20 border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent transition-colors placeholder:text-white/20"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="px-4 py-2 bg-white/5 border border-border rounded-lg text-xs font-medium hover:bg-white/10 transition-colors"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          <p className="text-[10px] text-text-muted">Required for AI features. Get one from Google AI Studio.</p>
        </div>

        <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-border hover:bg-white/[0.07] transition-colors">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Auto-Sort Bookmarks</h3>
            <p className="text-[10px] text-text-muted">Automatically organize newly added bookmarks.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={autoSort}
              onChange={(e) => setAutoSort(e.target.checked)}
            />
            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
          </label>
        </div>

        <div className="pt-6 mt-4 border-t border-border">
          <p className="text-[10px] text-text-muted text-center">
            Settings are saved automatically.
          </p>
        </div>
      </div>
    </div>
  )
}

export default Options
