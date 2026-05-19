(function () {
  const GRID = 16;
  const MIN_SCALE = 0.25;
  const MAX_SCALE = 2.5;
  const ASSET = "./assets/figma/";
  const DEFAULT_PAGE_IDS = new Set(["first", "works", "netease", "jinbao", "wallet", "notes"]);

  const loadingScreen = document.getElementById("loadingScreen");
  const loadingCopy = document.getElementById("loadingCopy");
  const loadingTitle = document.querySelector(".loading-title");
  const app = document.getElementById("app");
  const viewport = document.getElementById("canvasViewport");
  const world = document.getElementById("canvasWorld");
  const connectionLayer = document.getElementById("connectionLayer");
  const pageList = document.getElementById("pageList");
  const minimap = document.getElementById("minimap");
  const minimapBlocks = document.getElementById("minimapBlocks");
  const minimapViewport = document.getElementById("minimapViewport");
  const zoomLabel = document.getElementById("zoomLabel");
  const addMenu = document.getElementById("addMenu");
  const modeMenu = document.getElementById("modeMenu");
  const topLoadingBar = document.getElementById("topLoadingBar");
  const hScroll = document.getElementById("horizontalScrollbar");
  const vScroll = document.getElementById("verticalScrollbar");
  const selectionBox = document.getElementById("selectionBox");
  const multiActions = document.getElementById("multiActions");
  const pageGroupAction = document.getElementById("pageGroupAction");
  const confirmDialog = document.getElementById("confirmDialog");
  const modeSwitchButton = document.getElementById("modeSwitchButton");
  const modeStatusText = document.getElementById("modeStatusText");
  const contactButton = document.getElementById("contactButton");
  const contactDialog = document.getElementById("contactDialog");
  const messageButton = document.getElementById("messageButton");
  const messageDialog = document.getElementById("messageDialog");
  const messageInput = document.getElementById("messageInput");
  const messageStatus = document.getElementById("messageStatus");
  const cancelMessage = document.getElementById("cancelMessage");
  const sendMessage = document.getElementById("sendMessage");
  const messageListDialog = document.getElementById("messageListDialog");
  const messageList = document.getElementById("messageList");
  const messageToast = document.getElementById("messageToast");
  const messageToastText = document.getElementById("messageToastText");
  const closeMessageToast = document.getElementById("closeMessageToast");
  const globalToast = document.getElementById("globalToast");
  const pdfButton = document.getElementById("pdfButton");
  const pdfDialog = document.getElementById("pdfDialog");
  const pdfPreviewArea = document.getElementById("pdfPreviewArea");
  const pdfPreviewBody = document.getElementById("pdfPreviewBody");
  const pdfDownloadLink = document.getElementById("pdfDownloadLink");
  const pdfInput = document.getElementById("pdfInput");
  const viewMessagesButton = document.getElementById("viewMessagesButton");
  const saveDefaultCanvasButton = document.getElementById("saveDefaultCanvasButton");
  const saveDefaultCanvasText = document.getElementById("saveDefaultCanvasText");
  const adminAuthDialog = document.getElementById("adminAuthDialog");
  const adminPasswordInput = document.getElementById("adminPasswordInput");
  const toggleAdminPassword = document.getElementById("toggleAdminPassword");
  const adminAuthMessage = document.getElementById("adminAuthMessage");
  const cancelAdminAuth = document.getElementById("cancelAdminAuth");
  const submitAdminAuth = document.getElementById("submitAdminAuth");
  const imageInput = document.getElementById("imageInput");
  const htmlInput = document.getElementById("htmlInput");

  const defaultPages = [
    { id: "first", title: "初遇", kind: "page", icon: "nav-default.svg", activeIcon: "nav-default-active.svg" },
    { id: "works", title: "作品探索", kind: "group", icon: "nav-default.svg", activeIcon: "nav-default-active.svg", expanded: true },
    { id: "netease", title: "网易知数", kind: "child", parent: "works", icon: "nav-netease.svg", activeIcon: "nav-netease.svg" },
    { id: "jinbao", title: "金保通", kind: "child", parent: "works", icon: "nav-jinbao.svg", activeIcon: "nav-jinbao.svg" },
    { id: "wallet", title: "钱包-加油频道", kind: "child", parent: "works", icon: "nav-wallet.svg", activeIcon: "nav-wallet.svg" },
    { id: "notes", title: "沉淀小记", kind: "page", icon: "nav-default.svg", activeIcon: "nav-default-active.svg" }
  ];

  let pages = defaultPages.map((page) => ({ ...page }));
  let activePage = "first";
  let tool = "select";
  let panX = 0;
  let panY = 0;
  let scale = 1;
  let selectedIds = new Set();
  let selectedPageIds = new Set();
  let connectStart = null;
  let pendingPageDelete = null;
  let pendingImageTarget = null;
  let pendingHtmlTarget = null;
  let spaceDown = false;
  let undoStack = [];
  let dragState = null;
  let pageDragState = null;
  let suppressNextPageClick = false;
  let fitScale = null;
  let pageTitleEditing = false;
  let recentConnectionId = null;
  let cardClipboard = null;
  let pasteOffset = 0;
  let adminMode = false;
  let adminLoginPending = false;
  let pendingAdminAction = null;
  let adminHasUnsavedChanges = false;
  let pdfjsPromise = null;
  let pdfRenderToken = 0;
  let activePdfKind = "portfolio";
  let messageBroadcastTimer = null;
  let messageBroadcastStartTimer = null;
  let messageToastTimer = null;
  let globalToastTimer = null;
  let likedMessagesForBroadcast = [];
  let likedMessageBroadcastQueue = [];
  const broadcastedMessageIds = new Set();
  const pdfPreviewCache = new Map();
  const animatedConnectionIds = new Set();

  const defaultBlocks = [
    {
      id: "avatar",
      page: "first",
      type: "imageCard",
      x: 403,
      y: 234,
      width: 200,
      height: 326,
      className: "image-card",
      layout: "vertical",
      elements: [{ id: "avatar-img", type: "image", src: "image-2.png", alt: "澶村儚" }]
    },
    {
      id: "blank",
      page: "first",
      type: "card",
      x: 830,
      y: 353,
      width: 250,
      height: 326,
      className: "placeholder-card",
      layout: "vertical",
      elements: []
    }
  ];

  let blocks = defaultBlocks.map(cloneBlock);
  let connections = [{ id: "c1", page: "first", from: "avatar", fromSide: "right", to: "blank", toSide: "left" }];

  function cloneBlock(block) {
    return {
      ...block,
      elements: (block.elements || []).map((element) => ({ ...element })),
      children: (block.children || []).map((child) => (typeof child === "string" ? child : { ...child }))
    };
  }

  function snapshot() {
    return {
      pages: pages.map((page) => ({ ...page })),
      activePage,
      blocks: blocks.map((block) => {
        const next = cloneBlock(block);
        delete next.preserveSavedSize;
        return next;
      }),
      connections: connections.map((line) => ({ ...line })),
      panX,
      panY,
      scale
    };
  }

  function createCanvasPayload() {
    return {
      version: 1,
      pages: pages.map((page) => ({ ...page })),
      activePage,
      blocks: blocks.map(cloneBlock),
      connections: connections.map((line) => ({ ...line })),
      view: { panX, panY, scale },
      updatedAt: new Date().toISOString()
    };
  }

  function applyCanvasPayload(payload) {
    if (!payload || !Array.isArray(payload.pages) || !Array.isArray(payload.blocks) || !Array.isArray(payload.connections)) return false;
    pages = payload.pages.map((page) => ({ ...page }));
    blocks = payload.blocks.map((block) => ({ ...cloneBlock(block), preserveSavedSize: true }));
    connections = payload.connections.map((line) => ({ ...line }));
    const firstNavigable = pages.find((page) => pageCanNavigate(page))?.id || "first";
    activePage = pages.some((page) => page.id === payload.activePage && pageCanNavigate(page)) ? payload.activePage : firstNavigable;
    panX = Number(payload.view?.panX) || 0;
    panY = Number(payload.view?.panY) || 0;
    scale = clamp(Number(payload.view?.scale) || 1, MIN_SCALE, MAX_SCALE);
    selectedIds = new Set();
    connectStart = null;
    undoStack = [];
    fitScale = null;
    adminHasUnsavedChanges = false;
    return true;
  }

  async function loadDefaultCanvas() {
    try {
      const response = await fetch("./api/canvas-default", { cache: "no-store" });
      if (!response.ok) return;
      applyCanvasPayload(await response.json());
      if (pages.some((page) => page.id === "first" && pageCanNavigate(page))) activePage = "first";
    } catch {
      // Static file opening keeps the built-in defaults.
    }
  }

  function saveUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > 80) undoStack.shift();
    markAdminDirty();
  }

  function restoreUndo() {
    const item = undoStack.pop();
    if (!item) return;
    markAdminDirty();
    pages = item.pages.map((page) => ({ ...page }));
    activePage = item.activePage;
    blocks = item.blocks.map(cloneBlock);
    connections = item.connections.map((line) => ({ ...line }));
    panX = item.panX;
    panY = item.panY;
    scale = item.scale;
    selectedIds = new Set();
    connectStart = null;
    renderAll();
  }

  function isTextEditingTarget(target) {
    return Boolean(target?.closest?.('[contenteditable="true"], input, textarea'));
  }

  function collectCopyBlockIds() {
    const ids = new Set([...selectedIds]);
    [...ids].forEach((blockId) => {
      const block = blocks.find((item) => item.id === blockId);
      if (block?.type === "group") {
        childBlocks(block.id).forEach((child) => ids.add(child.id));
      }
    });
    return ids;
  }

  function buildCardClipboardPayload() {
    const ids = collectCopyBlockIds();
    const copiedBlocks = blocks.filter((block) => ids.has(block.id)).map((block) => {
      const next = cloneBlock(block);
      if (next.parentGroup && !ids.has(next.parentGroup)) {
        const pos = getBlockAbsolutePosition(block);
        next.x = pos.x;
        next.y = pos.y;
        delete next.parentGroup;
      }
      return next;
    });
    if (!copiedBlocks.length) return null;
    const boundsBlocks = copiedBlocks.filter((block) => !block.parentGroup);
    const minX = Math.min(...boundsBlocks.map((block) => block.x));
    const minY = Math.min(...boundsBlocks.map((block) => block.y));
    const maxX = Math.max(...boundsBlocks.map((block) => block.x + block.width));
    const maxY = Math.max(...boundsBlocks.map((block) => block.y + block.height));
    const copiedConnections = connections
      .filter((line) => ids.has(line.from) && ids.has(line.to))
      .map((line) => ({ ...line }));
    return {
      kind: "dreamate-card-clipboard",
      version: 1,
      sourcePage: activePage,
      bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      blocks: copiedBlocks,
      connections: copiedConnections
    };
  }

  async function copySelectedCards() {
    const payload = buildCardClipboardPayload();
    if (!payload) return;
    cardClipboard = payload;
    pasteOffset = 0;
    const text = JSON.stringify(payload);
    try {
      localStorage.setItem("dreamateCardClipboard", text);
    } catch {
      // Local fallback keeps copy/paste working when persistent storage is blocked.
    }
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // Local fallback keeps copy/paste working when browser clipboard access is blocked.
    }
  }

  function readCardClipboardPayload() {
    if (cardClipboard) return cardClipboard;
    try {
      const text = localStorage.getItem("dreamateCardClipboard");
      if (text) {
        const payload = JSON.parse(text);
        if (payload?.kind === "dreamate-card-clipboard" && Array.isArray(payload.blocks)) return payload;
      }
    } catch {
      // Ignore unavailable storage or invalid stored clipboard data.
    }
    return null;
  }

  function pasteCardsFromPayload(payload) {
    if (!payload?.blocks?.length) return;
    saveUndo();
    pasteOffset += GRID * 2;
    const idMap = new Map(payload.blocks.map((block) => [block.id, id("copy")]));
    const copiedIds = new Set(payload.blocks.map((block) => block.id));
    const sourceBounds = payload.bounds || getBounds(payload.blocks.filter((block) => !block.parentGroup));
    const rect = viewport.getBoundingClientRect();
    const center = screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const baseX = payload.sourcePage === activePage ? sourceBounds.x + pasteOffset : center.x - sourceBounds.width / 2;
    const baseY = payload.sourcePage === activePage ? sourceBounds.y + pasteOffset : center.y - sourceBounds.height / 2;
    const pastedBlocks = payload.blocks.map((block) => {
      const next = cloneBlock(block);
      next.id = idMap.get(block.id);
      next.page = activePage;
      next.x = block.x - sourceBounds.x + baseX;
      next.y = block.y - sourceBounds.y + baseY;
      next.elements = (next.elements || []).map((element) => ({ ...element, id: id("el") }));
      if (next.parentGroup && idMap.has(next.parentGroup)) next.parentGroup = idMap.get(next.parentGroup);
      else delete next.parentGroup;
      next.children = (next.children || []).filter((child) => copiedIds.has(child)).map((child) => idMap.get(child));
      return next;
    });
    const pastedConnections = (payload.connections || []).map((line) => ({
      ...line,
      id: id("line"),
      page: activePage,
      from: idMap.get(line.from),
      to: idMap.get(line.to)
    })).filter((line) => line.from && line.to);
    blocks.push(...pastedBlocks);
    connections.push(...pastedConnections);
    selectedIds = new Set(pastedBlocks.filter((block) => !block.parentGroup).map((block) => block.id));
    renderAll();
  }

  function snap(value) {
    return Math.round(value / GRID) * GRID;
  }

  function snapUp(value) {
    return Math.ceil(value / GRID) * GRID;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function elementSizeHint(element) {
    if (isTextElement(element) && element.manualSize && element.width && element.height) return { width: element.width, height: element.height };
    if (element.manualSize && element.width && element.height) return { width: element.width, height: element.height };
    if (element.type === "image" && element.intrinsicWidth && element.intrinsicHeight) {
      const maxW = 420;
      const maxH = 320;
      const ratio = Math.min(maxW / element.intrinsicWidth, maxH / element.intrinsicHeight, 1);
      return { width: Math.max(96, Math.round(element.intrinsicWidth * ratio)), height: Math.max(80, Math.round(element.intrinsicHeight * ratio)) };
    }
    if (element.type === "title") return { width: Math.min(420, (element.text || "").length * 22 + 24), height: 34 };
    if (element.type === "image") return { width: 256, height: 176 };
    const lines = (element.text || "").split(/\n/);
    return {
      width: Math.max(224, Math.min(460, Math.max(...lines.map((line) => line.length), 1) * 9 + 36)),
      height: Math.max(58, lines.length * 22 + 16)
    };
  }

  function isImageBlock(block) {
    return block?.className?.split(" ").includes("image-placeholder-card");
  }

  function isTextElement(element) {
    return element.type === "title" || element.type === "text" || element.type === "link";
  }

  function measureTextElementSize(element, width) {
    const probe = document.createElement("span");
    probe.className = element.type === "title" ? "block-title editable-text" : "block-copy editable-text";
    probe.textContent = element.text || "";
    Object.assign(probe.style, {
      position: "fixed",
      left: "-9999px",
      top: "-9999px",
      width: `${Math.max(32, width - 6)}px`,
      maxWidth: "none",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      visibility: "hidden"
    });
    document.body.appendChild(probe);
    const height = Math.ceil(probe.scrollHeight + 8);
    probe.remove();
    return {
      width,
      height: Math.max(element.type === "title" ? 34 : 30, height)
    };
  }

  function normalizeBlockSize(block) {
    if (!block || block.type === "group" || block.id === "avatar" || block.id === "blank") return;
    if (block.autoSize === false) return;
    if (block.preserveSavedSize) return;
    const elements = block.elements || [];
    if (!elements.length) return;
    const gap = 8;
    const padding = 32;
    const initialHints = elements.map(elementSizeHint);
    const targetElementWidth = block.layout === "horizontal" ? null : Math.max(...initialHints.map((item) => item.width));
    const hints = elements.map((element, index) => {
      if (isTextElement(element)) {
        return measureTextElementSize(element, block.layout === "horizontal" ? initialHints[index].width : targetElementWidth || initialHints[index].width);
      }
      return initialHints[index];
    });
    let minWidth;
    let minHeight;
    if (block.layout === "horizontal") {
      minWidth = padding + hints.reduce((sum, item) => sum + item.width, 0) + gap * Math.max(0, hints.length - 1);
      minHeight = padding + Math.max(...hints.map((item) => item.height));
    } else {
      minWidth = padding + Math.max(...hints.map((item) => item.width));
      minHeight = padding + hints.reduce((sum, item) => sum + item.height, 0) + gap * Math.max(0, hints.length - 1);
    }
    block.width = snapUp(minWidth);
    block.height = snapUp(minHeight);
  }

  function getContentFitSize(block, options = {}) {
    const elements = block?.elements || [];
    if (!elements.length) return { width: 96, height: 80 };
    const gap = 8;
    const padding = 32;
    const availableElementWidth = options.width ? Math.max(64, options.width - padding) : null;
    const hints = elements.map((element) => {
      if (options.resizeMinimum && element.type === "image") return { width: 96, height: 80 };
      if (options.resizeMinimum && block.layout !== "horizontal" && availableElementWidth && isTextElement(element)) {
        return measureTextElementSize(element, availableElementWidth);
      }
      return elementSizeHint(element);
    });
    if (block.layout === "horizontal") {
      return {
        width: snapUp(padding + hints.reduce((sum, item) => sum + item.width, 0) + gap * Math.max(0, hints.length - 1)),
        height: snapUp(padding + Math.max(...hints.map((item) => item.height)))
      };
    }
    return {
      width: snapUp(padding + Math.max(...hints.map((item) => item.width))),
      height: snapUp(padding + hints.reduce((sum, item) => sum + item.height, 0) + gap * Math.max(0, hints.length - 1))
    };
  }

  function captureElementSizes(blockId) {
    const block = blocks.find((item) => item.id === blockId);
    const node = world.querySelector(`.block[data-id="${blockId}"]`);
    if (!block || !node) return;
    node.querySelectorAll(".block-element").forEach((elementNode) => {
      const element = block.elements?.find((item) => item.id === elementNode.dataset.elementId);
      if (!element) return;
      const rect = elementNode.getBoundingClientRect();
      const canvasWidth = Math.max(24, rect.width / scale);
      const canvasHeight = Math.max(24, rect.height / scale);
      const image = elementNode.querySelector("img");
      const naturalWidth = image?.naturalWidth || element.intrinsicWidth;
      const naturalHeight = image?.naturalHeight || element.intrinsicHeight;
      if (isTextElement(element)) {
        const textNode = elementNode.querySelector(".editable-text");
        element.width = Math.max(80, Math.round(Math.max(canvasWidth, (textNode?.scrollWidth || 0) + 8)));
        element.height = Math.max(30, Math.round(Math.max(canvasHeight, (textNode?.scrollHeight || 0) + 8)));
      } else if (element.type === "image" && naturalWidth && naturalHeight) {
        element.intrinsicWidth = naturalWidth;
        element.intrinsicHeight = naturalHeight;
        const ratio = Math.min(canvasWidth / naturalWidth, canvasHeight / naturalHeight);
        element.width = Math.max(24, Math.round(naturalWidth * ratio));
        element.height = Math.max(24, Math.round(naturalHeight * ratio));
      } else {
        element.width = Math.round(canvasWidth);
        element.height = Math.round(canvasHeight);
      }
      element.manualSize = true;
    });
  }

  function activeBlocks() {
    return blocks.filter((block) => block.page === activePage);
  }

  function topLevelBlocks() {
    return activeBlocks().filter((block) => !block.parentGroup);
  }

  function childBlocks(groupId) {
    return activeBlocks().filter((block) => block.parentGroup === groupId);
  }

  function getBlockAbsolutePosition(block) {
    let x = block?.x || 0;
    let y = block?.y || 0;
    let parentId = block?.parentGroup;
    const visited = new Set();
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = blocks.find((item) => item.id === parentId);
      if (!parent) break;
      x += parent.x || 0;
      y += parent.y || 0;
      parentId = parent.parentGroup;
    }
    return { x, y };
  }

  function getBlockRect(block) {
    const pos = getBlockAbsolutePosition(block);
    return { x: pos.x, y: pos.y, width: block.width, height: block.height };
  }

  function normalizeGroupSize(group) {
    if (!group || group.type !== "group") return false;
    const children = childBlocks(group.id);
    if (!children.length) return false;
    const pad = 16;
    const minX = Math.min(...children.map((child) => child.x));
    const minY = Math.min(...children.map((child) => child.y));
    const maxX = Math.max(...children.map((child) => child.x + child.width));
    const maxY = Math.max(...children.map((child) => child.y + child.height));
    const offsetX = minX - pad;
    const offsetY = minY - pad;
    let changed = false;
    if (Math.abs(offsetX) > 0.01) {
      group.x += offsetX;
      children.forEach((child) => {
        child.x -= offsetX;
      });
      changed = true;
    }
    if (Math.abs(offsetY) > 0.01) {
      group.y += offsetY;
      children.forEach((child) => {
        child.y -= offsetY;
      });
      changed = true;
    }
    const nextWidth = maxX - minX + pad * 2;
    const nextHeight = maxY - minY + pad * 2;
    if (Math.abs(group.width - nextWidth) > 0.01) {
      group.width = nextWidth;
      changed = true;
    }
    if (Math.abs(group.height - nextHeight) > 0.01) {
      group.height = nextHeight;
      changed = true;
    }
    return changed;
  }

  function normalizeGroupSizes() {
    let changed = false;
    const movingChildGroupIds = new Set(
      dragState?.kind === "move"
        ? (dragState.originals || []).map((block) => block.parentGroup).filter(Boolean)
        : []
    );
    activeBlocks()
      .filter((block) => block.type === "group" && block.autoSize !== false && !movingChildGroupIds.has(block.id))
      .forEach((group) => {
        if (normalizeGroupSize(group)) changed = true;
      });
    return changed;
  }

  function activeConnections() {
    return connections.filter((line) => line.page === activePage);
  }

  function setTransform(animated) {
    if (animated) {
      world.style.transition = "transform 260ms ease";
      connectionLayer.style.transition = "transform 260ms ease";
      setTimeout(() => {
        world.style.transition = "";
        connectionLayer.style.transition = "";
      }, 280);
    }
    const transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    world.style.transform = transform;
    connectionLayer.style.transform = transform;
    world.style.setProperty("--inverse-scale", `${1 / scale}`);
    connectionLayer.style.setProperty("--connection-stroke", `${2 / scale}px`);
    viewport.style.setProperty("--grid", `${GRID * scale}px`);
    viewport.style.setProperty("--dot-size", `${clamp(3 * Math.sqrt(scale), 2, 3)}px`);
    viewport.style.backgroundPosition = `${panX}px ${panY}px`;
    zoomLabel.textContent = `Now: ${Math.round(scale * 100)}%`;
    updateMinimap();
    updateScrollbars();
    updateMultiActions();
  }

  function screenToCanvas(clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panX) / scale,
      y: (clientY - rect.top - panY) / scale
    };
  }

  function canvasToScreen(x, y) {
    const rect = viewport.getBoundingClientRect();
    return {
      x: rect.left + panX + x * scale,
      y: rect.top + panY + y * scale
    };
  }

  function getAnchor(block, side) {
    const blockNode = world.querySelector(`.block[data-id="${block.id}"]`);
    const pos = getBlockAbsolutePosition(block);
    if (blockNode) {
      const width = blockNode.offsetWidth || block.width;
      const height = blockNode.offsetHeight || block.height;
      const points = {
        top: { x: pos.x + width / 2, y: pos.y },
        right: { x: pos.x + width, y: pos.y + height / 2 },
        bottom: { x: pos.x + width / 2, y: pos.y + height },
        left: { x: pos.x, y: pos.y + height / 2 }
      };
      return points[side] || points.right;
    }
    const points = {
      top: { x: pos.x + block.width / 2, y: pos.y },
      right: { x: pos.x + block.width, y: pos.y + block.height / 2 },
      bottom: { x: pos.x + block.width / 2, y: pos.y + block.height },
      left: { x: pos.x, y: pos.y + block.height / 2 }
    };
    return points[side] || points.right;
  }

  function tangent(side) {
    return {
      top: { x: 0, y: -1 },
      right: { x: 1, y: 0 },
      bottom: { x: 0, y: 1 },
      left: { x: -1, y: 0 }
    }[side] || { x: 1, y: 0 };
  }

  function connectionPath(a, b, fromSide, toSide) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.hypot(dx, dy);
    const curve = clamp(distance / 2.8, 72, 160);
    const ta = tangent(fromSide);
    const tb = tangent(toSide);
    const c1 = { x: a.x + ta.x * curve, y: a.y + ta.y * curve };
    const c2 = { x: b.x + tb.x * curve, y: b.y + tb.y * curve };
    return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
  }

  function freeConnectionPath(a, b, fromSide) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const curve = clamp(distance / 2.8, 56, 148);
    const ta = tangent(fromSide);
    const c1 = { x: a.x + ta.x * curve, y: a.y + ta.y * curve };
    const approachDx = b.x - c1.x;
    const approachDy = b.y - c1.y;
    const approachDistance = Math.max(1, Math.hypot(approachDx, approachDy));
    const tail = Math.min(curve * 0.72, approachDistance * 0.48);
    const c2 = {
      x: b.x - (approachDx / approachDistance) * tail,
      y: b.y - (approachDy / approachDistance) * tail
    };
    return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
  }

  function canConnectBlocks(fromBlock, toBlock) {
    if (!fromBlock || !toBlock || fromBlock.id === toBlock.id) return false;
    const fromInside = Boolean(fromBlock.parentGroup);
    const toInside = Boolean(toBlock.parentGroup);
    if (fromInside || toInside) return fromBlock.parentGroup && fromBlock.parentGroup === toBlock.parentGroup;
    return true;
  }

  function getConnectionTarget(clientX, clientY) {
    const targetPoint = document.elementFromPoint(clientX, clientY)?.closest(".connection-point");
    const targetBlock = targetPoint?.closest(".block");
    if (!targetPoint || !targetBlock || targetBlock.dataset.id === dragState?.blockId) return null;
    const block = blocks.find((item) => item.id === targetBlock.dataset.id);
    const source = blocks.find((item) => item.id === dragState?.blockId);
    if (!canConnectBlocks(source, block)) return null;
    return {
      blockId: targetBlock.dataset.id,
      side: targetPoint.dataset.side,
      anchor: getAnchor(block, targetPoint.dataset.side)
    };
  }

  function renderConnections() {
    connectionLayer.innerHTML = "";
    activeConnections().forEach((line) => {
      const from = blocks.find((block) => block.id === line.from);
      const to = blocks.find((block) => block.id === line.to);
      if (!canConnectBlocks(from, to)) return;
      const d = connectionPath(getAnchor(from, line.fromSide), getAnchor(to, line.toSide), line.fromSide, line.toSide);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", `connection-path${line.id === recentConnectionId ? " is-new" : ""}`);
      path.setAttribute("d", d);
      connectionLayer.appendChild(path);
      if (line.id === recentConnectionId && !animatedConnectionIds.has(line.id)) {
        animateConnectionDash(path, line.id);
      }
    });
    if (dragState?.kind === "connect") {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const target = dragState.target;
      path.setAttribute("class", "connection-path connection-preview");
      path.setAttribute("d", target
        ? connectionPath(dragState.anchor, target.anchor, dragState.side, target.side)
        : freeConnectionPath(dragState.anchor, dragState.pointer, dragState.side));
      path.style.opacity = "0.58";
      connectionLayer.appendChild(path);
    }
  }

  function animateConnectionDash(path, lineId) {
    animatedConnectionIds.add(lineId);
    const start = 144;
    const duration = 5400;
    const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -9 * t));
    const startedAt = performance.now();
    path.style.strokeDashoffset = `${start}px`;
    const tick = (now) => {
      if (!path.isConnected) return;
      const progress = Math.min(1, (now - startedAt) / duration);
      const next = start * (1 - easeOutExpo(progress));
      path.style.strokeDashoffset = progress >= 0.985 ? "0px" : `${next}px`;
      if (progress < 0.985) {
        requestAnimationFrame(tick);
        return;
      }
      path.style.strokeDashoffset = "0px";
      path.classList.remove("is-new");
      if (recentConnectionId === lineId) recentConnectionId = null;
    };
    requestAnimationFrame(tick);
  }

  function makeButton(className, text, dataset) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    Object.entries(dataset || {}).forEach(([key, value]) => {
      button.dataset[key] = value;
    });
    return button;
  }

  function makeIconButton(kind, label, dataset) {
    const button = makeButton(`card-action-button ${kind}`, "", dataset);
    const icon = document.createElement("img");
    icon.alt = "";
    icon.src = `${ASSET}card-action-${kind}.svg`;
    if (kind === "more") icon.src = `${ASSET}card-action-more.png`;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.appendChild(icon);
    return button;
  }

  function resolveAssetSrc(src) {
    if (!src) return "";
    if (/^(blob:|data:|https?:|\.\/|\/)/.test(src)) return src;
    if (src.startsWith("uploads/")) return `./assets/${src}`;
    return `${ASSET}${src}`;
  }

  function normalizeLinkUrl(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^(https?:|mailto:|tel:|\.\/|\/)/i.test(text)) return text;
    if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(text)) return `https://${text}`;
    return "";
  }

  function linkElementUrl(element) {
    if (element?.htmlUrl) return element.htmlUrl;
    return normalizeLinkUrl(element?.href || element?.text);
  }

  function openLinkElement(element) {
    const url = linkElementUrl(element);
    if (!url) {
      showGlobalToast("这个链接暂时不可用。");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function createElementNode(block, element) {
    const wrapper = document.createElement("div");
    wrapper.className = `block-element ${element.type}-element`;
    if (element.type === "link" && linkElementUrl(element)) wrapper.classList.add("has-link");
    wrapper.dataset.elementId = element.id;
    wrapper.draggable = false;
    if (block.autoSize !== false) {
      const hint = elementSizeHint(element);
      wrapper.style.width = `${hint.width}px`;
      if (element.type === "image") wrapper.style.height = `${hint.height}px`;
    } else if (block.layout === "horizontal" && element.manualSize && element.width) {
      wrapper.style.width = `${element.width}px`;
      if (element.height) wrapper.style.height = `${element.height}px`;
    }

    if (element.type === "title" || element.type === "text" || element.type === "link") {
      const text = document.createElement("span");
      text.className = element.type === "title" ? "block-title editable-text" : "block-copy editable-text";
      text.contentEditable = "true";
      text.draggable = false;
      text.spellcheck = false;
      text.textContent = element.text || "";
      text.addEventListener("keydown", (event) => {
        if (element.type === "title" && event.key === "Enter") {
          event.preventDefault();
        }
        if (element.type !== "title" && event.key === "Enter") {
          event.stopPropagation();
        }
      });
      text.addEventListener("input", () => {
        markAdminDirty();
        element.text = text.textContent;
        element.manualSize = false;
        delete block.preserveSavedSize;
        if (block.autoSize !== false) {
          element.width = Math.max(80, Math.ceil(text.scrollWidth + 12));
          delete element.height;
          const elementNode = text.closest(".block-element");
          if (elementNode) {
            elementNode.style.width = `${element.width}px`;
            elementNode.style.height = "";
          }
          normalizeBlockSize(block);
          const blockNode = text.closest(".block");
          if (blockNode) {
            blockNode.style.width = `${block.width}px`;
            blockNode.style.height = `${block.height}px`;
            if (calibrateAutoBlockNode(blockNode)) {
              blockNode.style.width = `${block.width}px`;
              blockNode.style.height = `${block.height}px`;
            }
          }
          renderConnections();
          updateMinimap();
        }
      });
      wrapper.appendChild(text);
      if (element.type === "link") {
        const tools = document.createElement("div");
        tools.className = "link-tools";
        const upload = makeButton("admin-only", "上传HTML", { cardAction: "upload-html", elementId: element.id });
        tools.append(upload);
        wrapper.appendChild(tools);
      }
    } else if (element.type === "image") {
      const frame = document.createElement("div");
      frame.className = "media-frame";
      if (element.src) {
        const image = document.createElement("img");
        image.src = resolveAssetSrc(element.src);
        image.alt = element.alt || "";
        image.draggable = false;
        image.addEventListener("load", () => {
          if (!element.intrinsicWidth && image.naturalWidth) {
            element.intrinsicWidth = image.naturalWidth;
            element.intrinsicHeight = image.naturalHeight;
            if (block.autoSize !== false) {
              normalizeBlockSize(block);
              renderAll();
            }
          }
        }, { once: true });
        frame.appendChild(image);
      } else {
        const placeholder = document.createElement("button");
        placeholder.type = "button";
        placeholder.className = "image-placeholder";
        placeholder.textContent = "待插入图片";
        placeholder.dataset.cardAction = "replace-image";
        placeholder.dataset.elementId = element.id;
        frame.appendChild(placeholder);
      }
      const tools = document.createElement("div");
      tools.className = "image-tools";
      tools.append(makeButton("", "替换图片", { cardAction: "replace-image", elementId: element.id }));
      frame.appendChild(tools);
      wrapper.appendChild(frame);
    }

    const del = makeButton("element-delete", "", { cardAction: "delete-element", elementId: element.id });
    del.setAttribute("aria-label", "删除元素");
    wrapper.appendChild(del);
    return wrapper;
  }

  function createCardActions(block) {
    const actions = document.createElement("div");
    actions.className = "card-actions";
    actions.append(makeIconButton("delete", "删除", { cardAction: "delete-card" }));
    if (block.autoSize === false) {
      actions.classList.add("has-fit");
      actions.append(makeIconButton("fit", "适应", { cardAction: "fit-card" }));
    }
    actions.append(makeIconButton("more", "更多", { cardAction: "toggle-card-menu" }));
    if (block.parentGroup) {
      actions.append(makeIconButton("hide-bg", "隐藏背景", { cardAction: "toggle-background" }));
    }
    const menu = document.createElement("div");
    menu.className = "card-menu";
    if (block.type === "group") {
      menu.append(
        makeButton("", "删除", { cardAction: "delete-card" }),
        makeButton("", "置于顶层", { cardAction: "bring-front" }),
        makeButton("", "取消编组", { cardAction: "ungroup" })
      );
    } else if (isImageBlock(block)) {
      menu.append(
        makeButton("", "置于顶部", { cardAction: "bring-front" }),
        makeButton("", "添加图片", { cardAction: "add-image" }),
        makeButton("", "切换布局", { cardAction: "toggle-layout" })
      );
    } else {
      menu.append(
        makeButton("", "置于顶部", { cardAction: "bring-front" }),
        makeButton("", "添加标题", { cardAction: "add-title" }),
        makeButton("", "添加文本", { cardAction: "add-text" }),
        makeButton("", "添加图片", { cardAction: "add-image" }),
        makeButton("", "切换布局", { cardAction: "toggle-layout" })
      );
    }
    actions.appendChild(menu);
    return actions;
  }

  function createBlockElement(block) {
    const node = document.createElement("div");
    const hasSelectedChild = block.type === "group" && childBlocks(block.id).some((child) => selectedIds.has(child.id));
    node.className = `block ${block.type === "group" ? "group-card " : ""}${hasSelectedChild ? " child-selected" : ""}${block.className || ""}${block.hideBackground ? " hide-card-background" : ""}${block.autoSize === false ? " custom-size" : " auto-size"}${selectedIds.has(block.id) ? " selected" : ""}${selectedIds.size > 1 && selectedIds.has(block.id) ? " multi-selected" : ""}`;
    node.dataset.id = block.id;
    node.style.left = `${block.x}px`;
    node.style.top = `${block.y}px`;
    node.style.width = `${block.width}px`;
    if (block.autoSize !== false && (block.elements || []).length) {
      node.style.height = "auto";
      node.style.minHeight = `${block.height}px`;
    } else {
      node.style.height = `${block.height}px`;
      node.style.minHeight = "";
    }

    const surface = document.createElement("div");
    surface.className = "card-surface";
    node.appendChild(surface);

    if (block.type === "group") {
      childBlocks(block.id).forEach((child) => {
        normalizeBlockSize(child);
        node.appendChild(createBlockElement(child));
      });
    } else {
      const content = document.createElement("div");
      content.className = `block-content ${block.layout || "vertical"}`;
      (block.elements || []).forEach((element) => content.appendChild(createElementNode(block, element)));
      node.appendChild(content);
      const linkElement = (block.elements || []).find((element) => element.type === "link" && linkElementUrl(element));
      if (linkElement) {
        const jump = makeButton("link-jump-button", "跳转", { cardAction: "open-link", elementId: linkElement.id });
        node.appendChild(jump);
      }
    }

    node.appendChild(createCardActions(block));

    ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach((dir) => {
      const handle = document.createElement("span");
      handle.className = `resize-handle ${dir}`;
      handle.dataset.resize = dir;
      node.appendChild(handle);
    });

    ["top", "right", "bottom", "left"].forEach((side) => {
      const point = document.createElement("span");
      point.className = `connection-point ${side}${connectStart?.blockId === block.id && connectStart?.side === side ? " active" : ""}`;
      point.dataset.side = side;
      node.appendChild(point);
    });

    return node;
  }

  function calibrateAutoBlockNode(node) {
    let changed = false;
    const block = blocks.find((item) => item.id === node.dataset.id);
    const content = node.querySelector(".block-content");
    if (!block || !content || block.type === "group" || block.id === "avatar" || block.id === "blank") return false;
    if (block.preserveSavedSize) return false;
    node.querySelectorAll(".block-element").forEach((elementNode) => {
      const element = block.elements?.find((item) => item.id === elementNode.dataset.elementId);
      if (!element || !isTextElement(element)) return;
      const hint = elementSizeHint(element);
      const textNode = elementNode.querySelector(".editable-text");
      const rect = elementNode.getBoundingClientRect();
      const textWidth = textNode ? Math.ceil(textNode.scrollWidth + 8) : 0;
      const textHeight = textNode ? Math.ceil(textNode.scrollHeight + 8) : 0;
      const measuredWidth = Math.max(Math.ceil(rect.width / scale), textWidth);
      const measuredHeight = Math.max(Math.ceil(rect.height / scale), textHeight);
      if (measuredWidth > hint.width + 1 || measuredHeight > hint.height + 1) {
        element.width = Math.max(hint.width, measuredWidth);
        element.height = Math.max(hint.height, measuredHeight);
        element.manualSize = true;
        changed = true;
      }
    });
    if (changed) normalizeBlockSize(block);
    const overflowWidth = Math.max(0, content.scrollWidth - content.clientWidth);
    const overflowHeight = Math.max(0, content.scrollHeight - content.clientHeight);
    const rect = node.getBoundingClientRect();
    const naturalWidth = Math.ceil(rect.width / scale);
    const naturalHeight = Math.ceil(rect.height / scale);
    if (naturalWidth > block.width + 1) {
      block.width = snapUp(naturalWidth);
      changed = true;
    }
    if (naturalHeight > block.height + 1) {
      block.height = snapUp(naturalHeight);
      changed = true;
    }
    if (overflowWidth > 1) {
      block.width = snapUp(block.width + overflowWidth);
      changed = true;
    }
    if (overflowHeight > 1) {
      block.height = snapUp(block.height + overflowHeight);
      changed = true;
    }
    return changed;
  }

  function calibrateRenderedAutoSizes() {
    let changed = false;
    world.querySelectorAll(".block.auto-size").forEach((node) => {
      if (calibrateAutoBlockNode(node)) changed = true;
    });
    return changed;
  }

  function calibrateRenderedGroupSizes() {
    let changed = false;
    const movingChildGroupIds = new Set(
      dragState?.kind === "move"
        ? (dragState.originals || []).map((block) => block.parentGroup).filter(Boolean)
        : []
    );
    world.querySelectorAll(":scope > .block.group-card.auto-size").forEach((node) => {
      const group = blocks.find((item) => item.id === node.dataset.id);
      if (!group || group.autoSize === false || movingChildGroupIds.has(group.id)) return;
      const children = [...node.querySelectorAll(":scope > .block")];
      if (!children.length) return;
      const pad = 16;
      const border = Math.ceil(parseFloat(getComputedStyle(node).borderLeftWidth) || 0);
      const minLeft = Math.min(...children.map((child) => child.offsetLeft));
      const minTop = Math.min(...children.map((child) => child.offsetTop));
      const maxRight = Math.max(...children.map((child) => child.offsetLeft + child.offsetWidth));
      const maxBottom = Math.max(...children.map((child) => child.offsetTop + child.offsetHeight));
      const offsetX = minLeft - pad;
      const offsetY = minTop - pad;
      if (Math.abs(offsetX) > 0.01) {
        group.x += offsetX;
        childBlocks(group.id).forEach((child) => {
          child.x -= offsetX;
        });
        changed = true;
      }
      if (Math.abs(offsetY) > 0.01) {
        group.y += offsetY;
        childBlocks(group.id).forEach((child) => {
          child.y -= offsetY;
        });
        changed = true;
      }
      const nextWidth = Math.ceil(maxRight + pad + border);
      const nextHeight = Math.ceil(maxBottom + pad + border);
      if (Math.abs(group.width - nextWidth) > 0.01) {
        group.width = nextWidth;
        changed = true;
      }
      if (Math.abs(group.height - nextHeight) > 0.01) {
        group.height = nextHeight;
        changed = true;
      }
    });
    return changed;
  }

  function renderBlocks() {
    world.classList.toggle("connect-mode", tool === "connect");
    normalizeGroupSizes();
    world.innerHTML = "";
    topLevelBlocks().forEach((block) => {
      normalizeBlockSize(block);
      world.appendChild(createBlockElement(block));
    });
    if (calibrateRenderedAutoSizes()) {
      normalizeGroupSizes();
      world.innerHTML = "";
      topLevelBlocks().forEach((block) => {
        normalizeBlockSize(block);
        world.appendChild(createBlockElement(block));
      });
    }
    if (calibrateRenderedGroupSizes()) {
      world.innerHTML = "";
      topLevelBlocks().forEach((block) => {
        normalizeBlockSize(block);
        world.appendChild(createBlockElement(block));
      });
    }
    updateMultiActions();
  }

  function pageCanNavigate(page) {
    return page && page.kind !== "group";
  }

  function pageIsVisible(page) {
    if (page.kind !== "child") return true;
    const parent = pages.find((entry) => entry.id === page.parent);
    return !parent || parent.expanded;
  }

  function updatePageGroupAction(x, y) {
    const canGroup = [...selectedPageIds].filter((pageId) => pageCanNavigate(pages.find((page) => page.id === pageId))).length > 1;
    pageGroupAction.classList.toggle("visible", canGroup);
    if (!canGroup) return;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      pageGroupAction.style.left = `${Math.min(window.innerWidth - 96, x + 14)}px`;
      pageGroupAction.style.top = `${Math.min(window.innerHeight - 48, y + 12)}px`;
    }
  }

  function renderPages() {
    pageList.innerHTML = "";
    pages.forEach((page) => {
      if (!pageIsVisible(page)) return;
      const item = document.createElement("div");
      item.setAttribute("role", "button");
      item.tabIndex = 0;
      item.className = `page-item ${page.kind}${page.id === activePage ? " active" : ""}${selectedPageIds.has(page.id) ? " page-selected" : ""}`;
      item.dataset.pageId = page.id;

      if (page.kind === "group") {
        const toggle = document.createElement("span");
        toggle.className = `tree-toggle${page.expanded ? "" : " collapsed"}`;
        toggle.dataset.pageAction = "toggle-tree";
        toggle.innerHTML = `<img src="${ASSET}tree-arrow.svg" alt="">`;
        item.appendChild(toggle);
      }

      const main = document.createElement("span");
      main.className = "page-main";
      const icon = document.createElement("img");
      icon.src = `${ASSET}${page.id === activePage ? page.activeIcon : page.icon}`;
      icon.alt = "";
      const text = document.createElement("span");
      text.className = "page-title";
      text.dataset.pageTitle = "true";
      text.textContent = page.title;
      main.append(icon, text);
      item.appendChild(main);

      const del = document.createElement("span");
      del.className = "page-delete";
      del.dataset.pageAction = "delete";
      del.innerHTML = `<img src="${ASSET}${page.id === activePage ? "page-delete-active.svg" : "page-delete.svg"}" alt="">`;
      item.appendChild(del);
      pageList.appendChild(item);
    });
  }

  function renderAll() {
    renderPages();
    renderBlocks();
    renderConnections();
    updateMinimap();
    setTransform(false);
  }

  function updateMinimap() {
    const visible = topLevelBlocks();
    minimapBlocks.innerHTML = "";
    if (!visible.length) {
      minimapViewport.style.display = "none";
      return;
    }
    minimapViewport.style.display = "block";
    const bounds = getBounds(visible);
    const padding = fitScale === scale ? 0 : 120;
    const minX = bounds.x - padding;
    const minY = bounds.y - padding;
    const width = Math.max(bounds.width + padding * 2, 320);
    const height = Math.max(bounds.height + padding * 2, 220);
    const s = Math.min(196 / width, 111 / height);
    const offsetX = (196 - width * s) / 2;
    const offsetY = (111 - height * s) / 2;

    visible.forEach((block) => {
      const mini = document.createElement("div");
      mini.className = "minimap-block";
      mini.style.left = `${offsetX + (block.x - minX) * s}px`;
      mini.style.top = `${offsetY + (block.y - minY) * s}px`;
      mini.style.width = `${Math.max(4, block.width * s)}px`;
      mini.style.height = `${Math.max(4, block.height * s)}px`;
      minimapBlocks.appendChild(mini);
    });

    const rect = viewport.getBoundingClientRect();
    minimapViewport.style.left = `${offsetX + (-panX / scale - minX) * s}px`;
    minimapViewport.style.top = `${offsetY + (-panY / scale - minY) * s}px`;
    minimapViewport.style.width = `${(rect.width / scale) * s}px`;
    minimapViewport.style.height = `${(rect.height / scale) * s}px`;
    minimapViewport.classList.toggle("fit-perfect", fitScale !== null && Math.abs(scale - fitScale) < 0.001);
  }

  function updateScrollbars() {
    let show = Math.abs(panX) > 12 || Math.abs(panY) > 12 || Math.abs(scale - 1) > 0.001;
    if (fitScale !== null) show = scale > fitScale + 0.01;
    hScroll.classList.toggle("visible", show);
    vScroll.classList.toggle("visible", show);
    const rect = viewport.getBoundingClientRect();
    const hThumb = hScroll.querySelector("span");
    const vThumb = vScroll.querySelector("span");
    hThumb.style.transform = `translateX(${clamp((-panX / (1600 * scale)) * rect.width, 0, rect.width - 360)}px)`;
    vThumb.style.transform = `translateY(${clamp((-panY / (900 * scale)) * rect.height, 0, rect.height - 166)}px)`;
  }

  function getBounds(sourceBlocks) {
    const list = sourceBlocks.length ? sourceBlocks : topLevelBlocks();
    if (!list.length) return { x: 0, y: 0, width: 0, height: 0 };
    const rects = list.map(getBlockRect);
    const minX = Math.min(...rects.map((block) => block.x));
    const minY = Math.min(...rects.map((block) => block.y));
    const maxX = Math.max(...rects.map((block) => block.x + block.width));
    const maxY = Math.max(...rects.map((block) => block.y + block.height));
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function fitContent() {
    const list = topLevelBlocks();
    if (!list.length) {
      panX = 0;
      panY = 0;
      scale = 1;
      fitScale = scale;
      setTransform(true);
      return;
    }
    const bounds = getBounds(list);
    const rect = viewport.getBoundingClientRect();
    const safeLeft = 220;
    const safeBottom = 64;
    const fitPadding = 64;
    const safeWidth = Math.max(160, rect.width - safeLeft - fitPadding * 2);
    const safeHeight = Math.max(160, rect.height - safeBottom - fitPadding * 2);
    const nextScale = clamp(Math.min(safeWidth / bounds.width, safeHeight / bounds.height), MIN_SCALE, MAX_SCALE);
    scale = nextScale;
    fitScale = nextScale;
    panX = safeLeft + fitPadding + (safeWidth - bounds.width * scale) / 2 - bounds.x * scale;
    panY = fitPadding + (safeHeight - bounds.height * scale) / 2 - bounds.y * scale;
    setTransform(true);
  }

  function zoomAt(clientX, clientY, delta) {
    const before = screenToCanvas(clientX, clientY);
    scale = clamp(scale * (delta > 0 ? 0.9 : 1.1), MIN_SCALE, MAX_SCALE);
    const rect = viewport.getBoundingClientRect();
    panX = clientX - rect.left - before.x * scale;
    panY = clientY - rect.top - before.y * scale;
    setTransform(false);
  }

  function setTool(nextTool) {
    tool = nextTool;
    document.querySelectorAll("[data-tool]").forEach((button) => {
      const active = button.dataset.tool === tool || (button.dataset.tool === "select" && tool === "hand");
      button.classList.toggle("active", active);
      const img = button.querySelector("img");
      if (button.dataset.tool === "select") {
        if (tool === "hand") img.src = `${ASSET}tool-hand-active.svg`;
        else img.src = `${ASSET}${active ? "tool-select-active.svg" : "tool-select-default.svg"}`;
      }
    });
    renderBlocks();
  }

  function defaultElementsFor(type) {
    if (type === "note") return [{ id: id("el"), type: "title", text: "便利贴" }, { id: id("el"), type: "text", text: "临时灵感会停在这里。" }];
    if (type === "image") return [{ id: id("el"), type: "image", src: "" }];
    if (type === "text") return [{ id: id("el"), type: "title", text: "文本框" }, { id: id("el"), type: "text", text: "补充一段项目说明。" }];
    if (type === "link") return [{ id: id("el"), type: "title", text: "链接卡" }, { id: id("el"), type: "link", text: "https://dreamate.local" }];
    return [];
  }

  function addBlock(type) {
    saveUndo();
    const rect = viewport.getBoundingClientRect();
    const center = screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const presets = {
      note: { width: 272, height: 176, className: "note-card" },
      image: { width: 304, height: 256, className: "image-placeholder-card" },
      text: { width: 272, height: 160, className: "text-card" },
      link: { width: 304, height: 176, className: "link-card" }
    };
    const preset = presets[type];
    const block = {
      id: id("block"),
      page: activePage,
      type: "card",
      layout: "vertical",
      autoSize: true,
      x: snap(center.x - preset.width / 2),
      y: snap(center.y - preset.height / 2),
      elements: defaultElementsFor(type),
      ...preset
    };
    normalizeBlockSize(block);
    blocks.push(block);
    selectedIds = new Set([block.id]);
    addMenu.classList.remove("open");
    renderAll();
  }

  function id(prefix) {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  function groupSelectedPages() {
    const selectedPages = pages.filter((page) => selectedPageIds.has(page.id) && pageCanNavigate(page));
    if (selectedPages.length < 2) return;
    saveUndo();
    const groupId = id("page-group");
    const firstIndex = Math.min(...selectedPages.map((page) => pages.findIndex((entry) => entry.id === page.id)));
    const selectedIdSet = new Set(selectedPages.map((page) => page.id));
    const groupPage = {
      id: groupId,
      title: "New group",
      kind: "group",
      icon: "nav-default.svg",
      activeIcon: "nav-default-active.svg",
      expanded: true
    };
    const groupedChildren = selectedPages.map((page) => ({
      ...page,
      kind: "child",
      parent: groupId
    }));
    const rest = pages.filter((page) => !selectedIdSet.has(page.id));
    rest.splice(firstIndex, 0, groupPage, ...groupedChildren);
    pages = rest;
    selectedPageIds = new Set();
    updatePageGroupAction();
    renderPages();
  }

  function removePageFromCurrentPosition(pageId) {
    const index = pages.findIndex((page) => page.id === pageId);
    if (index < 0) return null;
    return pages.splice(index, 1)[0];
  }

  function appendPageToGroup(page, groupId) {
    if (!page || page.kind === "group" || page.id === groupId) return false;
    const groupIndex = pages.findIndex((entry) => entry.id === groupId);
    if (groupIndex < 0) return false;
    page.kind = "child";
    page.parent = groupId;
    const lastChildIndex = pages.reduce((last, entry, index) => entry.parent === groupId ? index : last, groupIndex);
    pages.splice(lastChildIndex + 1, 0, page);
    return true;
  }

  function insertPageNearTarget(page, targetId, placement) {
    const targetIndex = pages.findIndex((entry) => entry.id === targetId);
    if (!page || targetIndex < 0 || page.id === targetId) return false;
    const target = pages[targetIndex];
    if (page.kind === "group" && target.kind === "child") {
      const parentIndex = pages.findIndex((entry) => entry.id === target.parent);
      if (parentIndex < 0) return false;
      const lastChildIndex = pages.reduce((last, entry, index) => entry.parent === target.parent ? index : last, parentIndex);
      pages.splice(placement === "after" ? lastChildIndex + 1 : parentIndex, 0, page);
      return true;
    }
    if (target.kind === "child") {
      page.kind = "child";
      page.parent = target.parent;
    } else if (page.kind !== "group") {
      page.kind = "page";
      delete page.parent;
    }
    pages.splice(targetIndex + (placement === "after" ? 1 : 0), 0, page);
    return true;
  }

  function finishPageDrag(event) {
    if (!pageDragState) return;
    const state = pageDragState;
    pageDragState = null;
    pageList.querySelectorAll(".page-item.drop-target, .page-item.dragging-page").forEach((item) => {
      item.classList.remove("drop-target", "dragging-page", "drop-before", "drop-after");
    });
    if (!state.started) return;
    suppressNextPageClick = true;
    const targetNode = document.elementFromPoint(event.clientX, event.clientY)?.closest(".page-item");
    const source = pages.find((page) => page.id === state.pageId);
    const target = pages.find((page) => page.id === targetNode?.dataset.pageId);
    if (!source || !target || source.id === target.id) {
      renderPages();
      return;
    }
    const targetRect = targetNode.getBoundingClientRect();
    const placement = event.clientY > targetRect.top + targetRect.height / 2 ? "after" : "before";
    saveUndo();
    const moving = removePageFromCurrentPosition(source.id);
    const moved = target.kind === "group" && moving.kind !== "group"
      ? appendPageToGroup(moving, target.id)
      : insertPageNearTarget(moving, target.id, placement);
    if (!moved && moving) pages.splice(state.originalIndex, 0, moving);
    selectedPageIds = new Set();
    updatePageGroupAction();
    renderPages();
  }

  function updatePageDragTarget(event) {
    if (!pageDragState?.started) return;
    pageList.querySelectorAll(".page-item.drop-target, .page-item.drop-before, .page-item.drop-after").forEach((item) => {
      item.classList.remove("drop-target", "drop-before", "drop-after");
    });
    const targetNode = document.elementFromPoint(event.clientX, event.clientY)?.closest(".page-item");
    if (!targetNode || targetNode.dataset.pageId === pageDragState.pageId) return;
    const target = pages.find((page) => page.id === targetNode.dataset.pageId);
    if (!target) return;
    targetNode.classList.add("drop-target");
    if (target.kind !== "group") {
      const rect = targetNode.getBoundingClientRect();
      targetNode.classList.add(event.clientY > rect.top + rect.height / 2 ? "drop-after" : "drop-before");
    }
  }

  function beginPageDrag(event) {
    if (event.button !== 0 || event.shiftKey) return;
    if (event.target.closest("[data-page-title], [data-page-action], .page-delete, .tree-toggle")) return;
    const item = event.target.closest(".page-item");
    if (!item) return;
    const page = pages.find((entry) => entry.id === item.dataset.pageId);
    if (!page) return;
    pageDragState = {
      pageId: page.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originalIndex: pages.findIndex((entry) => entry.id === page.id),
      started: false
    };
  }

  function updatePageDrag(event) {
    if (!pageDragState) return;
    const distance = Math.hypot(event.clientX - pageDragState.startClientX, event.clientY - pageDragState.startClientY);
    if (!pageDragState.started && distance < 4) return;
    pageDragState.started = true;
    selectedPageIds = new Set();
    updatePageGroupAction();
    event.preventDefault();
    pageList.querySelector(`[data-page-id="${CSS.escape(pageDragState.pageId)}"]`)?.classList.add("dragging-page");
    updatePageDragTarget(event);
  }

  function setActivePage(pageId) {
    const target = pages.find((page) => page.id === pageId);
    if (!pageCanNavigate(target)) return;
    activePage = pageId;
    selectedIds = new Set();
    panX = 0;
    panY = 0;
    scale = 1;
    fitScale = null;
    topLoadingBar.classList.add("visible");
    setTimeout(() => topLoadingBar.classList.remove("visible"), 900);
    renderAll();
    requestAnimationFrame(fitContent);
  }

  function deletePage(pageId, confirmed) {
    const page = pages.find((entry) => entry.id === pageId);
    if (!page) return;
    if (DEFAULT_PAGE_IDS.has(pageId) && !confirmed) {
      pendingPageDelete = pageId;
      confirmDialog.classList.add("open");
      confirmDialog.setAttribute("aria-hidden", "false");
      return;
    }
    saveUndo();
    const ids = page.kind === "group" ? [page.id, ...pages.filter((entry) => entry.parent === page.id).map((entry) => entry.id)] : [page.id];
    pages = pages.filter((entry) => !ids.includes(entry.id));
    selectedPageIds = new Set([...selectedPageIds].filter((idValue) => !ids.includes(idValue)));
    updatePageGroupAction();
    blocks = blocks.filter((block) => !ids.includes(block.page));
    connections = connections.filter((line) => !ids.includes(line.page));
    if (ids.includes(activePage)) activePage = pages.find((entry) => entry.kind !== "group")?.id || "first";
    renderAll();
  }

  function initLike() {
    const button = document.getElementById("likeButton");
    const icon = document.getElementById("likeIcon");
    const countNode = document.getElementById("likeCount");
    const fallbackStorageKey = "portfolioLikeCountRealFallback";
    let count = 0;
    let active = false;
    const readFallbackCount = () => Math.max(0, Number(localStorage.getItem(fallbackStorageKey)) || 0);
    const writeFallbackCount = (value) => localStorage.setItem(fallbackStorageKey, String(Math.max(0, value)));
    const renderCountDigits = (value) => {
      countNode.textContent = "";
      [...String(value)].forEach((char) => {
        const digit = document.createElement("span");
        digit.className = "count-digit";
        const track = document.createElement("span");
        track.className = "count-digit-track";
        const item = document.createElement("span");
        item.textContent = char;
        track.appendChild(item);
        digit.appendChild(track);
        countNode.appendChild(digit);
      });
    };
    const measureCountWidth = (value) => {
      const probe = countNode.cloneNode(false);
      probe.style.cssText = "position:fixed;left:-9999px;top:-9999px;display:inline-flex;visibility:hidden;";
      document.body.appendChild(probe);
      [...String(value)].forEach((char) => {
        const digit = document.createElement("span");
        digit.className = "count-digit";
        digit.textContent = char;
        probe.appendChild(digit);
      });
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    };
    const lockCountWidth = (width) => {
      countNode.style.width = `${width}px`;
      countNode.style.flexBasis = `${width}px`;
    };
    const unlockCountWidth = () => {
      countNode.style.width = "";
      countNode.style.flexBasis = "";
    };
    const animateButtonFill = (fromWidth) => {
      const toWidth = button.getBoundingClientRect().width;
      button.style.width = `${fromWidth}px`;
      button.animate(
        [
          { width: `${fromWidth}px` },
          { width: `${toWidth + 2}px`, offset: 0.72 },
          { width: `${toWidth}px` }
        ],
        { duration: 500, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
      ).finished.finally(() => {
        button.style.width = "";
      });
      button.classList.remove("like-stretching");
      void button.offsetWidth;
      button.classList.add("like-stretching");
      setTimeout(() => button.classList.remove("like-stretching"), 520);
    };
    const animateHeart = () => {
      const frame = button.querySelector(".like-icon-frame");
      frame?.animate(
        [
          { transform: "scale(0.92)" },
          { transform: "scale(1.18)", offset: 0.46 },
          { transform: "scale(1)" }
        ],
        { duration: 500, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
      );
    };
    const digitSequence = (fromDigit, toDigit) => {
      if (!Number.isFinite(fromDigit)) return [toDigit];
      const sequence = [fromDigit];
      let current = fromDigit;
      while (current !== toDigit) {
        current = (current + 1) % 10;
        sequence.push(current);
      }
      return sequence;
    };
    const changedDigitIndexes = (fromPadded, toPadded) => {
      const indexes = [];
      for (let index = toPadded.length - 1; index >= 0; index -= 1) {
        if (fromPadded[index] !== toPadded[index]) indexes.push(index);
      }
      return indexes;
    };
    const animateCount = (fromValue, toValue) => {
      const from = String(fromValue);
      const to = String(toValue);
      const maxLength = Math.max(from.length, to.length);
      const fromPadded = from.padStart(maxLength, " ");
      const toPadded = to.padStart(maxLength, " ");
      const changed = changedDigitIndexes(fromPadded, toPadded);
      const digitDuration = 240;
      const digitStagger = 180;
      const newDigitDuration = 160;
      const rollingChanged = changed.filter((index) => !(fromPadded[index] === " " && toPadded[index] !== " "));
      const rollingEndDelay = rollingChanged.length
        ? (rollingChanged.length - 1) * digitStagger + digitDuration
        : 0;
      const order = new Map(changed.map((index, orderIndex) => [index, orderIndex]));
      countNode.textContent = "";
      countNode.classList.add("rolling");
      [...toPadded].forEach((char, index) => {
        const digit = document.createElement("span");
        digit.className = "count-digit";
        if (char === " ") {
          digit.textContent = " ";
          countNode.appendChild(digit);
          return;
        }
        const fromNumber = Number(fromPadded[index]);
        const toNumber = Number(char);
        const isNewDigit = fromPadded[index] === " " && char !== " ";
        const values = isNewDigit || fromPadded[index] === char ? [toNumber] : digitSequence(fromNumber, toNumber);
        const track = document.createElement("span");
        track.className = "count-digit-track";
        values.forEach((value) => {
          const item = document.createElement("span");
          item.textContent = value;
          track.appendChild(item);
        });
        digit.appendChild(track);
        countNode.appendChild(digit);
        if (!order.has(index)) return;
        const delay = order.get(index) * digitStagger;
        if (isNewDigit) {
          const newDigitDelay = rollingEndDelay + 20;
          digit.classList.add("new-digit");
          setTimeout(() => digit.classList.add("visible"), newDigitDelay);
        } else if (values.length > 1) {
          setTimeout(() => {
            track.style.transform = `translate3d(0, -${(values.length - 1) * 18}px, 0)`;
          }, delay);
        }
      });
      const totalDuration = rollingChanged.length
        ? rollingEndDelay + (changed.length > rollingChanged.length ? newDigitDuration + 20 : 0) + 40
        : newDigitDuration + 40;
      setTimeout(() => {
        countNode.classList.remove("rolling");
        [...countNode.querySelectorAll(".count-digit")].forEach((digit, index) => {
          const char = toPadded[index];
          if (char === " ") return;
          digit.classList.remove("new-digit", "visible");
          digit.style.width = "";
          digit.style.flexBasis = "";
          digit.style.opacity = "";
          digit.style.transform = "";
          const track = digit.querySelector(".count-digit-track");
          if (track) {
            track.style.transition = "none";
            track.style.transform = "translate3d(0, 0, 0)";
            track.textContent = char;
            requestAnimationFrame(() => {
              track.style.transition = "";
            });
          }
        });
        unlockCountWidth();
      }, totalDuration + 20);
    };
    const sync = (renderValue = true) => {
      if (renderValue) renderCountDigits(count);
      button.classList.toggle("active", active);
      icon.src = `${ASSET}${active ? "like-on.svg" : "like-off.svg"}`;
    };
    sync();
    fetchJson("./api/likes")
      .then((data) => {
        count = Math.max(0, Number(data?.count) || 0);
        active = false;
        sync();
      })
      .catch(() => {
        count = readFallbackCount();
        active = false;
        sync();
      });
    button.addEventListener("click", async () => {
      const previousCount = count;
      const previousWidth = button.getBoundingClientRect().width;
      active = !active;
      if (active) {
        count += 1;
      } else {
        count = Math.max(0, count - 1);
      }
      try {
        const data = await fetchJson("./api/likes", {
          method: "POST",
          body: JSON.stringify({ delta: active ? 1 : -1 })
        });
        count = Math.max(0, Number(data?.count) || count);
      } catch {
        writeFallbackCount(count);
      }
      if (active) {
        sync(false);
        renderCountDigits(previousCount);
        lockCountWidth(measureCountWidth(count));
        animateButtonFill(previousWidth);
        animateHeart();
        requestAnimationFrame(() => animateCount(previousCount, count));
      } else {
        sync();
      }
    });
  }

  function renderAdminMode() {
    document.body.classList.toggle("admin-mode", adminMode);
    modeSwitchButton.classList.toggle("admin", adminMode);
    modeSwitchButton.classList.toggle("visitor", !adminMode);
    modeStatusText.textContent = adminMode ? "管理员模式" : "访客模式";
  }

  function markAdminDirty() {
    if (adminMode) adminHasUnsavedChanges = true;
  }

  function setAdminMessage(message, isError = false) {
    adminAuthMessage.textContent = message || "";
    adminAuthDialog.querySelector(".admin-auth-dialog")?.classList.toggle("error", isError);
  }

  function setAdminLoginPending(pending) {
    adminLoginPending = pending;
    adminPasswordInput.disabled = pending;
    toggleAdminPassword.disabled = pending;
    submitAdminAuth.disabled = pending;
    submitAdminAuth.textContent = pending ? "验证中" : "进入管理员";
  }

  function openAdminAuth(action) {
    pendingAdminAction = action || null;
    adminAuthDialog.classList.add("open");
    adminAuthDialog.setAttribute("aria-hidden", "false");
    adminPasswordInput.disabled = false;
    adminPasswordInput.value = "";
    adminPasswordInput.type = "password";
    toggleAdminPassword.classList.remove("visible");
    toggleAdminPassword.setAttribute("aria-label", "显示密码");
    setAdminMessage("");
    requestAnimationFrame(() => adminPasswordInput.focus());
  }

  function closeAdminAuth() {
    pendingAdminAction = null;
    adminAuthDialog.classList.remove("open");
    adminAuthDialog.setAttribute("aria-hidden", "true");
    setAdminLoginPending(false);
    setAdminMessage("");
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
      ...options
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      const error = new Error(data?.message || "请求失败");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function checkAdminSession() {
    try {
      await fetchJson("./api/admin/logout", { method: "POST", body: "{}" });
    } catch {
      // Static file opening or an unavailable server still starts in visitor mode.
    }
    adminMode = false;
    adminHasUnsavedChanges = false;
    renderAdminMode();
  }

  async function logoutAdmin() {
    try {
      await fetchJson("./api/admin/logout", { method: "POST", body: "{}" });
    } catch {
      // Even if the session endpoint is unavailable, the local UI can leave admin mode.
    }
    adminMode = false;
    adminHasUnsavedChanges = false;
    renderAdminMode();
    setSaveState(null, "保存");
  }

  async function loginAdmin() {
    const password = adminPasswordInput.value;
    if (!password.trim()) {
      setAdminMessage("先填一下密码。", true);
      adminPasswordInput.focus();
      return;
    }
    setAdminLoginPending(true);
    setAdminMessage("");
    try {
      await fetchJson("./api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password })
      });
      adminMode = true;
      adminHasUnsavedChanges = false;
      renderAdminMode();
      const action = pendingAdminAction;
      closeAdminAuth();
      if (action === "save") saveDefaultCanvas();
    } catch {
      setAdminMessage("密码不对，再试一次。", true);
      setAdminLoginPending(false);
      adminPasswordInput.focus();
      adminPasswordInput.select();
    }
  }

  function setSaveState(state, text) {
    saveDefaultCanvasButton.classList.remove("saving", "saved", "error");
    if (state) saveDefaultCanvasButton.classList.add(state);
    saveDefaultCanvasText.textContent = text || "保存";
  }

  function hasTransientImageSource() {
    return blocks.some((block) => (block.elements || []).some((element) => element.type === "image" && /^(blob:|data:)/.test(element.src || "")));
  }

  async function saveDefaultCanvas() {
    if (!adminMode) {
      openAdminAuth("save");
      return;
    }
    if (hasTransientImageSource()) {
      setSaveState("error", "图片需重选");
      window.setTimeout(() => setSaveState(null, "保存"), 2200);
      return;
    }
    setSaveState("saving", "保存中");
    saveDefaultCanvasButton.disabled = true;
    try {
      await fetchJson("./api/admin/canvas-default", {
        method: "POST",
        body: JSON.stringify(createCanvasPayload())
      });
      adminHasUnsavedChanges = false;
      undoStack = [];
      setSaveState("saved", "已保存");
      window.setTimeout(() => setSaveState(null, "保存"), 1400);
    } catch (error) {
      if (error.status === 401) {
        adminMode = false;
        renderAdminMode();
        setSaveState(null, "保存");
        openAdminAuth("save");
      } else {
        setSaveState("error", "保存失败");
        window.setTimeout(() => setSaveState(null, "保存"), 1800);
      }
    } finally {
      saveDefaultCanvasButton.disabled = false;
    }
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function uploadAdminAsset(file) {
    const dataUrl = await fileToDataUrl(file);
    const data = await fetchJson("./api/admin/assets", {
      method: "POST",
      body: JSON.stringify({ name: file.name, type: file.type, dataUrl })
    });
    return data.src;
  }

  async function uploadAdminPdf(file, kind) {
    const dataUrl = await fileToDataUrl(file);
    await fetchJson("./api/admin/pdf", {
      method: "POST",
      body: JSON.stringify({ kind, name: file.name, dataUrl })
    });
  }

  async function uploadAdminHtml(file) {
    const dataUrl = await fileToDataUrl(file);
    return fetchJson("./api/admin/html-assets", {
      method: "POST",
      body: JSON.stringify({ name: file.name, dataUrl })
    });
  }

  function toggleSelect(blockId, additive) {
    if (additive) {
      if (selectedIds.has(blockId)) selectedIds.delete(blockId);
      else selectedIds.add(blockId);
    } else {
      selectedIds = new Set([blockId]);
    }
  }

  function animateElementOrder(content, firstRects) {
    content.querySelectorAll(".block-element").forEach((element) => {
      const first = firstRects.get(element.dataset.elementId);
      if (!first) return;
      const last = element.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      element.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: "translate(0, 0)" }
        ],
        { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      );
    });
  }

  function reorderElementLive(blockId, fromId, toId) {
    if (!fromId || !toId || fromId === toId) return false;
    const block = blocks.find((item) => item.id === blockId);
    const blockNode = world.querySelector(`.block[data-id="${blockId}"]`);
    const content = blockNode?.querySelector(".block-content");
    if (!block || !content) return false;
    const fromIndex = block.elements.findIndex((element) => element.id === fromId);
    const toIndex = block.elements.findIndex((element) => element.id === toId);
    if (fromIndex < 0 || toIndex < 0) return false;
    const nodes = [...content.querySelectorAll(".block-element")];
    const fromNode = nodes.find((node) => node.dataset.elementId === fromId);
    const toNode = nodes.find((node) => node.dataset.elementId === toId);
    if (!fromNode || !toNode) return false;
    const firstRects = new Map(nodes.map((node) => [node.dataset.elementId, node.getBoundingClientRect()]));
    const [moved] = block.elements.splice(fromIndex, 1);
    block.elements.splice(toIndex, 0, moved);
    if (fromIndex < toIndex) toNode.after(fromNode);
    else toNode.before(fromNode);
    animateElementOrder(content, firstRects);
    return true;
  }

  function getReorderTargetId(state, clientX, clientY) {
    const block = blocks.find((item) => item.id === state.blockId);
    const blockNode = world.querySelector(`.block[data-id="${state.blockId}"]`);
    if (!block || !blockNode) return "";
    const fromIndex = block.elements.findIndex((element) => element.id === state.elementId);
    if (fromIndex < 0) return "";
    const pointer = block.layout === "horizontal" ? clientX : clientY;
    const candidates = [...blockNode.querySelectorAll(".block-element")]
      .filter((node) => node.dataset.elementId !== state.elementId)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const center = block.layout === "horizontal" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
        const index = block.elements.findIndex((element) => element.id === node.dataset.elementId);
        return { id: node.dataset.elementId, index, center, distance: Math.abs(pointer - center) };
      })
      .filter((item) => item.index >= 0 && (fromIndex > item.index ? pointer <= item.center : pointer >= item.center));
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0]?.id || "";
  }

  function getNearestReorderTargetId(state, clientX, clientY) {
    const block = blocks.find((item) => item.id === state.blockId);
    const blockNode = world.querySelector(`.block[data-id="${state.blockId}"]`);
    if (!block || !blockNode) return "";
    const pointer = block.layout === "horizontal" ? clientX : clientY;
    const candidates = [...blockNode.querySelectorAll(".block-element")]
      .filter((node) => node.dataset.elementId !== state.elementId)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const center = block.layout === "horizontal" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
        return { id: node.dataset.elementId, distance: Math.abs(pointer - center) };
      });
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0]?.id || "";
  }

  function beginSelectedBlocksMove(event, canvas) {
    event.preventDefault();
    saveUndo();
    const moveIds = [...selectedIds].filter((blockId) => {
      const item = blocks.find((candidate) => candidate.id === blockId);
      return item && (!item.parentGroup || !selectedIds.has(item.parentGroup));
    });
    const originals = moveIds.map((blockId) => cloneBlock(blocks.find((item) => item.id === blockId))).filter(Boolean);
    dragState = { kind: "move", ids: moveIds, startX: canvas.x, startY: canvas.y, originals };
    renderAll();
  }

  function beginBlockDrag(event, block, target) {
    const canvas = screenToCanvas(event.clientX, event.clientY);
    if (target.dataset.side) {
      event.stopPropagation();
      const anchor = getAnchor(block, target.dataset.side);
      connectStart = { blockId: block.id, side: target.dataset.side };
      dragState = { kind: "connect", blockId: block.id, side: target.dataset.side, anchor, pointer: canvas };
      target.classList.add("dragging");
      renderBlocks();
      renderConnections();
      return;
    }
    if (target.dataset.resize) {
      event.stopPropagation();
      saveUndo();
      block.autoSize = false;
      captureElementSizes(block.id);
      dragState = { kind: "resize", id: block.id, dir: target.dataset.resize, startX: canvas.x, startY: canvas.y, original: cloneBlock(block) };
      return;
    }
    if (target.closest(".card-actions")) return;
    if (tool === "select" && selectedIds.size > 1 && selectedIds.has(block.id) && !event.shiftKey) {
      beginSelectedBlocksMove(event, canvas);
      return;
    }
    const elementNode = target.closest(".block-element");
    const elementCount = (block.elements || []).length;
    if (target.closest(".editable-text") && !event.shiftKey) {
      dragState = {
        kind: elementCount > 1 ? "element-reorder" : "move",
        blockId: block.id,
        elementId: elementNode?.dataset.elementId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: canvas.x,
        startY: canvas.y,
        originals: [cloneBlock(block)],
        pending: true,
        saved: false,
        started: false,
        lastTargetId: elementNode?.dataset.elementId
      };
      return;
    }
    if (elementNode && elementCount > 1 && !block.className?.includes("image-card")) {
      if (!target.closest(".editable-text")) event.preventDefault();
      event.stopPropagation();
      toggleSelect(block.id, event.shiftKey);
      elementNode.classList.add("reorder-dragging");
      dragState = {
        kind: "element-reorder",
        blockId: block.id,
        elementId: elementNode.dataset.elementId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        saved: false,
        started: false,
        lastTargetId: elementNode.dataset.elementId
      };
      return;
    }
    if (tool === "select") {
      toggleSelect(block.id, event.shiftKey);
      beginSelectedBlocksMove(event, canvas);
    }
  }

  function updateDraggedBlock(event) {
    if (!dragState) return;
    if (dragState.kind === "scrollbar-x") {
      const rect = viewport.getBoundingClientRect();
      const maxThumb = Math.max(1, rect.width - 360);
      const nextThumb = clamp(dragState.startThumb + event.clientX - dragState.startClientX, 0, maxThumb);
      panX = -(nextThumb / rect.width) * 1600 * scale;
      fitScale = null;
      setTransform(false);
      return;
    }
    if (dragState.kind === "scrollbar-y") {
      const rect = viewport.getBoundingClientRect();
      const maxThumb = Math.max(1, rect.height - 166);
      const nextThumb = clamp(dragState.startThumb + event.clientY - dragState.startClientY, 0, maxThumb);
      panY = -(nextThumb / rect.height) * 900 * scale;
      fitScale = null;
      setTransform(false);
      return;
    }
    if (dragState.kind === "pan") {
      panX = dragState.startPanX + event.clientX - dragState.startClientX;
      panY = dragState.startPanY + event.clientY - dragState.startClientY;
      fitScale = null;
      setTransform(false);
      return;
    }
    if (dragState.kind === "selectbox") {
      const rect = viewport.getBoundingClientRect();
      const left = Math.min(event.clientX, dragState.startClientX) - rect.left;
      const top = Math.min(event.clientY, dragState.startClientY) - rect.top;
      const width = Math.abs(event.clientX - dragState.startClientX);
      const height = Math.abs(event.clientY - dragState.startClientY);
      Object.assign(selectionBox.style, { display: "block", left: `${left}px`, top: `${top + 56}px`, width: `${width}px`, height: `${height}px` });
      const a = screenToCanvas(Math.min(event.clientX, dragState.startClientX), Math.min(event.clientY, dragState.startClientY));
      const b = screenToCanvas(Math.max(event.clientX, dragState.startClientX), Math.max(event.clientY, dragState.startClientY));
      selectedIds = new Set(topLevelBlocks().filter((block) => block.x >= a.x && block.y >= a.y && block.x + block.width <= b.x && block.y + block.height <= b.y).map((block) => block.id));
      renderBlocks();
      return;
    }
    if (dragState.kind === "connect") {
      dragState.pointer = screenToCanvas(event.clientX, event.clientY);
      dragState.target = getConnectionTarget(event.clientX, event.clientY);
      renderConnections();
      return;
    }
    if (dragState.kind === "element-reorder") {
      const moved = Math.hypot(event.clientX - dragState.startClientX, event.clientY - dragState.startClientY);
      if (moved < 5) return;
      dragState.started = true;
      const blockNode = world.querySelector(`.block[data-id="${dragState.blockId}"]`);
      const activeElement = blockNode?.querySelector(`.block-element[data-element-id="${dragState.elementId}"]`);
      activeElement?.classList.add("reorder-dragging");
      const targetId = getReorderTargetId(dragState, event.clientX, event.clientY);
      if (targetId && targetId !== dragState.elementId && targetId !== dragState.lastTargetId) {
        if (!dragState.saved) {
          saveUndo();
          dragState.saved = true;
        }
        if (reorderElementLive(dragState.blockId, dragState.elementId, targetId)) {
          dragState.lastTargetId = targetId;
        }
      }
      return;
    }
    const canvas = screenToCanvas(event.clientX, event.clientY);
    const dx = canvas.x - dragState.startX;
    const dy = canvas.y - dragState.startY;
    if (dragState.kind === "move") {
      if (dragState.pending) {
        if (Math.hypot(event.clientX - dragState.startClientX, event.clientY - dragState.startClientY) < 5) return;
        saveUndo();
        toggleSelect(dragState.blockId || dragState.id || dragState.originals[0]?.id, event.shiftKey);
        dragState.pending = false;
      }
      dragState.originals.forEach((original) => {
        const block = blocks.find((item) => item.id === original.id);
        if (!block) return;
        block.x = snap(original.x + dx);
        block.y = snap(original.y + dy);
      });
    } else if (dragState.kind === "resize") {
      const block = blocks.find((item) => item.id === dragState.id);
      if (!block) return;
      const original = dragState.original;
      const baseMinW = 96;
      const baseMinH = 80;
      if (dragState.dir.includes("e")) block.width = snap(Math.max(baseMinW, original.width + dx));
      if (dragState.dir.includes("s")) block.height = snap(Math.max(baseMinH, original.height + dy));
      if (dragState.dir.includes("w")) {
        const nextW = snap(Math.max(baseMinW, original.width - dx));
        block.x = snap(original.x + original.width - nextW);
        block.width = nextW;
      }
      if (dragState.dir.includes("n")) {
        const nextH = snap(Math.max(baseMinH, original.height - dy));
        block.y = snap(original.y + original.height - nextH);
        block.height = nextH;
      }
      const minSize = getContentFitSize(block, { resizeMinimum: true, width: block.width });
      if (block.width < minSize.width) {
        const right = block.x + block.width;
        block.width = minSize.width;
        if (dragState.dir.includes("w")) block.x = right - block.width;
      }
      if (block.height < minSize.height) {
        const bottom = block.y + block.height;
        block.height = minSize.height;
        if (dragState.dir.includes("n")) block.y = bottom - block.height;
      }
    }
    renderBlocks();
    renderConnections();
    updateMinimap();
  }

  function endDrag(event) {
    if (dragState?.kind === "pan") viewport.classList.remove("panning");
    if (dragState?.kind === "selectbox") {
      selectionBox.style.display = "none";
      renderBlocks();
    }
    if (dragState?.kind === "element-reorder") {
      let targetId = getReorderTargetId(dragState, event.clientX, event.clientY);
      const axisDelta = Math.abs((blocks.find((item) => item.id === dragState.blockId)?.layout === "horizontal" ? event.clientX - dragState.startClientX : event.clientY - dragState.startClientY));
      if (!targetId && axisDelta > 16) {
        targetId = getNearestReorderTargetId(dragState, event.clientX, event.clientY);
      }
      if (targetId && targetId !== dragState.elementId && targetId !== dragState.lastTargetId) {
        if (!dragState.saved) {
          saveUndo();
          dragState.saved = true;
        }
        reorderElementLive(dragState.blockId, dragState.elementId, targetId);
      }
      world.querySelectorAll(".reorder-dragging").forEach((element) => element.classList.remove("reorder-dragging"));
      if (dragState.saved) renderBlocks();
      dragState = null;
      return;
    }
    if (dragState?.kind === "connect") {
      const target = getConnectionTarget(event.clientX, event.clientY) || dragState.target;
      if (target) {
        saveUndo();
        const newLineId = id("line");
        connections.push({
          id: newLineId,
          page: activePage,
          from: dragState.blockId,
          fromSide: dragState.side,
          to: target.blockId,
          toSide: target.side
        });
        recentConnectionId = newLineId;
      }
      connectStart = null;
      dragState = null;
      renderAll();
      return;
    }
    if (dragState?.kind === "move") {
      const shouldNormalizeGroups = (dragState.originals || []).some((block) => block.parentGroup);
      dragState = null;
      if (shouldNormalizeGroups) {
        normalizeGroupSizes();
        renderAll();
      }
      return;
    }
    dragState = null;
  }

  function beginPan(event) {
    dragState = {
      kind: "pan",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: panX,
      startPanY: panY
    };
    viewport.classList.add("panning");
  }

  function beginScrollbarDrag(event, axis) {
    event.preventDefault();
    event.stopPropagation();
    const rect = viewport.getBoundingClientRect();
    const startThumb = axis === "x"
      ? clamp((-panX / (1600 * scale)) * rect.width, 0, Math.max(1, rect.width - 360))
      : clamp((-panY / (900 * scale)) * rect.height, 0, Math.max(1, rect.height - 166));
    dragState = {
      kind: axis === "x" ? "scrollbar-x" : "scrollbar-y",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startThumb
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function cardAction(blockId, action, elementId, button) {
    const block = blocks.find((item) => item.id === blockId);
    if (!block) return;
    const targetElement = elementId ? block.elements?.find((element) => element.id === elementId) : null;
    if (action === "toggle-card-menu") {
      button.parentElement.querySelector(".card-menu")?.classList.toggle("open");
      return;
    }
    if (action === "open-link" && targetElement?.type === "link") {
      openLinkElement(targetElement);
      return;
    }
    if (action === "upload-html" && targetElement?.type === "link") {
      if (!adminMode) {
        openAdminAuth();
        return;
      }
      pendingHtmlTarget = { blockId, elementId };
      htmlInput.value = "";
      htmlInput.click();
      return;
    }
    if (action === "replace-image") {
      pendingImageTarget = { blockId, elementId };
      imageInput.value = "";
      imageInput.click();
      return;
    }
    saveUndo();
    if (["delete-element", "add-title", "add-text", "add-image", "toggle-layout", "fit-card"].includes(action)) {
      delete block.preserveSavedSize;
    }
    if (action === "delete-card") {
      deleteBlocks([blockId]);
    } else if (action === "delete-element") {
      block.elements = block.elements.filter((element) => element.id !== elementId);
      if (!block.elements.length && !["avatar", "blank"].includes(block.id)) {
        block.classList = "clearing";
        deleteBlocks([block.id]);
      }
      normalizeBlockSize(block);
    } else if (action === "add-title" && !isImageBlock(block)) {
      block.elements.unshift({ id: id("el"), type: "title", text: "鏍囬" });
      block.autoSize = true;
      normalizeBlockSize(block);
    } else if (action === "add-text" && !isImageBlock(block)) {
      block.elements.push({ id: id("el"), type: "text", text: "新的文本内容" });
      block.autoSize = true;
      normalizeBlockSize(block);
    } else if (action === "add-image") {
      block.elements.push({ id: id("el"), type: "image", src: "" });
      if (block.autoSize !== false) block.autoSize = true;
      normalizeBlockSize(block);
    } else if (action === "toggle-layout") {
      block.layout = block.layout === "horizontal" ? "vertical" : "horizontal";
      block.autoSize = true;
      captureElementSizes(block.id);
      normalizeBlockSize(block);
    } else if (action === "bring-front") {
      blocks = blocks.filter((item) => item.id !== block.id);
      blocks.push(block);
    } else if (action === "ungroup") {
      ungroupBlock(blockId);
    } else if (action === "fit-card") {
      captureElementSizes(blockId);
      block.autoSize = true;
      normalizeBlockSize(block);
    } else if (action === "toggle-background" && block.parentGroup) {
      block.hideBackground = !block.hideBackground;
    }
    renderAll();
  }

  function deleteBlocks(ids) {
    const idSet = new Set(ids);
    ids.forEach((idValue) => {
      childBlocks(idValue).forEach((child) => idSet.add(child.id));
    });
    blocks = blocks.filter((block) => !idSet.has(block.id));
    blocks.forEach((block) => {
      if (idSet.has(block.parentGroup)) delete block.parentGroup;
      if (block.children) block.children = block.children.filter((child) => !idSet.has(typeof child === "string" ? child : child.id));
    });
    connections = connections.filter((line) => !idSet.has(line.from) && !idSet.has(line.to));
    selectedIds = new Set([...selectedIds].filter((idValue) => !idSet.has(idValue)));
  }

  function ungroupBlock(groupId) {
    const group = blocks.find((block) => block.id === groupId && block.type === "group");
    if (!group) return;
    const children = childBlocks(groupId);
    children.forEach((child) => {
      child.x = snap(group.x + child.x);
      child.y = snap(group.y + child.y);
      delete child.parentGroup;
    });
    blocks = blocks.filter((block) => block.id !== groupId);
    selectedIds = new Set(children.map((child) => child.id));
  }

  function groupSelected() {
    const selected = topLevelBlocks().filter((block) => selectedIds.has(block.id) && block.type !== "group");
    if (selected.length < 2) return;
    saveUndo();
    selected.forEach(normalizeBlockSize);
    const bounds = getBounds(selected);
    const pad = 16;
    const groupX = bounds.x - pad;
    const groupY = bounds.y - pad;
    const groupRight = bounds.x + bounds.width + pad;
    const groupBottom = bounds.y + bounds.height + pad;
    const firstIndex = Math.min(...selected.map((block) => blocks.findIndex((item) => item.id === block.id)));
    const group = {
      id: id("group"),
      page: activePage,
      type: "group",
      className: "",
      x: groupX,
      y: groupY,
      width: groupRight - groupX,
      height: groupBottom - groupY,
      children: selected.map((block) => block.id)
    };
    blocks.splice(Math.max(0, firstIndex), 0, group);
    selected.forEach((block) => {
      block.parentGroup = group.id;
      block.x = block.x - group.x;
      block.y = block.y - group.y;
    });
    selectedIds = new Set([group.id]);
    renderAll();
  }

  function updateMultiActions() {
    if (selectedIds.size < 2) {
      multiActions.classList.remove("visible");
      return;
    }
    const selected = activeBlocks().filter((block) => selectedIds.has(block.id));
    const bounds = getBounds(selected);
    const pos = canvasToScreen(bounds.x + bounds.width, bounds.y);
    multiActions.style.left = `${pos.x - 78}px`;
    multiActions.style.top = `${pos.y - 34}px`;
    multiActions.classList.add("visible");
  }

  function reorderElement(blockId, fromId, toId) {
    const block = blocks.find((item) => item.id === blockId);
    if (!block || fromId === toId) return;
    saveUndo();
    const fromIndex = block.elements.findIndex((element) => element.id === fromId);
    const toIndex = block.elements.findIndex((element) => element.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = block.elements.splice(fromIndex, 1);
    block.elements.splice(toIndex, 0, moved);
    renderAll();
  }

  function editPageTitle(title, item, event) {
    const page = pages.find((entry) => entry.id === item.dataset.pageId);
    if (!page) return;
    event?.preventDefault();
    event?.stopPropagation();
    pageTitleEditing = true;
    const previous = page.title;
    title.contentEditable = "true";
    title.focus();
    document.getSelection()?.selectAllChildren(title);
    const finish = () => {
      title.removeEventListener("blur", finish);
      title.removeEventListener("keydown", keyHandler);
      title.contentEditable = "false";
      const next = title.textContent.trim() || previous;
      if (next !== previous) saveUndo();
      page.title = next;
      pageTitleEditing = false;
      renderPages();
    };
    const keyHandler = (keyEvent) => {
      if (keyEvent.key === "Enter") {
        keyEvent.preventDefault();
        title.blur();
      }
      if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        title.textContent = previous;
        pageTitleEditing = false;
        title.blur();
      }
    };
    title.addEventListener("blur", finish);
    title.addEventListener("keydown", keyHandler);
  }

  function openContactDialog() {
    contactDialog.classList.add("open");
    contactDialog.setAttribute("aria-hidden", "false");
    contactDialog.focus();
  }

  function closeContactDialog() {
    contactDialog.classList.remove("open");
    contactDialog.setAttribute("aria-hidden", "true");
  }

  function setMessageStatus(text, type) {
    messageStatus.textContent = text || "";
    messageStatus.classList.remove("success", "error");
    if (type) messageStatus.classList.add(type);
  }

  function showGlobalToast(text, type = "success") {
    globalToast.textContent = text;
    globalToast.className = `global-toast open ${type}`;
    globalToast.setAttribute("aria-hidden", "false");
    window.clearTimeout(globalToastTimer);
    globalToastTimer = window.setTimeout(() => {
      globalToast.classList.remove("open");
      globalToast.setAttribute("aria-hidden", "true");
    }, 2200);
  }

  function openMessageDialog() {
    messageInput.value = "";
    setMessageStatus("");
    messageDialog.classList.add("open");
    messageDialog.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => messageInput.focus());
  }

  function closeMessageDialog() {
    messageDialog.classList.remove("open");
    messageDialog.setAttribute("aria-hidden", "true");
  }

  async function submitMessage() {
    const text = messageInput.value.trim();
    if (!text) {
      setMessageStatus("先写一点想说的话吧。", "error");
      messageInput.focus();
      return;
    }
    sendMessage.disabled = true;
    setMessageStatus("发送中...");
    try {
      await fetchJson("./api/messages", {
        method: "POST",
        body: JSON.stringify({ text })
      });
      messageInput.value = "";
      closeMessageDialog();
      showGlobalToast("发送成功，我已经收到啦。");
    } catch {
      setMessageStatus("发送失败，稍后再试一次。", "error");
    } finally {
      sendMessage.disabled = false;
    }
  }

  function openMessageListDialog() {
    messageListDialog.classList.add("open");
    messageListDialog.setAttribute("aria-hidden", "false");
    loadAdminMessages();
  }

  function closeMessageListDialog() {
    messageListDialog.classList.remove("open");
    messageListDialog.setAttribute("aria-hidden", "true");
  }

  function renderAdminMessages(messages) {
    messageList.innerHTML = "";
    if (!messages.length) {
      const empty = document.createElement("div");
      empty.className = "message-list-empty";
      empty.textContent = "还没有留言。";
      messageList.appendChild(empty);
      return;
    }
    messages.forEach((item) => {
      const row = document.createElement("div");
      row.className = "message-list-item";
      row.dataset.messageId = item.id;
      const content = document.createElement("div");
      content.className = "message-list-content";
      content.textContent = item.text;
      const actions = document.createElement("div");
      actions.className = "message-list-actions";
      const like = document.createElement("button");
      like.type = "button";
      like.className = `message-icon-action${item.liked ? " liked" : ""}`;
      like.dataset.messageAction = "like";
      like.setAttribute("aria-label", item.liked ? "取消喜欢" : "喜欢");
      like.innerHTML = `<img src="${ASSET}${item.liked ? "like-on.svg" : "like-off.svg"}" alt="">`;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "message-icon-action";
      del.dataset.messageAction = "delete";
      del.setAttribute("aria-label", "删除");
      del.innerHTML = `<img src="${ASSET}page-delete.svg" alt="">`;
      actions.append(like, del);
      row.append(content, actions);
      messageList.appendChild(row);
    });
  }

  async function loadAdminMessages() {
    messageList.innerHTML = `<div class="message-list-empty">加载中...</div>`;
    try {
      const data = await fetchJson("./api/admin/messages");
      renderAdminMessages(data.messages || []);
    } catch (error) {
      if (error.status === 401) {
        closeMessageListDialog();
        adminMode = false;
        renderAdminMode();
        openAdminAuth();
      } else {
        messageList.innerHTML = `<div class="message-list-empty">加载失败。</div>`;
      }
    }
  }

  async function updateAdminMessage(id, action) {
    const row = messageList.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
    if (!row) return;
    if (action === "delete") {
      await fetchJson(`./api/admin/messages/${encodeURIComponent(id)}`, { method: "DELETE" });
      row.remove();
      if (!messageList.querySelector(".message-list-item")) renderAdminMessages([]);
      return;
    }
    const likeButton = row.querySelector("[data-message-action='like']");
    const liked = !likeButton.classList.contains("liked");
    await fetchJson(`./api/admin/messages/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ liked })
    });
    likeButton.classList.toggle("liked", liked);
    likeButton.setAttribute("aria-label", liked ? "取消喜欢" : "喜欢");
    likeButton.innerHTML = `<img src="${ASSET}${liked ? "like-on.svg" : "like-off.svg"}" alt="">`;
  }

  function hideMessageToast() {
    messageToast.classList.remove("open");
    messageToast.setAttribute("aria-hidden", "true");
    window.clearTimeout(messageToastTimer);
  }

  async function refreshLikedMessagesForBroadcast() {
    try {
      const data = await fetchJson("./api/messages/liked");
      likedMessagesForBroadcast = data.messages || [];
    } catch {
      likedMessagesForBroadcast = [];
    }
  }

  function randomIndex(length) {
    if (length <= 1) return 0;
    const values = new Uint32Array(1);
    window.crypto?.getRandomValues?.(values);
    return (values[0] || Math.floor(Math.random() * 0xffffffff)) % length;
  }

  function shuffleMessages(list) {
    const shuffled = [...list];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = randomIndex(index + 1);
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    if (shuffled.length > 1 && shuffled[0]?.id === list[0]?.id) {
      const swapIndex = 1 + randomIndex(shuffled.length - 1);
      [shuffled[0], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[0]];
    }
    return shuffled;
  }

  async function showRandomLikedMessage() {
    if (adminMode) return;
    await refreshLikedMessagesForBroadcast();
    const candidates = likedMessagesForBroadcast.filter((item) => !broadcastedMessageIds.has(item.id));
    if (!candidates.length) return;
    likedMessageBroadcastQueue = likedMessageBroadcastQueue.filter((item) => candidates.some((candidate) => candidate.id === item.id));
    if (!likedMessageBroadcastQueue.length) likedMessageBroadcastQueue = shuffleMessages(candidates);
    const item = likedMessageBroadcastQueue.shift();
    broadcastedMessageIds.add(item.id);
    const rect = messageButton.getBoundingClientRect();
    messageToast.style.right = `${Math.max(16, window.innerWidth - rect.right)}px`;
    messageToast.style.top = `${Math.round(rect.bottom + 22)}px`;
    messageToast.style.setProperty("--toast-arrow-right", `${Math.max(24, rect.width / 2)}px`);
    messageToastText.textContent = item.text;
    messageToast.classList.add("open");
    messageToast.setAttribute("aria-hidden", "false");
    window.clearTimeout(messageToastTimer);
    messageToastTimer = window.setTimeout(hideMessageToast, 10000);
  }

  function scheduleMessageBroadcast() {
    if (messageBroadcastStartTimer || messageBroadcastTimer) return;
    messageBroadcastStartTimer = window.setTimeout(() => {
      showRandomLikedMessage();
      messageBroadcastTimer = window.setInterval(showRandomLikedMessage, 180000);
    }, 10000);
  }

  function loadPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import("./assets/pdfjs/pdf.mjs").then((module) => {
        module.GlobalWorkerOptions.workerSrc = "./assets/pdfjs/pdf.worker.mjs";
        return module;
      });
    }
    return pdfjsPromise;
  }

  async function renderPdfPreview(kind) {
    activePdfKind = kind;
    const isResume = kind === "resume";
    const renderToken = ++pdfRenderToken;
    pdfPreviewArea.className = `pdf-preview-area ${isResume ? "resume-preview" : "portfolio-preview"}`;
    pdfPreviewArea.innerHTML = "";
    document.querySelectorAll(".pdf-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.pdfKind === kind);
    });
    const pdfUrl = isResume
      ? "./api/pdf?kind=resume"
      : "./api/pdf?kind=portfolio";
    pdfDownloadLink.href = pdfUrl;
    pdfDownloadLink.textContent = adminMode ? "上传最新附件" : "点击下载";
    pdfPreviewBody.scrollTop = 0;
    const cachedPages = pdfPreviewCache.get(kind);
    if (cachedPages) {
      cachedPages.forEach((page) => pdfPreviewArea.appendChild(page));
      return;
    }
    const renderedPages = [];
    pdfPreviewArea.classList.add("rendering");
    try {
      const pdfjs = await loadPdfjs();
      const documentTask = pdfjs.getDocument(pdfUrl);
      const pdf = await documentTask.promise;
      const bodyStyle = getComputedStyle(pdfPreviewBody);
      const horizontalPadding = parseFloat(bodyStyle.paddingLeft) + parseFloat(bodyStyle.paddingRight);
      const availableWidth = Math.max(320, pdfPreviewBody.clientWidth - horizontalPadding);
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (renderToken !== pdfRenderToken) return;
        const pdfPage = await pdf.getPage(pageNumber);
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const targetWidth = availableWidth;
        const cssScale = targetWidth / baseViewport.width;
        const pixelScale = cssScale * Math.min(window.devicePixelRatio || 1, 2);
        const viewport = pdfPage.getViewport({ scale: pixelScale });
        const wrapper = document.createElement("div");
        wrapper.className = "pdf-page";
        wrapper.style.width = `${targetWidth}px`;
        wrapper.style.maxWidth = "100%";
        wrapper.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        wrapper.appendChild(canvas);
        pdfPreviewArea.appendChild(wrapper);
        await pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        wrapper.classList.add("loaded");
        renderedPages.push(wrapper);
      }
      pdfPreviewCache.set(kind, renderedPages);
    } catch {
      const fallback = document.createElement("div");
      fallback.className = "pdf-page";
      fallback.style.height = "644px";
      pdfPreviewArea.appendChild(fallback);
      pdfPreviewCache.set(kind, [fallback]);
    } finally {
      if (renderToken === pdfRenderToken) pdfPreviewArea.classList.remove("rendering");
    }
  }

  function openPdfDialog() {
    pdfDownloadLink.textContent = adminMode ? "上传最新附件" : "点击下载";
    renderPdfPreview("portfolio");
    pdfDialog.classList.add("open");
    pdfDialog.setAttribute("aria-hidden", "false");
    pdfDialog.focus();
  }

  function handlePdfAction(event) {
    if (!adminMode) return;
    event.preventDefault();
    pdfInput.value = "";
    pdfInput.click();
  }

  function closePdfDialog() {
    pdfDialog.classList.remove("open");
    pdfDialog.setAttribute("aria-hidden", "true");
  }

  function bindEvents() {
    modeSwitchButton.addEventListener("click", () => {
      if (adminMode) logoutAdmin();
      else openAdminAuth();
    });
    contactButton.addEventListener("click", openContactDialog);
    contactDialog.addEventListener("pointerdown", (event) => {
      if (event.target === contactDialog) closeContactDialog();
    });
    contactDialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeContactDialog();
    });
    messageButton.addEventListener("click", openMessageDialog);
    messageDialog.addEventListener("pointerdown", (event) => {
      if (event.target === messageDialog) closeMessageDialog();
    });
    messageDialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMessageDialog();
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") submitMessage();
    });
    cancelMessage.addEventListener("click", closeMessageDialog);
    sendMessage.addEventListener("click", submitMessage);
    viewMessagesButton.addEventListener("click", openMessageListDialog);
    messageListDialog.addEventListener("pointerdown", (event) => {
      if (event.target === messageListDialog) closeMessageListDialog();
    });
    messageListDialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMessageListDialog();
    });
    messageList.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-message-action]");
      const row = event.target.closest("[data-message-id]");
      if (!button || !row) return;
      try {
        await updateAdminMessage(row.dataset.messageId, button.dataset.messageAction);
      } catch (error) {
        if (error.status === 401) {
          closeMessageListDialog();
          adminMode = false;
          renderAdminMode();
          openAdminAuth();
        }
      }
    });
    closeMessageToast.addEventListener("click", hideMessageToast);
    pdfButton.addEventListener("click", openPdfDialog);
    pdfDialog.addEventListener("pointerdown", (event) => {
      if (event.target === pdfDialog) closePdfDialog();
    });
    pdfDialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePdfDialog();
    });
    pdfDialog.addEventListener("click", (event) => {
      const tab = event.target.closest(".pdf-tab");
      if (tab) renderPdfPreview(tab.dataset.pdfKind);
    });
    pdfDownloadLink.addEventListener("click", handlePdfAction);
    pdfInput.addEventListener("change", async () => {
      const file = pdfInput.files?.[0];
      if (!file) return;
      try {
        pdfDownloadLink.textContent = "上传中";
        await uploadAdminPdf(file, activePdfKind);
        pdfPreviewCache.delete(activePdfKind);
        await renderPdfPreview(activePdfKind);
        pdfDownloadLink.textContent = "上传最新附件";
      } catch (error) {
        if (error.status === 401) {
          adminMode = false;
          renderAdminMode();
          closePdfDialog();
          openAdminAuth();
        } else {
          pdfDownloadLink.textContent = "上传失败";
          window.setTimeout(() => {
            pdfDownloadLink.textContent = adminMode ? "上传最新附件" : "点击下载";
          }, 1600);
        }
      }
    });
    cancelAdminAuth.addEventListener("click", closeAdminAuth);
    submitAdminAuth.addEventListener("click", loginAdmin);
    toggleAdminPassword.addEventListener("click", () => {
      const visible = adminPasswordInput.type === "text";
      adminPasswordInput.type = visible ? "password" : "text";
      toggleAdminPassword.classList.toggle("visible", !visible);
      toggleAdminPassword.setAttribute("aria-label", visible ? "显示密码" : "隐藏密码");
      adminPasswordInput.focus();
    });
    adminPasswordInput.addEventListener("input", () => {
      if (!adminLoginPending) setAdminMessage("");
    });
    adminAuthDialog.addEventListener("keydown", (event) => {
      if (!adminAuthDialog.classList.contains("open")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeAdminAuth();
      } else if (event.key === "Enter") {
        event.preventDefault();
        loginAdmin();
      }
    });
    saveDefaultCanvasButton.addEventListener("click", saveDefaultCanvas);

    document.getElementById("addPageButton").addEventListener("click", () => {
      saveUndo();
      const idValue = id("page");
      pages.push({ id: idValue, title: "New page", kind: "page", icon: "nav-default.svg", activeIcon: "nav-default-active.svg" });
      setActivePage(idValue);
    });

    pageList.addEventListener("click", (event) => {
      if (suppressNextPageClick) {
        suppressNextPageClick = false;
        event.preventDefault();
        return;
      }
      const item = event.target.closest(".page-item");
      if (!item) return;
      const page = pages.find((entry) => entry.id === item.dataset.pageId);
      if (!page) return;
      const title = event.target.closest("[data-page-title]");
      if (pageTitleEditing && title) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.detail > 1 && title) {
        editPageTitle(title, item, event);
        return;
      }
      if (event.target.closest("[data-page-action='delete']")) {
        event.stopPropagation();
        deletePage(page.id, false);
      } else if (event.target.closest("[data-page-action='toggle-tree']") || page.kind === "group") {
        if (!event.shiftKey) {
          selectedPageIds = new Set();
          updatePageGroupAction();
        }
        page.expanded = !page.expanded;
        markAdminDirty();
        renderPages();
      } else if (event.shiftKey && pageCanNavigate(page)) {
        if (selectedPageIds.has(page.id)) selectedPageIds.delete(page.id);
        else selectedPageIds.add(page.id);
        updatePageGroupAction(event.clientX, event.clientY);
        renderPages();
      } else {
        selectedPageIds = new Set();
        updatePageGroupAction();
        if (page.id !== activePage) setActivePage(page.id);
      }
    });

    pageList.addEventListener("pointerdown", beginPageDrag);

    pageList.addEventListener("mousedown", (event) => {
      if (event.detail < 2) return;
      const title = event.target.closest("[data-page-title]");
      const item = event.target.closest(".page-item");
      if (title && item) editPageTitle(title, item, event);
    });

    pageGroupAction.addEventListener("click", groupSelectedPages);

    pageList.addEventListener("dblclick", (event) => {
      const title = event.target.closest("[data-page-title]");
      const item = event.target.closest(".page-item");
      if (!title || !item) return;
      editPageTitle(title, item, event);
    });

    document.getElementById("cancelDeletePage").addEventListener("click", () => {
      pendingPageDelete = null;
      confirmDialog.classList.remove("open");
      confirmDialog.setAttribute("aria-hidden", "true");
    });

    document.getElementById("confirmDeletePage").addEventListener("click", () => {
      const pageId = pendingPageDelete;
      pendingPageDelete = null;
      confirmDialog.classList.remove("open");
      confirmDialog.setAttribute("aria-hidden", "true");
      if (pageId) deletePage(pageId, true);
    });

    world.addEventListener("pointerdown", (event) => {
      const actionButton = event.target.closest("[data-card-action]");
      if (actionButton) {
        event.preventDefault();
        event.stopPropagation();
        const blockNode = event.target.closest(".block");
        if (blockNode) cardAction(blockNode.dataset.id, actionButton.dataset.cardAction, actionButton.dataset.elementId, actionButton);
        return;
      }
      const node = event.target.closest(".block");
      if (!node) return;
      const block = blocks.find((item) => item.id === node.dataset.id);
      if (!block) return;
      node.setPointerCapture(event.pointerId);
      beginBlockDrag(event, block, event.target);
    });

    world.addEventListener("click", (event) => {
      if (event.detail !== 0) return;
      const button = event.target.closest("[data-card-action]");
      if (!button) return;
      event.stopPropagation();
      const blockNode = event.target.closest(".block");
      cardAction(blockNode.dataset.id, button.dataset.cardAction, button.dataset.elementId, button);
    });

    world.addEventListener("dragstart", (event) => event.preventDefault());
    world.addEventListener("dragover", (event) => event.preventDefault());
    world.addEventListener("drop", (event) => event.preventDefault());

    viewport.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".block")) return;
      selectedIds = new Set();
      renderBlocks();
      if (tool === "hand" || event.button === 1 || (spaceDown && event.button === 0)) {
        viewport.setPointerCapture(event.pointerId);
        beginPan(event);
      } else if (tool === "select" && event.button === 0) {
        dragState = { kind: "selectbox", startClientX: event.clientX, startClientY: event.clientY };
      }
    });

    window.addEventListener("pointermove", updateDraggedBlock);
    window.addEventListener("pointermove", updatePageDrag);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointerup", finishPageDrag);

    viewport.addEventListener("wheel", (event) => {
      if (tool === "zoom" || event.ctrlKey || event.metaKey) {
        event.preventDefault();
        zoomAt(event.clientX, event.clientY, event.deltaY);
        return;
      }
      if (tool === "select") {
        event.preventDefault();
        panX -= event.deltaX;
        panY -= event.deltaY;
        fitScale = null;
        setTransform(false);
      }
    }, { passive: false });

    hScroll.addEventListener("pointerdown", (event) => beginScrollbarDrag(event, "x"));
    vScroll.addEventListener("pointerdown", (event) => beginScrollbarDrag(event, "y"));

    document.querySelectorAll("[data-tool]").forEach((button) => {
      button.addEventListener("click", () => setTool(button.dataset.tool));
    });
    document.getElementById("fitButton").addEventListener("click", fitContent);
    document.getElementById("undoButton").addEventListener("click", restoreUndo);
    document.getElementById("addBlockButton").addEventListener("click", () => {
      addMenu.classList.toggle("open");
      modeMenu.classList.remove("open");
    });
    document.getElementById("modeMenuButton").addEventListener("click", () => {
      modeMenu.classList.toggle("open");
      addMenu.classList.remove("open");
    });
    addMenu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-add-type]");
      if (button) addBlock(button.dataset.addType);
    });
    modeMenu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tool-choice]");
      if (!button) return;
      setTool(button.dataset.toolChoice);
      modeMenu.classList.remove("open");
    });
    multiActions.addEventListener("click", (event) => {
      const action = event.target.closest("[data-multi-action]")?.dataset.multiAction;
      if (action === "delete") {
        saveUndo();
        deleteBlocks([...selectedIds]);
        renderAll();
      } else if (action === "group") {
        groupSelected();
      }
    });
    imageInput.addEventListener("change", async () => {
      const file = imageInput.files?.[0];
      if (!file || !pendingImageTarget) return;
      saveUndo();
      const block = blocks.find((item) => item.id === pendingImageTarget.blockId);
      const element = block?.elements.find((item) => item.id === pendingImageTarget.elementId);
      if (element) {
        delete block.preserveSavedSize;
        let src = URL.createObjectURL(file);
        if (adminMode) {
          try {
            src = await uploadAdminAsset(file);
          } catch (error) {
            if (error.status === 401) {
              adminMode = false;
              renderAdminMode();
              openAdminAuth();
            }
          }
        }
        element.src = src;
        const img = new Image();
        img.onload = () => {
          element.intrinsicWidth = img.naturalWidth;
          element.intrinsicHeight = img.naturalHeight;
          const size = elementSizeHint(element);
          element.width = size.width;
          element.height = size.height;
          if (block.autoSize !== false) {
            normalizeBlockSize(block);
            renderAll();
          }
        };
        img.src = src;
        normalizeBlockSize(block);
      }
      pendingImageTarget = null;
      renderAll();
    });
    htmlInput.addEventListener("change", async () => {
      const file = htmlInput.files?.[0];
      if (!file || !pendingHtmlTarget) return;
      if (!/\.html?$/i.test(file.name) && file.type !== "text/html") {
        showGlobalToast("请选择 HTML 文件。");
        pendingHtmlTarget = null;
        return;
      }
      const block = blocks.find((item) => item.id === pendingHtmlTarget.blockId);
      const element = block?.elements?.find((item) => item.id === pendingHtmlTarget.elementId);
      if (!block || !element || element.type !== "link") {
        pendingHtmlTarget = null;
        return;
      }
      saveUndo();
      try {
        const data = await uploadAdminHtml(file);
        element.htmlPageId = data.id;
        element.htmlUrl = data.url;
        element.href = data.url;
        if (!element.text || normalizeLinkUrl(element.text)) element.text = file.name.replace(/\.html?$/i, "") || "HTML 页面";
        delete block.preserveSavedSize;
        markAdminDirty();
        renderAll();
        showGlobalToast("HTML 已上传，可点击打开。");
      } catch (error) {
        if (error.status === 401) {
          adminMode = false;
          renderAdminMode();
          openAdminAuth();
        } else {
          showGlobalToast("HTML 上传失败。");
        }
      } finally {
        pendingHtmlTarget = null;
      }
    });
    window.addEventListener("keydown", (event) => {
      if (event.code === "Space") spaceDown = true;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        restoreUndo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && !isTextEditingTarget(event.target)) {
        event.preventDefault();
        copySelectedCards();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && !isTextEditingTarget(event.target)) {
        event.preventDefault();
        pasteCardsFromPayload(readCardClipboardPayload());
        return;
      }
      if ((event.key === "Backspace" || event.key === "Delete") && !isTextEditingTarget(event.target) && selectedIds.size) {
        event.preventDefault();
        saveUndo();
        deleteBlocks([...selectedIds]);
        renderAll();
      }
    });
    window.addEventListener("beforeunload", (event) => {
      if (!adminMode || !adminHasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "还有未保存内容，确认刷新吗";
    });
    window.addEventListener("keyup", (event) => {
      if (event.code === "Space") spaceDown = false;
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".tool-group")) {
        addMenu.classList.remove("open");
        modeMenu.classList.remove("open");
      }
      if (!event.target.closest(".card-actions")) {
        document.querySelectorAll(".card-menu.open").forEach((menu) => menu.classList.remove("open"));
      }
    });
    minimap.addEventListener("click", fitContent);
  }

  function startLoading() {
    const readyText = "点击任意按键进入首页";
    let canEnterLoading = false;
    let copyShown = false;
    let tiltFrame = 0;
    const loadingStack = loadingScreen.querySelector(".loading-stack");
    const resetLoadingTilt = () => {
      loadingStack?.style.setProperty("--loading-tilt-x", "0deg");
      loadingStack?.style.setProperty("--loading-tilt-y", "0deg");
    };
    const updateLoadingTilt = (event) => {
      if (!loadingStack) return;
      const rect = loadingScreen.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      cancelAnimationFrame(tiltFrame);
      tiltFrame = requestAnimationFrame(() => {
        loadingStack.style.setProperty("--loading-tilt-x", `${(-y * 18).toFixed(2)}deg`);
        loadingStack.style.setProperty("--loading-tilt-y", `${(x * 22).toFixed(2)}deg`);
      });
    };

    const showReady = () => {
      if (copyShown) return;
      copyShown = true;
      loadingCopy.textContent = readyText;
      loadingCopy.classList.add("visible", "ready");
      canEnterLoading = true;
    };

    const enterLoading = () => {
      if (!canEnterLoading) return;
      loadingScreen.classList.add("done");
      app.classList.remove("is-hidden");
      requestAnimationFrame(fitContent);
      scheduleMessageBroadcast();
      window.removeEventListener("pointerdown", enterLoading);
      window.removeEventListener("keydown", enterLoading);
      loadingScreen.removeEventListener("pointermove", updateLoadingTilt);
      loadingScreen.removeEventListener("pointerleave", resetLoadingTilt);
      cancelAnimationFrame(tiltFrame);
    };

    const playLottie = () => {
      if (!loadingTitle || !window.lottie) {
        window.setTimeout(showReady, 900);
        return;
      }
      loadingTitle.textContent = "";
      const animation = window.lottie.loadAnimation({
        container: loadingTitle,
        renderer: "svg",
        loop: false,
        autoplay: false,
        animationData: window.LOADING_TITLE_ANIMATION_DATA,
        rendererSettings: {
          preserveAspectRatio: "xMidYMid meet"
        }
      });
      window.__loadingTitleAnimation = animation;
      const playFromStart = () => {
        animation.goToAndPlay(0, true);
      };
      requestAnimationFrame(playFromStart);
      animation.addEventListener("data_ready", playFromStart);
      animation.addEventListener("DOMLoaded", () => {
        const totalFrames = animation.totalFrames || animation.getDuration(true) || 330;
        animation.addEventListener("enterFrame", (event) => {
          if (event.currentTime >= totalFrames * 0.9) showReady();
        });
      });
      animation.addEventListener("complete", () => {
        const lastFrame = Math.max(0, (animation.totalFrames || animation.getDuration(true) || 1) - 1);
        animation.goToAndStop(lastFrame, true);
        showReady();
      });
      animation.addEventListener("data_failed", showReady);
    };

    window.addEventListener("pointerdown", enterLoading);
    window.addEventListener("keydown", enterLoading);
    loadingScreen.addEventListener("pointermove", updateLoadingTilt);
    loadingScreen.addEventListener("pointerleave", resetLoadingTilt);

    if (window.lottie) {
      playLottie();
    } else {
      const script = document.createElement("script");
      script.src = "./assets/lottie.min.js";
      script.onload = playLottie;
      script.onerror = showReady;
      document.head.appendChild(script);
    }
    return;
    const first = "足迹拓印处，是未完的序章";
    const ready = "点击任意按键进入首页";
    let index = 0;
    let readyToEnter = false;
    let typed = "";

    loadingCopy.classList.add("visible");
    const timer = setInterval(() => {
      if (index < first.length) {
        typed += first[index];
      }
      loadingCopy.innerHTML = `${typed}<span class="cursor">_</span>`;
      index += 1;
      if (index > first.length) {
        clearInterval(timer);
        setTimeout(() => {
          loadingCopy.textContent = ready;
          loadingCopy.classList.add("ready");
          readyToEnter = true;
        }, 1500);
      }
    }, 70);

    const enter = () => {
      if (!readyToEnter) return;
      loadingScreen.classList.add("done");
      app.classList.remove("is-hidden");
      scheduleMessageBroadcast();
      window.removeEventListener("pointerdown", enter);
      window.removeEventListener("keydown", enter);
    };
    window.addEventListener("pointerdown", enter);
    window.addEventListener("keydown", enter);
  }

  async function init() {
    await loadDefaultCanvas();
    await checkAdminSession();
    initLike();
    bindEvents();
    renderAll();
    fitContent();
    startLoading();
  }

  init();
})();

