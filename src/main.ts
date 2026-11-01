import "./style.css";

type ViewMode = "solo" | "stack";
type SelectionTool = "rect" | "lasso";
type FitMode = "contain" | "cover";
type Backdrop = "checker" | "ink" | "paper";
type HistoryMode = "push" | "replace" | "none";

interface StackImage {
  id: string;
  name: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
  url: string;
  blob: Blob;
  fingerprint: string;
  layer: HTMLImageElement;
}

interface Point {
  x: number;
  y: number;
}

interface ScreenPoint {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  rect: DOMRect;
  tool: SelectionTool;
  start: ScreenPoint;
  current: ScreenPoint;
  points: ScreenPoint[];
}

interface SavedImageMeta {
  id: string;
  name: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
  fingerprint: string;
}

interface SavedImageRecord extends SavedImageMeta {
  blob: Blob;
}

interface SavedSession {
  version: 1;
  images: SavedImageMeta[];
  activeId: string | null;
  viewMode: ViewMode;
  fitMode: FitMode;
  backdrop: Backdrop;
  stackOpacity: number;
  stageAspect: number;
  stageSource: { width: number; height: number } | null;
  lasso: Point[] | null;
  selectionTool?: SelectionTool;
}

const SUPPORTED_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "jfif",
  "webp",
  "avif",
  "gif",
  "apng",
  "svg",
  "bmp",
  "ico",
  "tif",
  "tiff",
]);

const MIME_LABELS: Record<string, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WEBP",
  "image/avif": "AVIF",
  "image/gif": "GIF",
  "image/svg+xml": "SVG",
  "image/bmp": "BMP",
  "image/x-icon": "ICO",
  "image/tiff": "TIFF",
  "image/heic": "HEIC",
  "image/heif": "HEIF",
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root is missing");

