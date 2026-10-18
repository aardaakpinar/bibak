import { feeds } from "./data.js";

class BibakRSSReader {
	constructor() {
		this.db = new RSSDatabase();
		this.parser = new RSSParser();
		this.selectedFeedId = null;
		this.selectedFolderId = null;
		this.showBookmarked = false;
		this.contextMenuFeedId = null;
		this.contextMenuFolderId = null;
		this.draggingFeedId = null;
		this.folderModalMode = "create"; // "create" | "rename"
		this.folderModalFolderId = null;
		this.moveFeedId = null;
		this.folders = [];
		this.feeds = [];
		this.currentView = "home";
		this.unreadByFeed = new Map();
		this.readerArticle = null;
		this.prefs = this.loadPrefs();

		this.init();
	}

	// ---- Preferences (per device, kept in localStorage) ----
	static READER_SIZES = [16, 17.5, 19, 21, 23];

	loadPrefs() {
		const defaults = { layout: "cards", showImages: true, readerTheme: null, readerFont: "serif", readerSize: 2 };
		try {
			return { ...defaults, ...JSON.parse(localStorage.getItem("bibak:prefs") || "{}") };
		} catch {
			return defaults;
		}
	}

	savePrefs() {
		try {
			localStorage.setItem("bibak:prefs", JSON.stringify(this.prefs));
		} catch {
			/* storage unavailable: preferences just last for this session */
		}
	}

	async init() {
		await this.db.init();
		this.setupEventListeners();
		this.setupDisplayControls();
		this.setupReader();
		await this.loadFeeds();
		await this.refreshAllFeeds();
		await this.loadArticles();
		this.loadDiscoverFeeds();
	}

	setupEventListeners() {
		// Add feed button
		document.getElementById("addFeedBtn").addEventListener("click", () => {
			this.showAddFeedModal();
		});

		document.getElementById("uploadFeedBtn").addEventListener("click", () => {
			this.uploadOpenModal();
		});

		document.getElementById("exportFeedBtn").addEventListener("click", () => {
			this.exportOPML();
		});

		// Modal controls
		document.getElementById("closeModalBtn").addEventListener("click", () => {
			this.hideAddFeedModal();
		});

		document.getElementById("cancelBtn").addEventListener("click", () => {
			this.hideAddFeedModal();
		});

		document.getElementById("addFeedForm").addEventListener("submit", (e) => {
			e.preventDefault();
			this.addFeed();
		});

		document.getElementById("opmlInput").addEventListener("change", (e) => {
			const file = e.target.files[0];
			if (file) this.importOPML(file);
		});

		// Close modal on overlay click
		document.querySelector(".modal-overlay")?.addEventListener("click", () => {
			this.hideAddFeedModal();
		});

		// Context menu
		document.addEventListener("click", () => {
			this.hideContextMenu();
		});

		document.getElementById("refreshFeedBtn").addEventListener("click", () => {
			if (this.contextMenuFeedId) {
				this.refreshFeed(this.contextMenuFeedId);
			}
		});

		document.getElementById("markAsReadBtn").addEventListener("click", () => {
			if (this.contextMenuFeedId) {
				this.markFeedAsRead(this.contextMenuFeedId);
			}
		});

		document.getElementById("deleteFeedBtn").addEventListener("click", () => {
			if (this.contextMenuFeedId) {
				this.deleteFeed(this.contextMenuFeedId);
			}
		});

		document.getElementById("moveFeedBtn").addEventListener("click", () => {
			if (this.contextMenuFeedId) {
				this.showMoveFeedModal(this.contextMenuFeedId);
			}
		});

		// Folders
		document.getElementById("addFolderBtn").addEventListener("click", () => {
			this.showFolderModal("create");
		});

		document.getElementById("folderForm").addEventListener("submit", (e) => {
			e.preventDefault();
			this.submitFolderModal();
		});

		document.getElementById("moveFeedForm").addEventListener("submit", (e) => {
			e.preventDefault();
			this.submitMoveFeedModal();
		});

		["folderModal", "moveFeedModal"].forEach((id) => {
			const modal = document.getElementById(id);
			modal.querySelector(".modal-overlay").addEventListener("click", () => modal.classList.remove("show"));
			modal.querySelectorAll(".modal-close").forEach((btn) => {
				btn.addEventListener("click", () => modal.classList.remove("show"));
			});
		});

		document.getElementById("renameFolderBtn").addEventListener("click", () => {
			if (this.contextMenuFolderId) {
				this.showFolderModal("rename", this.contextMenuFolderId);
			}
		});

		document.getElementById("markFolderReadBtn").addEventListener("click", () => {
			if (this.contextMenuFolderId) {
				this.markFolderAsRead(this.contextMenuFolderId);
			}
		});

		document.getElementById("deleteFolderBtn").addEventListener("click", () => {
			if (this.contextMenuFolderId) {
				this.deleteFolder(this.contextMenuFolderId);
			}
		});

		// Drop a feed on empty sidebar space (or an ungrouped feed) to take it out of its folder
		const feedSources = document.getElementById("feedSources");
		feedSources.addEventListener("dragover", (e) => {
			if (this.draggingFeedId === null) return;
			e.preventDefault();
		});
		feedSources.addEventListener("drop", (e) => {
			if (this.draggingFeedId === null) return;
			e.preventDefault();
			this.moveFeed(this.draggingFeedId, null);
		});

		// Mobile sidebar
		const openSidebar = document.getElementById("openSidebar");
		const sidebar = document.getElementById("sidebar");
		const overlay = document.getElementById("overlay");

		openSidebar.addEventListener("click", () => {
			sidebar.classList.add("mobile-active");
			overlay.classList.add("active");
		});

		// Overlay'a tıklayınca kapat
		overlay.addEventListener("click", () => {
			sidebar.classList.remove("mobile-active");
			overlay.classList.remove("active");
		});

		// Dışarı tıklayınca kapat
		document.addEventListener("click", (e) => {
			if (sidebar.classList.contains("mobile-active") && !sidebar.contains(e.target) && !openSidebar.contains(e.target)) {
				sidebar.classList.remove("mobile-active");
				overlay.classList.remove("active");
			}
		});

		// View navigation
		document.querySelectorAll(".nav-item").forEach((item) => {
			item.addEventListener("click", () => {
				const view = item.getAttribute("data-view");
				this.switchView(view);
			});
		});

		// Refresh all button
		document.getElementById("refreshAllBtn")?.addEventListener("click", async () => {
			await this.refreshAllFeeds();
			await this.loadArticles();
		});

		// Category chips
		document.querySelectorAll(".category-chip").forEach((chip) => {
			chip.addEventListener("click", () => {
				document.querySelectorAll(".category-chip").forEach((c) => c.classList.remove("active"));
				chip.classList.add("active");
				const category = chip.getAttribute("data-category");
				this.filterDiscoverFeeds(category);
			});
		});
	}

