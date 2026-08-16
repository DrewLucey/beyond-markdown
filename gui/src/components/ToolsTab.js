'use client';
import { useState, useRef } from 'react';
import MarkdownViewer from './MarkdownViewer';
import RulesetConverter from './RulesetConverter';

export default function ToolsTab({ onClearHistory }) {
    const [activeTool, setActiveTool] = useState(null); // 'viewer' | 'converter' | null
    const [fileContent, setFileContent] = useState('');
    const [filePath, setFilePath] = useState('');
    const [targetAnchor, setTargetAnchor] = useState('');

    const viewerInputRef = useRef(null);
    const converterInputRef = useRef(null);

    const processFile = async (file, tool) => {
        if (!file || !file.name.endsWith('.md')) {
            alert('Please select a markdown (.md) file.');
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
            alert('Failed to resolve file path.');
            return;
        }

        if (tool === 'viewer') {
            const content = await window.electronAPI.readFile(path);
            if (content) {
                setFilePath(path);
                setFileContent(content);
                setTargetAnchor(''); // Reset anchor on new manual file open
                setActiveTool('viewer');
            } else {
                alert('Could not read file contents.');
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

    const handleClearHistory = async () => {
        if (confirm('Are you sure you want to clear your download history?')) {
            const success = await window.electronAPI.clearHistory();
            if (success) {
                if (onClearHistory) onClearHistory();
                alert('Download history cleared successfully.');
            } else {
                alert('Failed to clear download history.');
            }
        }
    };

    const handleViewSchema = async () => {
        const content = await window.electronAPI.getSchemaContent();
        setFilePath('SCHEMA.md');
        setFileContent(content);
        setTargetAnchor('');
        setActiveTool('viewer');
    };

    const handleNavigate = async (href) => {
        // Parse the link (e.g. "../spells.md#fireball" or "./spells.md")
        const [targetFile, anchor] = href.split('#');

        // Note: The MarkdownViewer handles purely internal links natively 
        // because it checks for `href.startsWith('#')`. If we get here, 
        // it means there's a targetFile.

        if (!filePath || filePath === 'SCHEMA.md') {
            alert('Cannot resolve relative paths from the current document.');
            return;
        }

        const resolvedPath = await window.electronAPI.resolvePath(filePath, targetFile);
        if (resolvedPath) {
            const content = await window.electronAPI.readFile(resolvedPath);
            if (content) {
                setFilePath(resolvedPath);
                setFileContent(content);
                setTargetAnchor(anchor || '');
            } else {
                alert(`Could not read file: ${resolvedPath}`);
            }
        } else {
            alert(`Could not resolve path: ${targetFile}`);
        }
    };

    if (activeTool === 'viewer') {
        return (
            <div className="flex-1 flex flex-col pt-4 overflow-hidden relative">
                <MarkdownViewer
                    content={fileContent}
                    filePath={filePath}
                    targetAnchor={targetAnchor}
                    onNavigate={handleNavigate}
                    onClose={() => {
                        setActiveTool(null);
                        setFileContent('');
                        setFilePath('');
                        setTargetAnchor('');
                    }}
                />
            </div>
        );
    }

    if (activeTool === 'converter') {
        return (
            <div className="flex-1 flex flex-col pt-4 relative">
                <button
                    onClick={() => {
                        setActiveTool(null);
                        setFilePath('');
                    }}
                    className="self-start mb-4 bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded border border-gray-700 transition-colors"
                >
                    &larr; Back to Tools
                </button>
                <RulesetConverter filePath={filePath} />
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto px-4 py-8 flex flex-col items-center styled-scrollbar">
            <div className="w-full max-w-4xl flex flex-col gap-12">
                
                {/* Ruleset Converter */}
                <div className="flex flex-col gap-3">
                    <h2 className="text-3xl font-sans font-bold text-gray-100">
                        Ruleset Converter
                    </h2>
                    <p className="text-gray-400 text-[15px] leading-relaxed">
                        Applies <a href="https://media.dndbeyond.com/compendium-images/srd/guide/converting-to-srd-5.2.1.pdf" target="_blank" rel="noreferrer" className="text-red-400 hover:text-red-300 transition-colors hover:underline">Converting to System Reference Document (SRD) 5.2.1</a> guidelines to translate 5e (2014) to 5.5e (2024) ruleset, or vice versa.
                    </p>
                    <div
                        onClick={() => converterInputRef.current?.click()}
                        onDrop={(e) => handleFileDrop(e, 'converter')}
                        onDragOver={handleDragOver}
                        className="w-full h-20 mt-2 border-2 border-dashed border-gray-700 hover:border-red-500 hover:bg-gray-800/50 rounded-lg bg-gray-900/50 flex items-center justify-center transition-colors cursor-pointer group shadow-sm"
                    >
                        <input
                            type="file"
                            ref={converterInputRef}
                            onChange={(e) => handleFileSelect(e, 'converter')}
                            accept=".md"
                            className="hidden"
                        />
                        <svg className="w-6 h-6 text-gray-500 group-hover:text-red-400 mr-3 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        <span className="text-gray-400 group-hover:text-gray-200 transition-colors font-medium">Click to browse, or drop a compatible .md file here to convert its ruleset</span>
                    </div>
                </div>

                {/* Markdown Viewer */}
                <div className="flex flex-col gap-3 border-t border-gray-800 pt-10">
                    <h2 className="text-3xl font-sans font-bold text-gray-100">
                        Markdown Viewer
                    </h2>
                    <p className="text-gray-400 text-[15px] leading-relaxed flex items-center flex-wrap">
                        A Markdown file viewer optimized for use with files created by{' '}
                        <span className="inline-flex items-center ml-1 font-bold">
                            <span className="text-red-500 font-normal" style={{ fontFamily: 'var(--font-marcellus)' }}>BEYOND</span>
                            <span className="text-gray-200" style={{ fontFamily: "'Gill Sans', 'Gill Sans MT', Calibri, sans-serif", fontSize: "calc(100% + 1pt)", transform: "translateY(-1px)" }}>MARKDOWN</span>
                        </span>
                    </p>
                    <div
                        onClick={() => viewerInputRef.current?.click()}
                        onDrop={(e) => handleFileDrop(e, 'viewer')}
                        onDragOver={handleDragOver}
                        className="w-full h-20 mt-2 border-2 border-dashed border-gray-700 hover:border-blue-500 hover:bg-gray-800/50 rounded-lg bg-gray-900/50 flex items-center justify-center transition-colors cursor-pointer group shadow-sm"
                    >
                        <input
                            type="file"
                            ref={viewerInputRef}
                            onChange={(e) => handleFileSelect(e, 'viewer')}
                            accept=".md"
                            className="hidden"
                        />
                        <svg className="w-6 h-6 text-gray-500 group-hover:text-blue-400 mr-3 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        <span className="text-gray-400 group-hover:text-gray-200 transition-colors font-medium">Click to browse, or drop a compatible .md file here to view it cleanly</span>
                    </div>
                </div>

                {/* Markdown Schema */}
                <div className="flex flex-col gap-4 border-t border-gray-800 pt-10">
                    <h2 className="text-3xl font-sans font-bold text-gray-100">
                        Markdown Schema
                    </h2>
                    <div className="flex items-center gap-4">
                        <p className="text-gray-400 text-[15px] leading-relaxed flex items-center flex-wrap">
                            Want to author your own Markdown files in a format consistent with{' '}
                            <span className="inline-flex items-center ml-1 font-bold">
                                <span className="text-red-500 font-normal" style={{ fontFamily: 'var(--font-marcellus)' }}>BEYOND</span>
                                <span className="text-gray-200" style={{ fontFamily: "'Gill Sans', 'Gill Sans MT', Calibri, sans-serif", fontSize: "calc(100% + 1pt)", transform: "translateY(-1px)" }}>MARKDOWN</span>
                            </span>?
                        </p>
                        <button
                            onClick={handleViewSchema}
                            className="bg-gray-800 hover:bg-gray-700 text-blue-400 hover:text-blue-300 px-5 py-2 rounded-md border border-gray-700 transition-colors font-medium text-sm shadow-sm"
                        >
                            View SCHEMA.md
                        </button>
                    </div>
                </div>

                {/* Clear User Data */}
                <div className="flex flex-col gap-4 border-t border-gray-800 pt-10 pb-8">
                    <h2 className="text-3xl font-sans font-bold text-gray-100">
                        Clear User Data
                    </h2>
                    <div>
                        <button
                            onClick={handleClearHistory}
                            className="bg-red-900/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 px-5 py-2 rounded-md border border-red-900/50 hover:border-red-500/50 transition-colors font-medium text-sm shadow-sm"
                        >
                            Clear download history
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