app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <div class="brand" aria-label="Stack">
        <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="brand-name">Stack</span>
        <span class="brand-tag">aligned image viewer</span>
      </div>

      <div class="topbar-actions">
        <button class="btn btn-ghost" id="pasteBtn" type="button" title="Paste from clipboard">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M5.5 4.5h5M5.5 7.5h5M5.5 10.5h3" />
            <rect x="3" y="2" width="10" height="12" rx="2" />
            <path d="M6 2V1.5h4V2" />
          </svg>
          <span>Paste</span>
          <kbd>⌘V</kbd>
        </button>
        <button class="btn btn-primary" id="addBtn" type="button">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.2v9.6M3.2 8h9.6" /></svg>
          <span>Add images</span>
        </button>
        <button class="icon-btn" id="helpBtn" type="button" aria-label="Keyboard shortcuts and help">?</button>
      </div>
    </header>

    <main class="workspace">
      <aside class="rail" aria-label="Image stack">
        <div class="rail-top">
          <div>
            <div class="rail-eyebrow">The stack</div>
            <div class="rail-title"><span id="count">0</span> <span id="countWord">images</span></div>
          </div>
          <button class="clear-btn" id="clearBtn" type="button" disabled>Clear</button>
        </div>
        <p class="rail-note">Click a frame to bring it forward.</p>

        <div class="thumbs" id="thumbs"></div>

        <div class="rail-empty" id="railEmpty">
          <span class="rail-empty-icon" aria-hidden="true"></span>
          <span>Nothing stacked yet.<br /><em>Add an image to begin.</em></span>
        </div>

        <button class="add-row" id="addBtn2" type="button">
          <span class="plus" aria-hidden="true">+</span>
          <span>Add images</span>
          <span class="add-row-hint">⌘V</span>
        </button>

        <div class="rail-foot">
          <span class="tiny-stack" aria-hidden="true"><i></i><i></i><i></i></span>
          <span>Saved locally. Unlimited layers.</span>
        </div>
      </aside>

      <section class="viewer" aria-label="Image viewer">
        <header class="viewer-head">
          <div class="file-block">
            <div class="eyebrow" id="viewLabel">No images yet</div>
            <h1 id="fileName">Drop a few images</h1>
            <p class="file-meta" id="fileMeta">Everything lands in the same frame.</p>
          </div>

          <div class="viewer-head-right">
            <div class="zoom-hud" id="zoomHud" hidden>
              <span class="zoom-level">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="7" cy="7" r="4.5" />
                  <path d="m10.4 10.4 3.1 3.1M5.2 7h3.6M7 5.2v3.6" />
                </svg>
                <b id="zoomLevel">2.0×</b>
              </span>
              <button class="zoom-full" id="fullImageBtn" type="button" title="Show the full image (0)">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M6 2.5H2.5V6M10 2.5h3.5V6M6 13.5H2.5V10M10 13.5h3.5V10" />
                </svg>
                <span>Full image</span>
                <kbd>0</kbd>
              </button>
            </div>

            <div class="stepper" aria-label="Image navigation">
              <button class="step-btn" id="backBtn" type="button" aria-label="Previous image" title="Previous image (←)" disabled>
                <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M11.5 3.5 6 9l5.5 5.5" /></svg>
              </button>
              <div class="step-count"><b id="activeIndex">—</b><span>/</span><span id="totalCount">—</span></div>
              <button class="step-btn" id="nextBtn" type="button" aria-label="Next image" title="Next image (→)" disabled>
                <svg viewBox="0 0 18 18" aria-hidden="true"><path d="m6.5 3.5 5.5 5.5-5.5 5.5" /></svg>
              </button>
            </div>
          </div>
        </header>

        <div class="stage-area" id="stageArea">
          <div class="stage" id="stage" data-backdrop="checker" data-fit="contain">
            <div class="zoom-viewport" id="zoomViewport">
              <div class="layers" id="layers"></div>
            </div>

            <svg class="lasso-overlay" id="lassoOverlay" aria-hidden="true" hidden>
              <path class="lasso-shade" id="lassoShade"></path>
              <path class="lasso-stroke" id="lassoStroke"></path>
              <circle class="lasso-dot" id="lassoDot" r="3"></circle>
            </svg>



            <div class="empty" id="emptyState">
              <div class="empty-icon" aria-hidden="true">
                <i></i><i></i><i></i>
              </div>
              <h2>One frame.<br />Every version.</h2>
              <p>Drop images anywhere or paste with <kbd>⌘</kbd><kbd>V</kbd>. They stack in place, so flipping between them never shifts a pixel.</p>
              <div class="empty-actions">
                <button class="btn btn-primary" id="emptyAdd" type="button">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.2v9.6M3.2 8h9.6" /></svg>
                  Choose images
                </button>
                <button class="btn btn-ghost" id="emptyPaste" type="button">Paste</button>
              </div>
              <div class="formats">PNG · JPG · WEBP · AVIF · GIF · SVG</div>
            </div>

          </div>
        </div>

        <div class="controls" id="controls">
          <div class="control-group">
            <span class="control-label">View</span>
            <div class="segmented" id="viewMode" role="group" aria-label="View mode">
              <button type="button" data-value="solo" aria-pressed="true">Solo</button>
              <button type="button" data-value="stack" aria-pressed="false">Stack</button>
            </div>
          </div>

          <div class="control-group">
            <span class="control-label">Select</span>
            <div class="segmented" id="selectionTool" role="group" aria-label="Selection tool">
              <button type="button" data-value="rect" aria-pressed="true">Rect</button>
              <button type="button" data-value="lasso" aria-pressed="false">Lasso</button>
            </div>
          </div>

          <div class="control-group control-opacity is-disabled" id="opacityGroup">
            <label class="control-label" for="opacityRange">Layer opacity</label>
            <div class="range-wrap">
              <input id="opacityRange" type="range" min="10" max="90" step="1" value="45" disabled />
              <output id="opacityOutput" for="opacityRange">45%</output>
            </div>
          </div>

          <div class="control-group">
            <span class="control-label">Frame</span>
            <div class="segmented" id="fitMode" role="group" aria-label="Frame fitting">
              <button type="button" data-value="contain" aria-pressed="true">Fit</button>
              <button type="button" data-value="cover" aria-pressed="false">Fill</button>
            </div>
          </div>

          <div class="control-group">
            <span class="control-label">Backdrop</span>
            <div class="swatches" id="backdrop" role="group" aria-label="Stage backdrop">
              <button class="swatch swatch-checker" type="button" data-value="checker" aria-label="Checkerboard backdrop" aria-pressed="true"></button>
              <button class="swatch swatch-ink" type="button" data-value="ink" aria-label="Black backdrop" aria-pressed="false"></button>
              <button class="swatch swatch-paper" type="button" data-value="paper" aria-label="Paper backdrop" aria-pressed="false"></button>
            </div>
          </div>

          <div class="controls-spacer"></div>
          <button class="reset-btn" id="resetBtn" type="button" disabled>Reset view</button>
        </div>

        <footer class="viewer-foot">
          <p><span class="status-dot" aria-hidden="true"></span><span id="statusText">Your images stay in one fixed frame.</span></p>
          <p class="foot-keys"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> move <span>·</span> draw to zoom <span>·</span> <kbd>0</kbd> full image</p>
        </footer>
      </section>
    </main>
  </div>

  <div class="drag-overlay" id="dragOverlay" aria-hidden="true">
    <div class="drag-card">
      <div class="drag-icon" aria-hidden="true"><span></span><span></span><span></span></div>
      <strong>Drop to stack</strong>
      <span>They land in the same frame.</span>
    </div>
  </div>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>

  <dialog class="help-dialog" id="helpDialog">
    <div class="help-top">
      <div>
        <div class="rail-eyebrow">Reference</div>
        <h2>Shortcuts &amp; details</h2>
      </div>
      <form method="dialog">
        <button class="icon-btn" type="submit" aria-label="Close help">×</button>
      </form>
    </div>

    <div class="shortcut-list">
      <div><span>Previous / next image</span><span class="keys"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></span></div>
      <div><span>Select a region</span><span class="keys"><span class="drag-key">drag on image</span></span></div>
      <div><span>Back to the full image</span><span class="keys"><kbd>0</kbd><kbd>Esc</kbd></span></div>
      <div><span>Paste from clipboard</span><span class="keys"><kbd>⌘</kbd><kbd>V</kbd></span></div>
      <div><span>Jump to image 1–9</span><span class="keys"><kbd>1</kbd>…<kbd>9</kbd></span></div>
      <div><span>Toggle Stack view</span><span class="keys"><kbd>O</kbd></span></div>
      <div><span>Reset the view options</span><span class="keys"><kbd>R</kbd></span></div>
      <div><span>Open this panel</span><span class="keys"><kbd>?</kbd></span></div>
    </div>

    <div class="help-note">
      <p><strong>Browser Back works too.</strong> Click a thumbnail, then use Back or Forward and Stack returns to the images you viewed. The frame never moves.</p>
      <p><strong>Zoom stays put.</strong> Rect is the default: drag any width and height, with no aspect lock. Switch to Lasso for a freehand shape. Only the selected region is shown, and the viewer resizes to the crop so there is no checkerboard padding around it. Switch images with the arrows and you keep looking at exactly the same region. Press <kbd>0</kbd> or <kbd>Esc</kbd> for the full image.</p>
      <p>Paste works with screenshots and copied image files on macOS. Stack accepts anything your browser can decode: PNG, JPG, WEBP, AVIF, GIF, SVG, BMP, and more. HEIC support depends on the browser.</p>
      <p><strong>Your stack is saved locally.</strong> Reloading the page or updating the app brings back the same images, active image, view options, and lasso zoom.</p>
    </div>

    <div class="help-formats">
      <span>PNG</span><span>JPG</span><span>WEBP</span><span>AVIF</span><span>GIF</span><span>SVG</span><span>+ more</span>
    </div>
  </dialog>

  <input id="fileInput" type="file" accept="image/*,.webp,.avif,.png,.jpg,.jpeg,.gif,.svg,.bmp,.ico,.tif,.tiff" multiple hidden />
`;

const $ = <T extends Element>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing element: ${selector}`);
  return node;
};

