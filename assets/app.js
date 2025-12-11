class BibaRSSReader {
  constructor() {
    this.db = new RSSDatabase()
    this.parser = new RSSParser()
    this.selectedFeedId = null
    this.showBookmarked = false
    this.contextMenuFeedId = null

    this.init()
  }

  async init() {
    await this.db.init()
    this.setupEventListeners()
    await this.loadFeeds()
    await this.loadArticles()
  }

  setupEventListeners() {
    // Add feed button
    document.getElementById("addFeedBtn").addEventListener("click", () => {
      this.showAddFeedModal()
    })

    // Modal controls
    document.getElementById("closeModalBtn").addEventListener("click", () => {
      this.hideAddFeedModal()
    })

    document.getElementById("cancelBtn").addEventListener("click", () => {
      this.hideAddFeedModal()
    })

    document.getElementById("addFeedForm").addEventListener("submit", (e) => {
      e.preventDefault()
      this.addFeed()
    })

    // Close modal on outside click
    document.getElementById("addFeedModal").addEventListener("click", (e) => {
      if (e.target.id === "addFeedModal") {
        this.hideAddFeedModal()
      }
    })

    // Context menu
    document.addEventListener("click", () => {
      this.hideContextMenu()
    })

    document.getElementById("refreshFeedBtn").addEventListener("click", () => {
      if (this.contextMenuFeedId) {
        this.refreshFeed(this.contextMenuFeedId)
      }
    })

    document.getElementById("deleteFeedBtn").addEventListener("click", () => {
      if (this.contextMenuFeedId) {
        this.deleteFeed(this.contextMenuFeedId)
      }
    })

    // Mobile sidebar
    const openSidebar = document.getElementById("openSidebar")
    const closeSidebar = document.getElementById("closeSidebar")
    const sidebar = document.getElementById("sidebar")

    openSidebar.addEventListener("click", () => {
      sidebar.classList.add("mobile-active")
    })

    closeSidebar.addEventListener("click", () => {
      sidebar.classList.remove("mobile-active")
    })
  }

  showAddFeedModal() {
    document.getElementById("addFeedModal").classList.add("show")
    document.getElementById("feedUrlInput").value = ""
    document.getElementById("feedNameInput").value = ""
  }

  hideAddFeedModal() {
    document.getElementById("addFeedModal").classList.remove("show")
  }

  async addFeed() {
    const url = document.getElementById("feedUrlInput").value.trim()
    const customName = document.getElementById("feedNameInput").value.trim()

    if (!url) {
      alert("Lütfen bir RSS URL'si girin")
      return
    }

    try {
      this.showLoading(true)
      const feedData = await this.parser.fetchFeed(url)

      const feed = {
        url: url,
        name: customName || feedData.title || "İsimsiz Kaynak",
        addedAt: new Date().toISOString(),
      }

      const feedId = await this.db.addFeed(feed)

      // Save articles
      const articles = feedData.items.map((item) => ({
        ...item,
        feedId: feedId,
        bookmarked: false,
        guid: item.guid || item.link,
      }))

      await this.db.addArticles(articles)

      this.hideAddFeedModal()
      await this.loadFeeds()
      await this.loadArticles()
    } catch (error) {
      console.error("Error adding feed:", error)
      alert("RSS kaynağı eklenirken hata oluştu. URL'yi kontrol edin.")
    } finally {
      this.showLoading(false)
    }
  }

  async loadFeeds() {
    const feeds = await this.db.getAllFeeds()
    const feedSourcesContainer = document.getElementById("feedSources")

    feedSourcesContainer.innerHTML = ""

    // All feeds button (default)
    const allBtn = this.createFeedButton(null, "Tüm Makaleler")
    feedSourcesContainer.appendChild(allBtn)

    // Bookmarks button
    const bookmarkBtn = this.createFeedButton("showBookmarked", "İşaretlenenler")
    feedSourcesContainer.appendChild(bookmarkBtn)

    // Individual feed buttons
    feeds.forEach((feed) => {
      const feedBtn = this.createFeedButton(feed.id, feed.name)
      feedSourcesContainer.appendChild(feedBtn)
    })
  }

  createFeedButton(feedId, name) {
    const button = document.createElement("button")
    button.className = "feed-button"

    button.innerHTML = `<span>${name}</span>`

    // Set active class
    if (
      (feedId === null && !this.selectedFeedId && !this.showBookmarked) ||
      (feedId === "showBookmarked" && this.showBookmarked) ||
      feedId === this.selectedFeedId
    ) {
      button.classList.add("active")
    }

    button.addEventListener("click", () => {
      if (feedId === "showBookmarked") {
        if (this.showBookmarked) {
          this.showBookmarked = false
        } else {
          this.showBookmarked = true
          this.selectedFeedId = null
        }
      } else if (feedId === null) {
        if (!this.selectedFeedId && !this.showBookmarked) {
          // Already on All
        } else {
          this.selectedFeedId = null
          this.showBookmarked = false
        }
      } else {
        if (this.selectedFeedId === feedId) {
          this.selectedFeedId = null
        } else {
          this.selectedFeedId = feedId
          this.showBookmarked = false
        }
      }

      this.loadFeeds()
      this.loadArticles()
    })

    button.addEventListener("contextmenu", (e) => {
      if (feedId && feedId !== "showBookmarked") {
        e.preventDefault()
        this.showContextMenu(e, feedId)
      }
    })

    return button
  }

  async loadArticles() {
    this.showLoading(true)

    let articles

    if (this.showBookmarked) {
      articles = await this.db.getBookmarkedArticles()
    } else if (this.selectedFeedId) {
      articles = await this.db.getArticlesByFeed(this.selectedFeedId)
    } else {
      articles = await this.db.getAllArticles()
    }

    // Sort by date (newest first)
    articles.sort((a, b) => {
      const dateA = new Date(a.pubDate)
      const dateB = new Date(b.pubDate)
      return dateB - dateA
    })

    const container = document.getElementById("articlesContainer")
    const emptyState = document.getElementById("emptyState")

    if (articles.length === 0) {
      container.innerHTML = ""
      emptyState.style.display = "flex"
    } else {
      emptyState.style.display = "none"
      container.innerHTML = ""

      const feeds = await this.db.getAllFeeds()
      const feedMap = {}
      feeds.forEach((feed) => {
        feedMap[feed.id] = feed.name
      })

      articles.forEach((article) => {
        const card = this.createArticleCard(article, feedMap[article.feedId])
        container.appendChild(card)
      })
    }

    this.showLoading(false)
  }

  createArticleCard(article, feedName) {
    const card = document.createElement("div")
    card.className = "article-card"

    const cleanDescription = article.description ? article.description.replace(/<[^>]*>/g, "").substring(0, 200) : ""

    card.innerHTML = `
      <div class="article-header">
        <span class="article-source">${feedName || "Kaynak"}</span>
        <button class="bookmark-btn ${article.bookmarked ? "bookmarked" : ""}" data-article-id="${article.id}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
          </svg>
        </button>
      </div>
      <h3 class="article-title">${article.title}</h3>
      <p class="article-description">${cleanDescription}</p>
      <div class="article-footer">
        <span>${this.parser.formatDate(article.pubDate)}</span>
      </div>
    `

    card.addEventListener("click", (e) => {
      if (!e.target.closest(".bookmark-btn")) {
        window.open(article.link, "_blank")
      }
    })

    const bookmarkBtn = card.querySelector(".bookmark-btn")
    bookmarkBtn.addEventListener("click", async (e) => {
      e.stopPropagation()
      article.bookmarked = !article.bookmarked
      await this.db.updateArticle(article)
      bookmarkBtn.classList.toggle("bookmarked")
    })

    return card
  }

  showContextMenu(event, feedId) {
    event.preventDefault()
    this.contextMenuFeedId = feedId

    const menu = document.getElementById("contextMenu")
    menu.style.display = "block"

    let x = event.pageX
    let y = event.pageY

    const menuWidth = menu.offsetWidth
    const menuHeight = menu.offsetHeight

    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight

    if (x + menuWidth > windowWidth) {
      x = windowWidth - menuWidth - 10
    }

    if (y + menuHeight > windowHeight) {
      y = windowHeight - menuHeight - 10
    }

    menu.style.left = x + "px"
    menu.style.top = y + "px"
  }

  hideContextMenu() {
    document.getElementById("contextMenu").style.display = "none"
    this.contextMenuFeedId = null
  }

  async refreshFeed(feedId) {
    try {
      this.showLoading(true)
      const feeds = await this.db.getAllFeeds()
      const feed = feeds.find((f) => f.id === feedId)

      if (!feed) return

      const feedData = await this.parser.fetchFeed(feed.url)

      const articles = feedData.items.map((item) => ({
        ...item,
        feedId: feedId,
        bookmarked: false,
        guid: item.guid || item.link,
      }))

      await this.db.addArticles(articles)
      await this.loadArticles()
    } catch (error) {
      console.error("Error refreshing feed:", error)
      alert("Feed yenilenirken hata oluştu")
    } finally {
      this.showLoading(false)
    }
  }

  async deleteFeed(feedId) {
    if (confirm("Bu kaynağı silmek istediğinizden emin misiniz?")) {
      await this.db.deleteFeed(feedId)
      if (this.selectedFeedId === feedId) {
        this.selectedFeedId = null
      }
      await this.loadFeeds()
      await this.loadArticles()
    }
  }

  showLoading(show) {
    const loadingState = document.getElementById("loadingState")
    loadingState.style.display = show ? "flex" : "none"
  }
}

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  new BibaRSSReader()
})
