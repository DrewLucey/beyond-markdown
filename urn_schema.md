# **Semantic Reference Architecture & RAG Identifier System**

## 1. Overview

This document outlines the internal reference architecture, structural taxonomy, and anchor resolution system utilized across this corpus. Language models and retrieval-augmented generation (RAG) systems querying this database must utilize these identifier structures to accurately resolve cross-references, determine document hierarchy, and differentiate between rulesets.

## 2. Universal Resource Names (URNs) for Compendium Entities

Discrete mechanical entities (e.g., spells, monsters, magic items) are indexed using a standardized Universal Resource Name (URN) format. These URNs function as primary anchor targets for internal cross-referencing.

**Syntax Definition:** `{#ref:<category>:<slug>}`

* **category**: A singular string denoting the entity type. Valid categories include: `spell`, `monster`, `magic-item`, `item` (for mundane equipment), `species`, `feat`, `background`, `class`, and `vehicle`.  
* **slug**: A lowercase, hyphenated string derived from the entity's nomenclature (e.g., `fireball`, `ancient-red-dragon`).

**Link Resolution:** Inline hyperlinks targeting compendium entities are structured to prioritize internal RAG traversal while preserving external citation data.

* **Target (href):** Points to the internal URN (e.g., `#ref:spell:fireball`).  
* **Citation (title):** Contains the absolute external URL (e.g., `https://www.dndbeyond.com/spells/fireball`).  
* **Example Markdown:** `[Fireball](#ref:spell:fireball "https://www.dndbeyond.com/spells/fireball")`

## 3. Sourcebook Namespaces and Hierarchical Breadcrumbs

Narrative sourcebooks and rulebooks utilize a strict, multi-tiered namespace system for all heading identifiers. This prevents anchor collisions across disparate documents and provides implicit structural context.

**Syntax Definition:** `{#<book-slug>:<chapter-slug>:<heading-hash>}`

* **book-slug**: The root identifier for the sourcebook (e.g., `phb-2024`, `cos`).  
* **chapter-slug**: The specific file or chapter designation (e.g., `index`, `ch-1-introduction`).  
* **heading-hash**: An alphanumeric string generated from the heading text.

**Hierarchical Table of Contents (Breadcrumbs):**

To maintain structural parentage within index files, nested headings append their parent's hash to their own, creating a deterministic breadcrumb trail.

* *Level 2 (Parent):* `## Contents {#book:index:Contents}`  
* *Level 3 (Child):* `### Chapter 1 {#book:index:Contents:Chapter1}`  
* *Level 4 (Grandchild):* `#### Sub-Section {#book:index:Contents:Chapter1:SubSection}`

Models must recognize that colons (`:`) within a heading identifier denote structural descent.

## **4. Semantic Metadata Boundaries (XML Envelopes)**

The corpus relies on custom XML-style tags to establish explicit boundaries around documents and data blocks. Models should prioritize the metadata attributes within these tags to establish the ruleset context of the enclosed text.

**Macro-Structures:**

* `<SOURCEBOOK id="..." ruleset="..." type="..." legacy="...">`: Wraps an entire stitched book.  
* `<DATABASE type="..." ruleset="...">`: Wraps a concatenated repository of atomic entities (e.g., the Spells database).

**Meso-Structures:**

* `<CHAPTER id="..." title="...">`: Delineates individual sections within a `<SOURCEBOOK>`.  
* `<ENTRY type="..." name="..." source_url="..." source_book="..." ruleset="..." is_legacy="...">`: Wraps individual compendium records within a `<DATABASE>`.

**Metadata Attribute Definitions:**

* `ruleset`: Defines the governing rules framework (e.g., `5e` for 2014 rules, `5.5e` or 2024 for revised rules).  
* `is_legacy`: A boolean (`true`/`false`) indicating if the enclosed content has been superseded by a newer publication.  
* `type`: The taxonomic classification of the data (e.g., `SPELL`, `MONSTER`, `adventure`, `sourcebook`).