const els = {
  count: $<HTMLSpanElement>("#count"),
  countWord: $<HTMLSpanElement>("#countWord"),
  clearBtn: $<HTMLButtonElement>("#clearBtn"),
  thumbs: $<HTMLDivElement>("#thumbs"),
  railEmpty: $<HTMLDivElement>("#railEmpty"),
  addBtn: $<HTMLButtonElement>("#addBtn"),
  addBtn2: $<HTMLButtonElement>("#addBtn2"),
  emptyAdd: $<HTMLButtonElement>("#emptyAdd"),
  emptyPaste: $<HTMLButtonElement>("#emptyPaste"),
  pasteBtn: $<HTMLButtonElement>("#pasteBtn"),
  helpBtn: $<HTMLButtonElement>("#helpBtn"),
  helpDialog: $<HTMLDialogElement>("#helpDialog"),
  fileInput: $<HTMLInputElement>("#fileInput"),
  backBtn: $<HTMLButtonElement>("#backBtn"),
  nextBtn: $<HTMLButtonElement>("#nextBtn"),
  activeIndex: $<HTMLElement>("#activeIndex"),
  totalCount: $<HTMLElement>("#totalCount"),
  viewLabel: $<HTMLDivElement>("#viewLabel"),
  fileName: $<HTMLHeadingElement>("#fileName"),
  fileMeta: $<HTMLParagraphElement>("#fileMeta"),
  stageArea: $<HTMLDivElement>("#stageArea"),
  stage: $<HTMLDivElement>("#stage"),
  zoomViewport: $<HTMLDivElement>("#zoomViewport"),
  layers: $<HTMLDivElement>("#layers"),
  lassoOverlay: $<SVGSVGElement>("#lassoOverlay"),
  lassoShade: $<SVGPathElement>("#lassoShade"),
  lassoStroke: $<SVGPathElement>("#lassoStroke"),
  lassoDot: $<SVGCircleElement>("#lassoDot"),
  zoomHud: $<HTMLDivElement>("#zoomHud"),
  zoomLevel: $<HTMLElement>("#zoomLevel"),
  fullImageBtn: $<HTMLButtonElement>("#fullImageBtn"),
  emptyState: $<HTMLDivElement>("#emptyState"),
  viewMode: $<HTMLDivElement>("#viewMode"),
  selectionTool: $<HTMLDivElement>("#selectionTool"),
  opacityGroup: $<HTMLDivElement>("#opacityGroup"),
  opacityRange: $<HTMLInputElement>("#opacityRange"),
  opacityOutput: $<HTMLOutputElement>("#opacityOutput"),
  fitMode: $<HTMLDivElement>("#fitMode"),
  backdrop: $<HTMLDivElement>("#backdrop"),
  resetBtn: $<HTMLButtonElement>("#resetBtn"),
  statusText: $<HTMLSpanElement>("#statusText"),
  dragOverlay: $<HTMLDivElement>("#dragOverlay"),
  toast: $<HTMLDivElement>("#toast"),
};

let images: StackImage[] = [];
let activeId: string | null = null;
let viewMode: ViewMode = "solo";
let fitMode: FitMode = "contain";
let backdrop: Backdrop = "checker";
let stackOpacity = 0.45;
let stageAspect = 4 / 3;
let stageSource: { width: number; height: number } | null = null;
let lassoSelection: Point[] | null = null;
let selectionTool: SelectionTool = "rect";
let dragState: DragState | null = null;
let pasteSequence = 0;
let dragDepth = 0;
let toastTimer: number | undefined;
let persistenceEnabled = false;
let persistTimer: number | undefined;
let dbPromise: Promise<IDBDatabase> | null = null;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function getActive(): StackImage | null {
  return images.find((image) => image.id === activeId) ?? null;
}

function getActiveIndex(): number {
  return images.findIndex((image) => image.id === activeId);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** power;
  return `${value >= 10 || power === 0 ? Math.round(value) : value.toFixed(1)} ${units[power]}`;
}

