import React, { useEffect, useRef, useState } from 'react';
import './App.css';

function App() {
  const canvasRef = useRef(null);
  const [cards, setCards] = useState([]);
  const [deckCount, setDeckCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState('info');
  const [loadedFiles, setLoadedFiles] = useState([]);
  const [zoomLevel, setZoomLevel] = useState(100);
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

    let selectedCard = null;
    let offsetX = 0;
    let offsetY = 0;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;

    const toWorld = (sx, sy) => {
      const vp = viewportRef.current;
      return { x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale };
    };

    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { x, y } = toWorld(sx, sy);

      const found = [...cardsOnCanvasRef.current].reverse().find(card =>
        x > card.x && x < card.x + card.width &&
        y > card.y && y < card.y + card.height
      );

      cardsOnCanvasRef.current.forEach(c => c.selected = false);

      if (found) {
        selectedCard = found;
        offsetX = x - found.x;
        offsetY = y - found.y;
        found.selected = true;
        redraw();
      } else {
        selectedCard = null;
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

      if (selectedCard) {
        const { x, y } = toWorld(sx, sy);
        selectedCard.x = x - offsetX;
        selectedCard.y = y - offsetY;
        redraw();
      } else if (isPanning) {
        viewportRef.current.x = sx - panStartX;
        viewportRef.current.y = sy - panStartY;
        redraw();
      }
    });

    canvas.addEventListener('mouseup', () => { selectedCard = null; isPanning = false; });
    canvas.addEventListener('mouseleave', () => { selectedCard = null; isPanning = false; });

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
        if (card.selected) {
          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = '#00d4ff';
          ctx.lineWidth = 3 / vp.scale;
          ctx.strokeRect(-card.width / 2 - 3, -card.height / 2 - 3, card.width + 6, card.height + 6);
        }
        ctx.restore();
      });

      ctx.restore();
    };

    window.redraw = redraw;
  }, []);

  const resetZoom = () => {
    viewportRef.current = { x: 0, y: 0, scale: 1 };
    setZoomLevel(100);
    window.redraw();
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
    setLoadedFiles(files);
    setCards(files.map(f => f.name));
    setStatusMessage(`✓ ${files.length} cards ready`);
    setStatusType('success');
    e.target.value = '';
  };

  const drawCard = () => {
    const canvas = canvasRef.current;
    if (!canvas || loadedFiles.length === 0) {
      alert('Pick a folder of card images first.');
      return;
    }
    const randomIndex = Math.floor(Math.random() * loadedFiles.length);
    const url = URL.createObjectURL(loadedFiles[randomIndex]);
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
    };
    cardsOnCanvasRef.current.push(card);
    setDeckCount(cardsOnCanvasRef.current.length);
    window.redraw();
  };

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
    cardsOnCanvasRef.current = cardsOnCanvasRef.current.filter(c => !c.selected);
    setDeckCount(cardsOnCanvasRef.current.length);
    window.redraw();
  };

  const rotateSelected = (degrees) => {
    const selected = cardsOnCanvasRef.current.find(c => c.selected);
    if (selected) { selected.rotation = (selected.rotation || 0) + degrees; window.redraw(); }
  };

  const clearCanvas = () => {
    cardsOnCanvasRef.current = [];
    setDeckCount(0);
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
          <label>Card Deck:</label>
          <button className="btn btn-folder" onClick={() => folderInputRef.current.click()}>
            📁 Pick Folder
          </button>
          <input ref={folderInputRef} type="file" webkitdirectory="true" multiple
            style={{ display: 'none' }} onChange={handleFolderPick} />
          <p className={`status-message status-${statusType}`}>{statusMessage}</p>
        </div>

        <div className="controls">
          <button className="btn btn-primary" onClick={drawCard}>🃏 Draw Random Card</button>

          <div className="section-label">Rotate Selected</div>
          <div className="rotation-controls">
            <button className="btn btn-secondary" onClick={() => rotateSelected(-15)}>↻ Left</button>
            <button className="btn btn-secondary" onClick={() => rotateSelected(15)}>Right ↻</button>
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
            <li>Click <strong>Pick Folder</strong> to load cards</li>
            <li>Click <strong>Draw Random Card</strong> to deal</li>
            <li>Click a card to select, drag to move</li>
            <li>Drag empty space to pan</li>
            <li><strong>Scroll wheel</strong> to zoom in/out</li>
            <li>Use <strong>Layer</strong> buttons to stack cards</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

export default App;