import React, { useEffect, useRef, useState } from 'react';
import './App.css';

const HANDLE_SIZE = 8;
const isElectron = !!window.electronAPI;

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

function App() {
  const canvasRef = useRef(null);
  const [decks, setDecks] = useState([]);
  const [activeDeckIndex, setActiveDeckIndex] = useState(0);
  const [deckCount, setDeckCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState('info');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [newDeckName, setNewDeckName] = useState('');
  const [hasSelected, setHasSelected] = useState(false);
  const [selectedLocked, setSelectedLocked] = useState(false);
  const [cardSearch, setCardSearch] = useState('');
  const [showCardList, setShowCardList] = useState(false);
  const [previewCard, setPreviewCard] = useState(null);
  // Layout save/load
  const [layouts, setLayouts] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [saveLayoutName, setSaveLayoutName] = useState('');

  const cardsOnCanvasRef = useRef([]);
  const undoStackRef = useRef([]); // stores snapshots for undo
  const folderInputRef = useRef(null);
  const viewportRef = useRef({ x: 0, y: 0, scale: 1 });
  const [showGrid, setShowGrid] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [gridSize, setGridSize] = useState(50);
  const showGridRef = useRef(false);
  const gridSizeRef = useRef(50);
  const lastClickTimeRef = useRef(0);
  const lastClickCardRef = useRef(null);

  // ─── Canvas Setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const resizeCanvas = () => {
      canvas.width = window.innerWidth - 320;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const handleResize = () => {
      resizeCanvas();
      redraw();
    };
    window.addEventListener('resize', handleResize);

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

    const getSelectedCard = () => cardsOnCanvasRef.current.find(c => c.selected);

    const hitHandle = (sx, sy) => {
      const vp = viewportRef.current;
      const sel = getSelectedCard();
      if (!sel) return null;
      for (const h of getHandles(sel)) {
        const wp = handleWorldPos(sel, h);
        const screenX = wp.x * vp.scale + vp.x;
        const screenY = wp.y * vp.scale + vp.y;
        if (Math.sqrt((sx - screenX) ** 2 + (sy - screenY) ** 2) <= HANDLE_SIZE + 4)
          return { card: sel, handle: h };
      }
      return null;
    };



    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { x, y } = toWorld(sx, sy);

      const handleHit = hitHandle(sx, sy);
      if (handleHit && !handleHit.card.locked) {
        dragHandle = handleHit.handle;
        dragCard = handleHit.card;
        dragStartX = sx; dragStartY = sy;
        dragStartW = dragCard.width; dragStartH = dragCard.height;
        return;
      }

      // Use inverse rotation for accurate hit detection on rotated cards
      const found = [...cardsOnCanvasRef.current].reverse().find(card => {
        const angle = -(card.rotation || 0) * Math.PI / 180;
        const cx = card.x + card.width / 2;
        const cy = card.y + card.height / 2;
        const rotated = rotatePoint(x - cx, y - cy, angle);
        return (
          rotated.x > -card.width / 2 && rotated.x < card.width / 2 &&
          rotated.y > -card.height / 2 && rotated.y < card.height / 2
        );
      });

      cardsOnCanvasRef.current.forEach(c => c.selected = false);

      if (found) {
        const now = Date.now();
        const timeDiff = now - lastClickTimeRef.current;
        const isDoubleClick = (timeDiff < 250) && (timeDiff > 50) && lastClickCardRef.current === found;
        lastClickTimeRef.current = now;
        lastClickCardRef.current = found;

        if (isDoubleClick) {
          // Toggle lock on double-click
          found.locked = !found.locked;
          found.selected = true;
          cardsOnCanvasRef.current.forEach(c => { if (c !== found) c.selected = false; });
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
        redraw(); return;
      }

      if (dragCard) {
        const { x, y } = toWorld(sx, sy);
        dragCard.x = x - dragOffsetX;
        dragCard.y = y - dragOffsetY;
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

    const redraw = () => {
      const vp = viewportRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(vp.x, vp.y);
      ctx.scale(vp.scale, vp.scale);

      // Draw grid if enabled
      if (showGridRef.current) {
        const gs = gridSizeRef.current;
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1 / vp.scale;

        // Calculate grid bounds in world space
        const startX = Math.floor((-vp.x / vp.scale) / gs) * gs;
        const startY = Math.floor((-vp.y / vp.scale) / gs) * gs;
        const endX = startX + (canvas.width / vp.scale) + gs * 2;
        const endY = startY + (canvas.height / vp.scale) + gs * 2;

        for (let x = startX; x < endX; x += gs) {
          ctx.beginPath();
          ctx.moveTo(x, startY);
          ctx.lineTo(x, endY);
          ctx.stroke();
        }
        for (let y = startY; y < endY; y += gs) {
          ctx.beginPath();
          ctx.moveTo(startX, y);
          ctx.lineTo(endX, y);
          ctx.stroke();
        }

        // Draw a slightly brighter line every 5 cells
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        for (let x = startX; x < endX; x += gs * 5) {
          ctx.beginPath();
          ctx.moveTo(x, startY);
          ctx.lineTo(x, endY);
          ctx.stroke();
        }
        for (let y = startY; y < endY; y += gs * 5) {
          ctx.beginPath();
          ctx.moveTo(startX, y);
          ctx.lineTo(endX, y);
          ctx.stroke();
        }
      }

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
          const color = card.locked ? '#f59e0b' : '#00d4ff';
          ctx.strokeStyle = color;
          ctx.lineWidth = 3 / vp.scale;
          ctx.strokeRect(-card.width / 2 - 3, -card.height / 2 - 3, card.width + 6, card.height + 6);
          if (!card.locked) {
            ctx.fillStyle = '#00d4ff';
            for (const h of getHandles(card)) {
              const hs = HANDLE_SIZE / vp.scale;
              ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
            }
          }
          // Only show lock icon if card is locked
          if (card.locked) {
            const iconSize = 18 / vp.scale;
            const iconPad = 4 / vp.scale;
            ctx.beginPath();
            ctx.arc(-card.width / 2 + iconPad + iconSize / 2, -card.height / 2 + iconPad + iconSize / 2, iconSize / 1.4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fill();
            ctx.font = `${iconSize}px serif`;
            ctx.fillStyle = 'white';
            ctx.fillText('🔒', -card.width / 2 + iconPad, -card.height / 2 + iconPad + iconSize);
          }
        }

        if (card.locked && !card.selected) {
          const iconSize = 18 / vp.scale;
          const iconPad = 4 / vp.scale;
          ctx.beginPath();
          ctx.arc(-card.width / 2 + iconPad + iconSize / 2, -card.height / 2 + iconPad + iconSize / 2, iconSize / 1.4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fill();
          ctx.font = `${iconSize}px serif`;
          ctx.fillStyle = 'white';
          ctx.fillText('🔒', -card.width / 2 + iconPad, -card.height / 2 + iconPad + iconSize);
        }

        ctx.restore();
      });
      ctx.restore();
    };

    window.redraw = redraw;

    const handleKeyDown = (e) => {
      // Ctrl+S — Save layout
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('triggerSave'));
        return;
      }

      // Ctrl+Z — Undo
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('triggerUndo'));
        return;
      }

      // Arrow keys — rotate and layer selected card
      const sel = cardsOnCanvasRef.current.find(c => c.selected);
      if (sel && !sel.locked) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          sel.rotation = (sel.rotation || 0) - 15;
          redraw(); return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          sel.rotation = (sel.rotation || 0) + 15;
          redraw(); return;
        }
      }
      if (sel) {
        const list = cardsOnCanvasRef.current;
        const idx = list.findIndex(c => c.selected);
        if (e.key === 'ArrowUp') {
          // Send back (away from user = lower in stack)
          e.preventDefault();
          if (idx > 0 && !sel.locked) {
            [list[idx], list[idx - 1]] = [list[idx - 1], list[idx]];
            redraw();
          }
          return;
        }
        if (e.key === 'ArrowDown') {
          // Bring forward (toward user = higher in stack)
          e.preventDefault();
          if (idx < list.length - 1 && !sel.locked) {
            [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
            redraw();
          }
          return;
        }
      }

      // Delete key — remove selected card
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = cardsOnCanvasRef.current.find(c => c.selected);
        if (!sel || sel.locked) return;
        cardsOnCanvasRef.current = cardsOnCanvasRef.current.filter(c => !c.selected);
        redraw();
        window.dispatchEvent(new CustomEvent('cardDeleted'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    const handler = () => {
      setDeckCount(cardsOnCanvasRef.current.length);
      setHasSelected(false);
      setSelectedLocked(false);
    };
    window.addEventListener('cardDeleted', handler);
    return () => window.removeEventListener('cardDeleted', handler);
  }, []);

  // ─── Undo ─────────────────────────────────────────────────────────────────
  const undo = () => {
    if (undoStackRef.current.length === 0) return;
    const snapshot = undoStackRef.current.pop();
    cardsOnCanvasRef.current = snapshot;
    setDeckCount(snapshot.length);
    setHasSelected(false);
    setSelectedLocked(false);
    window.redraw();
  };

  const toggleGrid = () => {
    showGridRef.current = !showGridRef.current;
    setShowGrid(showGridRef.current);
    window.redraw();
  };

  const handleGridSizeChange = (size) => {
    gridSizeRef.current = size;
    setGridSize(size);
    window.redraw();
  };

  const resetZoom = () => {
    viewportRef.current = { x: 0, y: 0, scale: 1 };
    setZoomLevel(100);
    window.redraw();
  };

  const toggleLock = () => {
    const sel = cardsOnCanvasRef.current.find(c => c.selected);
    if (!sel) return;
    sel.locked = !sel.locked;
    setSelectedLocked(sel.locked);
    window.redraw();
  };

  // ─── Deck Management ──────────────────────────────────────────────────────
  const handleAddDeck = async () => {
    if (!newDeckName.trim()) {
      setStatusMessage('Enter a deck name first.');
      setStatusType('error');
      return;
    }

    if (isElectron) {
      // Use Electron native folder picker
      const result = await window.electronAPI.pickFolder();
      if (!result) return;
      const newDeck = {
        name: newDeckName.trim(),
        folderPath: result.folderPath,
        files: result.files, // { name, path }[]
      };
      setDecks(prev => {
        const updated = [...prev, newDeck];
        setActiveDeckIndex(updated.length - 1);
        setStatusMessage(`✓ "${newDeck.name}" — ${result.files.length} cards`);
        setStatusType('success');
        return updated;
      });
      setNewDeckName('');
    } else {
      // Fallback: browser file picker
      folderInputRef.current.click();
    }
  };

  const handleFolderPick = (e) => {
    const files = Array.from(e.target.files).filter(f =>
      /\.(jpg|jpeg|png|gif)$/i.test(f.name)
    );
    if (files.length === 0) {
      setStatusMessage('No image files found.');
      setStatusType('error');
      return;
    }
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

  // ─── Draw ─────────────────────────────────────────────────────────────────
  const loadImageFromFile = async (file) => {
    if (isElectron && file.path) {
      // Load via Electron base64
      const dataUrl = await window.electronAPI.readImage(file.path);
      return dataUrl;
    } else {
      // Browser blob URL
      return URL.createObjectURL(file);
    }
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

  const drawCard = async () => {
    const canvas = canvasRef.current;
    if (!canvas || decks.length === 0) { alert('Add a deck first.'); return; }
    const activeDeck = decks[activeDeckIndex];
    if (!activeDeck || activeDeck.files.length === 0) return;
    const randomIndex = Math.floor(Math.random() * activeDeck.files.length);
    const file = activeDeck.files[randomIndex];
    const url = await loadImageFromFile(file);
    if (!url) return;
    const img = new Image();
    img.onload = () => placeCard(img, canvas, file);
    img.src = url;
  };

  const placeCard = (img, canvas, file) => {
    const vp = viewportRef.current;
    const maxWidth = 150, maxHeight = 220;
    const scale = Math.min(maxWidth / img.width, maxHeight / img.height);
    const worldCenterX = (canvas.width / 2 - vp.x) / vp.scale;
    const worldCenterY = (canvas.height / 2 - vp.y) / vp.scale;
    const card = {
      image: img,
      // Store file reference for saving
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
    };
    // Save undo snapshot before adding card
    const snapshot = cardsOnCanvasRef.current.map(c => ({ ...c }));
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > 30) undoStackRef.current.shift();

    cardsOnCanvasRef.current.push(card);
    setDeckCount(cardsOnCanvasRef.current.length);
    window.redraw();
  };

  // ─── Layer Controls ───────────────────────────────────────────────────────
  const bringToFront = () => {
    const list = cardsOnCanvasRef.current;
    const idx = list.findIndex(c => c.selected);
    if (idx === -1 || list[idx].locked) return;
    const [card] = list.splice(idx, 1);
    list.push(card); window.redraw();
  };

  const sendToBack = () => {
    const list = cardsOnCanvasRef.current;
    const idx = list.findIndex(c => c.selected);
    if (idx === -1 || list[idx].locked) return;
    const [card] = list.splice(idx, 1);
    list.unshift(card); window.redraw();
  };

  const bringForward = () => {
    const list = cardsOnCanvasRef.current;
    const idx = list.findIndex(c => c.selected);
    if (idx === -1 || idx === list.length - 1 || list[idx].locked) return;
    [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
    window.redraw();
  };

  const sendBackward = () => {
    const list = cardsOnCanvasRef.current;
    const idx = list.findIndex(c => c.selected);
    if (idx <= 0 || list[idx].locked) return;
    [list[idx], list[idx - 1]] = [list[idx - 1], list[idx]];
    window.redraw();
  };

  const deleteSelected = () => {
    const sel = cardsOnCanvasRef.current.find(c => c.selected);
    if (sel && sel.locked) { alert('Unlock the card before deleting.'); return; }
    cardsOnCanvasRef.current = cardsOnCanvasRef.current.filter(c => !c.selected);
    setDeckCount(cardsOnCanvasRef.current.length);
    setHasSelected(false);
    setSelectedLocked(false);
    window.redraw();
  };

  const rotateSelected = (degrees) => {
    const selected = cardsOnCanvasRef.current.find(c => c.selected);
    if (selected && !selected.locked) {
      selected.rotation = (selected.rotation || 0) + degrees;
      window.redraw();
    }
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

  // ─── Save Layout ──────────────────────────────────────────────────────────
  const saveLayout = async () => {
    if (!saveLayoutName.trim()) return;

    const layoutData = {
      version: 1,
      savedAt: new Date().toISOString(),
      decks: decks.map(d => ({
        name: d.name,
        folderPath: d.folderPath || null,
        fileNames: d.files.map(f => f.name || f),
      })),
      cards: cardsOnCanvasRef.current.map(card => ({
        fileName: card.fileName,
        deckIndex: card.deckIndex,
        x: card.x,
        y: card.y,
        width: card.width,
        height: card.height,
        rotation: card.rotation || 0,
        locked: card.locked || false,
      })),
      viewport: { ...viewportRef.current },
    };

    await window.electronAPI.saveLayout(saveLayoutName.trim(), layoutData);
    setShowSaveDialog(false);
    setSaveLayoutName('');
    setStatusMessage(`✓ Layout "${saveLayoutName.trim()}" saved`);
    setStatusType('success');
  };

  // ─── Load Layouts List ────────────────────────────────────────────────────
  const openLoadDialog = async () => {
    const list = await window.electronAPI.listLayouts();
    setLayouts(list);
    setShowLoadDialog(true);
  };

  // ─── Load a Layout ────────────────────────────────────────────────────────
  const loadLayout = async (layout) => {
    const data = await window.electronAPI.loadLayout(layout.filePath);
    if (!data) { setStatusMessage('Failed to load layout.'); setStatusType('error'); return; }

    // Reload decks from saved folder paths - reconstruct file paths directly, no picker needed
    const reloadedDecks = data.decks.map((d) => {
      if (d.folderPath) {
        const files = d.fileNames.map(name => ({
          name,
          path: d.folderPath + '\\' + name,
        }));
        return { name: d.name, folderPath: d.folderPath, files };
      }
      return { name: d.name, folderPath: null, files: [] };
    });

    setDecks(reloadedDecks);

    // Restore viewport
    if (data.viewport) viewportRef.current = data.viewport;
    setZoomLevel(Math.round((data.viewport?.scale || 1) * 100));

    // Reload cards
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
            image: img,
            filePath: file.path || null,
            fileName: cardData.fileName,
            deckIndex: cardData.deckIndex,
            x: cardData.x,
            y: cardData.y,
            width: cardData.width,
            height: cardData.height,
            rotation: cardData.rotation,
            locked: cardData.locked,
            selected: false,
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

  return (
    <div className="app-container">
      <div className="canvas-wrapper">
        <canvas ref={canvasRef} />
        <div className="zoom-indicator">
          <span>{zoomLevel}%</span>
          <button className="btn-reset-zoom" onClick={resetZoom} title="Reset zoom">⊙</button>
          <button
            className={`btn-grid-toggle ${showGrid ? 'grid-on' : ''}`}
            onClick={toggleGrid}
            title="Toggle grid"
          >⊞</button>
          {showGrid && (
            <select
              className="grid-size-select"
              value={gridSize}
              onChange={(e) => handleGridSizeChange(Number(e.target.value))}
            >
              <option value={25}>25px</option>
              <option value={50}>50px</option>
              <option value={100}>100px</option>
              <option value={200}>200px</option>
            </select>
          )}
        </div>
      </div>

      <aside className="control-panel">
        <div className="panel-header">
          <h1>Card Canvas</h1>
          <p className="deck-counter">Cards on canvas: {deckCount}</p>
        </div>

        {/* Layout Save/Load — Electron only */}
        {isElectron && (
          <div className="layout-section">
            <label>Layouts:</label>
            <div className="layout-buttons">
              <button className="btn btn-layout" onClick={() => setShowSaveDialog(true)}>
                💾 Save Layout
              </button>
              <button className="btn btn-layout" onClick={openLoadDialog}>
                📂 Load Layout
              </button>
            </div>
          </div>
        )}

        {/* Deck Manager */}
        <div className="directory-section">
          <label>Active Deck:</label>
          <select
            className="deck-select"
            value={activeDeckIndex}
            onChange={(e) => {
              const idx = Number(e.target.value);
              setActiveDeckIndex(idx);
              const d = decks[idx];
              if (d) {
                setStatusMessage(`✓ "${d.name}" — ${d.files.length} cards`);
                setStatusType('success');
              }
            }}
            disabled={decks.length === 0}
          >
            {decks.length === 0
              ? <option>No decks loaded</option>
              : decks.map((d, i) => (
                  <option key={i} value={i}>{d.name} ({d.files.length})</option>
                ))
            }
          </select>

          <div className="new-deck-row">
            <input
              type="text"
              className="dir-input"
              placeholder="Deck name..."
              value={newDeckName}
              onChange={(e) => setNewDeckName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddDeck()}
            />
            <button className="btn btn-load" onClick={handleAddDeck}>+ Add</button>
          </div>
          <button className="btn btn-remove" onClick={handleRemoveDeck} disabled={decks.length === 0}>
            ✕ Remove Selected Deck
          </button>

          <input ref={folderInputRef} type="file" webkitdirectory="true" multiple
            style={{ display: 'none' }} onChange={handleFolderPick} />

          <p className={`status-message status-${statusType}`}>{statusMessage}</p>
        </div>

        {/* Controls */}
        <div className="controls">
          <button className="btn btn-primary" onClick={drawCard} disabled={decks.length === 0}>
            🃏 Draw Random Card
          </button>

          <div className="card-search-wrapper">
            <button
              className="btn btn-search-toggle"
              onClick={() => { setShowCardList(!showCardList); setCardSearch(''); }}
              disabled={decks.length === 0}
            >
              🔍 Draw Specific Card
            </button>

            {showCardList && activeDeck && (
              <div className="card-list-panel">
                {previewCard && (
                  <div className="card-preview"
                    onMouseEnter={() => clearTimeout(window._previewTimeout)}
                    onMouseLeave={() => { window._previewTimeout = setTimeout(() => setPreviewCard(null), 150); }}>
                    <img src={previewCard.url} alt={previewCard.name} className="card-preview-img" />
                    <p className="card-preview-name">{previewCard.name.replace(/\.[^/.]+$/, '')}</p>
                  </div>
                )}
                <input
                  type="text"
                  className="dir-input"
                  placeholder="Search cards..."
                  value={cardSearch}
                  onChange={(e) => setCardSearch(e.target.value)}
                  autoFocus
                />
                <div className="card-list-scroll">
                  {activeDeck.files
                    .filter(f => (f.name || f).toLowerCase().includes(cardSearch.toLowerCase()))
                    .map((file, i) => (
                      <div
                        key={i}
                        className="card-list-item"
                        onClick={() => drawSpecificCard(file)}
                        onMouseEnter={async () => {
                          clearTimeout(window._previewTimeout);
                          const url = await loadImageFromFile(file);
                          setPreviewCard({ url, name: file.name || file });
                        }}
                        onMouseLeave={() => { window._previewTimeout = setTimeout(() => setPreviewCard(null), 150); }}
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

          <button
            className={`btn ${selectedLocked ? 'btn-locked' : 'btn-unlocked'}`}
            onClick={toggleLock}
            disabled={!hasSelected}
          >
            {selectedLocked ? '🔒 Locked — Click to Unlock' : '🔓 Unlocked — Click to Lock'}
          </button>

          <div className="section-label">Rotate Selected</div>
          <div className="rotation-controls">
            <button className="btn btn-secondary" onClick={() => rotateSelected(-15)} disabled={selectedLocked}>↻ Left</button>
            <button className="btn btn-secondary" onClick={() => rotateSelected(15)} disabled={selectedLocked}>Right ↻</button>
          </div>
          <div className="angle-input-row">
            <input
              type="number"
              className="dir-input"
              placeholder="Angle °"
              min="-360"
              max="360"
              disabled={selectedLocked || !hasSelected}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  const sel = cardsOnCanvasRef.current.find(c => c.selected);
                  if (sel) { sel.rotation = Number(e.target.value); window.redraw(); e.target.value = ''; }
                }
              }}
            />
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

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="modal-overlay" onClick={() => setShowSaveDialog(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Save Layout</h2>
            <input
              type="text"
              className="dir-input"
              placeholder="Layout name..."
              value={saveLayoutName}
              onChange={(e) => setSaveLayoutName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && saveLayout()}
              autoFocus
            />
            <div className="modal-buttons">
              <button className="btn btn-primary" onClick={saveLayout}>Save</button>
              <button className="btn btn-secondary" onClick={() => setShowSaveDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Load Dialog */}
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
                        <span className="layout-item-date">
                          {new Date(layout.modified).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        className="layout-delete-btn"
                        onClick={(e) => deleteLayout(layout, e)}
                        title="Delete layout"
                      >✕</button>
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