function extensionOf(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function formatOf(file: File): string {
  const mime = MIME_LABELS[file.type.toLowerCase()];
  if (mime) return mime;
  const ext = extensionOf(file.name);
  if (ext === "jpeg" || ext === "jfif") return "JPG";
  if (ext === "svg") return "SVG";
  if (ext) return ext.toUpperCase();
  return "IMAGE";
}

function isImageFile(file: File): boolean {
  if (file.type.toLowerCase().startsWith("image/")) return true;
  return SUPPORTED_EXTENSIONS.has(extensionOf(file.name));
}

function normalizedName(file: File, format: string): string {
  const raw = file.name.trim();
  const generic = !raw || /^(image|blob|clipboard)(\.[a-z0-9]+)?$/i.test(raw);
  if (!generic) return raw;
  pasteSequence += 1;
  return `Pasted image ${pad(pasteSequence)}.${format.toLowerCase()}`;
}

function fingerprintOf(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function loadStackImage(file: File): Promise<StackImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const layer = new Image();
    layer.alt = "";
    layer.draggable = false;
    layer.decoding = "async";
    layer.className = "image-layer";

    const fail = (): void => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not decode ${file.name || "the image"}.`));
    };

    layer.onload = () => {
      const width = layer.naturalWidth;
      const height = layer.naturalHeight;
      if (!width || !height) {
        fail();
        return;
      }

      const format = formatOf(file);
      resolve({
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: normalizedName(file, format),
        format,
        bytes: file.size,
        width,
        height,
        url,
        blob: file,
        fingerprint: fingerprintOf(file),
        layer,
      });
    };
    layer.onerror = fail;
    layer.src = url;
  });
}

const DB_NAME = "stack-image-viewer";
const DB_VERSION = 1;
const IMAGE_STORE = "images";
const SESSION_STORE = "session";
const SESSION_KEY = "current";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(IMAGE_STORE)) {
        database.createObjectStore(IMAGE_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(SESSION_STORE)) {
        database.createObjectStore(SESSION_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB"));
  });

  return dbPromise;
}

async function dbGetAll<T>(storeName: string): Promise<T[]> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  return requestResult(transaction.objectStore(storeName).getAll() as IDBRequest<T[]>);
}

async function dbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  return requestResult(transaction.objectStore(storeName).get(key) as IDBRequest<T | undefined>);
}

async function dbPut(storeName: string, value: unknown, key?: IDBValidKey): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  const request = key === undefined ? store.put(value) : store.put(value, key);
  await requestResult(request);
}

async function dbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  await requestResult(transaction.objectStore(storeName).delete(key));
}

async function dbClear(storeName: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  await requestResult(transaction.objectStore(storeName).clear());
}

function savedMeta(image: StackImage): SavedImageMeta {
  return {
    id: image.id,
    name: image.name,
    format: image.format,
    bytes: image.bytes,
    width: image.width,
    height: image.height,
    fingerprint: image.fingerprint,
  };
}

function currentSession(): SavedSession {
  return {
    version: 1,
    images: images.map(savedMeta),
    activeId,
    viewMode,
    fitMode,
    backdrop,
    stackOpacity,
    stageAspect,
    stageSource,
    lasso: lassoSelection ? lassoSelection.map((point) => ({ ...point })) : null,
    selectionTool,
  };
}

async function persistSession(): Promise<void> {
  if (!persistenceEnabled) return;

  try {
    if (!images.length) {
      await dbDelete(SESSION_STORE, SESSION_KEY);
      return;
    }
    await dbPut(SESSION_STORE, currentSession(), SESSION_KEY);
  } catch (error) {
    console.warn("Stack could not save its session", error);
  }
}

function schedulePersist(): void {
  if (!persistenceEnabled) return;
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    void persistSession();
  }, 250);
}

async function persistStoredImages(newImages: StackImage[]): Promise<void> {
  if (!persistenceEnabled) return;

  try {
    await Promise.all(
      newImages.map((image) =>
        dbPut(IMAGE_STORE, {
          ...savedMeta(image),
          blob: image.blob,
        } satisfies SavedImageRecord),
      ),
    );
    await persistSession();
  } catch (error) {
    console.warn("Stack could not save an image", error);
  }
}

async function forgetStoredImage(id: string): Promise<void> {
  if (!persistenceEnabled) return;
  try {
    await dbDelete(IMAGE_STORE, id);
    await persistSession();
  } catch (error) {
    console.warn("Stack could not remove a saved image", error);
  }
}

async function clearStoredImages(): Promise<void> {
  if (!persistenceEnabled) return;
  try {
    await dbClear(IMAGE_STORE);
    await dbDelete(SESSION_STORE, SESSION_KEY);
  } catch (error) {
    console.warn("Stack could not clear saved images", error);
  }
}

function imageFromRecord(record: SavedImageRecord): StackImage | null {
  if (!(record.blob instanceof Blob) || !record.width || !record.height) return null;

  const url = URL.createObjectURL(record.blob);
  const layer = new Image();
  layer.alt = "";
  layer.draggable = false;
  layer.decoding = "async";
  layer.className = "image-layer";
  layer.src = url;

  return {
    id: record.id,
    name: record.name,
    format: record.format,
    bytes: record.bytes,
    width: record.width,
    height: record.height,
    url,
    blob: record.blob,
    fingerprint: record.fingerprint,
    layer,
  };
}

async function restoreSession(): Promise<number> {
  try {
    const [saved, records] = await Promise.all([
      dbGet<SavedSession>(SESSION_STORE, SESSION_KEY),
      dbGetAll<SavedImageRecord>(IMAGE_STORE),
    ]);

    if (!saved || saved.version !== 1 || !Array.isArray(saved.images)) return 0;

    const recordsById = new Map(records.map((record) => [record.id, record]));
    for (const meta of saved.images) {
      const record = recordsById.get(meta.id);
      if (!record) continue;
      const image = imageFromRecord(record);
      if (!image) continue;
      images.push(image);
      els.layers.append(image.layer);
    }

    if (!images.length) return 0;

    viewMode = saved.viewMode === "stack" ? "stack" : "solo";
    fitMode = saved.fitMode === "cover" ? "cover" : "contain";
    backdrop = saved.backdrop === "ink" || saved.backdrop === "paper" ? saved.backdrop : "checker";
    stackOpacity = Number.isFinite(saved.stackOpacity)
      ? Math.min(0.9, Math.max(0.1, saved.stackOpacity))
      : 0.45;
    stageAspect =
      Number.isFinite(saved.stageAspect) && saved.stageAspect > 0
        ? saved.stageAspect
        : images[0].width / images[0].height;
    stageSource =
      saved.stageSource && saved.stageSource.width > 0 && saved.stageSource.height > 0
        ? saved.stageSource
        : { width: images[0].width, height: images[0].height };
    lassoSelection = sanitizeLasso(saved.lasso);
    selectionTool = saved.selectionTool === "lasso" ? "lasso" : "rect";
    activeId = images.some((image) => image.id === saved.activeId) ? saved.activeId : images[0].id;
    return images.length;
  } catch (error) {
    console.warn("Stack could not restore its session", error);
    return 0;
  }
}

function renderThumbs(): void {
  els.thumbs.replaceChildren();
  const fragment = document.createDocumentFragment();

  images.forEach((image, index) => {
    const item = document.createElement("div");
    item.className = `thumb${image.id === activeId ? " is-active" : ""}`;
    item.dataset.id = image.id;

    const hit = document.createElement("button");
    hit.type = "button";
    hit.className = "thumb-hit";
    hit.setAttribute("aria-label", `Bring ${image.name} forward`);
    if (image.id === activeId) hit.setAttribute("aria-current", "true");

    const art = document.createElement("span");
    art.className = "thumb-art";
    const preview = document.createElement("img");
    preview.src = image.url;
    preview.alt = "";
    preview.draggable = false;
    art.append(preview);

    const copy = document.createElement("span");
    copy.className = "thumb-copy";
    const name = document.createElement("strong");
    name.className = "thumb-name";
    name.textContent = image.name;
    const meta = document.createElement("span");
    meta.className = "thumb-meta";
    meta.textContent = `${pad(index + 1)} · ${image.format} · ${image.width} × ${image.height}`;
    copy.append(name, meta);

    const indexBadge = document.createElement("span");
    indexBadge.className = "thumb-index";
    indexBadge.textContent = pad(index + 1);

    hit.append(art, copy, indexBadge);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "thumb-remove";
    remove.dataset.action = "remove";
    remove.setAttribute("aria-label", `Remove ${image.name}`);
    remove.title = "Remove image";
    remove.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7"/></svg>`;

    item.append(hit, remove);
    fragment.append(item);
  });

  els.thumbs.append(fragment);
}