	showAddFeedModal() {
		document.getElementById("addFeedModal").classList.add("show");
		document.getElementById("feedUrlInput").value = "";
		document.getElementById("feedNameInput").value = "";
		// Default to the folder currently being viewed, if any
		this.populateFolderSelect(document.getElementById("feedFolderSelect"), this.selectedFolderId);
	}

	// Fills a <select> with "No folder" plus every folder, selecting `selectedId`.
	populateFolderSelect(select, selectedId = null) {
		select.innerHTML = "";

		const none = document.createElement("option");
		none.value = "";
		none.textContent = "No folder";
		select.appendChild(none);

		[...this.folders]
			.sort((a, b) => a.name.localeCompare(b.name))
			.forEach((folder) => {
				const option = document.createElement("option");
				option.value = String(folder.id);
				option.textContent = folder.name;
				select.appendChild(option);
			});

		select.value = selectedId === null || selectedId === undefined ? "" : String(selectedId);
	}

	uploadOpenModal() {
		document.getElementById("opmlInput").click();
	}

	hideAddFeedModal() {
		document.getElementById("addFeedModal").classList.remove("show");
	}

	async refreshAllFeeds() {
		const feeds = await this.db.getAllFeeds();

		for (const feed of feeds) {
			try {
				const feedData = await this.parser.fetchFeed(feed.url);

				const articles = feedData.items.map((item) => ({
					...item,
					feedId: feed.id,
					bookmarked: 0,
					unread: 1,
					guid: item.guid || item.link,
				}));

				await this.db.addArticles(articles);
			} catch (e) {
				console.warn("The feed could not be refreshed:", feed.url);
			}
		}
	}

	async addFeed() {
		const url = document.getElementById("feedUrlInput").value.trim();
		const customName = document.getElementById("feedNameInput").value.trim();

		if (!url) {
			alert("Please enter an RSS URL.");
			return;
		}

		try {
			this.showLoading(true);
			const feedData = await this.parser.fetchFeed(url);

			const feed = {
				url: url,
				name: customName || feedData.title || "İsimsiz Kaynak",
				addedAt: new Date().toISOString(),
				folderId: document.getElementById("feedFolderSelect").value ? Number(document.getElementById("feedFolderSelect").value) : null,
			};

			const feedId = await this.db.addFeed(feed);

			// Save articles
			const articles = feedData.items.map((item) => ({
				...item,
				feedId: feedId,
				bookmarked: false,
				unread: true,
				guid: item.guid || item.link,
			}));

			await this.db.addArticles(articles);

			this.hideAddFeedModal();
			await this.loadFeeds();
			await this.loadArticles();
		} catch (error) {
			console.error("Error adding feed:", error);
			alert("An error occurred while adding the RSS feed. Please check the URL.");
		} finally {
			this.showLoading(false);
		}
	}

	async loadFeeds() {
		const [feeds, folders] = await Promise.all([this.db.getAllFeeds(), this.db.getAllFolders()]);
		const feedSourcesContainer = document.getElementById("feedSources");
		await this.computeUnreadCounts();

		this.feeds = feeds;
		this.folders = folders;
		feedSourcesContainer.innerHTML = "";

		// Group feeds by folder. A feed pointing at a missing folder counts as ungrouped.
		const folderIds = new Set(folders.map((f) => f.id));
		const feedsByFolder = new Map();
		const ungrouped = [];

		feeds.forEach((feed) => {
			if (feed.folderId != null && folderIds.has(feed.folderId)) {
				if (!feedsByFolder.has(feed.folderId)) feedsByFolder.set(feed.folderId, []);
				feedsByFolder.get(feed.folderId).push(feed);
			} else {
				ungrouped.push(feed);
			}
		});

		[...folders]
			.sort((a, b) => a.name.localeCompare(b.name))
			.forEach((folder) => {
				feedSourcesContainer.appendChild(this.createFolderElement(folder, feedsByFolder.get(folder.id) || []));
			});

		ungrouped.forEach((feed) => {
			feedSourcesContainer.appendChild(this.createFeedButton(feed.id, feed.name));
		});
	}

