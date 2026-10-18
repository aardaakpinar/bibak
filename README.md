# Bibak RSS Reader

A modern, fast, and fully browser-based RSS reader.

You can add your own RSS feeds, import OPML, bookmark posts, and find new feeds in the Discover tab.

---

## Features

- RSS & Atom support
- Local storage with IndexedDB
- Bookmark system
- OPML import/export
- Discover tab
- Feed filtering
- Folders to organize feeds (drag & drop, collapsible, saved in OPML)
- Three reading layouts: cards, list, compact
- In-app reader with Light / Sepia / Dark themes, serif or sans text, adjustable size
- Feed images on cards that have one (can be hidden)
- Unread counts per feed
- Mobile-friendly design (long-press a feed or folder for its menu)
- Vanilla JavaScript
- Read/unread state

---

## Technologies

- Vanilla JavaScript
-IndexedDB
- Fetch API
- DOM Parser
- Lucid Icons

---

## Installation

```bash
git clone <repo-url>
cd bibak-rss-reader
```
Run local server:

```bash
npx serve .
```

Or use VSCode Live Server.

---

## Usage

### Adding Feeds

1. Click the Add Feed button
2. Enter the RSS URL
3. Save

### Organizing Feeds into Folders

1. Click the folder-plus button next to **My Feeds** to create a folder
2. Add feeds to it by dragging them onto the folder, right-clicking a feed and choosing **Move to folder**, or picking a folder when adding a feed
3. Click a folder name to read all its feeds together, the arrow to collapse it
4. Right-click a folder to rename it, mark it read, or delete it (its feeds are kept)

Folders are preserved when exporting and importing OPML.

### OPML Import

1. Click the Upload button
2. Select the `.opml` file
3. Feeds will be added automatically

---

## Contributing

Pull requests and issues are open