function renderLayers(): void {
  const active = getActive();
  const hasImages = images.length > 0;

  images.forEach((image, index) => {
    const isActive = image.id === activeId;
    const opacity = viewMode === "solo" ? (isActive ? 1 : 0) : stackOpacity;
    image.layer.style.zIndex = String(isActive ? images.length + 10 : index + 1);
    image.layer.style.opacity = hasImages ? String(opacity) : "0";
    image.layer.classList.toggle("is-active", isActive);
    image.layer.setAttribute("aria-hidden", String(!isActive && viewMode === "solo"));
  });

  els.stage.classList.toggle("is-stacked", viewMode === "stack" && images.length > 1);
  els.stage.classList.toggle("is-empty", !hasImages);
  els.stage.setAttribute(
    "aria-label",
    active ? `${active.name}, ${active.width} by ${active.height}` : "Empty image frame",
  );
}

function syncControls(): void {
  const hasImages = images.length > 0;

  for (const button of els.viewMode.querySelectorAll<HTMLButtonElement>("button[data-value]")) {
    button.setAttribute("aria-pressed", String(button.dataset.value === viewMode));
  }
  for (const button of els.selectionTool.querySelectorAll<HTMLButtonElement>("button[data-value]")) {
    button.setAttribute("aria-pressed", String(button.dataset.value === selectionTool));
  }
  for (const button of els.fitMode.querySelectorAll<HTMLButtonElement>("button[data-value]")) {
    button.setAttribute("aria-pressed", String(button.dataset.value === fitMode));
  }
  for (const button of els.backdrop.querySelectorAll<HTMLButtonElement>("button[data-value]")) {
    button.setAttribute("aria-pressed", String(button.dataset.value === backdrop));
  }

  const overlayActive = viewMode === "stack" && hasImages;
  els.opacityGroup.classList.toggle("is-disabled", !overlayActive);
  els.opacityRange.disabled = !overlayActive;
  els.opacityRange.value = String(Math.round(stackOpacity * 100));
  els.opacityRange.style.setProperty("--fill", `${Math.round(stackOpacity * 100)}%`);
  els.opacityOutput.textContent = `${Math.round(stackOpacity * 100)}%`;

  els.stage.dataset.fit = fitMode;
  els.stage.dataset.backdrop = backdrop;
  els.resetBtn.disabled = !hasImages;
}

function updateChrome(): void {
  const active = getActive();
  const activeIndex = getActiveIndex();
  const hasImages = images.length > 0;

  document.body.classList.toggle("has-images", hasImages);
  els.count.textContent = String(images.length);
  els.countWord.textContent = images.length === 1 ? "image" : "images";
  els.clearBtn.disabled = !hasImages;
  els.railEmpty.hidden = hasImages;
  els.emptyState.hidden = hasImages;

  if (active) {
    els.viewLabel.textContent = viewMode === "stack" ? `Stacked · ${pad(images.length)} layers` : `Selected · ${active.format}`;
    els.fileName.textContent = active.name;
    els.fileMeta.textContent = `${active.format} · ${active.width} × ${active.height} · ${formatBytes(active.bytes)}`;
    els.activeIndex.textContent = pad(activeIndex + 1);
    els.totalCount.textContent = pad(images.length);
    els.backBtn.disabled = activeIndex <= 0;
    els.nextBtn.disabled = activeIndex >= images.length - 1;
    document.title = `${active.name} — Stack`;
  } else {
    els.viewLabel.textContent = "No images yet";
    els.fileName.textContent = "Drop a few images";
    els.fileMeta.textContent = "Everything lands in the same frame.";
    els.activeIndex.textContent = "—";
    els.totalCount.textContent = "—";
    els.backBtn.disabled = true;
    els.nextBtn.disabled = true;
    document.title = "Stack — aligned image viewer";
  }

  if (!hasImages) {
    lassoSelection = null;
  }

  renderThumbs();
  renderLayers();
  syncControls();
  fitStage();
  updateZoomUI();
  updateStatus();

  if (active) {
    requestAnimationFrame(() => {
      const selected = els.thumbs.querySelector<HTMLElement>(".thumb.is-active");
      selected?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    });
  }

  schedulePersist();
}

function displayAspect(): number {
  if (!lassoSelection) return stageAspect;
  const bounds = lassoBounds(lassoSelection);
  return Math.max(0.01, stageAspect * (bounds.w / bounds.h));
}

function fitStage(): void {
  const styles = getComputedStyle(els.stageArea);
  const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
  const verticalPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
  const availableWidth = Math.max(140, els.stageArea.clientWidth - horizontalPadding);
  const availableHeight = Math.max(140, els.stageArea.clientHeight - verticalPadding);
  const aspect = displayAspect();

  let width = availableWidth;
  let height = width / aspect;
  if (height > availableHeight) {
    height = availableHeight;
    width = height * aspect;
  }

  els.stage.style.width = `${Math.max(1, Math.floor(width))}px`;
  els.stage.style.height = `${Math.max(1, Math.floor(height))}px`;
}

function lassoBounds(points: Point[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    x: minX,
    y: minY,
    w: Math.max(0.000001, maxX - minX),
    h: Math.max(0.000001, maxY - minY),
  };
}

function polygonArea(points: Point[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area / 2);
}

function sanitizeLasso(points: Point[] | null | undefined): Point[] | null {
  if (!Array.isArray(points) || points.length < 3) return null;

  const clean: Point[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const x = Math.min(1, Math.max(0, point.x));
    const y = Math.min(1, Math.max(0, point.y));
    const previous = clean[clean.length - 1];
    if (!previous || Math.abs(previous.x - x) > 0.0001 || Math.abs(previous.y - y) > 0.0001) {
      clean.push({ x, y });
    }
  }

  if (clean.length < 3) return null;
  const bounds = lassoBounds(clean);
  if (bounds.w < 0.002 || bounds.h < 0.002) return null;
  if (polygonArea(clean) < 0.0002) return null;
  return clean;
}

