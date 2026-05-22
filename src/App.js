import React, { useEffect, useRef, useState } from 'react';
import './App.css';

const HANDLE_SIZE = 8;

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

// Rotate a point around origin by angle (radians)
function rotatePoint(x, y, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

// Get world-space position of the lock icon (top-left corner of card)
function getLockIconWorldPos(card) {
  const angle = (card.rotation || 0) * Math.PI / 180;
  const rot = rotatePoint(-card.width / 2, -card.height / 2, angle);
  return {
    x: card.x + card.width / 2 + rot.x,
    y: card.y + card.height / 2 + rot.y,
  };
}

// Get world-space position of a handle
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
  const [cardSearch, setCardSearch] = useState('');
  const [showCardList, setShowCardList] = useState(false);
  const [previewCard, setPreviewCard] = useState(null); // { url, name }
  const [selectedLocked, setSelectedLocked] = useState(false);
  const cardsOnCanvasRef = useRef([]);
  const folderInputRef = useRef(null);
  const viewportRef = useRef({ x: 0, y: 0, scale: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth - 280;
    canvas.height = window.innerHeight;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let dragCard = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let dragHandle = null;     // which corner handle is being dragged
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartW = 0;
    let dragStartH = 0;
    let dragStartCX = 0;
    let dragStartCY = 0;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;

    const toWorld = (sx, sy) => {
      const vp = viewportRef.current;
      return { x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale };
    };

    const getSelectedCard = () => cardsOnCanvasRef.current.find(c => c.selected);

    // Check if screen point is near a handle
    const hitHandle = (sx, sy) => {
      const vp = viewportRef.current;
      const sel = getSelectedCard();
      if (!sel) return null;
      for (const h of getHandles(sel)) {
        const wp = handleWorldPos(sel, h);
        const screenX = wp.x * vp.scale + vp.x;
        const screenY = wp.y * vp.scale + vp.y;
        const dist = Math.sqrt((sx - screenX) ** 2 + (sy - screenY) ** 2);
        if (dist <= HANDLE_SIZE + 4) return { card: sel, handle: h };
      }
      return null;
    };

    // Check if screen point hits the lock icon of any card
    const hitLockIcon = (sx, sy) => {
      const vp = viewportRef.current;
      for (const card of [...cardsOnCanvasRef.current].reverse()) {
        const wp = getLockIconWorldPos(card);
        // Icon is offset slightly inside the card corner
        const iconPad = 4;
        const iconSize = 18;
        const screenX = (wp.x + iconPad + iconSize / 2) * vp.scale + vp.x - iconPad * vp.scale;
        const screenY = (wp.y + iconPad + iconSize / 2) * vp.scale + vp.y - iconPad * vp.scale;
        const hitRadius = (iconSize / 1.4) * vp.scale + 4;
        const dist = Math.sqrt((sx - screenX) ** 2 + (sy - screenY) ** 2);
        if (dist <= hitRadius) return card;
      }
      return null;
    };

    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { x, y } = toWorld(sx, sy);

      // Check lock icon hit first
      const lockHit = hitLockIcon(sx, sy);
      if (lockHit) {
        lockHit.locked = !lockHit.locked;
        // Update React state if this card is selected
        if (lockHit.selected) setSelectedLocked(lockHit.locked);
        redraw();
        return;
      }

      // Check handle hit first
      const handleHit = hitHandle(sx, sy);
      if (handleHit && !handleHit.card.locked) {
        dragHandle = handleHit.handle;
        dragCard = handleHit.card;
        dragStartX = sx;
        dragStartY = sy;
        dragStartW = dragCard.width;
        dragStartH = dragCard.height;
        dragStartCX = dragCard.x + dragCard.width / 2;
        dragStartCY = dragCard.y + dragCard.height / 2;
        return;
      }

      // Check card hit
      const found = [...cardsOnCanvasRef.current].reverse().find(card =>
        x > card.x && x < card.x + card.width &&
        y > card.y && y < card.y + card.height
      );

      cardsOnCanvasRef.current.forEach(c => c.selected = false);

      if (found) {
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
        // Scaling: compute delta in screen space, convert to world
        const vp = viewportRef.current;
        const dx = (sx - dragStartX) / vp.scale;
        const dy = (sy - dragStartY) / vp.scale;

        // Which corner determines scale direction
        const signX = dragHandle.id.includes('r') ? 1 : -1;
        const signY = dragHandle.id.includes('b') ? 1 : -1;

        const newW = Math.max(40, dragStartW + signX * dx * 2);
        const newH = Math.max(40, dragStartH + signY * dy * 2);

        dragCard.width = newW;
        dragCard.height = newH;
        redraw();
        return;
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

      // Update cursor based on handle hover
      const handleHit = hitHandle(sx, sy);
      if (handleHit) {
        const id = handleHit.handle.id;
        canvas.style.cursor = (id === 'tl' || id === 'br') ? 'nwse-resize' : 'nesw-resize';
      } else {
        canvas.style.cursor = 'crosshair';
      }
    });

    canvas.addEventListener('mouseup', () => {
      dragCard = null;
      dragHandle = null;
      isPanning = false;
    });

    canvas.addEventListener('mouseleave', () => {
      dragCard = null;
      dragHandle = null;
      isPanning = false;
    });

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
          // Selection outline
          const color = card.locked ? '#f59e0b' : '#00d4ff';
          ctx.strokeStyle = color;
          ctx.lineWidth = 3 / vp.scale;
          ctx.strokeRect(-card.width / 2 - 3, -card.height / 2 - 3, card.width + 6, card.height + 6);

          // Corner handles (only if not locked)
          if (!card.locked) {
            ctx.fillStyle = '#00d4ff';
            for (const h of getHandles(card)) {
              const hs = HANDLE_SIZE / vp.scale;
              ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
            }
          }

          // Lock icon - drawn inside top-left of card
          const lockIcon = card.locked ? '🔒' : '🔓';
          const iconSize = 18 / vp.scale;
          const iconPad = 4 / vp.scale;
          // Background circle
          ctx.beginPath();
          ctx.arc(-card.width / 2 + iconPad + iconSize / 2, -card.height / 2 + iconPad + iconSize / 2, iconSize / 1.4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fill();
          // Icon
          ctx.font = `${iconSize}px serif`;
          ctx.fillStyle = 'white';
          ctx.fillText(lockIcon, -card.width / 2 + iconPad, -card.height / 2 + iconPad + iconSize);
        }

        // Always show lock badge on locked cards even when not selected
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

    // Delete key removes selected card
    const handleKeyDown = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = cardsOnCanvasRef.current.find(c => c.selected);
        if (!sel) return;
        if (sel.locked) return; // respect lock
        cardsOnCanvasRef.current = cardsOnCanvasRef.current.filter(c => !c.selected);
        redraw();
        // Sync React state via a custom event
        window.dispatchEvent(new CustomEvent('cardDeleted'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sync React state when Delete key removes a card
  useEffect(() => {
    const handler = () => {
      setDeckCount(cardsOnCanvasRef.current.length);
      setHasSelected(false);
      setSelectedLocked(false);
    };
    window.addEventListener('cardDeleted', handler);
    return () => window.removeEventListener('cardDeleted', handler);
  }, []);

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

  // ─── Deck Management ──────────────────────────────────────────────────────────
  const handleAddDeck = () => {
    if (!newDeckName.trim()) {
      setStatusMessage('Enter a deck name first.');
      setStatusType('error');
      return;
    }
    folderInputRef.current.click();
  };

  const handleFolderPick = (e) => {
    const files = Array.from(e.target.files).filter(f =>
      /\.(jpg|jpeg|png|gif)$/i.test(f.name)
    );
    if (files.length === 0) {
      setStatusMessage('No image files found in that folder.');
      setStatusType('error');
      return;
    }
    const newDeck = { name: newDeckName.trim(), files };
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
      if (prev.length === 0) return prev;
      const updated = prev.filter((_, i) => i !== activeDeckIndex);
      setActiveDeckIndex(Math.max(0, activeDeckIndex - 1));
      setStatusMessage(updated.length === 0 ? 'No decks loaded.' : '✓ Deck removed');
      setStatusType(updated.length === 0 ? 'info' : 'success');
      return updated;
    });
  };

  // ─── Draw ─────────────────────────────────────────────────────────────────────
  const drawSpecificCard = (file) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => placeCard(img, canvas);
    img.src = url;
    setShowCardList(false);
    setCardSearch('');
    setPreviewCard(null);
  };

  const drawCard = () => {
    const canvas = canvasRef.current;
    if (!canvas || decks.length === 0) { alert('Add a deck first.'); return; }
    const activeDeck = decks[activeDeckIndex];
    if (!activeDeck || activeDeck.files.length === 0) return;
    const randomIndex = Math.floor(Math.random() * activeDeck.files.length);
    const url = URL.createObjectURL(activeDeck.files[randomIndex]);
    const img = new Image();
    img.onload = () => placeCard(img, canvas);
    img.src = url;
  };

  const placeCard = (img, canvas) => {
    const vp = viewportRef.current;
    const maxWidth = 150;
    const maxHeight = 220;
    const scale = Math.min(maxWidth / img.width, maxHeight / img.height);
    const worldCenterX = (canvas.width / 2 - vp.x) / vp.scale;
    const worldCenterY = (canvas.height / 2 - vp.y) / vp.scale;
    const card = {
      image: img,
      x: worldCenterX - (img.width * scale) / 2 + (Math.random() - 0.5) * 100,
      y: worldCenterY - (img.height * scale) / 2 + (Math.random() - 0.5) * 100,
      width: img.width * scale,
      height: img.height * scale,
      rotation: 0,
      selected: false,
      locked: false,
    };
    cardsOnCanvasRef.current.push(card);
    setDeckCount(cardsOnCanvasRef.current.length);
    window.redraw();
  };

  // ─── Layer Controls ───────────────────────────────────────────────────────────
  const bringToFront = () => {
    const list = cardsOnCanvasRef.current;
    const idx = list.findIndex(c => c.selected);
    if (idx === -1) return;
    const [card] = list.splice(idx, 1);
    list.push(card);
    window.redraw();
  };

  const sendToBack = () => {
    const list = cardsOnCanvasRef.current;
    const idx = list.findIndex(c => c.selected);
    if (idx === -1) return;
    const [card] = list.splice(idx, 1);
    list.unshift(card);
    window.redraw();
  };

  const bringForward = () => {
    const list = cardsOnCanvasRef.current;
    const idx = list.findIndex(c => c.selected);
    if (idx === -1 || idx === list.length - 1) return;
    [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
    window.redraw();
  };

  const sendBackward = () => {
    const list = cardsOnCanvasRef.current;
    const idx = list.findIndex(c => c.selected);
    if (idx <= 0) return;
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
    cardsOnCanvasRef.current = [];
    setDeckCount(0);
    setHasSelected(false);
    setSelectedLocked(false);
    window.redraw();
  };

  return (
    <div className="app-container">
      <div className="canvas-wrapper">
        <canvas ref={canvasRef} />
        <div className="zoom-indicator">
          <span>{zoomLevel}%</span>
          <button className="btn-reset-zoom" onClick={resetZoom} title="Reset zoom">⊙</button>
        </div>
      </div>

      <aside className="control-panel">
        <div className="panel-header">
          <h1>Card Canvas</h1>
          <p className="deck-counter">Cards on canvas: {deckCount}</p>
        </div>

        <div className="directory-section">
          <label>Active Deck:</label>
          <select
            className="deck-select"
            value={activeDeckIndex}
            onChange={(e) => {
              setActiveDeckIndex(Number(e.target.value));
              const d = decks[Number(e.target.value)];
              setStatusMessage(d ? `✓ "${d.name}" — ${d.files.length} cards` : '');
              setStatusType('success');
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

        <div className="controls">
          <button className="btn btn-primary" onClick={drawCard} disabled={decks.length === 0}>
            🃏 Draw Random Card
          </button>

          <div className="card-search-wrapper">
            <button
              className="btn btn-search-toggle"
              onClick={() => { setShowCardList(!showCardList); setCardSearch(''); setPreviewCard(null); }}
              disabled={decks.length === 0}
            >
              🔍 Draw Specific Card
            </button>

            {showCardList && decks[activeDeckIndex] && (
              <div className="card-list-panel">
                {previewCard && (
                  <div className="card-preview" onMouseEnter={() => clearTimeout(window._previewTimeout)} onMouseLeave={() => { window._previewTimeout = setTimeout(() => setPreviewCard(null), 150); }}>
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
                  {decks[activeDeckIndex].files
                    .filter(f => f.name.toLowerCase().includes(cardSearch.toLowerCase()))
                    .map((file, i) => (
                      <div
                        key={i}
                        className="card-list-item"
                        onClick={() => drawSpecificCard(file)}
                        onMouseEnter={() => { clearTimeout(window._previewTimeout); setPreviewCard({ url: URL.createObjectURL(file), name: file.name }); }}
                        onMouseLeave={() => { window._previewTimeout = setTimeout(() => setPreviewCard(null), 150); }}
                      >
                        {file.name.replace(/\.[^/.]+$/, '')}
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
          <h3>How to Use</h3>
          <ul>
            <li>Click <strong>+ Add</strong> to load a deck</li>
            <li>Switch decks from the dropdown</li>
            <li>Click <strong>Draw Random Card</strong> to deal</li>
            <li>Click card to select, drag to move</li>
            <li>Drag <strong>corner handles</strong> to resize</li>
            <li>Click 🔒 to lock a card in place</li>
            <li>Drag empty space to pan</li>
            <li><strong>Scroll wheel</strong> to zoom</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

export default App;