"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import ToolsTab from "../components/ToolsTab";
import MarkdownSvg from "../components/MarkdownSvg";

export default function Home() {
  const [sources, setSources] = useState(null);
  const [history, setHistory] = useState({});
  const [logs, setLogs] = useState([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [authMsg, setAuthMsg] = useState("");
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [username, setUsername] = useState("");
  
  useEffect(() => {
    // Prevent default drag/drop behaviors globally so dropping a file outside a dropzone doesn't navigate the Electron window
    const preventDefault = (e) => e.preventDefault();
    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);

    window.addEventListener('dragenter', preventDefault);
    window.addEventListener('dragleave', preventDefault);

    return () => {
      window.removeEventListener('dragover', preventDefault);
      window.removeEventListener('drop', preventDefault);
      window.removeEventListener('dragenter', preventDefault);
      window.removeEventListener('dragleave', preventDefault);
    };
  }, []);
  
  // View state
  const [activeTab, setActiveTab] = useState("library"); // "library" | "rules" | "tools"
  
  // Library Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [sortOrder, setSortOrder] = useState("Sort by: Title"); // "Sort by: Title" | "Sort by: Newest" | "Sort by: Oldest"
  const [rulesetFilter, setRulesetFilter] = useState("All");
  const [publisherFilter, setPublisherFilter] = useState("All");
  
  // Rules State
  const [includeHomebrew, setIncludeHomebrew] = useState(true);
  const [selectedRules, setSelectedRules] = useState(new Set());
  const logsEndRef = useRef(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const ruleCategories = [
    { slug: "classes", label: "Classes" },
    { slug: "backgrounds", label: "Backgrounds" },
    { slug: "races", label: "Species/Races" },
    { slug: "feats", label: "Feats" },
    { slug: "spells", label: "Spells" },
    { slug: "items", label: "Equipment" },
    { slug: "magic-items", label: "Magic Items" }
  ];
  
  const ruleIcons = {
    classes: "https://wizardsprod.a.bigcontent.io/v1/static/class",
    spells: "https://wizardsprod.a.bigcontent.io/v1/static/spells_1",
    items: "https://wizardsprod.a.bigcontent.io/v1/static/equipment",
    "magic-items": "https://wizardsprod.a.bigcontent.io/v1/static/magical-items_1",
    feats: "https://wizardsprod.a.bigcontent.io/v1/static/feats",
    backgrounds: "https://wizardsprod.a.bigcontent.io/v1/static/background",
    races: "https://wizardsprod.a.bigcontent.io/v1/static/species",
    monsters: "https://wizardsprod.a.bigcontent.io/v1/static/monsters"
  };

  const refreshLibrary = async () => {
    if (!window.electronAPI) return;
    await window.electronAPI.refreshLibrary();
    const data = await window.electronAPI.getSources();
    if (data) {
      const sorted = Object.values(data).sort((a, b) => b.isOwned - a.isOwned);
      setSources(sorted);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI) {
      
      window.electronAPI.checkAuth().then(res => {
        setIsSignedIn(res.success);
        if (res.success) {
          setUsername(res.message);
          refreshLibrary(); // Refresh silently in the background
        } else {
          setAuthMsg("");
        }
      });

      window.electronAPI.getHistory().then(hist => {
        setHistory(hist || {});
      });

      window.electronAPI.getSources()
        .then((data) => {
          if (data) {
            const sorted = Object.values(data).sort((a, b) => b.isOwned - a.isOwned);
            setSources(sorted);
          } else {
            setSources([]);
          }
        })
        .catch(err => {
          console.error("IPC Error:", err);
          setSources([]);
        });

      window.electronAPI.onExtractionLog((log) => {
        setLogs((prev) => [...prev, log]);
      });
    } else {
      setSources([]);
    }
  }, []);

  const handleAuth = async () => {
    if (isSignedIn) return;
    setAuthMsg("Opening browser...");
    const res = await window.electronAPI.authCobalt();
    if (res?.success) {
      const authRes = await window.electronAPI.checkAuth();
      if (authRes.success) {
        setIsSignedIn(true);
        setUsername(authRes.message);
        setAuthMsg("Refreshing library...");
        await refreshLibrary();
        setAuthMsg("");
      }
    } else {
      setAuthMsg("Authentication failed.");
    }
  };

  const handleSignOut = async () => {
    await window.electronAPI.signOut();
    setIsSignedIn(false);
    setUsername("");
    setAuthMsg("");
    setHistory({});
  };

  const handleExtractSourcebook = async (slug, title, ruleset) => {
    const defaultName = `${title.replace(/[<>:"/\\|?*]+/g, '').trim()} (${ruleset}).md`;
    const outputPath = await window.electronAPI.showSaveDialog(defaultName);
    
    if (outputPath) {
      setIsExtracting(true);
      setLogs([`Starting extraction for ${title}...`]);
      const result = await window.electronAPI.startExtractionSourcebook(slug, outputPath);
      if (result.success) {
        setLogs(prev => [...prev, `\nSuccess! Saved to ${outputPath}`]);
        setHistory(prev => ({ ...prev, [slug]: new Date().toISOString() }));
      } else {
        setLogs(prev => [...prev, `\nExtraction failed. Check the logs above.`]);
      }
      setTimeout(() => setIsExtracting(false), 3000);
    }
  };

  const handleExtractSelectedRules = async () => {
    if (selectedRules.size === 0) return;
    
    const outputPath = await window.electronAPI.showDirectoryDialog();
    if (!outputPath) return;

    setIsExtracting(true);
    setLogs([`Starting bulk rule extraction to ${outputPath}...`]);
    
    let allSuccess = true;
    for (const category of selectedRules) {
      setLogs(prev => [...prev, `\n--- Extracting ${category} ---`]);
      const result = await window.electronAPI.startExtractionRules(category, includeHomebrew, outputPath);
      if (!result.success) {
        allSuccess = false;
        setLogs(prev => [...prev, `\nFailed to extract ${category}.`]);
      } else {
        setLogs(prev => [...prev, `\n${category} complete.`]);
        setHistory(prev => ({ ...prev, [category]: new Date().toISOString() }));
      }

      // Handle subclasses automatically if classes is selected
      if (category === "classes") {
        setLogs(prev => [...prev, `\n--- Extracting subclasses ---`]);
        const subResult = await window.electronAPI.startExtractionRules("subclasses", includeHomebrew, outputPath);
        if (!subResult.success) {
          allSuccess = false;
          setLogs(prev => [...prev, `\nFailed to extract subclasses.`]);
        } else {
          setLogs(prev => [...prev, `\nsubclasses complete.`]);
          setHistory(prev => ({ ...prev, subclasses: new Date().toISOString() }));
        }
      }
    }
    
    if (allSuccess) {
      setLogs(prev => [...prev, `\nAll selected rules extracted successfully!`]);
    } else {
      setLogs(prev => [...prev, `\nExtraction finished with some errors.`]);
    }
    setTimeout(() => setIsExtracting(false), 3000);
  };

  const toggleRuleSelection = (cat) => {
    const nextSet = new Set(selectedRules);
    if (nextSet.has(cat)) nextSet.delete(cat);
    else nextSet.add(cat);
    setSelectedRules(nextSet);
  };

  const handleSelectAllRules = () => {
    if (selectedRules.size === ruleCategories.length) {
      setSelectedRules(new Set()); // Deselect all
    } else {
      setSelectedRules(new Set(ruleCategories.map(c => c.slug))); // Select all
    }
  };

  const accessibleSources = useMemo(() => {
    if (!sources) return [];
    return sources.filter(source => {
      if (source.title.startsWith("D&D Beyond Drops") || source.slug === "ddb-drops") return false;
      if (!isSignedIn && !source.isFree) return false;
      if (!(source.isOwned || source.isSharedWithMe || source.isFree)) return false;
      return true;
    });
  }, [sources, isSignedIn]);

  const rulesets = useMemo(() => {
    return Array.from(new Set(accessibleSources.map(s => s.ruleset || '5e'))).sort();
  }, [accessibleSources]);

  const publishers = useMemo(() => {
    let pubs = Array.from(new Set(accessibleSources.map(s => s.publisher).filter(Boolean))).sort();
    
    const wotcIndex = pubs.findIndex(p => p.toLowerCase().includes("wizards of the coast"));
    if (wotcIndex > -1) {
      const wotc = pubs.splice(wotcIndex, 1)[0];
      pubs.unshift(wotc);
    }
    return pubs;
  }, [accessibleSources]);

  const filteredSources = useMemo(() => {
    return accessibleSources.filter(source => {
      if (searchQuery && !source.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      
      if (categoryFilter !== "All") {
        const type = source.type || source.category;
        if (categoryFilter === "Sourcebooks" && type !== "sourcebook") return false;
        if (categoryFilter === "Adventures" && type !== "adventure") return false;
      }

      if (rulesetFilter !== "All" && (source.ruleset || '5e') !== rulesetFilter) return false;
      if (publisherFilter !== "All" && source.publisher !== publisherFilter) return false;
      
      return true;
    }).sort((a, b) => {
      if (sortOrder === "Sort by: Title") {
        return a.title.localeCompare(b.title);
      } else if (sortOrder === "Sort by: Newest") {
        const dateA = a.releaseDate ? new Date(a.releaseDate) : new Date(0);
        const dateB = b.releaseDate ? new Date(b.releaseDate) : new Date(0);
        return dateB - dateA;
      } else if (sortOrder === "Sort by: Oldest") {
        const dateA = a.releaseDate ? new Date(a.releaseDate) : new Date(0);
        const dateB = b.releaseDate ? new Date(b.releaseDate) : new Date(0);
        return dateA - dateB;
      }
      return 0;
    });
  }, [accessibleSources, searchQuery, categoryFilter, sortOrder, rulesetFilter, publisherFilter]);

  if (!sources) {
    return <div className="flex h-screen items-center justify-center">Loading Library...</div>;
  }

  // Helper for Chiclet styling
  const Chiclet = ({ label, isActive, onClick }) => (
    <button 
      onClick={onClick} 
      className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors whitespace-nowrap ${
        isActive 
          ? 'bg-red-600/90 text-white shadow-sm' 
          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
      }`}
    >
      {label}
    </button>
  );



  return (
    <main className="pt-8 px-8 pb-0 h-full flex flex-col">
      <header className="flex justify-between items-center mb-8 shrink-0">
        <div>
          <h1 className="text-5xl mb-2 tracking-wide flex items-baseline">
            <span className="font-serif text-red-500 font-bold">BEYOND</span>
            <span className="text-white font-bold text-[1.12em]" style={{ fontFamily: "'Gill Sans', 'Gill Sans MT', Calibri, sans-serif" }}>MARKDOWN</span>
          </h1>
        </div>
        <div className="relative flex flex-col items-end">
          <button 
            onClick={handleAuth}
            disabled={isSignedIn}
            className={`px-6 py-3 rounded-lg transition-all duration-300 font-sans ${
              isSignedIn 
                ? 'bg-[#374045] text-gray-200 cursor-default' 
                : 'border bg-red-600/20 hover:bg-red-600/40 text-red-400 border-red-500/30 shadow-[0_0_15px_rgba(220,38,38,0.2)] hover:shadow-[0_0_25px_rgba(220,38,38,0.4)] cursor-pointer'
            }`}
          >
            {isSignedIn ? username : "Sign In to D&D Beyond"}
          </button>
          {!isSignedIn && authMsg && <span className="absolute top-full right-0 text-sm mt-2 text-green-400 whitespace-nowrap">{authMsg}</span>}
          {isSignedIn && (
            <button 
              onClick={handleSignOut} 
              className="absolute top-full right-0 text-xs text-red-500 hover:text-white font-sans tracking-wider mt-2 pr-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              SIGN OUT
            </button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="flex space-x-4 mb-4 border-b border-gray-800 shrink-0 relative">
        <button 
          onClick={() => setActiveTab("library")}
          className={`pb-2 px-4 font-medium transition-colors relative z-10 ${activeTab === "library" ? "text-red-400 border-b-2 border-red-500 -mb-[1px]" : "text-gray-500 hover:text-gray-300"}`}
        >
          Library
        </button>
        <button 
          onClick={() => setActiveTab("rules")}
          className={`pb-2 px-4 font-medium transition-colors relative z-10 ${activeTab === "rules" ? "text-red-400 border-b-2 border-red-500 -mb-[1px]" : "text-gray-500 hover:text-gray-300"}`}
        >
          Rules
        </button>
        <button 
          onClick={() => setActiveTab("tools")}
          className={`pb-2 px-4 font-medium transition-colors relative z-10 ${activeTab === "tools" ? "text-red-400 border-b-2 border-red-500 -mb-[1px]" : "text-gray-500 hover:text-gray-300"}`}
        >
          Tools
        </button>
      </div>

      {activeTab === "library" && (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Controls - Kept stationary above the scrollable grid */}
          <div className="flex items-end space-x-4 mb-6 shrink-0 p-2 w-full overflow-x-auto styled-scrollbar">
            
            {/* Ruleset Chiclets */}
            <div className="flex flex-col gap-2 shrink-0">
              <span className="text-gray-400 font-[800] text-[10px] tracking-wider uppercase">Rule Set:</span>
              <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-800 items-center">
                <Chiclet label="All" isActive={rulesetFilter === "All"} onClick={() => setRulesetFilter("All")} />
                {rulesets.map(rs => (
                  <Chiclet key={rs} label={rs} isActive={rulesetFilter === rs} onClick={() => setRulesetFilter(rs)} />
                ))}
              </div>
            </div>

            {/* Book Type Chiclets */}
            <div className="flex flex-col gap-2 shrink-0">
              <span className="text-gray-400 font-[800] text-[10px] tracking-wider uppercase">Book Type:</span>
              <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-800 items-center">
                <Chiclet label="All" isActive={categoryFilter === "All"} onClick={() => setCategoryFilter("All")} />
                <Chiclet label="Sourcebooks" isActive={categoryFilter === "Sourcebooks"} onClick={() => setCategoryFilter("Sourcebooks")} />
                <Chiclet label="Adventures" isActive={categoryFilter === "Adventures"} onClick={() => setCategoryFilter("Adventures")} />
              </div>
            </div>

            {/* Publisher Dropdown */}
            <div className="flex flex-col gap-2 shrink-0">
              <span className="text-gray-400 font-[800] text-[10px] tracking-wider uppercase">Publisher:</span>
              <select 
                value={publisherFilter} 
                onChange={(e) => setPublisherFilter(e.target.value)}
                className="px-3 py-1.5 h-[34px] bg-gray-900 border border-gray-800 rounded-md text-gray-300 font-semibold text-xs tracking-wider uppercase focus:outline-none focus:border-red-500"
              >
                <option value="All">All</option>
                {publishers.map(pub => <option key={pub} value={pub}>{pub}</option>)}
              </select>
            </div>

            <div className="flex-1 min-w-4 w-full"></div>

            {/* Search Input */}
            <div className="flex flex-col gap-2 shrink-0">
              {/* Invisible spacer to push the input down to align with chiclets */}
              <span className="text-transparent font-[800] text-[10px] tracking-wider uppercase invisible">Search:</span>
              <div className="relative">
                <svg className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input 
                  type="text" 
                  placeholder="Filter by title" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 h-[34px] bg-gray-900 border border-gray-800 rounded-md text-gray-300 text-sm focus:outline-none focus:border-red-500 w-56 placeholder-gray-500"
                />
              </div>
            </div>

            {/* Sort Dropdown */}
            <div className="flex flex-col gap-2 shrink-0 pr-1">
              <span className="text-transparent font-[800] text-[10px] tracking-wider uppercase invisible">Sort:</span>
              <select 
                value={sortOrder} 
                onChange={(e) => setSortOrder(e.target.value)}
                className="px-3 py-1.5 h-[34px] bg-gray-900 border border-gray-800 rounded-md text-gray-300 text-sm focus:outline-none focus:border-red-500"
              >
                <option value="Sort by: Title">Sort by: Title</option>
                <option value="Sort by: Newest">Sort by: Newest</option>
                <option value="Sort by: Oldest">Sort by: Oldest</option>
              </select>
            </div>

          </div>

          <div className="overflow-y-auto flex-1 pr-2 styled-scrollbar">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
              {filteredSources.map((source) => {
                const slug = source.path?.split('/').pop() || source.id;
                const isAccessible = source.isOwned || source.isFree || source.isSharedWithMe;
                const lastExtracted = history[slug];

                return (
                  <div 
                    key={source.id || source.sku || source.title}
                    className={`group relative rounded-xl overflow-hidden bg-gray-800 border transition-all duration-500 flex flex-col ${
                      isAccessible 
                        ? 'border-gray-700 hover:border-[#E2E2E2] hover:shadow-[0_10px_30px_rgba(226,226,226,0.15)]'
                        : 'border-gray-700 opacity-60 grayscale'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-[3/4] w-full bg-gray-900 overflow-hidden shrink-0">
                      {source.image?.src ? (
                        <img 
                          src={source.image.src} 
                          alt={source.title} 
                          className={`w-full h-full object-cover origin-top transition-transform duration-700 ${isAccessible ? 'group-hover:scale-105' : ''}`}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600 font-serif text-xl p-4 text-center">
                          {source.title}
                        </div>
                      )}
                      
                      {/* Lock Overlay */}
                      {!isAccessible && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="relative p-3 flex-1 flex flex-col bg-gradient-to-t from-gray-900 to-gray-800">
                      {/* Ruleset Badge */}
                      <div className="absolute top-0 right-3 -translate-y-1/2 z-10 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded border border-gray-600 text-[9px] font-bold text-gray-300 shadow-lg pointer-events-none">
                        {source.ruleset || '5e'}
                      </div>
                      
                      <h3 className="font-sans font-[800] text-sm md:text-base text-gray-100 mb-1 line-clamp-2 leading-tight" title={source.title}>
                        {source.title}
                      </h3>
                      <p className="text-gray-400 text-[10px] md:text-xs font-sans mb-3 capitalize line-clamp-1" title={source.publisher}>
                        {source.publisher || source.category || source.type}
                      </p>

                      <div className="mt-auto flex flex-col space-y-2">
                        {lastExtracted && (
                          <span className="text-[10px] text-green-400/80 text-center font-mono">
                            Extracted: {new Date(lastExtracted).toLocaleDateString()}
                          </span>
                        )}
                        {isAccessible ? (
                          <button 
                            onClick={() => handleExtractSourcebook(slug, source.title, source.ruleset || '5e')}
                            className={`w-full py-2 flex items-center justify-center ${lastExtracted ? 'bg-green-900/40 hover:bg-green-800 text-green-300 border border-green-700/50' : 'bg-gray-700 hover:bg-[#E2E2E2] hover:text-gray-900 text-gray-100'} rounded transition-colors duration-300 font-medium text-sm`}
                          >
                            Extract <MarkdownSvg />
                          </button>
                        ) : (
                          <a 
                            href={source.marketplaceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block w-full py-2 bg-gray-800 border border-gray-600 hover:border-[#E2E2E2] text-gray-300 hover:text-gray-900 hover:bg-[#E2E2E2] text-center rounded transition-colors duration-300 font-medium text-sm"
                          >
                            Marketplace
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredSources.length === 0 && (
                <div className="col-span-full py-12 text-center text-gray-500">
                  {isSignedIn ? "No matches found." : "Sign in to see your full library."}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "rules" && (
        <div className="flex-1 flex flex-col pt-2">
          
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-3 bg-gray-800/50 p-4 rounded-lg border border-gray-700">
              <input 
                type="checkbox" 
                id="homebrewToggle"
                checked={includeHomebrew}
                onChange={(e) => setIncludeHomebrew(e.target.checked)}
                className="w-5 h-5 accent-red-500 cursor-pointer"
              />
              <label htmlFor="homebrewToggle" className="text-gray-300 font-medium cursor-pointer">
                Include Homebrew
              </label>
            </div>
            
            <div className="flex items-center space-x-4">
              <button 
                onClick={handleSelectAllRules}
                className="px-4 py-3 bg-gray-800 border border-gray-600 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-semibold transition-colors"
              >
                {selectedRules.size === ruleCategories.length ? "Deselect All" : "Select All"}
              </button>
              <button 
                onClick={handleExtractSelectedRules}
                disabled={selectedRules.size === 0}
                className={`px-6 py-3 flex items-center justify-center rounded-lg transition-all duration-300 font-medium ${
                  selectedRules.size > 0 
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20' 
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                Extract Selected ({selectedRules.size}) <MarkdownSvg />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 overflow-y-auto pr-2 styled-scrollbar p-1">
            {ruleCategories.map(cat => {
              const lastExtracted = history[cat.slug];
              return (
                <div key={cat.slug} className="flex flex-col gap-1">
                  <div 
                    onClick={() => toggleRuleSelection(cat.slug)}
                    className={`cursor-pointer border-2 py-3 px-5 rounded-xl flex items-center justify-between transition-all duration-300 shadow-sm hover:shadow-md ${
                      selectedRules.has(cat.slug) 
                        ? 'bg-gray-800/80 border-[#E2E2E2] scale-[1.02]' 
                        : lastExtracted
                          ? 'bg-green-900/40 hover:bg-green-800 text-green-300 border-green-700/50 hover:border-green-500 hover:scale-[1.01]'
                          : 'bg-gray-800 border-gray-700 hover:border-[#E2E2E2] hover:scale-[1.01]'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      {ruleIcons[cat.slug] && (
                        <img 
                          src={ruleIcons[cat.slug]} 
                          className={`h-[1.25em] w-auto object-contain transition-opacity duration-300 ${selectedRules.has(cat.slug) || lastExtracted ? 'opacity-100' : 'opacity-60'}`} 
                          style={{ filter: "brightness(0) invert(1)" }}
                          alt="" 
                        />
                      )}
                      <div className="flex flex-col items-start justify-center">
                        <h3 className={`font-sans font-[800] text-[1.1rem] leading-none ${!selectedRules.has(cat.slug) && lastExtracted ? 'text-green-300' : 'text-gray-200'}`}>{cat.label}</h3>
                      </div>
                    </div>
                  </div>
                  
                  {lastExtracted && (
                    <div className="text-[10px] text-green-400/80 text-center font-mono w-full">
                      Extracted: {new Date(lastExtracted).toLocaleDateString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "tools" && (
        <ToolsTab />
      )}

      {/* Terminal Modal */}
      {isExtracting && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-8">
          <div className="bg-gray-900 border border-[#E2E2E2]/30 rounded-xl shadow-[0_0_50px_rgba(226,226,226,0.1)] w-full max-w-4xl h-[70vh] flex flex-col overflow-hidden">
            <div className="bg-black/50 px-6 py-4 border-b border-gray-800 flex justify-between items-center">
              <h2 className="font-sans font-[800] tracking-wider text-xl text-gray-200">Extraction Progress</h2>
            </div>
            <div className="flex-1 p-6 overflow-y-auto styled-scrollbar font-mono text-sm text-green-400 leading-relaxed whitespace-pre-wrap">
              {logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