function formatZoomFactor(factor: number): string {
  return `${factor >= 10 ? Math.round(factor) : factor.toFixed(1)}×`;
}

function updateZoomUI(): void {
  const bounds = lassoSelection ? lassoBounds(lassoSelection) : null;
  const zoomed = Boolean(bounds && images.length > 0 && bounds.w > 0.0005 && bounds.h > 0.0005);
  els.zoomHud.hidden = !zoomed;
  els.stage.classList.toggle("is-zoomed", zoomed);

  if (!zoomed || !bounds || !lassoSelection) {
    els.layers.style.left = "0";
    els.layers.style.top = "0";
    els.layers.style.width = "100%";
    els.layers.style.height = "100%";
    els.zoomViewport.style.clipPath = "none";
    return;
  }

  const factor = Math.min(1 / bounds.w, 1 / bounds.h);
  els.zoomLevel.textContent = formatZoomFactor(factor);
  els.layers.style.left = `${-(bounds.x / bounds.w) * 100}%`;
  els.layers.style.top = `${-(bounds.y / bounds.h) * 100}%`;
  els.layers.style.width = `${(1 / bounds.w) * 100}%`;
  els.layers.style.height = `${(1 / bounds.h) * 100}%`;

  const clipPoints = lassoSelection
    .map((point) => {
      const x = Math.min(100, Math.max(0, ((point.x - bounds.x) / bounds.w) * 100));
      const y = Math.min(100, Math.max(0, ((point.y - bounds.y) / bounds.h) * 100));
      return `${x.toFixed(3)}% ${y.toFixed(3)}%`;
    })
    .join(", ");
  els.zoomViewport.style.clipPath = `polygon(${clipPoints})`;
}

function updateStatus(): void {
  if (!images.length) {
    els.statusText.textContent = "Your images stay in one fixed frame.";
    return;
  }

  if (lassoSelection) {
    const bounds = lassoBounds(lassoSelection);
    const factor = Math.min(1 / bounds.w, 1 / bounds.h);
    els.statusText.textContent = `Zoom locked at ${formatZoomFactor(factor)} · arrows compare the same crop`;
    return;
  }

  const mixed = images.some((image) => Math.abs(image.width / image.height - stageAspect) > 0.005);
  els.statusText.textContent = mixed
    ? `${images.length} images · mixed ratios stay centered in the first frame`
    : `${images.length} ${images.length === 1 ? "image" : "images"} · drag to zoom · browser Back remembers the last view`;
}

function setLassoSelection(points: Point[] | null): void {
  lassoSelection = sanitizeLasso(points);
  fitStage();
  updateZoomUI();
  updateStatus();
  schedulePersist();
}

function resetZoom(announce = false): void {
  if (!lassoSelection) return;
  lassoSelection = null;
  fitStage();
  updateZoomUI();
  updateStatus();
  schedulePersist();
  if (announce) showToast("Back to the full image");
}

function screenPoint(event: PointerEvent, rect: DOMRect): ScreenPoint {
  return {
    x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
    y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height),
  };
}

function screenPath(points: ScreenPoint[], close: boolean): string {
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  return close && points.length >= 3 ? `${path} Z` : path;
}

function updateLassoOverlay(): void {
  if (!dragState) return;

  const { rect, points } = dragState;
  const width = rect.width;
  const height = rect.height;
  const closed = points.length >= 3;
  const hole = closed
    ? ` M${points.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" L")} Z`
    : "";

  els.lassoOverlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
  els.lassoShade.setAttribute("d", `M0 0 H${width} V${height} H0 Z${hole}`);
  els.lassoShade.style.opacity = closed ? "1" : "0";
  els.lassoStroke.setAttribute("d", screenPath(points, closed));

  const last = points[points.length - 1];
  els.lassoDot.setAttribute("cx", String(last.x));
  els.lassoDot.setAttribute("cy", String(last.y));
  els.lassoDot.style.opacity = "1";
}

