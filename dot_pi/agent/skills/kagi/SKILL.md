---
name: kagi
description: Search the web and summarize URLs using the Kagi API via mcporter.
---

# Kagi Search & Summarize

Use this skill when the user asks to search the web, look something up online, or summarize a URL.

## Tools

- `mcporter call kagi.kagi_search_fetch queries='["search terms"]'` — search the web via Kagi
- `mcporter call kagi.kagi_summarizer url="https://example.com"` — summarize a URL

## Steps

### Web Search

1. Run: `mcporter call kagi.kagi_search_fetch queries='["<user query>"]'`
2. Parse the JSON result — extract titles, URLs, and snippets
3. Present a concise summary to the user
4. If the user wants details on a result, use `kagi_summarizer` on the URL

### URL Summarization

1. Run: `mcporter call kagi.kagi_summarizer url="<target URL>"`
2. Optional parameters:
   - `summary_type`: `"summary"` (default, paragraph prose) or `"takeaway"` (bullet points)
   - `target_language`: language code e.g. `"EN"`, `"DE"`, `"JA"`
3. Present the summary to the user

## Notes

- Always use `mcporter call` via the bash tool — never attempt direct HTTP calls
- Keep queries specific for better results
- If a search returns few results, try rephrasing the query