	createFolderElement(folder, folderFeeds) {
		const wrapper = document.createElement("div");
		wrapper.className = "folder";
		if (folder.collapsed) wrapper.classList.add("collapsed");

		const header = document.createElement("div");
		header.className = "folder-header";
		if (this.selectedFolderId === folder.id) header.classList.add("active");

		const toggle = document.createElement("button");
		toggle.className = "folder-toggle";
		toggle.setAttribute("aria-label", folder.collapsed ? "Expand folder" : "Collapse folder");
		toggle.setAttribute("aria-expanded", String(!folder.collapsed));
		toggle.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;

		const nameBtn = document.createElement("button");
		nameBtn.className = "folder-name";
		nameBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg><span class="folder-label"></span><span class="folder-count"></span>`;
		nameBtn.querySelector(".folder-label").textContent = folder.name;
		nameBtn.querySelector(".folder-count").textContent = folderFeeds.length;

		header.appendChild(toggle);
		header.appendChild(nameBtn);

		const list = document.createElement("div");
		list.className = "folder-feeds";

		if (folderFeeds.length === 0) {
			const hint = document.createElement("div");
			hint.className = "folder-empty";
			hint.textContent = "Empty. Drag feeds here or use “Move to folder”.";
			list.appendChild(hint);
		} else {
			folderFeeds.forEach((feed) => list.appendChild(this.createFeedButton(feed.id, feed.name)));
		}

		wrapper.appendChild(header);
		wrapper.appendChild(list);

		toggle.addEventListener("click", (e) => {
			e.stopPropagation();
			this.toggleFolder(folder.id);
		});

		// Clicking the name shows articles from every feed in the folder
		nameBtn.addEventListener("click", () => {
			this.selectedFolderId = this.selectedFolderId === folder.id ? null : folder.id;
			this.selectedFeedId = null;
			this.loadFeeds();
			this.loadArticles();
		});

		header.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.showFolderContextMenu(e, folder.id);
		});
		this.addLongPress(header, (pos) => this.showFolderContextMenu(pos, folder.id));

		// Drop target for feeds
		wrapper.addEventListener("dragover", (e) => {
			if (this.draggingFeedId === null) return;
			e.preventDefault();
			e.stopPropagation();
			wrapper.classList.add("drag-over");
		});
		wrapper.addEventListener("dragleave", (e) => {
			if (!wrapper.contains(e.relatedTarget)) wrapper.classList.remove("drag-over");
		});
		wrapper.addEventListener("drop", (e) => {
			if (this.draggingFeedId === null) return;
			e.preventDefault();
			e.stopPropagation();
			wrapper.classList.remove("drag-over");
			this.moveFeed(this.draggingFeedId, folder.id);
		});

		return wrapper;
	}

	async toggleFolder(folderId) {
		const folder = this.folders.find((f) => f.id === folderId);
		if (!folder) return;
		folder.collapsed = !folder.collapsed;
		await this.db.updateFolder(folder);
		await this.loadFeeds();
	}

	showFolderModal(mode, folderId = null) {
		this.folderModalMode = mode;
		this.folderModalFolderId = folderId;

		const folder = folderId ? this.folders.find((f) => f.id === folderId) : null;
		document.getElementById("folderModalTitle").textContent = mode === "rename" ? "Rename Folder" : "New Folder";
		document.getElementById("folderSubmitLabel").textContent = mode === "rename" ? "Save" : "Create";

		const input = document.getElementById("folderNameInput");
		input.value = folder ? folder.name : "";

		document.getElementById("folderModal").classList.add("show");
		input.focus();
		input.select();
	}

	// Returns an existing folder with this name (case-insensitive) or creates one.
	async findOrCreateFolder(name) {
		const trimmed = name.trim();
		const existing = this.folders.find((f) => f.name.toLowerCase() === trimmed.toLowerCase());
		if (existing) return existing;

		const folder = { name: trimmed, collapsed: false, createdAt: new Date().toISOString() };
		folder.id = await this.db.addFolder(folder);
		this.folders.push(folder);
		return folder;
	}

	async submitFolderModal() {
		const name = document.getElementById("folderNameInput").value.trim();
		if (!name) return;

		try {
			if (this.folderModalMode === "rename") {
				const folder = this.folders.find((f) => f.id === this.folderModalFolderId);
				const clash = this.folders.find((f) => f.id !== this.folderModalFolderId && f.name.toLowerCase() === name.toLowerCase());
				if (clash) {
					alert("A folder with this name already exists.");
					return;
				}
				if (folder) {
					folder.name = name;
					await this.db.updateFolder(folder);
				}
			} else {
				if (this.folders.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
					alert("A folder with this name already exists.");
					return;
				}
				await this.findOrCreateFolder(name);
			}

			document.getElementById("folderModal").classList.remove("show");
			await this.loadFeeds();
		} catch (error) {
			console.error("Error saving folder:", error);
			alert("An error occurred while saving the folder.");
		}
	}

	async deleteFolder(folderId) {
		const folder = this.folders.find((f) => f.id === folderId);
		if (!folder) return;

		if (confirm(`Delete the folder "${folder.name}"? The feeds inside will be kept.`)) {
			await this.db.deleteFolder(folderId);
			if (this.selectedFolderId === folderId) {
				this.selectedFolderId = null;
			}
			await this.loadFeeds();
			await this.loadArticles();
		}
	}

	showMoveFeedModal(feedId) {
		this.moveFeedId = feedId;
		const feed = this.feeds.find((f) => f.id === feedId);
		this.populateFolderSelect(document.getElementById("moveFolderSelect"), feed ? feed.folderId : null);
		document.getElementById("moveNewFolderInput").value = "";
		document.getElementById("moveFeedModal").classList.add("show");
	}

	async submitMoveFeedModal() {
		const newName = document.getElementById("moveNewFolderInput").value.trim();
		const selected = document.getElementById("moveFolderSelect").value;

		try {
			let folderId = selected ? Number(selected) : null;
			if (newName) {
				folderId = (await this.findOrCreateFolder(newName)).id;
			}
			document.getElementById("moveFeedModal").classList.remove("show");
			await this.moveFeed(this.moveFeedId, folderId);
		} catch (error) {
			console.error("Error moving feed:", error);
			alert("An error occurred while moving the feed.");
		}
	}

	// folderId === null removes the feed from its folder
	async moveFeed(feedId, folderId) {
		const feeds = await this.db.getAllFeeds();
		const feed = feeds.find((f) => f.id === feedId);
		this.draggingFeedId = null;
		if (!feed) return;

		feed.folderId = folderId;
		await this.db.updateFeed(feed);

		// Make sure the destination is visible
		if (folderId !== null) {
			const folder = this.folders.find((f) => f.id === folderId);
			if (folder && folder.collapsed) {
				folder.collapsed = false;
				await this.db.updateFolder(folder);
			}
		}

		await this.loadFeeds();
		// A folder view may now include/exclude this feed
		if (this.selectedFolderId !== null) await this.loadArticles();
	}

	switchView(view) {
		this.currentView = view;

		// Update nav items
		document.querySelectorAll(".nav-item").forEach((item) => {
			item.classList.remove("active");
		});
		document.querySelector(`[data-view="${view}"]`)?.classList.add("active");

		// Update views
		document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));

		// Update title and subtitle
		const titleEl = document.getElementById("viewTitle");

		if (view === "home") {
			document.getElementById("homeView").classList.add("active");
			titleEl.textContent = "Feeds";
			this.loadArticles();
		} else if (view === "discover") {
			document.getElementById("discoverView").classList.add("active");
			titleEl.textContent = "Discover";
		} else if (view === "bookmarks") {
			document.getElementById("bookmarksView").classList.add("active");
			titleEl.textContent = "Bookmarks";
			this.loadBookmarks();
		}

		// Close mobile sidebar
		document.getElementById("overlay").classList.remove("active");
		document.getElementById("sidebar").classList.remove("mobile-active");
	}

	async loadBookmarks() {
		const articles = await this.db.getBookmarkedArticles();
		const container = document.getElementById("bookmarksContainer");
		const emptyState = document.getElementById("bookmarksEmpty");

		if (articles.length === 0) {
			container.innerHTML = "";
			emptyState.style.display = "flex";
		} else {
			emptyState.style.display = "none";

			// Sort by date
			articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
			await this.renderArticles(container, articles);
		}
	}

	loadDiscoverFeeds() {
		this.allDiscoverFeeds = feeds;
		this.renderDiscoverFeeds(feeds);
	}

	filterDiscoverFeeds(category) {
		if (category === "all") {
			this.renderDiscoverFeeds(this.allDiscoverFeeds);
		} else {
			const filtered = this.allDiscoverFeeds.filter((f) => f.category === category);
			this.renderDiscoverFeeds(filtered);
		}
	}

	renderDiscoverFeeds(feeds) {
		const container = document.getElementById("discoverFeeds");
		container.innerHTML = "";

		feeds.forEach((feed) => {
			const card = document.createElement("div");
			card.className = "discover-card";

			card.innerHTML = `
                <div class="discover-card-header">
                    <div class="discover-info">
                        <h3>${feed.name}</h3>
                        <p>${feed.description}</p>
                    </div>
                </div>
                <div class="discover-meta">
                    <span class="discover-tag">${this.getCategoryName(feed.category)}</span>
                </div>
                <div class="discover-actions">
                    <button class="btn btn-primary" data-url="${feed.url}" data-name="${feed.name}">
                        <i data-lucide="plus"></i>
                        <span>Ekle</span>
                    </button>
                </div>
            `;

			const addBtn = card.querySelector(".btn");
			addBtn.addEventListener("click", async () => {
				await this.addFeedFromDiscover(feed.url, feed.name);
				addBtn.disabled = true;
				addBtn.innerHTML = '<i data-lucide="check"></i><span>Eklendi</span>';
				lucide.createIcons();
			});

			container.appendChild(card);
		});

		lucide.createIcons();
	}

	getCategoryName(category) {
		const names = {
			tech: "Technology",
			news: "News",
			gaming: "Gaming",
			economy: "Economy",
			science: "Science",
			sports: "Sports",
			fashion: "Fashion",
		};
		return names[category] || category;
	}

	async addFeedFromDiscover(url, name) {
		try {
			this.showLoading(true);
			const feedData = await this.parser.fetchFeed(url);

			const feed = {
				url: url,
				name: name || feedData.title || "İsimsiz Kaynak",
				addedAt: new Date().toISOString(),
			};

			const feedId = await this.db.addFeed(feed);

			const articles = feedData.items.map((item) => ({
				...item,
				feedId: feedId,
				bookmarked: false,
				unread: true,
				guid: item.guid || item.link,
			}));

			await this.db.addArticles(articles);
			await this.loadFeeds();

			// Switch to home view
			this.switchView("home");
		} catch (error) {
			console.error("Error adding feed:", error);
			alert("An error occurred while adding the RSS feed.");
		} finally {
			this.showLoading(false);
		}
	}

	async importOPML(file) {
		try {
			this.showLoading(true);

			const text = await file.text();
			const parser = new DOMParser();
			const xml = parser.parseFromString(text, "application/xml");

			if (xml.querySelector("parsererror")) {
				alert("Invalid OPML file.");
				return;
			}

			// OPML outline'ları
			const outlines = Array.from(xml.querySelectorAll("outline[xmlUrl]"));

			// Group outlines (an <outline> without xmlUrl wrapping feeds) become folders.
			// "RSS Feeds" is the wrapper older Bi'Bak exports used, not a real folder.
			const folderNameOf = (outline) => {
				const parent = outline.parentElement;
				if (!parent || parent.tagName !== "outline" || parent.hasAttribute("xmlUrl")) return null;
				const name = (parent.getAttribute("title") || parent.getAttribute("text") || "").trim();
				return name && name !== "RSS Feeds" ? name : null;
			};

			if (outlines.length === 0) {
				alert("No RSS feed found within OPML.");
				return;
			}

			let added = 0;

			for (const outline of outlines) {
				const url = outline.getAttribute("xmlUrl");
				const title = outline.getAttribute("title") || outline.getAttribute("text") || "OPML Kaynağı";

				if (!url) continue;

				try {
					const feedData = await this.parser.fetchFeed(url);

					const folderName = folderNameOf(outline);
					const folder = folderName ? await this.findOrCreateFolder(folderName) : null;

					const feed = {
						url,
						name: title || feedData.title || "İsimsiz Kaynak",
						addedAt: new Date().toISOString(),
						folderId: folder ? folder.id : null,
					};

					const feedId = await this.db.addFeed(feed);

					const articles = feedData.items.map((item) => ({
						...item,
						feedId,
						bookmarked: 0,
						unread: 1,
						guid: item.guid || item.link,
					}));

					await this.db.addArticles(articles);
					added++;
				} catch (err) {
					console.warn("OPML feed skipped:", url, err.message);
					// devam et
				}
			}

			alert(`${added} successfully added.`);
			this.hideAddFeedModal();
			await this.loadFeeds();
			await this.loadArticles();
		} catch (err) {
			console.error("OPML import error:", err);
			alert("An error occurred while importing OPML.");
		} finally {
			this.showLoading(false);
			document.getElementById("opmlInput").value = "";
		}
	}

	createFeedButton(feedId, name) {
		const button = document.createElement("button");
		button.className = "feed-button";
		button.dataset.feedId = String(feedId);

		button.appendChild(this.createAvatar(name));

		const label = document.createElement("span");
		label.className = "feed-label";
		label.textContent = name;
		button.appendChild(label);

		const count = document.createElement("span");
		count.className = "feed-count";
		button.appendChild(count);
		this.setCount(count, this.unreadByFeed.get(feedId) || 0);

		// Set active class
		if (this.selectedFeedId === feedId) {
			button.classList.add("active");
		}

		// Drag onto a folder to organize. Only for mouse-like pointers: on touch screens
		// draggable=true makes a long-press start a drag, which swallows the context menu
		// (mark as read, delete, move...). Touch users get a long-press menu instead.
		button.draggable = this.canDrag();
		button.addEventListener("dragstart", (e) => {
			this.draggingFeedId = feedId;
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/plain", String(feedId));
			button.classList.add("dragging");
		});
		button.addEventListener("dragend", () => {
			this.draggingFeedId = null;
			button.classList.remove("dragging");
			document.querySelectorAll(".folder.drag-over").forEach((el) => el.classList.remove("drag-over"));
		});

		button.addEventListener("click", () => {
			if (this.selectedFeedId === feedId) {
				this.selectedFeedId = null;
			} else {
				this.selectedFeedId = feedId;
			}
			this.selectedFolderId = null;

			this.loadFeeds();
			this.loadArticles();
		});

		button.addEventListener("contextmenu", (e) => {
			if (feedId) {
				e.preventDefault();
				this.showContextMenu(e, feedId);
			}
		});

		// iOS Safari never fires "contextmenu" on long-press, so handle it ourselves
		if (feedId) this.addLongPress(button, (pos) => this.showContextMenu(pos, feedId));

		return button;
	}

	// True when the primary input is a mouse/trackpad (HTML5 drag & drop is usable)
	canDrag() {
		return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
	}

	// Calls handler({pageX, pageY, preventDefault}) after a touch is held ~500ms without moving
	addLongPress(el, handler, delay = 500) {
		let timer = null;
		let startX = 0;
		let startY = 0;
		let fired = false;

		const cancel = () => {
			clearTimeout(timer);
			timer = null;
		};

		el.addEventListener(
			"touchstart",
			(e) => {
				if (e.touches.length !== 1) return cancel();
				fired = false;
				const t = e.touches[0];
				startX = t.clientX;
				startY = t.clientY;
				const pageX = t.pageX;
				const pageY = t.pageY;
				timer = setTimeout(() => {
					timer = null;
					fired = true;
					if (navigator.vibrate) navigator.vibrate(10);
					handler({ pageX, pageY, preventDefault() {} });
				}, delay);
			},
			{ passive: true },
		);

		el.addEventListener(
			"touchmove",
			(e) => {
				const t = e.touches[0];
				if (timer && Math.hypot(t.clientX - startX, t.clientY - startY) > 10) cancel();
			},
			{ passive: true },
		);

		el.addEventListener("touchend", (e) => {
			cancel();
			// Don't let the release count as a tap (would select the feed / close the menu)
			if (fired) {
				e.preventDefault();
				fired = false;
			}
		});
		el.addEventListener("touchcancel", cancel);
	}

	async loadArticles() {
		this.showLoading(true);

		let articles;

		if (this.selectedFeedId) {
			articles = await this.db.getArticlesByFeed(this.selectedFeedId);
		} else if (this.selectedFolderId) {
			const folderFeeds = (await this.db.getAllFeeds()).filter((f) => f.folderId === this.selectedFolderId);
			const perFeed = await Promise.all(folderFeeds.map((f) => this.db.getArticlesByFeed(f.id)));
			articles = perFeed.flat();
		} else {
			articles = await this.db.getAllArticles();
		}

		// Sort by date (newest first)
		articles.sort((a, b) => {
			const dateA = new Date(a.pubDate);
			const dateB = new Date(b.pubDate);
			return dateB - dateA;
		});

		const container = document.getElementById("articlesContainer");
		const emptyState = document.getElementById("emptyState");

		if (articles.length === 0) {
			container.innerHTML = "";
			emptyState.style.display = "flex";
		} else {
			emptyState.style.display = "none";
			await this.renderArticles(container, articles);
		}

		this.showLoading(false);
		this.refreshBadges();
	}

	// Fills a container with article cards using the current layout
	async renderArticles(container, articles) {
		container.innerHTML = "";
		container.className = `articles-grid layout-${this.prefs.layout}`;

		const feeds = await this.db.getAllFeeds();
		const feedMap = {};
		feeds.forEach((feed) => {
			feedMap[feed.id] = feed.name;
		});

		const fragment = document.createDocumentFragment();
		articles.forEach((article) => {
			fragment.appendChild(this.createArticleCard(article, feedMap[article.feedId]));
		});
		container.appendChild(fragment);
	}

	// ---- Small helpers ----
	esc(value) {
		return String(value ?? "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}

	// Plain text of an HTML snippet (entities decoded, tags dropped)
	htmlToText(html) {
		if (!html) return "";
		const doc = new DOMParser().parseFromString(html, "text/html");
		return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
	}

	static ICONS = {
		bookmark: '<path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
		unread: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/>',
		image: '<path d="M16 5h6"/><path d="M19 2v6"/><path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/><circle cx="9" cy="9" r="2"/>',
	};

	icon(name) {
		return `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">${BibakRSSReader.ICONS[name]}</svg>`;
	}