function beginDrag(event: PointerEvent): void {
  if (event.button !== 0 || images.length === 0) return;
  if ((event.target as HTMLElement).closest(".zoom-hud")) return;

  const rect = els.stage.getBoundingClientRect();
  const point = screenPoint(event, rect);
  dragState = {
    pointerId: event.pointerId,
    rect,
    tool: selectionTool,
    start: point,
    current: point,
    points: [point],
  };

  els.stage.classList.add("is-selecting");
  els.lassoOverlay.removeAttribute("hidden");
  els.lassoOverlay.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  updateLassoOverlay();
  els.stage.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function rectanglePoints(start: ScreenPoint, current: ScreenPoint): ScreenPoint[] {
  const left = Math.min(start.x, current.x);
  const right = Math.max(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const bottom = Math.max(start.y, current.y);
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

function moveDrag(event: PointerEvent): void {
  if (!dragState || event.pointerId !== dragState.pointerId) return;

  const point = screenPoint(event, dragState.rect);
  dragState.current = point;

  if (dragState.tool === "rect") {
    dragState.points = rectanglePoints(dragState.start, point);
    updateLassoOverlay();
    return;
  }

  const last = dragState.points[dragState.points.length - 1];
  if (Math.hypot(point.x - last.x, point.y - last.y) >= 1.8) {
    dragState.points.push(point);
    updateLassoOverlay();
  }
}

function finishDrag(event: PointerEvent): void {
  if (!dragState || event.pointerId !== dragState.pointerId) return;

  const drag = dragState;
  const finalPoint = screenPoint(event, drag.rect);
  drag.current = finalPoint;

  if (drag.tool === "rect") {
    if (Math.abs(finalPoint.x - drag.start.x) < 6 || Math.abs(finalPoint.y - drag.start.y) < 6) {
      drag.points = [];
    } else {
      drag.points = rectanglePoints(drag.start, finalPoint);
    }
  } else {
    const last = drag.points[drag.points.length - 1];
    if (Math.hypot(finalPoint.x - last.x, finalPoint.y - last.y) >= 1.8) {
      drag.points.push(finalPoint);
    }
  }

  dragState = null;
  els.stage.classList.remove("is-selecting");
  els.lassoOverlay.setAttribute("hidden", "");
  if (els.stage.hasPointerCapture(event.pointerId)) {
    els.stage.releasePointerCapture(event.pointerId);
  }

  if (drag.points.length < 3) return;

  const base = lassoSelection ? lassoBounds(lassoSelection) : { x: 0, y: 0, w: 1, h: 1 };
  const points = drag.points.map((point) => ({
    x: base.x + (point.x / drag.rect.width) * base.w,
    y: base.y + (point.y / drag.rect.height) * base.h,
  }));
  const clean = sanitizeLasso(points);
  if (!clean) return;
  setLassoSelection(clean);
}

function cancelDrag(): void {
  dragState = null;
  els.stage.classList.remove("is-selecting");
  els.lassoOverlay.setAttribute("hidden", "");
}

function setActive(id: string, historyMode: HistoryMode = "none"): void {
  if (!images.some((image) => image.id === id)) return;
  const changed = activeId !== id;
  activeId = id;

  if (historyMode === "push" && changed) {
    history.pushState({ stackId: id }, "");
  } else if (historyMode === "replace") {
    history.replaceState({ stackId: id }, "");
  }

  updateChrome();
}

function navigate(offset: number): void {
  const current = getActiveIndex();
  if (current < 0) return;
  const next = images[current + offset];
  if (next) setActive(next.id, "push");
}

function showToast(message: string, tone: "default" | "error" = "default"): void {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.toggle("is-error", tone === "error");
  els.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 2800);
}

async function addFiles(incoming: File[], source: "picker" | "paste" | "drop"): Promise<void> {
  if (!incoming.length) return;

  const existing = new Set(images.map((image) => image.fingerprint));
  const accepted: StackImage[] = [];
  let failed = 0;
  let duplicates = 0;
  let skipped = 0;
  const wasEmpty = images.length === 0;

  for (const file of incoming) {
    if (!isImageFile(file)) {
      skipped += 1;
      continue;
    }

    const fingerprint = fingerprintOf(file);
    if (existing.has(fingerprint)) {
      duplicates += 1;
      continue;
    }

    try {
      const image = await loadStackImage(file);
      images.push(image);
      accepted.push(image);
      existing.add(image.fingerprint);
      els.layers.append(image.layer);
    } catch {
      failed += 1;
    }
  }

  if (!accepted.length) {
    if (duplicates && incoming.length === duplicates) {
      showToast("That image is already in the stack.");
    } else if (skipped) {
      showToast("Those files are not images.", "error");
    } else {
      showToast("Couldn’t open those images. Try PNG, JPG, WEBP, AVIF, GIF, or SVG.", "error");
    }
    return;
  }

  if (wasEmpty || !activeId) {
    const first = accepted[0];
    activeId = first.id;
    stageAspect = first.width / first.height;
    stageSource = { width: first.width, height: first.height };
    history.replaceState({ stackId: first.id }, "");
  } else {
    activeId = accepted[0].id;
    history.pushState({ stackId: activeId }, "");
  }

  updateChrome();
  void persistStoredImages(accepted);

  const count = accepted.length;
  const notes: string[] = [`${count} ${count === 1 ? "image" : "images"} stacked`];
  if (failed) notes.push(`${failed} couldn’t be decoded`);
  if (duplicates) notes.push(`${duplicates} already added`);
  if (skipped) notes.push(`${skipped} skipped`);
  const hasIssue = failed > 0 || skipped > 0;
  showToast(notes.join(" · "), hasIssue ? "error" : "default");

  if (source === "paste" && count === 1) {
    requestAnimationFrame(() => els.stage.focus({ preventScroll: true }));
  }
}

function removeImage(id: string): void {
  const index = images.findIndex((image) => image.id === id);
  if (index < 0) return;

  const [removed] = images.splice(index, 1);
  removed.layer.remove();
  URL.revokeObjectURL(removed.url);
  const wasActive = removed.id === activeId;

  if (!images.length) {
    activeId = null;
    stageAspect = 4 / 3;
    stageSource = null;
    history.replaceState({}, "");
  } else if (wasActive) {
    const next = images[Math.min(index, images.length - 1)];
    activeId = next.id;
    history.replaceState({ stackId: next.id }, "");
  }

  updateChrome();
  void forgetStoredImage(removed.id);
  showToast(`Removed ${removed.name}`);
}

function clearStack(): void {
  if (!images.length) return;
  const count = images.length;
  if (!window.confirm(`Clear all ${count} ${count === 1 ? "image" : "images"} from the stack?`)) return;

  for (const image of images) {
    image.layer.remove();
    URL.revokeObjectURL(image.url);
  }
  images = [];
  activeId = null;
  stageAspect = 4 / 3;
  stageSource = null;
  history.replaceState({}, "");
  updateChrome();
  void clearStoredImages();
  showToast("Stack cleared");
}

function resetView(): void {
  viewMode = "solo";
  fitMode = "contain";
  backdrop = "checker";
  stackOpacity = 0.45;
  lassoSelection = null;
  selectionTool = "rect";
  updateChrome();
  showToast("View reset");
}

async function readClipboard(): Promise<void> {
  const clipboard = navigator.clipboard;
  if (!clipboard || typeof clipboard.read !== "function") {
    showToast("Press ⌘V to paste from your clipboard.");
    return;
  }

  try {
    const items = await clipboard.read();
    const files: File[] = [];
    for (const item of items) {
      const type = item.types.find((candidate) => candidate.startsWith("image/"));
      if (!type) continue;
      const blob = await item.getType(type);
      const extension = type.split("/")[1]?.replace("+xml", "").replace("jpeg", "jpg") || "png";
      files.push(new File([blob], `clipboard-${Date.now()}.${extension}`, { type }));
    }
    if (!files.length) {
      showToast("No image found on the clipboard.", "error");
      return;
    }
    await addFiles(files, "paste");
  } catch {
    showToast("Clipboard access was blocked. Press ⌘V instead.", "error");
  }
}

function openFilePicker(): void {
  els.fileInput.click();
}

function showDragOverlay(visible: boolean): void {
  els.dragOverlay.classList.toggle("is-visible", visible);
  els.dragOverlay.setAttribute("aria-hidden", String(!visible));
}

function hasDraggedFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function onPaste(event: ClipboardEvent): void {
  const clipboard = event.clipboardData;
  if (!clipboard) return;

  const files: File[] = Array.from(clipboard.files);
  if (!files.length) {
    for (const item of Array.from(clipboard.items)) {
      if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }

  const imageFiles = files.filter(isImageFile);
  if (!imageFiles.length) return;

  event.preventDefault();
  void addFiles(imageFiles, "paste");
}

// Controls
els.addBtn.addEventListener("click", openFilePicker);
els.addBtn2.addEventListener("click", openFilePicker);
els.emptyAdd.addEventListener("click", openFilePicker);
els.emptyPaste.addEventListener("click", () => void readClipboard());
els.pasteBtn.addEventListener("click", () => void readClipboard());
els.helpBtn.addEventListener("click", () => els.helpDialog.showModal());
els.backBtn.addEventListener("click", () => navigate(-1));
els.nextBtn.addEventListener("click", () => navigate(1));
els.clearBtn.addEventListener("click", clearStack);
els.resetBtn.addEventListener("click", resetView);
els.fullImageBtn.addEventListener("click", () => resetZoom(true));

els.stage.addEventListener("pointerdown", beginDrag);
els.stage.addEventListener("pointermove", moveDrag);
els.stage.addEventListener("pointerup", finishDrag);
els.stage.addEventListener("pointercancel", cancelDrag);
els.stage.addEventListener("lostpointercapture", () => {
  if (dragState) cancelDrag();
});
els.stage.addEventListener("dblclick", (event) => {
  if ((event.target as HTMLElement).closest(".zoom-hud")) return;
  resetZoom(true);
});

els.fileInput.addEventListener("change", () => {
  const files = Array.from(els.fileInput.files ?? []);
  els.fileInput.value = "";
  void addFiles(files, "picker");
});

els.thumbs.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const item = target.closest<HTMLElement>(".thumb");
  if (!item?.dataset.id) return;

  if (target.closest("[data-action='remove']")) {
    removeImage(item.dataset.id);
    return;
  }

  if (item.dataset.id === activeId) return;
  setActive(item.dataset.id, "push");
});

els.viewMode.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-value]");
  if (!button?.dataset.value) return;
  viewMode = button.dataset.value as ViewMode;
  updateChrome();
});

