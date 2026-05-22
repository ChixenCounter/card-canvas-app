# Card Canvas

A standalone desktop application for managing and displaying card images on a virtual tabletop canvas. Built with React and Electron.

![Card Canvas](https://img.shields.io/badge/version-1.0-blue) ![Platform](https://img.shields.io/badge/platform-Windows-lightgrey) ![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- **Multiple Decks** — Load as many card decks as you want from any folder on your computer. Switch between them instantly with a dropdown selector.
- **Draw Cards** — Draw a random card from the active deck, or search and pick a specific card with a hover preview.
- **Canvas Manipulation** — Drag cards anywhere on the canvas. Pan around by dragging empty space. Zoom in and out with the scroll wheel.
- **Resize** — Drag the corner handles of any selected card to resize it freely.
- **Rotate** — Rotate selected cards with the panel buttons, arrow keys, or type an exact angle.
- **Layer Control** — Move cards in front of or behind each other using panel buttons or arrow keys.
- **Lock** — Double-click any card to lock it in place. Locked cards can't be moved, resized, rotated, or deleted until unlocked.
- **Grid** — Toggle a grid overlay with adjustable size (25, 50, 100, or 200px). Enable snap-to-grid for precise placement.
- **Save & Load Layouts** — Save your canvas arrangement as a named layout. Load it back later with all cards restored to their exact positions, sizes, rotations, and lock states.
- **Undo** — Step back through your last 30 actions with Ctrl+Z.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `← →` | Rotate selected card 15° |
| `↑ ↓` | Move selected card back/forward in layer stack |
| `Delete` | Remove selected card |
| `Ctrl+S` | Save layout |
| `Ctrl+Z` | Undo |
| `Double-click` | Lock / unlock a card |

---

## Getting Started

### Running the Installer

1. Download `Card Canvas Setup.exe` from the releases page
2. Run the installer and follow the wizard
3. Launch **Card Canvas** from your Start Menu or Desktop shortcut

> **Note:** Windows may show a "Windows protected your PC" warning on first launch since the app isn't code-signed. Click **More info → Run anyway** to proceed.

---

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org) (LTS version)
- [Git](https://git-scm.com)

### Installation

```bash
git clone https://github.com/yourusername/card-canvas-app.git
cd card-canvas-app
npm install
```

### Running in Development

Open two terminals:

**Terminal 1** — Start React:
```bash
npm start
```

**Terminal 2** — Start Electron (once React says "Compiled successfully"):
```bash
.\node_modules\.bin\electron .
```

### Building a Production Installer

**Step 1:** Build the React app:
```bash
npm run build
```

**Step 2:** Package with Electron:
```bash
.\node_modules\.bin\electron-packager . "Card Canvas" --platform=win32 --arch=x64 --out=dist --overwrite --ignore=node_modules --ignore=dist --ignore=public/cards --ignore=src --ignore=installer --ignore=".git"
```

**Step 3:** Compile the installer using [Inno Setup](https://jrsoftware.org/isdl.php):
1. Open Inno Setup Compiler
2. Open `installer.iss`
3. Press **F9**

The installer will be saved to the `installer` folder.

---

## How to Use

### Loading Cards

1. Type a name for your deck in the **Deck name** field
2. Click **+ Add** — a folder picker will open
3. Select a folder containing your card images (JPG, PNG, or GIF)
4. The deck will appear in the dropdown ready to use

### Drawing Cards

- Click **🃏 Draw Random Card** to pull a random card onto the canvas
- Click **🔍 Draw Specific Card** to search and pick a card by name — hover over a name to preview the image

### Managing the Canvas

- **Select** a card by clicking it
- **Move** by dragging
- **Resize** by dragging a corner handle
- **Rotate** using the panel buttons, ← → keys, or the angle input
- **Layer** using the Front/Back/Forward/Backward buttons or ↑ ↓ keys
- **Lock** by double-clicking — locked cards show a 🔒 badge
- **Delete** selected card with the Delete key or panel button
- **Zoom** with the scroll wheel — click ⊙ to reset
- **Pan** by dragging empty canvas space

### Saving and Loading Layouts

1. Click **💾 Save Layout** and give it a name
2. Your card positions, sizes, rotations, and lock states are all saved
3. Click **📂 Load Layout** to restore a saved arrangement

---

## Project Structure

```
card-canvas-app/
├── src/
│   ├── App.js          # Main React application
│   └── App.css         # Styles
├── public/
│   └── index.html      # HTML entry point
├── electron.js         # Electron main process
├── preload.js          # Electron preload script
├── installer.iss       # Inno Setup installer script
└── package.json
```

---

## Tech Stack

- **React** — UI framework
- **HTML5 Canvas** — Card rendering and manipulation
- **Electron** — Desktop app wrapper
- **Inno Setup** — Windows installer

---

## License

MIT License — feel free to use, modify, and distribute.