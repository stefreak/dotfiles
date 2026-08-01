---
name: brave-search
description: MUST read before any web search or URL fetch. Provides search and content extraction via Brave Search API — the fastest way to get web content.
---

# Brave Search

Provides purpose-built scripts for web search and content extraction that are faster and more reliable than ad-hoc `curl` or `fetch` calls — especially for extracting readable content from pages.

## Setup

See README for API key setup.

## Important: Direct Execution Required

Scripts must be invoked directly, not via `node`.

## Search

```bash
{baseDir}/search.js "query"                         # Basic search (5 results)
{baseDir}/search.js "query" -n 10                   # More results (max 20)
{baseDir}/search.js "query" --content               # Include page content as markdown
{baseDir}/search.js "query" --freshness pw          # Results from last week
{baseDir}/search.js "query" --freshness 2024-01-01to2024-06-30  # Date range
{baseDir}/search.js "query" --country DE            # Results from Germany
{baseDir}/search.js "query" -n 3 --content          # Combined options
```

### Options

- `-n <num>` - Number of results (default: 5, max: 20)
- `--content` - Fetch and include page content as markdown
- `--country <code>` - Two-letter country code (default: US)
- `--freshness <period>` - Filter by time:
  - `pd` - Past day (24 hours)
  - `pw` - Past week
  - `pm` - Past month
  - `py` - Past year
  - `YYYY-MM-DDtoYYYY-MM-DD` - Custom date range

## Sandbox

- `search.js` calls the Brave Search API (`api.search.brave.com`, whitelisted). **No sandbox bypass needed.**
- `content.js` fetches arbitrary URLs. **Always use `askOutsideSandbox: true`** unless the domain is in the sandbox whitelist.
- Using `--content` with `search.js` fetches page content, so also needs `askOutsideSandbox: true`.

## Extract Page Content

```bash
{baseDir}/content.js https://example.com/article
```

Fetches a URL and extracts readable content as markdown.

## Output Format

```
--- Result 1 ---
Title: Page Title
Link: https://example.com/page
Age: 2 days ago
Snippet: Description from search results
Content: (if --content flag used)
  Markdown content extracted from the page...

--- Result 2 ---
...
```

## When to Use

- Searching for documentation or API references
- Looking up facts or current information
- Fetching content from specific URLs
- Any task requiring web search without interactive browsing
