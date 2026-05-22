import React, { useEffect, useRef, useState } from 'react';
import './App.css';

function App() {
  const canvasRef = useRef(null);
  const [cards, setCards] = useState([]);
  const [deckCount, setDeckCount] = useState(0);
  const [cardDirectory, setCardDirectory] = useState('cards');
  const [dirInput, setDirInput] = useState('cards');
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

    loadCardsFromManifest('cards');

    let selectedCard = null;
    let offsetX = 0;
    let offsetY = 0;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;

    // Convert screen coords to world coords
    const toWorld = (sx, sy) => {
      const vp = viewportRef.current;
      return {
        x: (sx - vp.x) / vp.scale,
        y: (sy - vp.y) / vp.scale,
      };
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
        // Start panning
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

    canvas.addEventListener('mouseup', () => {
      selectedCard = null;
      isPanning = false;
    });

    canvas.addEventListener('mouseleave', () => {
      selectedCard = null;
      isPanning = false;
    });

    // Zoom with mouse wheel
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const vp = viewportRef.current;
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(Math.max(vp.scale * zoomFactor, 0.2), 5);

      // Zoom toward mouse position
      vp.x = sx - (sx - vp.x) * (newScale / vp.scale);
      vp.y = sy - (sy - vp.y) * (newScale / vp.scale);
      vp.scale = newScale;

      setZoomLevel(Math.round(newScale * 100));
      redraw();
    }, { passive: false });

    const redraw = () => {
      const vp = viewportRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Apply viewport transform
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

  const loadCardsFromManifest = async (dirPath) => {
    try {
      setStatusMessage('Loading...');
      setStatusType('info');
      const response = await fetch(`/${dirPath}/manifest.json`);
      if (!response.ok) {
        setStatusMessage(`No manifest.json found in /${dirPath}`);
        setStatusType('error');
        setCards([]);
        return;
      }
      const fileList = await response.json();
      const imageFiles = fileList.filter(f => /\.(jpg|jpeg|png|gif)$/i.test(f));
      if (imageFiles.length === 0) {
        setStatusMessage('No images found in manifest.');
        setStatusType('error');
        setCards([]);
        return;
      }
      setCards(imageFiles);
      setLoadedFiles([]);
      setCardDirectory(dirPath);
      setStatusMessage(`✓ ${imageFiles.length} cards loaded from /${dirPath}`);
      setStatusType('success');
    } catch (error) {
      setStatusMessage(`Error: ${error.message}`);
      setStatusType('error');
      setCards([]);
    }
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
    setCardDirectory('__local__');
    setStatusMessage(`✓ ${files.length} cards loaded from folder`);
    setStatusType('success');
    e.target.value = '';
  };

  const generateManifest = async () => {
    const dir = dirInput.trim();
    if (!dir) return;
    try {
      const command = `node -e "const fs=require('fs');const files=fs.readdirSync('./public/${dir}').filter(f=>/\\\\.(jpg|jpeg|png|gif)$/i.test(f));fs.writeFileSync('./public/${dir}/manifest.json',JSON.stringify(files,null,2));console.log('Done! Found '+files.length+' cards.');"`;
      await navigator.clipboard.writeText(command);
      setStatusMessage('✓ Command copied! Paste in terminal, then click Load.');
      setStatusType('success');
    } catch {
      setStatusMessage('Could not copy. Run the manifest command manually.');
      setStatusType('error');
    }
  };

  const drawCard = () => {
    const canvas = canvasRef.current;
    if (!canvas || cards.length === 0) { alert('No cards loaded.'); return; }
    const randomIndex = Math.floor(Math.random() * cards.length);
    if (cardDirectory === '__local__' && loadedFiles.length > 0) {
      const file = loadedFiles[randomIndex];
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => placeCard(img, canvas);
      img.src = url;
      return;
    }
    const cardPath = `/${cardDirectory}/${cards[randomIndex]}`;
    const img = new Image();
    img.onload = () => placeCard(img, canvas);
    img.onerror = () => alert(`Failed to load: ${cards[randomIndex]}`);
    img.src = cardPath;
  };

  const placeCard = (img, canvas) => {
    const vp = viewportRef.current;
    const maxWidth = 150;
    const maxHeight = 220;
    const scale = Math.min(maxWidth / img.width, maxHeight / img.height);

    // Place card in center of current view
    const worldCenterX = (canvas.width / 2 - vp.x) / vp.scale;
    const worldCenterY = (canvas.height / 2 - vp.y) / vp.scale;
    const jitter = 100;

    const card = {
      image: img,
      x: worldCenterX - (img.width * scale) / 2 + (Math.random() - 0.5) * jitter,
      y: worldCenterY - (img.height * scale) / 2 + (Math.random() - 0.5) * jitter,
      width: img.width * scale,
      height: img.height * scale,
      rotation: 0,
      selected: false,
    };
    cardsOnCanvasRef.current.push(card);
    setDeckCount(cardsOnCanvasRef.current.length);
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
          <label>Load Cards From Folder:</label>
          <button className="btn btn-folder" onClick={() => folderInputRef.current.click()}>
            📁 Pick Folder
          </button>
          <input ref={folderInputRef} type="file" webkitdirectory="true" multiple
            style={{ display: 'none' }} onChange={handleFolderPick} />
          <div className="divider">— or use public/ folder —</div>
          <div className="dir-row">
            <input type="text" placeholder="folder name" value={dirInput}
              onChange={(e) => setDirInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && loadCardsFromManifest(dirInput)}
              className="dir-input" />
            <button className="btn btn-load" onClick={() => loadCardsFromManifest(dirInput)}>Load</button>
          </div>
          <button className="btn btn-manifest" onClick={generateManifest}>⚙ Generate Manifest</button>
          <p className={`status-message status-${statusType}`}>{statusMessage}</p>
        </div>

        <div className="controls">
          <button className="btn btn-primary" onClick={drawCard}>🃏 Draw Random Card</button>
          <div className="rotation-controls">
            <button className="btn btn-secondary" onClick={() => rotateSelected(-15)}>↻ Left</button>
            <button className="btn btn-secondary" onClick={() => rotateSelected(15)}>Right ↻</button>
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
            <li>Click ⊙ to reset zoom</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

export default App;