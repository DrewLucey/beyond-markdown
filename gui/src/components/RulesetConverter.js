import { useState, useEffect, useRef } from 'react';

export default function RulesetConverter({ filePath }) {
    const [sourceRuleset, setSourceRuleset] = useState(null);
    const [targetRuleset, setTargetRuleset] = useState(null);
    const [isChecking, setIsChecking] = useState(true);

    const formatRuleset = (rs) => {
        if (!rs || rs === 'Unknown') return 'Unknown';
        if (rs === '2014' || rs.toLowerCase() === '5e') return '5e (2014)';
        if (rs === '2024' || rs.toLowerCase() === '5.5e') return '5.5e (2024)';
        return rs;
    };

    const [isExtracting, setIsExtracting] = useState(false);
    const [logs, setLogs] = useState([]);
    const logsEndRef = useRef(null);

    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    useEffect(() => {
        async function checkHeader() {
            setIsChecking(true);
            const rs = await window.electronAPI.readMarkdownHeader(filePath);

            if (rs) {
                setSourceRuleset(rs);
                // Default target to the opposite
                if (rs === '2014' || rs.toLowerCase() === '5e') {
                    setTargetRuleset('2024');
                } else if (rs === '2024' || rs.toLowerCase() === '5.5e') {
                    setTargetRuleset('2014');
                } else {
                    setTargetRuleset('2024');
                }
            } else {
                setSourceRuleset('Unknown');
                setTargetRuleset('2024');
            }
            setIsChecking(false);
        }

        if (filePath) {
            checkHeader();
        }
    }, [filePath]);

    const handleConvert = async () => {
        const targetLabel = targetRuleset === '2024' ? '5.5e' : '5e';
        let baseName = filePath.replace(/\\/g, '/').split('/').pop().replace('.md', '');
        // Remove existing "(...)" tags like "(5e)" or "(2014)" from the basename
        baseName = baseName.replace(/\s*\([^)]+\)/g, '').trim();
        const defaultName = `${baseName} (${targetLabel}).md`;

        const outputPath = await window.electronAPI.showSaveDialog(defaultName);

        if (outputPath) {
            setIsExtracting(true);
            setLogs([
                `Starting conversion to ${targetRuleset}...`,
                `Source: ${filePath}`,
                `Destination: ${outputPath}`,
            ]);

            const result = await window.electronAPI.convertLocalFile(
                filePath,
                targetRuleset,
                outputPath,
            );
            if (result.success) {
                setLogs((prev) => [...prev, `\nSuccess! Saved to ${outputPath}`]);
            } else {
                setLogs((prev) => [...prev, `\nConversion failed. Check the logs above.`]);
            }
        }
    };

    if (isChecking) {
        return <div className="p-8 text-gray-400">Reading file header...</div>;
    }

    return (
        <div className="flex-1 flex flex-col items-center justify-start pt-12">
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 max-w-lg w-full shadow-lg">
                <h2 className="text-2xl font-sans font-[800] tracking-wider text-gray-200 mb-6 border-b border-gray-800 pb-4">
                    Convert Ruleset
                </h2>

                <div className="mb-6 space-y-4">
                    <div>
                        <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-[800] mb-1">
                            Source File
                        </label>
                        <div
                            className="font-mono text-sm text-gray-300 truncate bg-gray-950 p-2 rounded border border-gray-800"
                            title={filePath}
                        >
                            {filePath}
                        </div>
                    </div>

                    <div className="flex gap-4 items-center">
                        <div className="flex-1">
                            <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-[800] mb-1">
                                Detected Ruleset
                            </label>
                            <div className="bg-gray-800/50 p-3 rounded border border-gray-700 text-gray-300 font-semibold text-center">
                                {formatRuleset(sourceRuleset)}
                            </div>
                        </div>

                        <svg
                            className="w-6 h-6 text-gray-500 mt-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M14 5l7 7m0 0l-7 7m7-7H3"
                            />
                        </svg>

                        <div className="flex-1">
                            <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-[800] mb-1">
                                Target Ruleset
                            </label>
                            <select
                                value={targetRuleset}
                                onChange={(e) => setTargetRuleset(e.target.value)}
                                className="w-full bg-gray-950 p-3 rounded border border-gray-700 text-gray-300 font-semibold text-center focus:outline-none focus:border-red-500 transition-colors cursor-pointer"
                            >
                                <option value="2024">5.5e (2024)</option>
                                <option value="2014">5e (2014)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleConvert}
                    className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-4 rounded transition-colors shadow-md mt-4"
                >
                    Convert
                </button>
            </div>

            {isExtracting && (
                <div className="mt-8 bg-black/50 border border-[#E2E2E2]/20 rounded-xl w-full max-w-2xl h-64 flex flex-col overflow-hidden shadow-inner">
                    <div className="bg-gray-900/80 px-4 py-2 border-b border-gray-800 flex justify-between items-center shrink-0">
                        <h3 className="font-sans font-[800] text-sm text-gray-400">
                            Conversion Logs
                        </h3>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto styled-scrollbar font-mono text-sm text-green-400 leading-relaxed whitespace-pre-wrap">
                        {logs.map((log, i) => (
                            <div key={i}>{log}</div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                </div>
            )}
        </div>
    );
}
