/**
 * library.js
 * Scrapes the Next.js hydration payload from D&D Beyond to map all owned/shared sourcebooks.
 * Captures their specific Ruleset tags (5e vs 2024), Type, and Legacy status to fuel AI context routing.
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import axios from "axios";
import * as cheerio from "cheerio";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load Authentication
import { getSessionToken } from "../utils/auth.js";
const sessionToken = getSessionToken();

async function crawlLibrary() {
    function extractJsonArray(html, keyName) {
        const searchString = `"${keyName}":[`;
        const startIndex = html.lastIndexOf(searchString);
        if (startIndex === -1) return null;
        let bracketCount = 0;
        let inString = false;
        let escape = false;
        let endIndex = -1;
        const arrayStart = startIndex + searchString.length - 1;
        for (let i = arrayStart; i < html.length; i++) {
            const char = html[i];
            if (!escape && char === '"') inString = !inString;
            if (!inString) {
                if (char === '[') bracketCount++;
                else if (char === ']') bracketCount--;
            }
            escape = (!escape && char === '\\');
            if (bracketCount === 0 && char === ']') {
                endIndex = i;
                break;
            }
        }
        if (endIndex !== -1) return html.substring(arrayStart, endIndex + 1);
        return null;
    }

    const OUTPUT_MAP_FILE = path.resolve(__dirname, '../sources/ruleset_map.json');
    const LICENSES_URL = "https://www.dndbeyond.com/account/licenses";
    const SOURCES_URL = "https://www.dndbeyond.com/sources";
    const reqHeaders = {
      Cookie: sessionToken ? `CobaltSession=${sessionToken}` : "",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    };

    // --- NEW: FETCH CONFIG JSON ---
    console.log("Fetching DDB Configuration API...");
    let ddbConfig = {};
    try {
      const configRes = await axios.get(
        "https://www.dndbeyond.com/api/config/json",
        { headers: reqHeaders },
      );
      ddbConfig = configRes.data || {};

      const configOutputPath = path.resolve(
        __dirname,
        "../sources/config.json",
      );
      if (!fs.existsSync(path.dirname(configOutputPath))) {
        fs.mkdirSync(path.dirname(configOutputPath), { recursive: true });
      }

      fs.writeFileSync(configOutputPath, JSON.stringify(ddbConfig, null, 2));
      console.log(`✅ Config Dictionary saved to: ${configOutputPath}`);
    } catch (err) {
      console.warn("! Failed to fetch DDB config.json:", err.message);
    }

    // --- 1. FETCH LICENSES FOR OWNERSHIP ---
    const licensesRes = await axios.get(LICENSES_URL, { headers: reqHeaders });
    const $licenses = cheerio.load(licensesRes.data);

    function normalizeTitle(str) {
      if (!str) return '';
      return str.toLowerCase()
          .replace(/[\u2018\u2019]/g, "'")
          .replace(/\s*\(.*?\)\s*/g, '')
          .replace(/[^a-z0-9]/g, '');
    }

    // D&D Beyond's license page changed, let's extract ownership from the table
    // It's a table with rows. The second column has the source title.
    const visibleOwnedSlugs = new Set();
    const visibleOwnedTitles = new Set();
    $licenses('table tr').each((_, el) => {
        const titleText = $licenses(el).find('td:nth-child(2)').text().trim();
        if (titleText) {
            visibleOwnedTitles.add(normalizeTitle(titleText));
            const $link = $licenses(el).find('a');
            if ($link.length > 0) {
                const relativePath = $link.attr("href");
                if (relativePath && relativePath.includes('/sources/')) {
                    visibleOwnedSlugs.add(relativePath.split("/").pop());
                }
            } else {
                visibleOwnedSlugs.add(titleText.toLowerCase());
            }
        }
    });

    console.log(`Found ${visibleOwnedSlugs.size} licenses in the DOM.`);

    // --- 2. FETCH SOURCES FOR METADATA ---
    const response = await axios.get(SOURCES_URL, { headers: reqHeaders });
    const $ = cheerio.load(response.data);

    const sourceMap = {};
    let sources = [];

    // --- THE NEXT.JS JSON HIJACK ---
    // Attempt 1: Legacy Pages Router
    const nextDataScript = $("#__NEXT_DATA__").html();
    if (nextDataScript) {
      try {
        const nextData = JSON.parse(nextDataScript);
        sources =
          nextData.props?.pageProps?.initialState?.library?.sources || [];
      } catch (err) {
        console.warn(
          "! Error traversing legacy Next.js state tree:",
          err.message,
        );
      }
    }

    // Attempt 2: New App Router Streaming (self.__next_f.push)
    if (sources.length === 0) {
      console.log("Checking for Next.js App Router streaming payloads...");
      // Unescape the raw HTML to make the embedded string readable
      fs.writeFileSync("library_dump.html", response.data);
      const unescapedHtml = response.data
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");

      const idx = unescapedHtml.indexOf('"sources":');
      if (idx !== -1) {
          console.log("Found 'sources': string at index", idx);
          console.log("Snippet:", unescapedHtml.substring(idx, idx + 100));
      } else {
          console.log("Did not find '\"sources\":' in unescaped HTML.");
      }

      const sourcesJson = extractJsonArray(unescapedHtml, "sources");

      if (sourcesJson) {
        try {
          sources = JSON.parse(sourcesJson);
          console.log(
            "Next.js App Router Payload Found! Extracted sources array.",
          );
        } catch (e) {
          console.warn("! Failed to parse extracted streaming sources array.");
        }
      } else {
        console.warn(
          "! Warning: Next.js script payload not found in standard or streaming formats.",
        );
      }
    }

    if (sources.length > 0) {
      sources.forEach((source) => {
        if (source.relativePath) {
          const slug = source.relativePath.split("/").pop();

          // --- CROSS-REFERENCE CONFIG METADATA ---
          let configName = null;
          let configCategory = null;
          let configCategoryDesc = null;

          if (source.id && ddbConfig.sources) {
            const confSource = ddbConfig.sources.find(
              (s) => s.id === source.id,
            );
            if (confSource) {
              configName = confSource.name;
              if (ddbConfig.sourceCategories && confSource.sourceCategoryId) {
                const confCat = ddbConfig.sourceCategories.find(
                  (c) => c.id === confSource.sourceCategoryId,
                );
                if (confCat) {
                  configCategory = confCat.name;
                  configCategoryDesc = confCat.description;
                }
              }
            }
          }

          const isCardVisible = visibleOwnedSlugs.has(slug) || 
                                (source.name && visibleOwnedTitles.has(normalizeTitle(source.name))) ||
                                (configName && visibleOwnedTitles.has(normalizeTitle(configName)));

          // Map the exact schema values required for AI routing + comprehensive repo data
          sourceMap[slug] = {
            id: source.id || null,
            name: configName || source.name || slug,
            category: configCategory || null,
            categoryDescription: configCategoryDesc || null,
            title: source.name || slug,
            image: source.image || null,
            marketplaceUrl: source.marketplaceUrl || null,
            sku: source.sku || null,
            path: source.relativePath,
            isThirdParty: source.isThirdParty === true,
            publisher: source.publisher || "Unknown",
            ruleset: source.ruleset?.name || "5e",
            fullRulesetInfo: source.ruleset || null,
            type: source.type || "unknown",
            isFree: source.isFree === true,
            isReleased: source.isReleased !== false,
            releaseDate: source.releaseDate || null,
            // The Next.js streaming payload has multiple states. We grab the LAST occurrence 
            // which contains the final hydration state after entitlements resolve.
            // We also cross-reference with the licenses page just in case.
            isOwned: isCardVisible || source.isOwned === true,
            isSharedWithMe: source.isSharedWithMe === true,
            isFavorite: source.isFavorite === true,
            isOnWishlist: source.isOnWishlist === true,
            isLegacy: source.isLegacy === true,
          };
        }
      });
    }

    // --- DOM FALLBACK ---
    // If the JSON extraction fails, we scrape the visual cards so the pipeline doesn't break
    if (Object.keys(sourceMap).length === 0) {
      console.log("Using DOM fallback extraction...");
      $('[data-testid="sourceCard"]').each((_, el) => {
        const $link = $(el).find('a[class*="sourceTitle"]');
        const title = $link.text().trim();
        const relativePath = $link.attr("href");

        if (title && relativePath) {
          const slug = relativePath.split("/").pop();
          const ruleset = title.includes("2024") ? "2024" : "5e";

          // Fallbacks lack exact deep-data, but we maintain the identical schema structure
          sourceMap[slug] = {
            id: null,
            name: title,
            category: null,
            categoryDescription: null,
            title,
            image: null,
            marketplaceUrl: null,
            sku: null,
            path: relativePath,
            isThirdParty: false,
            publisher: "Unknown",
            ruleset,
            fullRulesetInfo: null,
            type: "unknown",
            isFree: false,
            isReleased: true,
            releaseDate: null,
            isOwned: true, // Assumed if visible in library
            isSharedWithMe: false,
            isFavorite: false,
            isOnWishlist: false,
            isLegacy: false,
          };
        }
      });
    }

    const sourceCount = Object.keys(sourceMap).length;

    if (sourceCount === 0) {
      console.warn(
        "! No sources mapped. Check your CobaltSession and library ownership.",
      );
    } else {
      console.log(
        `\nDiscovered ${sourceCount} sources mapped to internal metadata.`,
      );

      // Save the Map to a JSON file
      const outputDir = path.dirname(OUTPUT_MAP_FILE);
      if (!fs.existsSync(outputDir))
        fs.mkdirSync(outputDir, { recursive: true });

      fs.writeFileSync(OUTPUT_MAP_FILE, JSON.stringify(sourceMap, null, 2));
      console.log(`✅ Metadata Dictionary saved to: ${OUTPUT_MAP_FILE}`);

      // Provide a quick visual verification in the console
      const sampleAdv = Object.values(sourceMap).find(
        (s) => s.type === "adventure",
      );
      const sampleLegacy = Object.values(sourceMap).find(
        (s) => s.isLegacy === true,
      );
      console.log(
        `\nSample Captures:\n- Adventure: ${sampleAdv ? sampleAdv.title : "None found"}\n- Legacy Material: ${sampleLegacy ? sampleLegacy.title : "None found"}\n`,
      );
  }
}

crawlLibrary();