	// Stable hue (0-359) derived from a name
	hueOf(text) {
		let hash = 0;
		for (const ch of text || "?") hash = (hash * 31 + ch.codePointAt(0)) % 360;
		return hash;
	}

	initialOf(name) {
		return (Array.from((name || "?").trim())[0] || "?").toLocaleUpperCase("tr-TR");
	}

	// Colored initial for a source; the hue stays the same for the same name
	createAvatar(name) {
		const el = document.createElement("span");
		el.className = "source-avatar";
		el.setAttribute("aria-hidden", "true");
		el.style.setProperty("--h", String(this.hueOf((name || "?").trim())));
		el.textContent = this.initialOf(name);
		return el;
	}

	setCount(el, count) {
		el.textContent = count > 99 ? "99+" : String(count);
		el.hidden = count === 0;
	}

	async computeUnreadCounts() {
		const articles = await this.db.getAllArticles();
		this.unreadByFeed = new Map();
		articles.forEach((a) => {
			if (a.unread) this.unreadByFeed.set(a.feedId, (this.unreadByFeed.get(a.feedId) || 0) + 1);
		});
	}

	// Updates the sidebar badges in place (no rebuild, so nothing flickers)
	async refreshBadges() {
		await this.computeUnreadCounts();
		document.querySelectorAll(".feed-button[data-feed-id]").forEach((button) => {
			const count = button.querySelector(".feed-count");
			if (count) this.setCount(count, this.unreadByFeed.get(Number(button.dataset.feedId)) || 0);
		});
	}

