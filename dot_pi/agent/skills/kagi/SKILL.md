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

## When to Summarize vs. Fetch Raw Source

The Kagi summarizer is a lossy overview. It strips nuance, omits details, and can miss critical context.
Use it **only** for a quick rough overview when the user explicitly asks for a summary or when a high-level gist suffices.

**For anything requiring accuracy or depth, always fetch the raw source yourself:**

- Run `curl -sL <URL>` (or `curl -sL <URL> | <pandoc/html2text/etc.>` for HTML) to get the full content.
- Then read and interpret it directly.

This is especially important for:

- **Reference documentation** — APIs, specs, man pages, RFCs. Summaries will miss details that matter.
- **Long-form articles with nuance** — technical deep-dives, changelogs, post-mortems, legal/policy text.
- **Code-related content** — source files, GitHub issues/PRs, release notes.
- **Anything the user will act on** — copy-pasting a summary into code or a config is risky.

In short: **default to fetching raw source with `curl`.** Only fall back to `kagi_summarizer` when the user explicitly wants a quick summary or when the content is trivial and a gloss is enough.

## General Notes

- Always use `mcporter call` via the bash tool — never attempt direct HTTP calls to the Kagi API
- Keep queries specific for better results
- If a search returns few results, try rephrasing the query
