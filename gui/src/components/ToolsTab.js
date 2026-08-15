"use client";
import { useState, useRef } from "react";
import MarkdownViewer from "./MarkdownViewer";
import RulesetConverter from "./RulesetConverter";

export default function ToolsTab() {
  const [activeTool, setActiveTool] = useState(null); // 'viewer' | 'converter' | null
  const [fileContent, setFileContent] = useState("");
  const [filePath, setFilePath] = useState("");

  const viewerInputRef = useRef(null);
  const converterInputRef = useRef(null);

  const processFile = async (file, tool) => {
    if (!file || !file.name.endsWith('.md')) {
      alert("Please select a markdown (.md) file.");
      return;
    }
    
    // Resolve absolute path using our Electron context bridge helper
    let path = file.path;
    if (window.electronAPI && window.electronAPI.getFilePath) {
        const electronPath = window.electronAPI.getFilePath(file);
        if (electronPath) {
            path = electronPath;
        }
    }
    
    if (!path) {
        alert("Failed to resolve file path.");
        return;
    }

    if (tool === 'viewer') {
      const content = await window.electronAPI.readFile(path);
      if (content) {
        setFilePath(path);
        setFileContent(content);
        setActiveTool('viewer');
      } else {
        alert("Could not read file contents.");
      }
    } else if (tool === 'converter') {
      setFilePath(path);
      setActiveTool('converter');
    }
  };

  const handleFileDrop = async (e, tool) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    processFile(file, tool);
  };

  const handleFileSelect = (e, tool) => {
    const file = e.target.files[0];
    if (file) {
      processFile(file, tool);
    }
    // Reset the input value so the same file can be selected again
    e.target.value = null;
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  if (activeTool === 'viewer') {
    return (
      <div className="flex-1 flex flex-col pt-4 overflow-hidden relative">
        <MarkdownViewer 
          content={fileContent} 
          filePath={filePath} 
          onClose={() => { setActiveTool(null); setFileContent(""); setFilePath(""); }}
        />
      </div>
    );
  }

  if (activeTool === 'converter') {
    return (
      <div className="flex-1 flex flex-col pt-4 relative">
        <button 
          onClick={() => { setActiveTool(null); setFilePath(""); }}
          className="self-start mb-4 bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded border border-gray-700 transition-colors"
        >
          &larr; Back to Tools
        </button>
        <RulesetConverter filePath={filePath} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center pt-8 px-4 h-full">
      <div className="flex gap-8 w-full max-w-4xl justify-center">
        {/* Markdown Viewer Card */}
        <div 
          onClick={() => viewerInputRef.current?.click()}
          onDrop={(e) => handleFileDrop(e, 'viewer')}
          onDragOver={handleDragOver}
          className="w-80 h-72 border-2 border-dashed border-gray-700 hover:border-blue-500 rounded-xl bg-gray-900/50 flex flex-col items-center justify-center p-6 transition-colors cursor-pointer group shadow-lg"
        >
          <input 
            type="file" 
            ref={viewerInputRef} 
            onChange={(e) => handleFileSelect(e, 'viewer')} 
            accept=".md" 
            className="hidden" 
          />
          <svg className="w-12 h-12 text-gray-500 group-hover:text-blue-400 mb-4 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <h2 className="text-xl font-sans font-[800] tracking-wider text-gray-200 mb-2">Markdown Viewer</h2>
          <p className="text-gray-400 text-center text-sm">
            Click to browse, or drop an extracted `.md` file here to preview it cleanly.
          </p>
        </div>

        {/* Ruleset Converter Card */}
        <div 
          onClick={() => converterInputRef.current?.click()}
          onDrop={(e) => handleFileDrop(e, 'converter')}
          onDragOver={handleDragOver}
          className="w-80 h-72 border-2 border-dashed border-gray-700 hover:border-red-500 rounded-xl bg-gray-900/50 flex flex-col items-center justify-center p-6 transition-colors cursor-pointer group shadow-lg"
        >
          <input 
            type="file" 
            ref={converterInputRef} 
            onChange={(e) => handleFileSelect(e, 'converter')} 
            accept=".md" 
            className="hidden" 
          />
          <svg className="w-12 h-12 text-gray-500 group-hover:text-red-400 mb-4 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <h2 className="text-xl font-sans font-[800] tracking-wider text-gray-200 mb-2">Ruleset Converter</h2>
          <p className="text-gray-400 text-center text-sm">
            Click to browse, or drop an extracted `.md` file here to convert its ruleset.
          </p>
        </div>
      </div>
    </div>
  );
}