	// The picture shown for an article: the reader's own upload wins, then the feed's image
	getArticleImage(article) {
		return article.image || this.parser.firstImageInHTML(article.content || article.description) || "";
	}

	// ---- Article cards ----
	createArticleCard(article, feedName) {
		const card = document.createElement("article");
		card.className = `article-card ${article.unread ? "unread" : ""}`;
		card.tabIndex = 0;

		const description = this.htmlToText(article.description).substring(0, 220);
		const image = this.prefs.showImages ? this.getArticleImage(article) : "";
		// Cards without a picture give the freed space to the summary, so grid rows stay even
		if (this.prefs.showImages && !image) card.classList.add("no-media");

		card.innerHTML = `
			${image ? `<div class="article-media"><img src="${this.esc(image)}" alt="" loading="lazy" referrerpolicy="no-referrer" /></div>` : ""}
			<div class="article-body">
				<div class="article-header">
					<span class="article-source">${this.esc(feedName || "Kaynak")}</span>
					<span class="article-date">${this.esc(this.parser.formatDate(article.pubDate))}</span>
				</div>
				<h3 class="article-title">${this.esc(article.title)}</h3>
				<p class="article-description">${this.esc(description)}</p>
				<div class="article-footer">
					<div class="article-buttons">
						<button type="button" class="unread-btn ${article.unread ? "unread" : ""}" title="Toggle unread" aria-label="Toggle unread">${this.icon("unread")}</button>
						<button type="button" class="bookmark-btn ${article.bookmarked ? "bookmarked" : ""}" title="Bookmark" aria-label="Bookmark">${this.icon("bookmark")}</button>
					</div>
				</div>
			</div>
		`;

		// Avatar goes in front of the source name (built with the same helper as the sidebar)
		card.querySelector(".article-header").prepend(this.createAvatar(feedName));

		// A picture that fails to load is dropped rather than leaving an empty box
		const img = card.querySelector(".article-media img");
		if (img) img.addEventListener("error", () => img.closest(".article-media")?.remove());

		const open = () => this.openReader(article, feedName, card);
		card.addEventListener("click", (e) => {
			if (!e.target.closest(".article-buttons")) open();
		});
		card.addEventListener("keydown", (e) => {
			if (e.target === card && (e.key === "Enter" || e.key === " ")) {
				e.preventDefault();
				open();
			}
		});

		const unreadBtn = card.querySelector(".unread-btn");
		unreadBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			article.unread = article.unread ? 0 : 1;
			await this.db.updateArticle(article);
			unreadBtn.classList.toggle("unread", !!article.unread);
			card.classList.toggle("unread", !!article.unread);
			this.refreshBadges();
		});

		const bookmarkBtn = card.querySelector(".bookmark-btn");
		bookmarkBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			article.bookmarked = article.bookmarked ? 0 : 1;
			await this.db.updateArticle(article);
			bookmarkBtn.classList.toggle("bookmarked", !!article.bookmarked);
		});

		return card;
	}

	// ---- Display controls: layout + images ----
	setupDisplayControls() {
		const applyButtons = () => {
			document.querySelectorAll("#layoutSwitch .seg-btn").forEach((btn) => {
				btn.setAttribute("aria-pressed", String(btn.dataset.layout === this.prefs.layout));
			});
			const toggle = document.getElementById("toggleImagesBtn");
			toggle.setAttribute("aria-pressed", String(this.prefs.showImages));
			toggle.title = this.prefs.showImages ? "Hide images" : "Show images";
		};
		applyButtons();

		document.querySelectorAll("#layoutSwitch .seg-btn").forEach((btn) => {
			btn.addEventListener("click", () => {
				this.prefs.layout = btn.dataset.layout;
				this.savePrefs();
				applyButtons();
				this.reloadCurrentList();
			});
		});

		document.getElementById("toggleImagesBtn").addEventListener("click", () => {
			this.prefs.showImages = !this.prefs.showImages;
			this.savePrefs();
			applyButtons();
			this.reloadCurrentList();
		});
	}

	reloadCurrentList() {
		if (this.currentView === "bookmarks") return this.loadBookmarks();
		if (this.currentView === "home") return this.loadArticles();
	}

	// ---- Reader ----
	setupReader() {
		const reader = document.getElementById("reader");

		document.getElementById("readerClose").addEventListener("click", () => this.closeReader());
		document.getElementById("readerBackdrop").addEventListener("click", () => this.closeReader());
		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape" && reader.classList.contains("open")) this.closeReader();
		});

		reader.querySelectorAll("[data-reader-theme]").forEach((btn) => {
			btn.addEventListener("click", () => {
				this.prefs.readerTheme = btn.dataset.readerTheme;
				this.savePrefs();
				this.applyReaderPrefs();
			});
		});

		const step = (delta) => {
			const max = BibakRSSReader.READER_SIZES.length - 1;
			this.prefs.readerSize = Math.min(max, Math.max(0, this.prefs.readerSize + delta));
			this.savePrefs();
			this.applyReaderPrefs();
		};
		document.getElementById("readerSmaller").addEventListener("click", () => step(-1));
		document.getElementById("readerLarger").addEventListener("click", () => step(1));

		document.getElementById("readerFont").addEventListener("click", () => {
			this.prefs.readerFont = this.prefs.readerFont === "serif" ? "sans" : "serif";
			this.savePrefs();
			this.applyReaderPrefs();
		});

		document.getElementById("readerBookmark").addEventListener("click", async () => {
			const article = this.readerArticle;
			if (!article) return;
			article.bookmarked = article.bookmarked ? 0 : 1;
			await this.db.updateArticle(article);
			this.applyReaderPrefs();
			this.reloadCurrentList();
		});

		this.applyReaderPrefs();
	}

	// Reader theme defaults to the system theme until the reader picks one
	applyReaderPrefs() {
		const reader = document.getElementById("reader");
		const theme = this.prefs.readerTheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

		reader.dataset.theme = theme;
		reader.classList.toggle("sans", this.prefs.readerFont === "sans");
		reader.style.setProperty("--r-size", BibakRSSReader.READER_SIZES[this.prefs.readerSize] + "px");

		reader.querySelectorAll("[data-reader-theme]").forEach((btn) => {
			btn.setAttribute("aria-pressed", String(btn.dataset.readerTheme === theme));
		});

		const sizes = BibakRSSReader.READER_SIZES;
		document.getElementById("readerSmaller").disabled = this.prefs.readerSize === 0;
		document.getElementById("readerLarger").disabled = this.prefs.readerSize === sizes.length - 1;

		const bookmark = document.getElementById("readerBookmark");
		bookmark.setAttribute("aria-pressed", String(!!(this.readerArticle && this.readerArticle.bookmarked)));
	}

	async openReader(article, feedName, card) {
		this.readerArticle = article;
		this.readerFeedName = feedName;
		this.readerReturnFocus = card || document.activeElement;

		this.fillReader(article, feedName);

		const reader = document.getElementById("reader");
		reader.classList.add("open");
		reader.setAttribute("aria-hidden", "false");
		document.getElementById("readerScroll").scrollTop = 0;
		document.getElementById("readerClose").focus({ preventScroll: true });

		// Opening counts as reading
		if (article.unread) {
			article.unread = 0;
			await this.db.updateArticle(article);
			if (card) {
				card.classList.remove("unread");
				card.querySelector(".unread-btn")?.classList.remove("unread");
			}
			this.refreshBadges();
		}
	}

	closeReader() {
		const reader = document.getElementById("reader");
		reader.classList.remove("open");
		reader.setAttribute("aria-hidden", "true");
		this.readerArticle = null;
		this.readerReturnFocus?.focus?.({ preventScroll: true });
	}

	fillReader(article, feedName) {
		const meta = document.getElementById("readerMeta");
		meta.innerHTML = `<strong>${this.esc(feedName || "Kaynak")}</strong> · ${this.esc(this.parser.formatDate(article.pubDate))}`;

		document.getElementById("readerTitle").textContent = article.title || "";

		const open = document.getElementById("readerOpen");
		const safeLink = /^https?:\/\//i.test(article.link || "") ? article.link : "";
		open.hidden = !safeLink;
		open.href = safeLink || "#";

		// Hero image (reader's own upload wins). Hidden if the feed gave none or it fails to load.
		const hero = this.getArticleImage(article);
		const figure = document.getElementById("readerFigure");
		const img = document.getElementById("readerImg");
		img.onerror = () => (figure.hidden = true);
		if (hero && this.prefs.showImages) {
			img.src = hero;
			figure.hidden = false;
		} else {
			img.removeAttribute("src");
			figure.hidden = true;
		}

		// Body: full content if the feed provides it, else the summary
		const source = article.content || article.description || "";
		const content = document.getElementById("readerContent");
		content.innerHTML = "";
		content.appendChild(this.sanitizeArticleHTML(source, article.link, hero));

		if (!content.textContent.trim() && !content.querySelector("img")) {
			const note = document.createElement("p");
			note.className = "reader-note";
			note.textContent = "This feed doesn't include the article text.";
			content.appendChild(note);
		} else if (!article.content && this.htmlToText(source).length < 600) {
			const note = document.createElement("p");
			note.className = "reader-note";
			note.textContent = "This feed only shares a summary. Open the original site to read the rest.";
			content.appendChild(note);
		}

		this.applyReaderPrefs();
	}

	// Feed HTML is untrusted: keep a small set of reading tags and attributes, drop everything else.
	sanitizeArticleHTML(html, baseUrl, heroUrl) {
		// Feeds that give plain text get paragraphs instead of one run-on block
		if (!/<[a-z][\s\S]*>/i.test(html)) {
			html = html
				.split(/\n{2,}/)
				.map((p) => `<p>${this.esc(p.trim())}</p>`)
				.join("");
		}

		const doc = new DOMParser().parseFromString(html, "text/html");
		const allowed = new Set(["P", "BR", "A", "STRONG", "B", "EM", "I", "U", "S", "SUB", "SUP", "UL", "OL", "LI", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "IMG", "FIGURE", "FIGCAPTION", "PRE", "CODE", "HR", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "SPAN", "DIV"]);
		const dropped = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON", "SELECT", "TEXTAREA", "LINK", "META", "NOSCRIPT", "SVG", "VIDEO", "AUDIO", "SOURCE", "TEMPLATE", "CANVAS"]);

		const resolve = (value) => {
			try {
				return new URL(value, baseUrl || undefined);
			} catch {
				return null;
			}
		};

		[...doc.body.querySelectorAll("*")].forEach((el) => {
			if (!el.isConnected) return;
			if (dropped.has(el.tagName)) return el.remove();
			if (!allowed.has(el.tagName)) return el.replaceWith(...el.childNodes);

			const keep = el.tagName === "A" ? ["href"] : el.tagName === "IMG" ? ["src", "alt"] : [];
			[...el.attributes].forEach((attr) => {
				if (!keep.includes(attr.name)) el.removeAttribute(attr.name);
			});

			if (el.tagName === "A") {
				const url = resolve(el.getAttribute("href") || "");
				if (url && /^(https?:|mailto:)$/.test(url.protocol)) {
					el.setAttribute("href", url.href);
					el.setAttribute("target", "_blank");
					el.setAttribute("rel", "noopener noreferrer");
				} else {
					el.removeAttribute("href");
				}
			}

			if (el.tagName === "IMG") {
				const url = resolve(el.getAttribute("src") || "");
				const src = url && url.protocol.startsWith("http") ? this.parser.normalizeUrl(url.href) : "";
				// The hero already shows this picture
				if (!src || (heroUrl && src === heroUrl)) return el.remove();
				el.setAttribute("src", src);
				el.setAttribute("loading", "lazy");
				el.setAttribute("referrerpolicy", "no-referrer");
				el.addEventListener("error", () => el.remove());
			}
		});

		const fragment = document.createDocumentFragment();
		fragment.append(...doc.body.childNodes);
		return fragment;
	}

	showFolderContextMenu(event, folderId) {
		event.preventDefault();
		this.hideContextMenu();
		this.contextMenuFolderId = folderId;
		this.positionMenu(document.getElementById("folderContextMenu"), event);
	}

	showContextMenu(event, feedId) {
		event.preventDefault();
		this.hideContextMenu();
		this.contextMenuFeedId = feedId;
		this.positionMenu(document.getElementById("contextMenu"), event);
	}

	positionMenu(menu, event) {
		menu.style.display = "block";

		let x = event.pageX;
		let y = event.pageY;

		const menuWidth = menu.offsetWidth;
		const menuHeight = menu.offsetHeight;

		const windowWidth = window.innerWidth;
		const windowHeight = window.innerHeight;

		if (x + menuWidth > windowWidth) {
			x = windowWidth - menuWidth - 10;
		}

		if (y + menuHeight > windowHeight) {
			y = windowHeight - menuHeight - 10;
		}

		menu.style.left = x + "px";
		menu.style.top = y + "px";
	}

	hideContextMenu() {
		document.getElementById("contextMenu").style.display = "none";
		document.getElementById("folderContextMenu").style.display = "none";
		this.contextMenuFeedId = null;
		this.contextMenuFolderId = null;
	}

	async refreshFeed(feedId) {
		try {
			this.showLoading(true);
			const feeds = await this.db.getAllFeeds();
			const feed = feeds.find((f) => f.id === feedId);

			if (!feed) return;

			const feedData = await this.parser.fetchFeed(feed.url);

			const articles = feedData.items.map((item) => ({
				...item,
				feedId: feedId,
				bookmarked: false,
				unread: true,
				guid: item.guid || item.link,
			}));

			await this.db.addArticles(articles);
			await this.loadArticles();
		} catch (error) {
			console.error("Error refreshing feed:", error);
			alert("An error occurred while refreshing the feed.");
		} finally {
			this.showLoading(false);
		}
	}

	async deleteFeed(feedId) {
		if (confirm("Bu kaynağı silmek istediğinizden emin misiniz?")) {
			await this.db.deleteFeed(feedId);
			if (this.selectedFeedId === feedId) {
				this.selectedFeedId = null;
			}
			await this.loadFeeds();
			await this.loadArticles();
		}
	}

	async markFolderAsRead(folderId) {
		const feeds = await this.db.getAllFeeds();
		await this.markFeedAsRead(feeds.filter((f) => f.folderId === folderId).map((f) => f.id));
	}

	async markFeedAsRead(feedIds) {
		feedIds = Array.isArray(feedIds) ? feedIds : [feedIds];

		try {
			this.showLoading(true);

			for (const feedId of feedIds) {
				// Get all articles for this feed
				const articles = await this.db.getArticlesByFeed(feedId);

				// Mark each article as read
				for (const article of articles) {
					if (article.unread) {
						article.unread = 0;
						await this.db.updateArticle(article);
					}
				}
			}

			// Reload articles to reflect changes
			await this.loadArticles();
		} catch (error) {
			console.error("Error marking feed as read:", error);
			alert("An error occurred while marking the articles.");
		} finally {
			this.showLoading(false);
		}
	}

	async exportOPML() {
		try {
			const feeds = await this.db.getAllFeeds();

			if (feeds.length === 0) {
				alert("No RSS feed was found to export.");
				return;
			}

			// Create OPML XML
			let opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Bi'Bak RSS Feeds</title>
    <dateCreated>${new Date().toISOString()}</dateCreated>
    <ownerName>Bi'Bak RSS Reader</ownerName>
  </head>
  <body>
`;

			const feedOutline = (feed, indent) => {
				const escapedTitle = this.escapeXML(feed.name);
				const escapedUrl = this.escapeXML(feed.url);
				return `${indent}<outline type="rss" text="${escapedTitle}" title="${escapedTitle}" xmlUrl="${escapedUrl}" />\n`;
			};

			// Folders become group outlines; ungrouped feeds sit directly under <body>
			const folders = await this.db.getAllFolders();
			const folderIds = new Set(folders.map((f) => f.id));

			[...folders]
				.sort((a, b) => a.name.localeCompare(b.name))
				.forEach((folder) => {
					const inFolder = feeds.filter((f) => f.folderId === folder.id);
					if (inFolder.length === 0) return;
					const escapedName = this.escapeXML(folder.name);
					opmlContent += `    <outline text="${escapedName}" title="${escapedName}">\n`;
					inFolder.forEach((feed) => (opmlContent += feedOutline(feed, "      ")));
					opmlContent += `    </outline>\n`;
				});

			feeds.filter((f) => f.folderId == null || !folderIds.has(f.folderId)).forEach((feed) => (opmlContent += feedOutline(feed, "    ")));

			opmlContent += `  </body>
</opml>`;

			// Download the file
			const blob = new Blob([opmlContent], { type: "application/xml" });
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `bibak-feeds-${new Date().toISOString().split("T")[0]}.opml`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);

			alert(`${feeds.length} RSS feed was successfully exported.`);
		} catch (error) {
			console.error("OPML export error:", error);
			alert("An error occurred during OPML export.");
		}
	}

	escapeXML(str) {
		if (!str) return "";
		return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
	}

	showLoading(show) {
		const loadingState = document.getElementById("loadingState");
		loadingState.style.display = show ? "flex" : "none";
	}
}

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
	new BibakRSSReader();
	lucide.createIcons();
});
