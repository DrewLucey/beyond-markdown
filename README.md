# beyond-markdown
D&amp;D Beyond Public and Owned content to LLM/AI Optimized Markdown
---
#### *This project is vibe-coded using Gemini*
---
# beyond-markdown

Automated pipeline for extracting and preparing D&D Beyond content for AI Dungeon Masters.

This project enables a fully autonomous AI DM (powered by Gemini) to interact with D&D Beyond data (sourcebooks, items, spells, and character sheets) via a structured, LLM-optimized Markdown pipeline.

## Features

- **Authenticated Extraction:** Uses your `CobaltSession` cookie to access private and public D&D Beyond data.
- **XML Enveloping:** Transforms standard HTML/Markdown into structured XML-wrapped blocks (`<ENTRY>`, `<CHAPTER>`, `<SOURCEBOOK>`), ensuring optimal RAG (Retrieval-Augmented Generation) performance for LLMs.
- **AI-Optimized Compilation:** Maps complex D&D Beyond JSON structures into readable, relational Markdown formats.
- **Dynamic Character Sheets:** Pulls live character data to generate fresh Markdown sheets for AI context.

## Prerequisites

- Node.js (v18+)
- A valid `CobaltSession` cookie from D&D Beyond.

## Setup

1. **Install Dependencies:**

```
   npm install
```

2. **Configure Authentication:**
Create a `.env` file in the root directory and add your session token:
```env
COBALTSESSION=your_actual_cobalt_session_token_here

```



## Usage

This project uses `npm` scripts for simplified execution:

### 1. Extract Game Data (Spells, Items, Monsters)

Fetch raw game data and process it into formatted Markdown entries:

```bash
npm run fetch <category>
```

*Categories: `spells`, `items`, `feats`, `backgrounds`, `races`, `monsters*`

### 2. Stitch Sourcebooks

Assemble a full sourcebook into a single, structured Master Markdown file:

```bash
npm run stitch <sourcebook_id>
```

*Example: `npm run stitch wgte*`

### 3. Compile Character Sheets

Fetch a live character sheet and render it into an AI-ready Markdown format:

```bash
npm run compile <character_id_or_url>
```

## Project Structure

* `downloader/`: Contains the extraction and processing logic.
* `api_fetcher.js`: Authenticated API extraction engine.
* `stitcher.js`: Assembles atomic Markdown files into macro-level sourcebooks.
* `character_compiler.js`: Fetches and formats character sheets.


* `sources/`: Stores the extracted Markdown repositories.

## Disclaimer

This project is an independent tool for personal use and is not affiliated with, endorsed by, or connected to D&D Beyond or Wizards of the Coast. Please respect D&D Beyond's Terms of Service when automating requests.