els.selectionTool.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-value]");
  if (!button?.dataset.value) return;
  selectionTool = button.dataset.value === "lasso" ? "lasso" : "rect";
  syncControls();
  schedulePersist();
});

els.fitMode.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-value]");
  if (!button?.dataset.value) return;
  fitMode = button.dataset.value as FitMode;
  syncControls();
  schedulePersist();
});

els.backdrop.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-value]");
  if (!button?.dataset.value) return;
  backdrop = button.dataset.value as Backdrop;
  syncControls();
  schedulePersist();
});

els.opacityRange.addEventListener("input", () => {
  stackOpacity = Number(els.opacityRange.value) / 100;
  els.opacityOutput.textContent = `${Math.round(stackOpacity * 100)}%`;
  els.opacityRange.style.setProperty("--fill", `${Math.round(stackOpacity * 100)}%`);
  renderLayers();
  schedulePersist();
});

// Clipboard, drag and drop
window.addEventListener("paste", onPaste);

window.addEventListener("dragenter", (event) => {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  dragDepth += 1;
  showDragOverlay(true);
});

window.addEventListener("dragover", (event) => {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
});

window.addEventListener("dragleave", (event) => {
  if (!hasDraggedFiles(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) showDragOverlay(false);
});

window.addEventListener("drop", (event) => {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  dragDepth = 0;
  showDragOverlay(false);
  const files = Array.from(event.dataTransfer?.files ?? []);
  void addFiles(files, "drop");
});

window.addEventListener("blur", () => {
  dragDepth = 0;
  showDragOverlay(false);
});

// Keyboard
window.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null;
  const isTyping =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    Boolean(target?.isContentEditable);

  if (els.helpDialog.open) return;

  if (event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping) {
    event.preventDefault();
    els.helpDialog.showModal();
    return;
  }

  if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key === "0" || (event.key === "Escape" && lassoSelection)) {
    event.preventDefault();
    resetZoom(true);
    return;
  }
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    event.preventDefault();
    navigate(-1);
    return;
  }
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    event.preventDefault();
    navigate(1);
    return;
  }
  if (event.key.toLowerCase() === "o") {
    event.preventDefault();
    viewMode = viewMode === "solo" ? "stack" : "solo";
    updateChrome();
    return;
  }
  if (event.key.toLowerCase() === "r") {
    event.preventDefault();
    resetView();
    return;
  }
  if (/^[1-9]$/.test(event.key)) {
    const index = Number(event.key) - 1;
    const image = images[index];
    if (image) {
      event.preventDefault();
      setActive(image.id, "push");
    }
  }
});

// Browser history keeps image selection in sync.
window.addEventListener("popstate", (event) => {
  const state = event.state as { stackId?: string } | null;
  if (!state?.stackId) return;
  if (images.some((image) => image.id === state.stackId)) {
    activeId = state.stackId;
    updateChrome();
  }
});

// Keep the frame exactly the same size as the window changes, never as images change.
const resizeObserver = new ResizeObserver(() => fitStage());
resizeObserver.observe(els.stageArea);
window.addEventListener("resize", fitStage);

function flushPersist(): void {
  if (!persistenceEnabled) return;
  window.clearTimeout(persistTimer);
  persistTimer = undefined;
  void persistSession();
}

window.addEventListener("pagehide", flushPersist);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushPersist();
});

async function boot(): Promise<void> {
  document.body.classList.add("is-booting");
  const restored = await restoreSession();
  persistenceEnabled = true;
  updateChrome();
  fitStage();
  document.body.classList.remove("is-booting");

  if (restored > 0) {
    window.setTimeout(() => {
      showToast(`Restored ${restored} ${restored === 1 ? "image" : "images"}`);
    }, 220);
  }
}

void boot();
