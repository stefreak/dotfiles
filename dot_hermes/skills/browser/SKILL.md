---
name: browser
description: Control a web browser using Playwright MCP via mcporter. Only use for web development tasks (e.g. iterating on React apps, visual debugging) or when actual browser interaction is needed (e.g. single-page apps, JavaScript-heavy sites). Do NOT use for simple URL fetching — prefer curl instead.
---

# Playwright Browser Control

Use this skill when the user asks to interact with a website, test a web page, fill in forms, take screenshots, or do anything that requires a real browser.

## Tools

All tools are accessed via `mcporter call playwright.<tool_name>` with `key=value` arguments.

### Navigation
- `mcporter call playwright.browser_navigate url="https://example.com"` — go to a URL

### Page inspection
- `mcporter call playwright.browser_snapshot` — get an accessibility snapshot of the current page (preferred over screenshots for reading content)
- `mcporter call playwright.browser_take_screenshot` — capture a screenshot (saved to `.playwright-mcp/`)

### Interaction
- `mcporter call playwright.browser_click element="Submit button" target=e3` — click an element
- `mcporter call playwright.browser_type element="Search input" target=e5 text="query"` — type into an input
- `mcporter call playwright.browser_press_key key="Enter"` — press a keyboard key
- `mcporter call playwright.browser_select_option element="Dropdown" target=e7 values='["option1"]'` — select from dropdown

### Tab management
- `mcporter call playwright.browser_tab_list` — list open tabs
- `mcporter call playwright.browser_tab_new url="https://example.com"` — open new tab
- `mcporter call playwright.browser_tab_close` — close current tab

## Workflow

1. **Navigate** to the target URL
2. **Take a snapshot** to understand the page structure (snapshots return `ref` IDs for each element, shown as `[ref=eN]`)
3. **Interact** using the `ref` value as the `target` argument
4. After any action that changes the page, take a new snapshot to see the updated state
5. Repeat until the task is done

## When to Use Screenshots vs. Snapshots

Accessibility snapshots (`browser_snapshot`) are good for finding interactive elements and reading structured text. However, **screenshots (`browser_take_screenshot`) should be preferred** in these cases:

- **Taking in information visually** — layout, spacing, alignment, visual hierarchy, colors, typography, responsive behavior.
- **Making or evaluating changes to layout, design, or colors** — after editing CSS/HTML, take a screenshot to verify the result.
- **Improving layout or design** — when the user asks to improve how something looks, screenshots are the only way to actually see it.
- **Complex HTML** — when the accessibility tree is too large or complex to extract the necessary information from text alone, a screenshot gives an immediate visual summary.

In short: **use snapshots to find and interact with elements; use screenshots to see and judge visual output.** When in doubt about whether a change looks right, take a screenshot.

## Sandbox

Browser control launches external processes and makes network requests. **Always use `askOutsideSandbox: true`** when running any `mcporter call playwright.*` command.

## General Notes

- Always use `mcporter call` via the bash tool — never attempt direct HTTP calls
- Prefer `browser_snapshot` over screenshots for extracting text content — it returns structured accessibility tree data
- Use the `ref` from snapshot results as the `target` argument in click/type actions
- If an element can't be found, take a fresh snapshot — the page may have changed
- Screenshots and snapshots are saved to `~/.mcporter/.playwright-mcp/`
