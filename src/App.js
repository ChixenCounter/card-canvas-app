import React, { useEffect, useRef, useState } from 'react';
import './App.css';

const HANDLE_SIZE = 8;
const isElectron = !!window.electronAPI;

// ─── Pure helpers (no React deps) ─────────────────────────────────────────────

function getHandles(card) {
  const hw = card.width / 2;
  const hh = card.height / 2;
  return [
    { id: 'tl', x: -hw, y: -hh },
    { id: 'tr', x:  hw, y: -hh },
    { id: 'bl', x: -hw, y:  hh },
    { id: 'br', x:  hw, y:  hh },
  ];
}

function rotatePoint(x, y, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

function handleWorldPos(card, handle) {
  const angle = (card.rotation || 0) * Math.PI / 180;
  const rot = rotatePoint(handle.x, handle.y, angle);
  return { x: card.x + card.width / 2 + rot.x, y: card.y + card.height / 2 + rot.y };
}

function cardHitTest(card, worldX, worldY) {
  const angle = -(card.rotation || 0) * Math.PI / 180;
  const cx = card.x + card.width / 2;
  const cy = card.y + card.height / 2;
  const rot = rotatePoint(worldX - cx, worldY - cy, angle);
  return (
    rot.x > -card.width / 2 && rot.x < card.width / 2 &&
    rot.y > -card.height / 2 && rot.y < card.height / 2
  );
}

// ─── App ───────────────────────────────────────────────────────────────────────

function App() {
  // ── UI state ──
  const [decks, setDecks] = useState([]);
  const [activeDeckIndex, setActiveDeckIndex] = useState(0);
  const [deckCount, setDeckCount] = useState(0);
  const [newDeckName, setNewDeckName] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState('info');
  const [hasSelected, setHasSelected] = useState(false);
  const [selectedLocked, setSelectedLocked] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showGrid, setShowGrid] = useState(false);
  const [gridSize, setGridSize] = useState(50);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [cardSearch, setCardSearch] = useState('');
  const [showCardList, setShowCardList] = useState(false);
  const [previewCard, setPreviewCard] = useState(null);
  const [layouts, setLayouts] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [saveLayoutName, setSaveLayoutName] = useState('');

  // ── Refs ──
  const canvasRef = useRef(null);
  const folderInputRef = useRef(null);
  const cardsOnCanvasRef = useRef([]);
  const undoStackRef = useRef([]);
  const viewportRef = useRef({ x: 0, y: 0, scale: 1 });
  const showGridRef = useRef(false);
  const gridSizeRef = useRef(50);
  const snapToGridRef = useRef(false);
  const lastClickTimeRef = useRef(0);
  const lastClickCardRef = useRef(null);
  const previewTimeoutRef = useRef(null);

  // ─── Canvas Setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resizeCanvas = () => {
      canvas.width = window.innerWidth - 320;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();

    const handleResize = () => { resizeCanvas(); redraw(); };
    window.addEventListener('resize', handleResize);

    // ── Drag state ──
    let dragCard = null;
    let dragOffsetX = 0, dragOffsetY = 0;
    let dragHandle = null;
    let dragStartX = 0, dragStartY = 0;
    let dragStartW = 0, dragStartH = 0;
    let isPanning = false;
    let panStartX = 0, panStartY = 0;

    const toWorld = (sx, sy) => {
      const vp = viewportRef.current;
      return { x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale };
    };

    const snapValue = (val) => {
      if (!snapToGridRef.current) return val;
      const gs = gridSizeRef.current;
      return Math.round(val / gs) * gs;
    };

    const getSelectedCard = () => cardsOnCanvasRef.current.find(c => c.selected);

    const hitHandle = (sx, sy) => {
      const vp = viewportRef.current;
      const sel = getSelectedCard();
      if (!sel || sel.locked) return null;
      for (const h of getHandles(sel)) {
        const wp = handleWorldPos(sel, h);
        const screenX = wp.x * vp.scale + vp.x;
        const screenY = wp.y * vp.scale + vp.y;
        if (Math.sqrt((sx - screenX) ** 2 + (sy - screenY) ** 2) <= HANDLE_SIZE + 4)
          return { card: sel, handle: h };
      }
      return null;
    };

    // ── Mouse events ──
    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { x, y } = toWorld(sx, sy);

      const handleHit = hitHandle(sx, sy);
      if (handleHit) {
        dragHandle = handleHit.handle;
        dragCard = handleHit.card;
        dragStartX = sx; dragStartY = sy;
        dragStartW = dragCard.width; dragStartH = dragCard.height;
        return;
      }

      const found = [...cardsOnCanvasRef.current].reverse().find(c => cardHitTest(c, x, y));
      cardsOnCanvasRef.current.forEach(c => c.selected = false);

      if (found) {
        const now = Date.now();
        const timeDiff = now - lastClickTimeRef.current;
        const isDoubleClick = timeDiff < 250 && timeDiff > 50 && lastClickCardRef.current === found;
        lastClickTimeRef.current = now;
        lastClickCardRef.current = found;

        if (isDoubleClick) {
          found.locked = !found.locked;
          found.selected = true;
          setHasSelected(true);
          setSelectedLocked(found.locked);
          redraw();
          return;
        }

        found.selected = true;
        setHasSelected(true);
        setSelectedLocked(found.locked || false);
        if (!found.locked) {
          dragCard = found;
          dragOffsetX = x - found.x;
          dragOffsetY = y - found.y;
        }
        redraw();
      } else {
        dragCard = null;
        setHasSelected(false);
        setSelectedLocked(false);
        lastClickTimeRef.current = 0;
        lastClickCardRef.current = null;
        isPanning = true;
        panStartX = sx - viewportRef.current.x;
        panStartY = sy - viewportRef.current.y;
        redraw();
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (dragHandle && dragCard) {
        const vp = viewportRef.current;
        const dx = (sx - dragStartX) / vp.scale;
        const dy = (sy - dragStartY) / vp.scale;
        const signX = dragHandle.id.includes('r') ? 1 : -1;
        const signY = dragHandle.id.includes('b') ? 1 : -1;
        dragCard.width = Math.max(40, dragStartW + signX * dx * 2);
        dragCard.height = Math.max(40, dragStartH + signY * dy * 2);
        redraw();
        return;
      }

      if (dragCard) {
        const { x, y } = toWorld(sx, sy);
        dragCard.x = snapValue(x - dragOffsetX);
        dragCard.y = snapValue(y - dragOffsetY);
        redraw();
      } else if (isPanning) {
        viewportRef.current.x = sx - panStartX;
        viewportRef.current.y = sy - panStartY;
        redraw();
      }

      const handleHit = hitHandle(sx, sy);
      if (handleHit) {
        const id = handleHit.handle.id;
        canvas.style.cursor = (id === 'tl' || id === 'br') ? 'nwse-resize' : 'nesw-resize';
      } else {
        canvas.style.cursor = 'crosshair';
      }
    });

    canvas.addEventListener('mouseup', () => { dragCard = null; dragHandle = null; isPanning = false; });
    canvas.addEventListener('mouseleave', () => { dragCard = null; dragHandle = null; isPanning = false; });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const vp = viewportRef.current;
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(Math.max(vp.scale * zoomFactor, 0.2), 5);
      vp.x = sx - (sx - vp.x) * (newScale / vp.scale);
      vp.y = sy - (sy - vp.y) * (newScale / vp.scale);
      vp.scale = newScale;
      setZoomLevel(Math.round(newScale * 100));
      redraw();
    }, { passive: false });

    // ── Draw lock icon helper ──
    const drawLockIcon = (card, vp) => {
      const iconSize = 18 / vp.scale;
      const iconPad = 4 / vp.scale;
      ctx.beginPath();
      ctx.arc(
        -card.width / 2 + iconPad + iconSize / 2,
        -card.height / 2 + iconPad + iconSize / 2,
        iconSize / 1.4, 0, Math.PI * 2
      );
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill();
      ctx.font = `${iconSize}px serif`;
      ctx.fillStyle = 'white';
      ctx.fillText('🔒', -card.width / 2 + iconPad, -card.height / 2 + iconPad + iconSize);
    };

    // ── Redraw ──
    const redraw = () => {
      const vp = viewportRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(vp.x, vp.y);
      ctx.scale(vp.scale, vp.scale);

      // Grid
      if (showGridRef.current) {
        const gs = gridSizeRef.current;
        const startX = Math.floor((-vp.x / vp.scale) / gs) * gs;
        const startY = Math.floor((-vp.y / vp.scale) / gs) * gs;
        const endX = startX + canvas.width / vp.scale + gs * 2;
        const endY = startY + canvas.height / vp.scale + gs * 2;

        const drawGridLines = (color, step) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1 / vp.scale;
          for (let gx = startX; gx < endX; gx += step) {
            ctx.beginPath(); ctx.moveTo(gx, startY); ctx.lineTo(gx, endY); ctx.stroke();
          }
          for (let gy = startY; gy < endY; gy += step) {
            ctx.beginPath(); ctx.moveTo(startX, gy); ctx.lineTo(endX, gy); ctx.stroke();
          }
        };
        drawGridLines('rgba(255,255,255,0.08)', gs);
        drawGridLines('rgba(255,255,255,0.15)', gs * 5);
      }

      // Cards
      cardsOnCanvasRef.current.forEach(card => {
        ctx.save();
        ctx.translate(card.x + card.width / 2, card.y + card.height / 2);
        ctx.rotate((card.rotation || 0) * Math.PI / 180);

        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 4;
        ctx.drawImage(card.image, -card.width / 2, -card.height / 2, card.width, card.height);
        ctx.shadowColor = 'transparent';

        if (card.selected) {
          ctx.strokeStyle = card.locked ? '#f59e0b' : '#00d4ff';
          ctx.lineWidth = 3 / vp.scale;
          ctx.strokeRect(-card.width / 2 - 3, -card.height / 2 - 3, card.width + 6, card.height + 6);
          if (!card.locked) {
            ctx.fillStyle = '#00d4ff';
            for (const h of getHandles(card)) {
              const hs = HANDLE_SIZE / vp.scale;
              ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
            }
          }
        }

        if (card.locked) drawLockIcon(card, vp);

        ctx.restore();
      });

      ctx.restore();
    };

    window.redraw = redraw;

    // ── Keyboard ──
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); window.dispatchEvent(new CustomEvent('triggerSave')); return; }
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); window.dispatchEvent(new CustomEvent('triggerUndo')); return; }

      const selected = cardsOnCanvasRef.current.find(c => c.selected);
      if (!selected) return;

      const list = cardsOnCanvasRef.current;
      const idx = list.findIndex(c => c.selected);

      if (!selected.locked) {
        if (e.key === 'ArrowLeft')  { e.preventDefault(); selected.rotation = (selected.rotation || 0) - 15; redraw(); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); selected.rotation = (selected.rotation || 0) + 15; redraw(); return; }
        if (e.key === 'ArrowUp' && idx > 0) {
          e.preventDefault(); [list[idx], list[idx - 1]] = [list[idx - 1], list[idx]]; redraw(); return;
        }
        if (e.key === 'ArrowDown' && idx < list.length - 1) {
          e.preventDefault(); [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]]; redraw(); return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          cardsOnCanvasRef.current = list.filter(c => !c.selected);
          redraw();
          window.dispatchEvent(new CustomEvent('cardDeleted'));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // ── Event bridge effects ──
  useEffect(() => {
    const handler = () => { setDeckCount(cardsOnCanvasRef.current.length); setHasSelected(false); setSelectedLocked(false); };
    window.addEventListener('cardDeleted', handler);
    return () => window.removeEventListener('cardDeleted', handler);
  }, []);

  useEffect(() => {
    const handleSave = () => setShowSaveDialog(true);
    const handleUndo = () => {
      if (undoStackRef.current.length === 0) return;
      const snapshot = undoStackRef.current.pop();
      cardsOnCanvasRef.current = snapshot;
      setDeckCount(snapshot.length);
      setHasSelected(false);
      setSelectedLocked(false);
      window.redraw();
    };
    window.addEventListener('triggerSave', handleSave);
    window.addEventListener('triggerUndo', handleUndo);
    return () => {
      window.removeEventListener('triggerSave', handleSave);
      window.removeEventListener('triggerUndo', handleUndo);
    };
  }, []);

  // ─── Controls ──────────────────────────────────────────────────────────────
  const resetZoom = () => { viewportRef.current = { x: 0, y: 0, scale: 1 }; setZoomLevel(100); window.redraw(); };

  const toggleGrid = () => {
    const next = !showGridRef.current;
    showGridRef.current = next;
    setShowGrid(next);
    if (!next) { snapToGridRef.current = false; setSnapToGrid(false); }
    window.redraw();
  };

  const toggleSnapToGrid = () => {
    snapToGridRef.current = !snapToGridRef.current;
    setSnapToGrid(snapToGridRef.current);
  };

  const handleGridSizeChange = (size) => {
    gridSizeRef.current = size;
    setGridSize(size);
    window.redraw();
  };

  const toggleLock = () => {
    const sel = cardsOnCanvasRef.current.find(c => c.selected);
    if (!sel) return;
    sel.locked = !sel.locked;
    setSelectedLocked(sel.locked);
    window.redraw();
  };

  // ─── Deck Management ───────────────────────────────────────────────────────
  const handleAddDeck = async () => {
    if (!newDeckName.trim()) { setStatusMessage('Enter a deck name first.'); setStatusType('error'); return; }
    if (isElectron) {
      const result = await window.electronAPI.pickFolder();
      if (!result) return;
      const newDeck = { name: newDeckName.trim(), folderPath: result.folderPath, files: result.files };
      setDecks(prev => {
        const updated = [...prev, newDeck];
        setActiveDeckIndex(updated.length - 1);
        setStatusMessage(`✓ "${newDeck.name}" — ${result.files.length} cards`);
        setStatusType('success');
        return updated;
      });
      setNewDeckName('');
    } else {
      folderInputRef.current.click();
    }
  };

  const handleFolderPick = (e) => {
    const files = Array.from(e.target.files).filter(f => /\.(jpg|jpeg|png|gif)$/i.test(f.name));
    if (files.length === 0) { setStatusMessage('No image files found.'); setStatusType('error'); return; }
    const newDeck = { name: newDeckName.trim(), folderPath: null, files };
    setDecks(prev => {
      const updated = [...prev, newDeck];
      setActiveDeckIndex(updated.length - 1);
      setStatusMessage(`✓ "${newDeck.name}" — ${files.length} cards`);
      setStatusType('success');
      return updated;
    });
    setNewDeckName('');
    e.target.value = '';
  };

  const handleRemoveDeck = () => {
    setDecks(prev => {
      const updated = prev.filter((_, i) => i !== activeDeckIndex);
      setActiveDeckIndex(Math.max(0, activeDeckIndex - 1));
      setStatusMessage(updated.length === 0 ? 'No decks loaded.' : '✓ Deck removed');
      setStatusType(updated.length === 0 ? 'info' : 'success');
      return updated;
    });
  };

  // ─── Image Loading ──────────────────────────────────────────────────────────
  const loadImageFromFile = async (file) => {
    if (isElectron && file.path) return window.electronAPI.readImage(file.path);
    return URL.createObjectURL(file);
  };

  // ─── Draw ──────────────────────────────────────────────────────────────────
  const placeCard = (img, canvas, file) => {
    const vp = viewportRef.current;
    const maxWidth = 150, maxHeight = 220;
    const scale = Math.min(maxWidth / img.width, maxHeight / img.height);
    const worldCenterX = (canvas.width / 2 - vp.x) / vp.scale;
    const worldCenterY = (canvas.height / 2 - vp.y) / vp.scale;

    // Save undo snapshot
    undoStackRef.current.push(cardsOnCanvasRef.current.map(c => ({ ...c })));
    if (undoStackRef.current.length > 30) undoStackRef.current.shift();

    cardsOnCanvasRef.current.push({
      image: img,
      filePath: file.path || null,
      fileName: file.name,
      deckIndex: activeDeckIndex,
      x: worldCenterX - (img.width * scale) / 2 + (Math.random() - 0.5) * 100,
      y: worldCenterY - (img.height * scale) / 2 + (Math.random() - 0.5) * 100,
      width: img.width * scale,
      height: img.height * scale,
      rotation: 0,
      selected: false,
      locked: false,
    });
    setDeckCount(cardsOnCanvasRef.current.length);
    window.redraw();
  };

  const drawCard = async () => {
    const canvas = canvasRef.current;
    if (!canvas || decks.length === 0) { alert('Add a deck first.'); return; }
    const activeDeck = decks[activeDeckIndex];
    if (!activeDeck?.files.length) return;
    const file = activeDeck.files[Math.floor(Math.random() * activeDeck.files.length)];
    const url = await loadImageFromFile(file);
    if (!url) return;
    const img = new Image();
    img.onload = () => placeCard(img, canvas, file);
    img.src = url;
  };

  const drawSpecificCard = async (file) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = await loadImageFromFile(file);
    if (!url) return;
    const img = new Image();
    img.onload = () => placeCard(img, canvas, file);
    img.src = url;
    setShowCardList(false);
    setCardSearch('');
    setPreviewCard(null);
  };

  // ─── Layer Controls ────────────────────────────────────────────────────────
  const moveLayer = (fn) => {
    const list = cardsOnCanvasRef.current;
    const idx = list.findIndex(c => c.selected);
    if (idx === -1 || list[idx].locked) return;
    fn(list, idx);
    window.redraw();
  };

  const bringToFront  = () => moveLayer((l, i) => { const [c] = l.splice(i, 1); l.push(c); });
  const sendToBack    = () => moveLayer((l, i) => { const [c] = l.splice(i, 1); l.unshift(c); });
  const bringForward  = () => moveLayer((l, i) => { if (i < l.length - 1) [l[i], l[i+1]] = [l[i+1], l[i]]; });
  const sendBackward  = () => moveLayer((l, i) => { if (i > 0) [l[i], l[i-1]] = [l[i-1], l[i]]; });

  const rotateSelected = (degrees) => {
    const sel = cardsOnCanvasRef.current.find(c => c.selected);
    if (sel && !sel.locked) { sel.rotation = (sel.rotation || 0) + degrees; window.redraw(); }
  };

  const deleteSelected = () => {
    const sel = cardsOnCanvasRef.current.find(c => c.selected);
    if (sel?.locked) { alert('Unlock the card before deleting.'); return; }
    cardsOnCanvasRef.current = cardsOnCanvasRef.current.filter(c => !c.selected);
    setDeckCount(cardsOnCanvasRef.current.length);
    setHasSelected(false);
    setSelectedLocked(false);
    window.redraw();
  };

  const clearCanvas = () => {
    if (cardsOnCanvasRef.current.length === 0) return;
    if (!window.confirm('Clear all cards from the canvas? This cannot be undone.')) return;
    cardsOnCanvasRef.current = [];
    setDeckCount(0);
    setHasSelected(false);
    setSelectedLocked(false);
    window.redraw();
  };

  // ─── Layout Save/Load ──────────────────────────────────────────────────────
  const saveLayout = async () => {
    if (!saveLayoutName.trim()) return;
    const layoutData = {
      version: 1,
      savedAt: new Date().toISOString(),
      decks: decks.map(d => ({ name: d.name, folderPath: d.folderPath || null, fileNames: d.files.map(f => f.name || f) })),
      cards: cardsOnCanvasRef.current.map(card => ({
        fileName: card.fileName, deckIndex: card.deckIndex,
        x: card.x, y: card.y, width: card.width, height: card.height,
        rotation: card.rotation || 0, locked: card.locked || false,
      })),
      viewport: { ...viewportRef.current },
    };
    await window.electronAPI.saveLayout(saveLayoutName.trim(), layoutData);
    setShowSaveDialog(false);
    setSaveLayoutName('');
    setStatusMessage(`✓ Layout "${saveLayoutName.trim()}" saved`);
    setStatusType('success');
  };

  const openLoadDialog = async () => {
    const list = await window.electronAPI.listLayouts();
    setLayouts(list);
    setShowLoadDialog(true);
  };

  const loadLayout = async (layout) => {
    const data = await window.electronAPI.loadLayout(layout.filePath);
    if (!data) { setStatusMessage('Failed to load layout.'); setStatusType('error'); return; }

    const reloadedDecks = data.decks.map(d => ({
      name: d.name,
      folderPath: d.folderPath || null,
      files: d.folderPath
        ? d.fileNames.map(name => ({ name, path: d.folderPath + '\\' + name }))
        : [],
    }));
    setDecks(reloadedDecks);

    if (data.viewport) viewportRef.current = data.viewport;
    setZoomLevel(Math.round((data.viewport?.scale || 1) * 100));

    cardsOnCanvasRef.current = [];
    await Promise.all(data.cards.map(async (cardData) => {
      const deck = reloadedDecks[cardData.deckIndex];
      if (!deck) return;
      const file = deck.files.find(f => (f.name || f) === cardData.fileName);
      if (!file) return;
      const url = await loadImageFromFile(file);
      if (!url) return;
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          cardsOnCanvasRef.current.push({
            image: img, filePath: file.path || null,
            fileName: cardData.fileName, deckIndex: cardData.deckIndex,
            x: cardData.x, y: cardData.y, width: cardData.width, height: cardData.height,
            rotation: cardData.rotation, locked: cardData.locked, selected: false,
          });
          resolve();
        };
        img.onerror = resolve;
        img.src = url;
      });
    }));

    setDeckCount(cardsOnCanvasRef.current.length);
    window.redraw();
    setShowLoadDialog(false);
    setStatusMessage(`✓ Layout "${layout.name}" loaded`);
    setStatusType('success');
  };

  const deleteLayout = async (layout, e) => {
    e.stopPropagation();
    await window.electronAPI.deleteLayout(layout.filePath);
    setLayouts(prev => prev.filter(l => l.filePath !== layout.filePath));
  };

  const activeDeck = decks[activeDeckIndex];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app-container">
      <div className="canvas-wrapper">
        <canvas ref={canvasRef} />
        <div className="zoom-indicator">
          <span>{zoomLevel}%</span>
          <button className="btn-reset-zoom" onClick={resetZoom} title="Reset zoom">⊙</button>
          <button className={`btn-grid-toggle ${showGrid ? 'grid-on' : ''}`} onClick={toggleGrid} title="Toggle grid">⊞</button>
          {showGrid && (
            <>
              <select className="grid-size-select" value={gridSize} onChange={(e) => handleGridSizeChange(Number(e.target.value))}>
                <option value={25}>25px</option>
                <option value={50}>50px</option>
                <option value={100}>100px</option>
                <option value={200}>200px</option>
              </select>
              <button className={`btn-grid-toggle ${snapToGrid ? 'grid-on' : ''}`} onClick={toggleSnapToGrid} title="Snap to grid">⊠</button>
            </>
          )}
        </div>
      </div>

      <aside className="control-panel">
        <div className="panel-header">
          <h1>Card Canvas</h1>
          <p className="deck-counter">Cards on canvas: {deckCount}</p>
        </div>

        {isElectron && (
          <div className="layout-section">
            <label>Layouts:</label>
            <div className="layout-buttons">
              <button className="btn btn-layout" onClick={() => setShowSaveDialog(true)}>💾 Save Layout</button>
              <button className="btn btn-layout" onClick={openLoadDialog}>📂 Load Layout</button>
            </div>
          </div>
        )}

        <div className="directory-section">
          <label>Active Deck:</label>
          <select
            className="deck-select"
            value={activeDeckIndex}
            onChange={(e) => {
              const idx = Number(e.target.value);
              setActiveDeckIndex(idx);
              const d = decks[idx];
              if (d) { setStatusMessage(`✓ "${d.name}" — ${d.files.length} cards`); setStatusType('success'); }
            }}
            disabled={decks.length === 0}
          >
            {decks.length === 0
              ? <option>No decks loaded</option>
              : decks.map((d, i) => <option key={i} value={i}>{d.name} ({d.files.length})</option>)
            }
          </select>

          <div className="new-deck-row">
            <input type="text" className="dir-input" placeholder="Deck name..."
              value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddDeck()} />
            <button className="btn btn-load" onClick={handleAddDeck}>+ Add</button>
          </div>
          <button className="btn btn-remove" onClick={handleRemoveDeck} disabled={decks.length === 0}>
            ✕ Remove Selected Deck
          </button>

          <input ref={folderInputRef} type="file" webkitdirectory="true" multiple
            style={{ display: 'none' }} onChange={handleFolderPick} />

          <p className={`status-message status-${statusType}`}>{statusMessage}</p>
        </div>

        <div className="controls">
          <button className="btn btn-primary" onClick={drawCard} disabled={decks.length === 0}>
            🃏 Draw Random Card
          </button>

          <div className="card-search-wrapper">
            <button className="btn btn-search-toggle"
              onClick={() => { setShowCardList(!showCardList); setCardSearch(''); }}
              disabled={decks.length === 0}>
              🔍 Draw Specific Card
            </button>

            {showCardList && activeDeck && (
              <div className="card-list-panel">
                {previewCard && (
                  <div className="card-preview"
                    onMouseEnter={() => clearTimeout(previewTimeoutRef.current)}
                    onMouseLeave={() => { previewTimeoutRef.current = setTimeout(() => setPreviewCard(null), 150); }}>
                    <img src={previewCard.url} alt={previewCard.name} className="card-preview-img" />
                    <p className="card-preview-name">{previewCard.name.replace(/\.[^/.]+$/, '')}</p>
                  </div>
                )}
                <input type="text" className="dir-input" placeholder="Search cards..."
                  value={cardSearch} onChange={(e) => setCardSearch(e.target.value)} autoFocus />
                <div className="card-list-scroll">
                  {activeDeck.files
                    .filter(f => (f.name || f).toLowerCase().includes(cardSearch.toLowerCase()))
                    .map((file, i) => (
                      <div key={i} className="card-list-item"
                        onClick={() => drawSpecificCard(file)}
                        onMouseEnter={async () => {
                          clearTimeout(previewTimeoutRef.current);
                          const url = await loadImageFromFile(file);
                          setPreviewCard({ url, name: file.name || file });
                        }}
                        onMouseLeave={() => { previewTimeoutRef.current = setTimeout(() => setPreviewCard(null), 150); }}
                      >
                        {(file.name || file).replace(/\.[^/.]+$/, '')}
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>

          <div className="section-label">Selected Card</div>
          <button className={`btn ${selectedLocked ? 'btn-locked' : 'btn-unlocked'}`}
            onClick={toggleLock} disabled={!hasSelected}>
            {selectedLocked ? '🔒 Locked — Click to Unlock' : '🔓 Unlocked — Click to Lock'}
          </button>

          <div className="section-label">Rotate Selected</div>
          <div className="rotation-controls">
            <button className="btn btn-secondary" onClick={() => rotateSelected(-15)} disabled={selectedLocked}>↻ Left</button>
            <button className="btn btn-secondary" onClick={() => rotateSelected(15)}>Right ↻</button>
          </div>
          <div className="angle-input-row">
            <input type="number" className="dir-input" placeholder="Angle °"
              min="-360" max="360" disabled={selectedLocked || !hasSelected}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  const sel = cardsOnCanvasRef.current.find(c => c.selected);
                  if (sel) { sel.rotation = Number(e.target.value); window.redraw(); e.target.value = ''; }
                }
              }} />
            <span className="angle-label">° Set</span>
          </div>

          <div className="section-label">Layer Selected</div>
          <div className="layer-controls">
            <button className="btn btn-layer" onClick={bringToFront}>⤒ Front</button>
            <button className="btn btn-layer" onClick={sendToBack}>⤓ Back</button>
            <button className="btn btn-layer" onClick={bringForward}>↑ Forward</button>
            <button className="btn btn-layer" onClick={sendBackward}>↓ Backward</button>
          </div>

          <button className="btn btn-danger" onClick={deleteSelected}>Delete Selected</button>
          <button className="btn btn-warning" onClick={clearCanvas}>Clear All</button>
        </div>

        <div className="info-section">
          <button className="help-toggle" onClick={() => setShowHelp(h => !h)}>
            {showHelp ? '▾ Hide Help' : '▸ How to Use'}
          </button>
          {showHelp && (
            <ul className="help-list">
              <li>Click <strong>+ Add</strong> to load a deck</li>
              <li>Switch decks from the dropdown</li>
              <li>Click <strong>Draw Random Card</strong> to deal</li>
              <li>Click card to select, drag to move</li>
              <li>Drag <strong>corner handles</strong> to resize</li>
              <li><strong>Double-click</strong> a card to lock/unlock</li>
              <li><strong>← →</strong> to rotate selected</li>
              <li><strong>↑ ↓</strong> to layer selected</li>
              <li>Drag empty space to pan</li>
              <li><strong>Scroll wheel</strong> to zoom</li>
              <li><strong>Delete</strong> to remove selected</li>
              <li><strong>Ctrl+S</strong> to save layout</li>
              <li><strong>Ctrl+Z</strong> to undo</li>
              <li><strong>⊞</strong> to toggle grid</li>
            </ul>
          )}
        </div>
      </aside>

      {showSaveDialog && (
        <div className="modal-overlay" onClick={() => setShowSaveDialog(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Save Layout</h2>
            <input type="text" className="dir-input" placeholder="Layout name..."
              value={saveLayoutName} onChange={(e) => setSaveLayoutName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && saveLayout()} autoFocus />
            <div className="modal-buttons">
              <button className="btn btn-primary" onClick={saveLayout}>Save</button>
              <button className="btn btn-secondary" onClick={() => setShowSaveDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showLoadDialog && (
        <div className="modal-overlay" onClick={() => setShowLoadDialog(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Load Layout</h2>
            {layouts.length === 0
              ? <p className="status-message status-info">No saved layouts yet.</p>
              : <div className="layout-list">
                  {layouts.map((layout, i) => (
                    <div key={i} className="layout-item" onClick={() => loadLayout(layout)}>
                      <div className="layout-item-info">
                        <span className="layout-item-name">{layout.name}</span>
                        <span className="layout-item-date">{new Date(layout.modified).toLocaleDateString()}</span>
                      </div>
                      <button className="layout-delete-btn" onClick={(e) => deleteLayout(layout, e)} title="Delete layout">✕</button>
                    </div>
                  ))}
                </div>
            }
            <div className="modal-buttons">
              <button className="btn btn-secondary" onClick={() => setShowLoadDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;