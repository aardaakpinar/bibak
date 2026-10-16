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

		this.init();
	}

	async init() {
		await this.db.init();
		this.setupEventListeners();
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
			container.innerHTML = "";

			const feeds = await this.db.getAllFeeds();
			const feedMap = {};
			feeds.forEach((feed) => {
				feedMap[feed.id] = feed.name;
			});

			// Sort by date
			articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

			articles.forEach((article) => {
				const card = this.createArticleCard(article, feedMap[article.feedId]);
				container.appendChild(card);
			});
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

		const label = document.createElement("span");
		label.textContent = name;
		button.appendChild(label);

		// Set active class
		if (this.selectedFeedId === feedId) {
			button.classList.add("active");
		}

		// Drag onto a folder to organize
		button.draggable = true;
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

		return button;
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
			container.innerHTML = "";

			const feeds = await this.db.getAllFeeds();
			const feedMap = {};
			feeds.forEach((feed) => {
				feedMap[feed.id] = feed.name;
			});

			articles.forEach((article) => {
				const card = this.createArticleCard(article, feedMap[article.feedId]);
				container.appendChild(card);
			});
		}

		this.showLoading(false);
	}

	createArticleCard(article, feedName) {
		const card = document.createElement("div");
		card.className = `article-card ${article.unread ? "unread" : ""}`;

		const cleanDescription = article.description ? article.description.replace(/<[^>]*>/g, "").substring(0, 200) : "";

		card.innerHTML = `
      <div class="article-header">
        <span class="article-source">${feedName || "Kaynak"}</span>
        <div class="article-buttons">
          <button class="unread-btn ${article.unread ? "unread" : ""}" data-article-id="${article.id}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="1"></circle>
            </svg>
          </button>
          <button class="bookmark-btn ${article.bookmarked ? "bookmarked" : ""}" data-article-id="${article.id}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
            </svg>
          </button>
        </div>
      </div>
      <h3 class="article-title">${article.title}</h3>
      <p class="article-description">${cleanDescription}</p>
      <div class="article-footer">
        <span>${this.parser.formatDate(article.pubDate)}</span>
      </div>
    `;

		card.addEventListener("click", async (e) => {
			if (!e.target.closest(".bookmark-btn") && !e.target.closest(".unread-btn")) {
				// Mark as read when opening
				if (article.unread) {
					await this.db.markArticleAsRead(article.id);
					article.unread = false;
				}
				window.open(article.link, "_blank");
			}
		});

		// Unread button
		const unreadBtn = card.querySelector(".unread-btn");
		unreadBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			article.unread = !article.unread;
			await this.db.updateArticle(article);
			unreadBtn.classList.toggle("unread");
			card.classList.toggle("unread");
		});

		// Bookmark button
		const bookmarkBtn = card.querySelector(".bookmark-btn");
		bookmarkBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			article.bookmarked = !article.bookmarked;
			await this.db.updateArticle(article);
			bookmarkBtn.classList.toggle("bookmarked");
		});

		return card;
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

			feeds
				.filter((f) => f.folderId == null || !folderIds.has(f.folderId))
				.forEach((feed) => (opmlContent += feedOutline(feed, "    ")));

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
