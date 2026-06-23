import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import readline from 'node:readline';
import { generateKeyBetween } from 'fractional-indexing';

const SERVER_NAME = 'Image Agent Canvas MCP';
const SERVER_VERSION = '0.2.0';
const TOOL_OPEN_SERVICE = 'open_canvas_service';
const TOOL_GET_SELECTION = 'get_canvas_selection';
const TOOL_CREATE_HOLDER = 'create_ai_image_holder';
const TOOL_INSERT_IMAGE = 'insert_canvas_image';
const TOOL_INSERT_REFERENCE_IMAGE = 'insert_reference_image';
const TOOL_READ_LAYERS = 'read_canvas_layers';
const TOOL_SEARCH_INSPIRATION = 'search_inspiration_library';
const TOOL_INSERT_PROMPT_CARD = 'insert_prompt_card';
const TOOL_CREATE_BRANCH = 'create_canvas_branch';
const TOOL_EXPORT_EDIT_PACK = 'export_edit_pack';
const TOOL_INSERT_ERROR_NOTE = 'insert_error_note';
const TOOL_EXPORT_ARCHIVE = 'export_canvas_archive';
const TOOL_IMPORT_ARCHIVE = 'import_canvas_archive';
const PAGE_ID_PREFIX = 'page:';
const PAGE_ASSETS_ROUTE = '/page-assets/';
const CANVAS_FILE_NAME = 'image-agent-canvas.json';

const JsonRpcError = {
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602
};

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function contentResult(text, structuredContent = {}) {
  return {
    content: [{ type: 'text', text }],
    structuredContent
  };
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function finiteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function compactText(value, maxLength = 12000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, maxLength);
}

function parseJsonText(text) {
  return JSON.parse(String(text ?? '').replace(/^\uFEFF/, ''));
}

function richTextFromPlainText(value) {
  const lines = String(value ?? '').replace(/\r\n/g, '\n').split('\n');
  const paragraphs = lines.length ? lines : [''];
  return {
    type: 'doc',
    content: paragraphs.map((line) => {
      const text = String(line);
      return text
        ? { type: 'paragraph', content: [{ type: 'text', text }] }
        : { type: 'paragraph' };
    })
  };
}

function pathResolve(value) {
  return resolve(String(value));
}

function resolveCanvasDir(args = {}) {
  const explicitCanvasDir = nonEmptyString(args.canvasDir);
  if (explicitCanvasDir) return pathResolve(explicitCanvasDir);

  const explicitProjectDir = nonEmptyString(args.projectDir);
  if (explicitProjectDir) return join(pathResolve(explicitProjectDir), 'canvas');

  const envCanvasDir = nonEmptyString(process.env.IMAGE_AGENT_CANVAS_DIR);
  if (envCanvasDir) return pathResolve(envCanvasDir);

  const envProjectDir = nonEmptyString(process.env.IMAGE_AGENT_PROJECT_DIR);
  if (envProjectDir) return join(pathResolve(envProjectDir), 'canvas');

  return join(process.cwd(), 'canvas');
}

function resolveSelectionFile(args = {}) {
  return join(resolveCanvasDir(args), 'image-agent-selection.json');
}

function resolveViewStateFile(args = {}) {
  return join(resolveCanvasDir(args), 'image-agent-view-state.json');
}

function pageDirName(pageId) {
  return encodeURIComponent(String(pageId).replace(PAGE_ID_PREFIX, ''));
}

function pageAssetUrl(pageId, fileName) {
  return `${PAGE_ASSETS_ROUTE}${pageDirName(pageId)}/${encodeURIComponent(fileName)}`;
}

function isSafeChildPath(parent, child) {
  const pathToChild = relative(parent, child);
  return pathToChild && !pathToChild.startsWith('..') && !pathToChild.includes(`..${sep}`);
}

function sanitizeFileName(name, fallbackName = 'image.png') {
  const rawName = basename(String(name || fallbackName));
  const extension = extname(rawName) || extname(fallbackName) || '.png';
  const baseName = rawName
    .slice(0, rawName.length - extname(rawName).length)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${baseName || 'image'}${extension}`;
}

function sanitizeIdPart(value, fallback = 'image') {
  return String(value || fallback)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;
}

function mimeTypeForFile(filePath) {
  switch (extname(filePath).toLowerCase()) {
    case '.apng':
      return 'image/apng';
    case '.avif':
      return 'image/avif';
    case '.gif':
      return 'image/gif';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function extensionFromMimeType(mimeType) {
  switch (mimeType) {
    case 'image/apng':
      return '.apng';
    case 'image/avif':
      return '.avif';
    case 'image/gif':
      return '.gif';
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/svg+xml':
      return '.svg';
    case 'image/webp':
      return '.webp';
    default:
      return '.bin';
  }
}

async function uniqueFilePath(dir, requestedName) {
  const safeName = sanitizeFileName(requestedName);
  const ext = extname(safeName);
  const base = safeName.slice(0, safeName.length - ext.length);
  let candidate = safeName;
  let counter = 2;
  while (true) {
    const candidatePath = join(dir, candidate);
    try {
      await stat(candidatePath);
      candidate = `${base}-v${counter}${ext}`;
      counter += 1;
    } catch (error) {
      if (error?.code === 'ENOENT') return { fileName: candidate, filePath: candidatePath };
      throw error;
    }
  }
}

function parseDataUrl(src) {
  const match = /^data:([^;,]+)?(?:;[^,]*)?,(.*)$/s.exec(src);
  if (!match) return null;
  const mimeType = match[1] || 'application/octet-stream';
  const encoded = match[2];
  const isBase64 = /^data:[^,]*;base64,/i.test(src);
  const buffer = isBase64 ? Buffer.from(encoded, 'base64') : Buffer.from(decodeURIComponent(encoded));
  return { buffer, mimeType };
}

function sanitizeReferenceFileName(name, fallbackName, mimeType) {
  const rawName = basename(String(name || fallbackName || 'reference'));
  const extension = extname(rawName) || extensionFromMimeType(mimeType);
  const baseName = rawName
    .slice(0, rawName.length - extname(rawName).length)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${baseName || 'reference'}${extension}`;
}

async function resolveReferenceImageSource(args = {}) {
  const localPath = nonEmptyString(args.imagePath) || nonEmptyString(args.localImagePath);
  if (localPath) {
    const sourceImagePath = pathResolve(localPath);
    const sourceStat = await stat(sourceImagePath);
    if (!sourceStat.isFile()) throw new Error(`imagePath is not a file: ${sourceImagePath}`);
    return {
      kind: 'local',
      sourceImagePath,
      sourceStat,
      fileName: basename(sourceImagePath),
      mimeType: mimeTypeForFile(sourceImagePath),
      sourceUrl: null
    };
  }

  const imageUrl = nonEmptyString(args.imageUrl) || nonEmptyString(args.image) || nonEmptyString(args.src);
  if (!imageUrl) throw new Error('imageUrl or imagePath is required.');

  const dataUrl = imageUrl.startsWith('data:') ? parseDataUrl(imageUrl) : null;
  if (dataUrl) {
    return {
      kind: 'buffer',
      buffer: dataUrl.buffer,
      fileName: sanitizeReferenceFileName(args.fileName, args.title || 'reference', dataUrl.mimeType),
      mimeType: dataUrl.mimeType,
      sourceUrl: 'data:'
    };
  }

  if (/^https?:\/\//i.test(imageUrl)) {
    const response = await fetch(imageUrl, {
      headers: { 'user-agent': 'image-agent-canvas-mcp/0.2' }
    });
    if (!response.ok) throw new Error(`Could not download reference image: HTTP ${response.status}`);
    const contentType =
      response.headers.get('content-type')?.split(';')[0]?.trim() ||
      mimeTypeForFile(new URL(imageUrl).pathname) ||
      'application/octet-stream';
    if (!contentType.startsWith('image/')) throw new Error(`Reference URL is not an image: ${contentType}`);
    return {
      kind: 'buffer',
      buffer: Buffer.from(await response.arrayBuffer()),
      fileName: sanitizeReferenceFileName(new URL(imageUrl).pathname, args.title || 'reference', contentType),
      mimeType: contentType,
      sourceUrl: imageUrl
    };
  }

  throw new Error('Only local image paths, data URLs, and http(s) image URLs are supported.');
}

async function getImageDimensionsFromBuffer(buffer) {
  if (buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 10 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 9) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const size = buffer.readUInt16BE(offset + 2);
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + size;
    }
  }
  if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3)
      };
    }
  }
  return { width: 512, height: 512 };
}

function uniqueRecordId(store, prefix, seed) {
  const cleanSeed = sanitizeIdPart(seed);
  let candidate = `${prefix}:${cleanSeed}`;
  let counter = 2;
  while (store[candidate]) {
    candidate = `${prefix}:${cleanSeed}-${counter}`;
    counter += 1;
  }
  return candidate;
}

async function readSelectionState(args) {
  const selectionFile = resolveSelectionFile(args);
  try {
    const selection = parseJsonText(await readFile(selectionFile, 'utf8'));
    if (!selection || typeof selection !== 'object' || !Array.isArray(selection.selectedShapes)) {
      throw new Error(`Invalid selection state in ${selectionFile}`);
    }
    return { selection, selectionFile };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        selection: { selectedShapes: [], updatedAt: null },
        selectionFile
      };
    }
    throw error;
  }
}

async function readViewState(args) {
  const viewStateFile = resolveViewStateFile(args);
  try {
    const payload = parseJsonText(await readFile(viewStateFile, 'utf8'));
    return payload?.viewState ?? payload;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function normalizeCanvasUrl(args = {}) {
  const value =
    nonEmptyString(args.canvasUrl) ||
    nonEmptyString(process.env.IMAGE_AGENT_CANVAS_URL) ||
    `http://127.0.0.1:${process.env.IMAGE_AGENT_CANVAS_PORT || 43217}`;
  return value.replace(/\/+$/, '');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
  }
  return text ? parseJsonText(text) : {};
}

async function loadCanvasSnapshot(args) {
  const canvasUrl = normalizeCanvasUrl(args);
  const payload = await fetchJson(`${canvasUrl}/api/canvas`);
  const snapshot = payload?.snapshot ?? payload;
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.schema || !snapshot.store) {
    throw new Error(`Expected Image Agent Canvas snapshot from ${canvasUrl}/api/canvas`);
  }
  return { canvasUrl, snapshot, payload };
}

async function saveCanvasSnapshot(canvasUrl, snapshot) {
  return fetchJson(`${canvasUrl}/api/canvas`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(snapshot)
  });
}

function getRecord(store, id, label) {
  const record = store[id];
  if (!record) throw new Error(`Missing ${label}: ${id}`);
  return record;
}

function findPageIdForShape(store, shapeId) {
  let record = getRecord(store, shapeId, 'shape');
  const visited = new Set();
  while (record && !visited.has(record.id)) {
    visited.add(record.id);
    if (record.typeName === 'page') return record.id;
    const parentId = record.parentId;
    if (!parentId) break;
    const parent = store[parentId];
    if (parent?.typeName === 'page') return parent.id;
    record = parent;
  }
  return null;
}

function getPageShapes(store, pageId) {
  const shapes = [];
  const byParent = new Map();
  for (const record of Object.values(store)) {
    if (record?.typeName !== 'shape') continue;
    const siblings = byParent.get(record.parentId) ?? [];
    siblings.push(record);
    byParent.set(record.parentId, siblings);
  }
  const queue = [...(byParent.get(pageId) ?? [])];
  while (queue.length > 0) {
    const shape = queue.shift();
    shapes.push(shape);
    queue.push(...(byParent.get(shape.id) ?? []));
  }
  return shapes;
}

function localBoundsForShape(shape) {
  if (!shape || shape.typeName !== 'shape') return null;
  if (shape.type === 'arrow') {
    const start = shape.props?.start ?? { x: 0, y: 0 };
    const end = shape.props?.end ?? { x: 0, y: 0 };
    const minX = Math.min(start.x ?? 0, end.x ?? 0);
    const minY = Math.min(start.y ?? 0, end.y ?? 0);
    const maxX = Math.max(start.x ?? 0, end.x ?? 0);
    const maxY = Math.max(start.y ?? 0, end.y ?? 0);
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  }
  const w = finiteNumber(shape.props?.w, shape.type === 'text' ? 160 : 1);
  const h = finiteNumber(shape.props?.h, shape.type === 'text' ? 40 : 1);
  return { x: 0, y: 0, w, h };
}

function pageBoundsForShape(store, shape) {
  const local = localBoundsForShape(shape);
  if (!local) return null;
  let x = finiteNumber(shape.x, 0) + local.x;
  let y = finiteNumber(shape.y, 0) + local.y;
  let parent = store[shape.parentId];
  const visited = new Set([shape.id]);
  while (parent?.typeName === 'shape' && !visited.has(parent.id)) {
    visited.add(parent.id);
    x += finiteNumber(parent.x, 0);
    y += finiteNumber(parent.y, 0);
    parent = store[parent.parentId];
  }
  return { x, y, w: local.w, h: local.h };
}

function rectsOverlap(a, b, padding = 0) {
  return !(
    a.x + a.w + padding <= b.x ||
    b.x + b.w + padding <= a.x ||
    a.y + a.h + padding <= b.y ||
    b.y + b.h + padding <= a.y
  );
}

function chooseIndex(store, parentId) {
  const siblingIndexes = Object.values(store)
    .filter((record) => record?.typeName === 'shape' && record.parentId === parentId && typeof record.index === 'string')
    .map((record) => record.index)
    .sort();
  return generateKeyBetween(siblingIndexes.at(-1) ?? null, null);
}

function chooseNextBranchLabel(store) {
  const numbers = Object.values(store)
    .filter((record) => record?.typeName === 'shape')
    .map((record) => String(record.meta?.branchLabel || record.meta?.imageAgentBranchLabel || '').match(/^#(\d+)$/)?.[1])
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  return `#${(numbers.length ? Math.max(...numbers) : 1) + 1}`;
}

function firstSelectedShapeId(selection) {
  return selection?.selectedShapes?.length === 1 ? selection.selectedShapes[0]?.id : null;
}

function isAiImageHolder(shape) {
  return shape?.meta?.imageAgentAiImageHolder === true || shape?.meta?.cowartAiImageHolder === true;
}

function createGeoPromptCardRecord({
  store,
  parentId,
  seed = 'prompt-card',
  x,
  y,
  width = 360,
  height = 220,
  title,
  text,
  source,
  color = 'blue',
  meta = {}
}) {
  const shapeId = uniqueRecordId(store, 'shape', seed);
  const titleText = compactText(title, 120);
  const bodyText = compactText(text);
  const sourceText = compactText(source, 240);
  const cardText = [
    titleText || 'Prompt Card',
    sourceText ? `来源：${sourceText}` : '',
    bodyText
  ].filter(Boolean).join('\n\n');

  return {
    shapeId,
    record: {
      x,
      y,
      rotation: 0,
      isLocked: false,
      opacity: 1,
      meta: {
        imageAgentPromptCard: true,
        title: titleText,
        source: sourceText,
        prompt: bodyText,
        createdAt: new Date().toISOString(),
        ...meta
      },
      id: shapeId,
      type: 'geo',
      props: {
        w: width,
        h: height,
        geo: 'rectangle',
        dash: 'solid',
        growY: 0,
        url: '',
        scale: 1,
        color,
        labelColor: 'black',
        fill: 'semi',
        size: 'm',
        font: 'draw',
        align: 'start',
        verticalAlign: 'start',
        richText: richTextFromPlainText(cardText)
      },
      parentId,
      index: chooseIndex(store, parentId),
      typeName: 'shape'
    }
  };
}

function createArrowRecord({ store, parentId, sourceShapeId, targetShapeId, start, end, label }) {
  const arrowId = uniqueRecordId(store, 'shape', `${sanitizeIdPart(sourceShapeId, 'source')}-to-${sanitizeIdPart(targetShapeId, 'target')}`);
  return {
    arrowId,
    record: {
      x: start.x,
      y: start.y,
      rotation: 0,
      isLocked: false,
      opacity: 1,
      meta: {
        imageAgentLineage: true,
        sourceShapeId,
        targetShapeId,
        branchLabel: label,
        createdAt: new Date().toISOString()
      },
      id: arrowId,
      type: 'arrow',
      props: {
        kind: 'arc',
        elbowMidPoint: 0.5,
        dash: 'draw',
        size: 's',
        fill: 'none',
        color: 'blue',
        labelColor: 'blue',
        bend: 0,
        start: { x: 0, y: 0 },
        end: { x: end.x - start.x, y: end.y - start.y },
        arrowheadStart: 'none',
        arrowheadEnd: 'arrow',
        richText: richTextFromPlainText(label || ''),
        labelPosition: 0.5,
        font: 'draw',
        scale: 1
      },
      parentId,
      index: chooseIndex(store, parentId),
      typeName: 'shape'
    }
  };
}

function choosePlacement({ store, pageId, parentId, anchorShape, width, height, margin, placement }) {
  const anchorBounds = anchorShape ? pageBoundsForShape(store, anchorShape) : null;
  let x = anchorBounds ? anchorBounds.x + anchorBounds.w + margin : 0;
  let y = anchorBounds ? anchorBounds.y : 0;

  if (placement === 'left' && anchorBounds) x = anchorBounds.x - width - margin;
  if (placement === 'below' && anchorBounds) {
    x = anchorBounds.x;
    y = anchorBounds.y + anchorBounds.h + margin;
  }

  const pageShapes = getPageShapes(store, pageId);
  const obstacles = pageShapes
    .filter((shape) => shape.parentId === parentId && shape.id !== anchorShape?.id)
    .map((shape) => pageBoundsForShape(store, shape))
    .filter(Boolean);

  const stepX = Math.max(width + margin, 1);
  const stepY = Math.max(height + margin, 1);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidate = { x, y, w: width, h: height };
    if (!obstacles.some((bounds) => rectsOverlap(candidate, bounds, margin / 2))) return candidate;
    if (placement === 'below') y += stepY;
    else if (placement === 'left') x -= stepX;
    else x += stepX;
  }

  return { x, y, w: width, h: height };
}

async function getImageDimensions(filePath) {
  const buffer = await readFile(filePath);
  if (buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 10 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const size = buffer.readUInt16BE(offset + 2);
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + size;
    }
  }
  if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3)
      };
    }
  }
  throw new Error(`Could not read image dimensions for ${filePath}. Pass displayWidth/displayHeight and use PNG/JPEG/WebP.`);
}

function currentPageFromStore(store) {
  return Object.values(store).find((record) => record?.typeName === 'page')?.id ?? null;
}

async function openCanvasService(args = {}) {
  const canvasUrl = normalizeCanvasUrl(args);
  const safeUrl = `${canvasUrl}/safe`;
  const canvasAppUrl = `${canvasUrl}/canvas/`;
  const health = await fetchJson(`${canvasUrl}/health`).catch((error) => ({ ok: false, error: error.message }));
  const canvasDir = resolveCanvasDir(args);
  return {
    canvasUrl,
    safeUrl,
    canvasAppUrl,
    running: health.ok === true,
    health,
    projectDir: nonEmptyString(args.projectDir) || nonEmptyString(process.env.IMAGE_AGENT_PROJECT_DIR) || process.cwd(),
    canvasRoot: canvasDir,
    selectionPath: resolveSelectionFile(args),
    viewStatePath: resolveViewStateFile(args),
    startCommand: 'bash ./scripts/start-canvas.sh',
    windowsStartCommand: 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-canvas.ps1'
  };
}

async function getCanvasSelection(args = {}) {
  const { selection, selectionFile } = await readSelectionState(args);
  const selectedShapes = selection.selectedShapes ?? [];
  const summary =
    selectedShapes.length === 0
      ? 'No Image Agent Canvas shapes are currently selected.'
      : selectedShapes
          .map((shape) => {
            const assetName = shape.asset?.name ? ` (${shape.asset.name})` : '';
            return `${shape.id} [${shape.type ?? 'unknown'}]${assetName}`;
          })
          .join('\n');
  return { summary, selection, selectionFile };
}

async function createAiImageHolder(args = {}) {
  const { canvasUrl, snapshot } = await loadCanvasSnapshot(args);
  const store = snapshot.store;
  const viewState = await readViewState(args);
  const pageId =
    nonEmptyString(args.pageId) ||
    nonEmptyString(viewState?.currentPageId) ||
    currentPageFromStore(store);
  if (!pageId || !store[pageId]) throw new Error('Could not determine target pageId.');

  const width = finiteNumber(args.width, 320);
  const height = finiteNumber(args.height, 220);
  const frameId = uniqueRecordId(store, 'shape', args.name || 'ai-image-holder');
  const parentId = pageId;
  const index = chooseIndex(store, parentId);
  const camera = viewState?.camera ?? { x: 0, y: 0, z: 1 };

  store[frameId] = {
    x: finiteNumber(args.x, -camera.x + 120),
    y: finiteNumber(args.y, -camera.y + 120),
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {
      imageAgentAiImageHolder: true,
      cowartAiImageHolder: true,
      imageAgentAiImageHolderVersion: 1
    },
    id: frameId,
    type: 'frame',
    props: {
      w: width,
      h: height,
      name: nonEmptyString(args.name) || 'AI Image',
      color: 'blue'
    },
    parentId,
    index,
    typeName: 'shape'
  };

  await saveCanvasSnapshot(canvasUrl, snapshot);
  return { canvasUrl, pageId, holderId: frameId, index, bounds: { w: width, h: height } };
}

async function insertCanvasImage(args = {}) {
  const imagePath = nonEmptyString(args.imagePath) || nonEmptyString(args.localImagePath);
  if (!imagePath) throw new Error('imagePath is required.');

  const sourceImagePath = pathResolve(imagePath);
  const sourceStat = await stat(sourceImagePath);
  if (!sourceStat.isFile()) throw new Error(`imagePath is not a file: ${sourceImagePath}`);

  const { canvasUrl, snapshot } = await loadCanvasSnapshot(args);
  const store = snapshot.store;
  const { selection } = await readSelectionState(args);
  const viewState = await readViewState(args);

  const anchorShapeId =
    nonEmptyString(args.anchorShapeId) ||
    nonEmptyString(args.targetId) ||
    nonEmptyString(args.sourceShapeId) ||
    firstSelectedShapeId(selection);
  const anchorShape = anchorShapeId ? getRecord(store, anchorShapeId, 'anchor shape') : null;
  const holderAnchor = isAiImageHolder(anchorShape);
  const pageId =
    nonEmptyString(args.pageId) ||
    (anchorShape ? findPageIdForShape(store, anchorShape.id) : null) ||
    nonEmptyString(viewState?.currentPageId) ||
    currentPageFromStore(store);
  if (!pageId || !store[pageId]) throw new Error('Could not determine target pageId.');

  const imageSize = await getImageDimensions(sourceImagePath);
  const anchorBounds = anchorShape ? pageBoundsForShape(store, anchorShape) : null;
  const matchAnchor = args.matchAnchor !== false && anchorBounds;
  const width = finiteNumber(args.displayWidth ?? args.width, matchAnchor ? anchorBounds.w : Math.min(imageSize.width, 512));
  const height = finiteNumber(
    args.displayHeight ?? args.height,
    matchAnchor ? anchorBounds.h : Math.round(width * (imageSize.height / imageSize.width))
  );
  const parentId = holderAnchor && anchorShape.type === 'frame'
    ? anchorShape.id
    : anchorShape?.parentId && store[anchorShape.parentId]?.typeName === 'page'
      ? anchorShape.parentId
      : pageId;
  const margin = Math.max(0, finiteNumber(args.margin, 40));
  const placement = ['right', 'left', 'below'].includes(args.placement) ? args.placement : 'right';
  const bounds = holderAnchor && anchorShape.type === 'frame'
    ? { x: 0, y: 0, w: width, h: height }
    : holderAnchor && anchorBounds
      ? { x: anchorShape.x, y: anchorShape.y, w: width, h: height }
      : choosePlacement({ store, pageId, parentId, anchorShape, width, height, margin, placement });

  const canvasDir = resolveCanvasDir(args);
  const assetsDir = join(canvasDir, 'pages', pageDirName(pageId), 'assets');
  if (!isSafeChildPath(canvasDir, assetsDir)) throw new Error(`Unsafe page assets directory: ${assetsDir}`);

  const { fileName, filePath } = await uniqueFilePath(assetsDir, args.fileName || basename(sourceImagePath));
  const recordSeed = sanitizeIdPart(fileName);
  const assetId = uniqueRecordId(store, 'asset', recordSeed);
  const shapeId = uniqueRecordId(store, 'shape', recordSeed);
  const index = chooseIndex(store, parentId);
  const mimeType = mimeTypeForFile(fileName);

  const assetRecord = {
    id: assetId,
    typeName: 'asset',
    type: 'image',
    props: {
      name: fileName,
      src: pageAssetUrl(pageId, fileName),
      w: imageSize.width,
      h: imageSize.height,
      fileSize: sourceStat.size,
      mimeType,
      isAnimated: false
    },
    meta: args.assetMeta && typeof args.assetMeta === 'object' ? args.assetMeta : {}
  };

  const shapeMeta = args.shapeMeta && typeof args.shapeMeta === 'object' ? { ...args.shapeMeta } : {};
  if (holderAnchor && !shapeMeta.imageAgentGeneratedForAiImageHolder) {
    shapeMeta.imageAgentGeneratedForAiImageHolder = anchorShapeId;
  }
  if (anchorShapeId && !shapeMeta.imageAgentSourceShapeId) {
    shapeMeta.imageAgentSourceShapeId = anchorShapeId;
  }
  if (nonEmptyString(args.prompt) && !shapeMeta.prompt) {
    shapeMeta.prompt = nonEmptyString(args.prompt);
  }

  const shapeRecord = {
    x: bounds.x,
    y: bounds.y,
    rotation: holderAnchor && anchorShape?.type === 'frame' ? 0 : finiteNumber(anchorShape?.rotation, 0),
    isLocked: false,
    opacity: 1,
    meta: shapeMeta,
    id: shapeId,
    type: 'image',
    props: {
      w: bounds.w,
      h: bounds.h,
      assetId,
      playing: true,
      url: '',
      crop: null,
      flipX: false,
      flipY: false,
      altText: nonEmptyString(args.altText) || 'Image Agent inserted image'
    },
    parentId,
    index,
    typeName: 'shape'
  };

  if (!args.dryRun) {
    await mkdir(assetsDir, { recursive: true });
    await copyFile(sourceImagePath, filePath);
    store[assetId] = assetRecord;
    store[shapeId] = shapeRecord;
    await saveCanvasSnapshot(canvasUrl, snapshot);
  }

  return {
    canvasUrl,
    pageId,
    parentId,
    anchorShapeId,
    holderAnchor,
    assetId,
    shapeId,
    index,
    sourceImagePath,
    assetFile: filePath,
    assetUrl: assetRecord.props.src,
    imageSize,
    bounds,
    dryRun: Boolean(args.dryRun)
  };
}

async function insertReferenceImage(args = {}) {
  const source = await resolveReferenceImageSource(args);
  const tempName = sanitizeReferenceFileName(
    args.fileName || source.fileName,
    args.title || 'reference',
    source.mimeType
  );

  if (source.kind === 'local') {
    return insertCanvasImage({
      ...args,
      imagePath: source.sourceImagePath,
      fileName: tempName,
      altText: nonEmptyString(args.altText) || nonEmptyString(args.title) || 'Reference image',
      shapeMeta: {
        imageAgentReferenceImage: true,
        imageAgentInspirationId: nonEmptyString(args.inspirationId) || '',
        title: nonEmptyString(args.title) || 'Reference Image',
        source: nonEmptyString(args.source) || nonEmptyString(args.sourceLabel) || '',
        prompt: compactText(args.prompt || ''),
        sourceUrl: source.sourceUrl,
        createdAt: new Date().toISOString(),
        ...(args.shapeMeta && typeof args.shapeMeta === 'object' ? args.shapeMeta : {})
      },
      assetMeta: {
        imageAgentReferenceAsset: true,
        sourceUrl: source.sourceUrl,
        ...(args.assetMeta && typeof args.assetMeta === 'object' ? args.assetMeta : {})
      }
    });
  }

  const { canvasUrl, snapshot } = await loadCanvasSnapshot(args);
  const store = snapshot.store;
  const { selection } = await readSelectionState(args);
  const viewState = await readViewState(args);
  const anchorShapeId =
    nonEmptyString(args.anchorShapeId) ||
    nonEmptyString(args.targetId) ||
    nonEmptyString(args.sourceShapeId) ||
    firstSelectedShapeId(selection);
  const anchorShape = anchorShapeId ? getRecord(store, anchorShapeId, 'anchor shape') : null;
  const pageId =
    nonEmptyString(args.pageId) ||
    (anchorShape ? findPageIdForShape(store, anchorShape.id) : null) ||
    nonEmptyString(viewState?.currentPageId) ||
    currentPageFromStore(store);
  if (!pageId || !store[pageId]) throw new Error('Could not determine target pageId.');

  const imageSize = await getImageDimensionsFromBuffer(source.buffer);
  const maxDisplayWidth = Math.max(160, Math.min(720, finiteNumber(args.maxWidth, 420)));
  const width = finiteNumber(args.displayWidth ?? args.width, Math.min(maxDisplayWidth, imageSize.width || maxDisplayWidth));
  const height = finiteNumber(args.displayHeight ?? args.height, Math.round(width * ((imageSize.height || width) / (imageSize.width || width))));
  const parentId = anchorShape?.parentId && store[anchorShape.parentId]?.typeName === 'page' ? anchorShape.parentId : pageId;
  const margin = Math.max(0, finiteNumber(args.margin, 40));
  const placement = ['right', 'left', 'below'].includes(args.placement) ? args.placement : 'right';
  const bounds = choosePlacement({ store, pageId, parentId, anchorShape, width, height, margin, placement });

  const canvasDir = resolveCanvasDir(args);
  const assetsDir = join(canvasDir, 'pages', pageDirName(pageId), 'assets');
  if (!isSafeChildPath(canvasDir, assetsDir)) throw new Error(`Unsafe page assets directory: ${assetsDir}`);
  const { fileName, filePath } = await uniqueFilePath(assetsDir, tempName);
  const recordSeed = sanitizeIdPart(fileName);
  const assetId = uniqueRecordId(store, 'asset', recordSeed);
  const shapeId = uniqueRecordId(store, 'shape', recordSeed);
  const index = chooseIndex(store, parentId);

  const assetRecord = {
    id: assetId,
    typeName: 'asset',
    type: 'image',
    props: {
      name: fileName,
      src: pageAssetUrl(pageId, fileName),
      w: imageSize.width,
      h: imageSize.height,
      fileSize: source.buffer.length,
      mimeType: source.mimeType,
      isAnimated: false
    },
    meta: {
      imageAgentReferenceAsset: true,
      sourceUrl: source.sourceUrl,
      ...(args.assetMeta && typeof args.assetMeta === 'object' ? args.assetMeta : {})
    }
  };

  const shapeRecord = {
    x: bounds.x,
    y: bounds.y,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {
      imageAgentReferenceImage: true,
      imageAgentInspirationId: nonEmptyString(args.inspirationId) || '',
      title: nonEmptyString(args.title) || 'Reference Image',
      source: nonEmptyString(args.source) || nonEmptyString(args.sourceLabel) || '',
      prompt: compactText(args.prompt || ''),
      sourceUrl: source.sourceUrl,
      createdAt: new Date().toISOString(),
      ...(args.shapeMeta && typeof args.shapeMeta === 'object' ? args.shapeMeta : {})
    },
    id: shapeId,
    type: 'image',
    props: {
      w: bounds.w,
      h: bounds.h,
      assetId,
      playing: true,
      url: '',
      crop: null,
      flipX: false,
      flipY: false,
      altText: nonEmptyString(args.altText) || nonEmptyString(args.title) || 'Reference image'
    },
    parentId,
    index,
    typeName: 'shape'
  };

  if (!args.dryRun) {
    await mkdir(assetsDir, { recursive: true });
    await writeFile(filePath, source.buffer);
    store[assetId] = assetRecord;
    store[shapeId] = shapeRecord;
    await saveCanvasSnapshot(canvasUrl, snapshot);
  }

  return {
    canvasUrl,
    pageId,
    parentId,
    anchorShapeId,
    assetId,
    shapeId,
    index,
    assetFile: filePath,
    assetUrl: assetRecord.props.src,
    imageSize,
    bounds,
    dryRun: Boolean(args.dryRun)
  };
}

async function searchInspirationLibrary(args = {}) {
  const canvasUrl = normalizeCanvasUrl(args);
  const query = new URLSearchParams();
  if (nonEmptyString(args.query)) query.set('q', nonEmptyString(args.query));
  if (nonEmptyString(args.category)) query.set('category', nonEmptyString(args.category));
  if (typeof args.limit === 'number') query.set('limit', String(Math.max(1, Math.min(100, Math.floor(args.limit)))));
  if (args.promptOnly === true) query.set('promptOnly', 'true');
  const payload = await fetchJson(`${canvasUrl}/api/inspirations/search?${query.toString()}`);
  const count = payload?.items?.length ?? 0;
  return { canvasUrl, ...payload, count };
}

async function insertPromptCard(args = {}) {
  const text = compactText(args.text || args.prompt);
  if (!text) throw new Error('text is required.');

  const { canvasUrl, snapshot } = await loadCanvasSnapshot(args);
  const store = snapshot.store;
  const { selection } = await readSelectionState(args);
  const viewState = await readViewState(args);
  const targetShapeId =
    nonEmptyString(args.targetShapeId) ||
    nonEmptyString(args.anchorShapeId) ||
    firstSelectedShapeId(selection);
  const anchorShape = targetShapeId ? getRecord(store, targetShapeId, 'target shape') : null;
  const pageId =
    nonEmptyString(args.pageId) ||
    (anchorShape ? findPageIdForShape(store, anchorShape.id) : null) ||
    nonEmptyString(viewState?.currentPageId) ||
    currentPageFromStore(store);
  if (!pageId || !store[pageId]) throw new Error('Could not determine target pageId.');

  const width = finiteNumber(args.width, 360);
  const height = finiteNumber(args.height, 220);
  const camera = viewState?.camera ?? { x: 0, y: 0, z: 1 };
  const bounds = anchorShape
    ? choosePlacement({
        store,
        pageId,
        parentId: pageId,
        anchorShape,
        width,
        height,
        margin: Math.max(16, finiteNumber(args.margin, 36)),
        placement: ['right', 'left', 'below'].includes(args.placement) ? args.placement : 'right'
      })
    : {
        x: finiteNumber(args.x, -camera.x + 120),
        y: finiteNumber(args.y, -camera.y + 120),
        w: width,
        h: height
      };

  const { shapeId, record } = createGeoPromptCardRecord({
    store,
    parentId: pageId,
    seed: args.title || 'prompt-card',
    x: bounds.x,
    y: bounds.y,
    width,
    height,
    title: args.title,
    text,
    source: args.source,
    color: ['blue', 'green', 'red', 'yellow', 'black', 'grey'].includes(args.color) ? args.color : 'blue',
    meta: args.meta && typeof args.meta === 'object' ? args.meta : {}
  });
  store[shapeId] = record;
  await saveCanvasSnapshot(canvasUrl, snapshot);

  return { canvasUrl, pageId, shapeId, targetShapeId, bounds };
}

async function createCanvasBranch(args = {}) {
  const { canvasUrl, snapshot } = await loadCanvasSnapshot(args);
  const store = snapshot.store;
  const { selection } = await readSelectionState(args);
  const viewState = await readViewState(args);
  const sourceShapeId =
    nonEmptyString(args.sourceShapeId) ||
    nonEmptyString(args.targetShapeId) ||
    firstSelectedShapeId(selection);
  if (!sourceShapeId) throw new Error('sourceShapeId is required when no single canvas shape is selected.');

  const sourceShape = getRecord(store, sourceShapeId, 'source shape');
  const pageId =
    nonEmptyString(args.pageId) ||
    findPageIdForShape(store, sourceShape.id) ||
    nonEmptyString(viewState?.currentPageId) ||
    currentPageFromStore(store);
  if (!pageId || !store[pageId]) throw new Error('Could not determine target pageId.');

  const width = finiteNumber(args.width, 320);
  const height = finiteNumber(args.height, 220);
  const branchLabel = nonEmptyString(args.branchLabel) || chooseNextBranchLabel(store);
  const sourceBounds = pageBoundsForShape(store, sourceShape) ?? { x: sourceShape.x ?? 0, y: sourceShape.y ?? 0, w: width, h: height };
  const bounds = choosePlacement({
    store,
    pageId,
    parentId: pageId,
    anchorShape: sourceShape,
    width,
    height,
    margin: Math.max(24, finiteNumber(args.margin, 56)),
    placement: ['right', 'left', 'below'].includes(args.placement) ? args.placement : 'right'
  });
  const holderId = uniqueRecordId(store, 'shape', `${branchLabel}-branch-holder`);
  const prompt = compactText(args.prompt);
  const createdAt = new Date().toISOString();

  if (!sourceShape.meta?.branchLabel && !sourceShape.meta?.imageAgentBranchLabel) {
    sourceShape.meta = {
      ...(sourceShape.meta ?? {}),
      branchLabel: '#1',
      imageAgentBranchLabel: '#1'
    };
  }

  store[holderId] = {
    x: bounds.x,
    y: bounds.y,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {
      imageAgentAiImageHolder: true,
      cowartAiImageHolder: true,
      imageAgentBranchNode: true,
      sourceShapeId,
      prompt,
      createdAt,
      branchLabel,
      imageAgentBranchLabel: branchLabel,
      operationType: nonEmptyString(args.operationType) || 'derivative'
    },
    id: holderId,
    type: 'frame',
    props: {
      w: width,
      h: height,
      name: `${branchLabel} ${nonEmptyString(args.title) || 'Branch'}`,
      color: 'blue'
    },
    parentId: pageId,
    index: chooseIndex(store, pageId),
    typeName: 'shape'
  };

  const sourceCenter = { x: sourceBounds.x + sourceBounds.w / 2, y: sourceBounds.y + sourceBounds.h / 2 };
  const targetCenter = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  const { arrowId, record: arrowRecord } = createArrowRecord({
    store,
    parentId: pageId,
    sourceShapeId,
    targetShapeId: holderId,
    start: sourceCenter,
    end: targetCenter,
    label: branchLabel
  });
  store[arrowId] = arrowRecord;

  let promptCardId = null;
  if (prompt) {
    const card = createGeoPromptCardRecord({
      store,
      parentId: pageId,
      seed: `${branchLabel}-prompt`,
      x: bounds.x,
      y: bounds.y + bounds.h + 24,
      width: Math.max(320, width),
      height: 180,
      title: `${branchLabel} 修改要求`,
      text: prompt,
      source: sourceShapeId,
      color: 'green',
      meta: {
        imageAgentBranchPrompt: true,
        sourceShapeId,
        targetShapeId: holderId,
        branchLabel
      }
    });
    promptCardId = card.shapeId;
    store[card.shapeId] = card.record;
  }

  await saveCanvasSnapshot(canvasUrl, snapshot);
  return { canvasUrl, pageId, sourceShapeId, branchShapeId: holderId, arrowId, promptCardId, branchLabel, bounds };
}

function classifyCanvasError(message, technicalReason = '') {
  const text = `${message} ${technicalReason}`.toLowerCase();
  if (/403|forbidden|not enabled|permission|unauthorized|api key|key/.test(text)) {
    return { category: '权限或模型不可用', retryable: false, action: '检查密钥、模型权限、接口类型和当前账号组是否开通生图。' };
  }
  if (/timeout|timed out|context canceled|abort|cancel/.test(text)) {
    return { category: '超时或请求中断', retryable: true, action: '先查看历史或上游记录，确认没有继续处理后再重试。' };
  }
  if (/policy|safety|flagged|blocked|refused/.test(text)) {
    return { category: '内容策略拦截', retryable: false, action: '调整提示词，减少敏感、受限或容易被误判的描述。' };
  }
  if (/network|econn|internal_error|stream|upstream|origin_not_allowed/.test(text)) {
    return { category: '网络或上游异常', retryable: true, action: '稍后重试，或切换到稳定的接口与账号池。' };
  }
  if (/format|mime|unsupported|image/.test(text)) {
    return { category: '图片格式不支持', retryable: false, action: '换成 PNG、JPG 或 WebP，并确认图片没有损坏。' };
  }
  return { category: '未识别错误', retryable: true, action: '保留这条节点，查看技术原因后再决定是否重试。' };
}

async function insertErrorNote(args = {}) {
  const message = compactText(args.message, 2000);
  if (!message) throw new Error('message is required.');
  const technicalReason = compactText(args.technicalReason, 2000);
  const classified = classifyCanvasError(message, technicalReason);
  const retryable = typeof args.retryable === 'boolean' ? args.retryable : classified.retryable;
  const text = [
    `失败类型：${classified.category}`,
    `用户提示：${message}`,
    technicalReason ? `技术原因：${technicalReason}` : '',
    `是否建议重试：${retryable ? '可以重试' : '不建议直接重试'}`,
    `下一步：${classified.action}`
  ].filter(Boolean).join('\n');

  const result = await insertPromptCard({
    ...args,
    text,
    title: nonEmptyString(args.title) || '生成失败说明',
    targetShapeId: nonEmptyString(args.targetShapeId),
    color: 'red',
    meta: {
      imageAgentErrorNote: true,
      errorCategory: classified.category,
      retryable,
      technicalReason
    }
  });
  return { ...result, category: classified.category, retryable, nextAction: classified.action };
}

async function exportEditPack(args = {}) {
  const canvasUrl = normalizeCanvasUrl(args);
  return fetchJson(`${canvasUrl}/api/export/edit-pack`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      selectionIds: Array.isArray(args.selectionIds) ? args.selectionIds : undefined,
      includeSnapshot: args.includeSnapshot === true
    })
  });
}

async function exportCanvasArchive(args = {}) {
  const canvasUrl = normalizeCanvasUrl(args);
  return fetchJson(`${canvasUrl}/api/archive/export`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      outputPath: nonEmptyString(args.outputPath)
    })
  });
}

async function importCanvasArchive(args = {}) {
  const archivePath = nonEmptyString(args.archivePath);
  if (!archivePath) throw new Error('archivePath is required.');
  const canvasUrl = normalizeCanvasUrl(args);
  return fetchJson(`${canvasUrl}/api/archive/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      archivePath,
      mode: ['merge', 'replace'].includes(args.mode) ? args.mode : 'merge'
    })
  });
}

function layerText(shape) {
  const props = shape.props || {};
  return props.text || props.plainText || props.richText?.content?.[0]?.content?.map((node) => node.text).filter(Boolean).join(' ') || props.name || '';
}

async function readCanvasLayers(args = {}) {
  const { canvasUrl, snapshot } = await loadCanvasSnapshot(args);
  const layers = Object.values(snapshot.store)
    .filter((record) => record?.typeName === 'shape')
    .map((shape) => ({
      id: shape.id,
      type: shape.type,
      parentId: shape.parentId,
      x: shape.x ?? 0,
      y: shape.y ?? 0,
      rotation: shape.rotation ?? 0,
      bounds: pageBoundsForShape(snapshot.store, shape),
      zIndex: shape.index ?? null,
      text: layerText(shape),
      assetRef: shape.props?.assetId ?? null,
      asset: shape.props?.assetId ? snapshot.store[shape.props.assetId] ?? null : null,
      links: {
        sourceShapeId: shape.meta?.sourceShapeId ?? shape.meta?.imageAgentSourceShapeId ?? null,
        targetShapeId: shape.meta?.targetShapeId ?? null,
        branchLabel: shape.meta?.branchLabel ?? shape.meta?.imageAgentBranchLabel ?? null
      },
      meta: shape.meta ?? null,
      props: shape.props ?? null
    }));
  return { canvasUrl, layers, layerCount: layers.length };
}

function toolDefinitions() {
  return [
    {
      name: TOOL_OPEN_SERVICE,
      title: 'Open Image Agent Canvas Service',
      description: 'Return the running Image Agent Canvas URL, project-local storage paths, and health state.',
      inputSchema: {
        type: 'object',
        properties: {
          canvasUrl: { type: 'string' },
          projectDir: { type: 'string' },
          canvasDir: { type: 'string' }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    {
      name: TOOL_GET_SELECTION,
      title: 'Get Canvas Selection',
      description: 'Return currently selected Image Agent Canvas/tldraw shapes from the project-local selection file.',
      inputSchema: {
        type: 'object',
        properties: {
          projectDir: { type: 'string' },
          canvasDir: { type: 'string' }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    {
      name: TOOL_CREATE_HOLDER,
      title: 'Create AI Image Holder',
      description: 'Create a tldraw frame holder with Image Agent metadata on the running canvas.',
      inputSchema: {
        type: 'object',
        properties: {
          canvasUrl: { type: 'string' },
          projectDir: { type: 'string' },
          canvasDir: { type: 'string' },
          pageId: { type: 'string' },
          name: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    {
      name: TOOL_INSERT_IMAGE,
      title: 'Insert Canvas Image',
      description: 'Copy a local bitmap into page-local assets, create tldraw image asset and shape records, and save through the canvas API.',
      inputSchema: {
        type: 'object',
        properties: {
          imagePath: { type: 'string' },
          localImagePath: { type: 'string' },
          projectDir: { type: 'string' },
          canvasDir: { type: 'string' },
          canvasUrl: { type: 'string' },
          pageId: { type: 'string' },
          anchorShapeId: { type: 'string' },
          targetId: { type: 'string' },
          sourceShapeId: { type: 'string' },
          fileName: { type: 'string' },
          placement: { type: 'string', enum: ['right', 'left', 'below'] },
          margin: { type: 'number' },
          matchAnchor: { type: 'boolean' },
          displayWidth: { type: 'number' },
          displayHeight: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
          prompt: { type: 'string' },
          altText: { type: 'string' },
          shapeMeta: { type: 'object' },
          assetMeta: { type: 'object' },
          dryRun: { type: 'boolean' }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    {
      name: TOOL_INSERT_REFERENCE_IMAGE,
      title: 'Insert Reference Image',
      description: 'Insert a reference image from a local path, data URL, or http(s) image URL through MCP. Browser UI does not write reference images directly.',
      inputSchema: {
        type: 'object',
        properties: {
          imageUrl: { type: 'string' },
          image: { type: 'string' },
          src: { type: 'string' },
          imagePath: { type: 'string' },
          localImagePath: { type: 'string' },
          projectDir: { type: 'string' },
          canvasDir: { type: 'string' },
          canvasUrl: { type: 'string' },
          pageId: { type: 'string' },
          anchorShapeId: { type: 'string' },
          targetId: { type: 'string' },
          sourceShapeId: { type: 'string' },
          fileName: { type: 'string' },
          title: { type: 'string' },
          source: { type: 'string' },
          sourceLabel: { type: 'string' },
          inspirationId: { type: 'string' },
          prompt: { type: 'string' },
          placement: { type: 'string', enum: ['right', 'left', 'below'] },
          margin: { type: 'number' },
          maxWidth: { type: 'number' },
          displayWidth: { type: 'number' },
          displayHeight: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
          altText: { type: 'string' },
          shapeMeta: { type: 'object' },
          assetMeta: { type: 'object' },
          dryRun: { type: 'boolean' }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    {
      name: TOOL_READ_LAYERS,
      title: 'Read Canvas Layers',
      description: 'Read a compact structured view of current tldraw shape layers.',
      inputSchema: {
        type: 'object',
        properties: {
          canvasUrl: { type: 'string' }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    {
      name: TOOL_SEARCH_INSPIRATION,
      title: 'Search Inspiration Library',
      description: 'Search the project-local Image Agent inspiration and prompt library.',
      inputSchema: {
        type: 'object',
        properties: {
          canvasUrl: { type: 'string' },
          query: { type: 'string' },
          category: { type: 'string' },
          limit: { type: 'number' },
          promptOnly: { type: 'boolean' }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    {
      name: TOOL_INSERT_PROMPT_CARD,
      title: 'Insert Prompt Card',
      description: 'Insert a readable prompt card onto the canvas near a target or the current viewport.',
      inputSchema: {
        type: 'object',
        properties: {
          canvasUrl: { type: 'string' },
          projectDir: { type: 'string' },
          canvasDir: { type: 'string' },
          pageId: { type: 'string' },
          text: { type: 'string' },
          prompt: { type: 'string' },
          title: { type: 'string' },
          source: { type: 'string' },
          targetShapeId: { type: 'string' },
          anchorShapeId: { type: 'string' },
          placement: { type: 'string', enum: ['right', 'left', 'below'] },
          margin: { type: 'number' },
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
          color: { type: 'string' },
          meta: { type: 'object' }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    {
      name: TOOL_CREATE_BRANCH,
      title: 'Create Canvas Branch',
      description: 'Create a visual lineage branch from a selected/source shape to a new AI holder, with optional prompt card and connecting arrow.',
      inputSchema: {
        type: 'object',
        properties: {
          canvasUrl: { type: 'string' },
          projectDir: { type: 'string' },
          canvasDir: { type: 'string' },
          pageId: { type: 'string' },
          sourceShapeId: { type: 'string' },
          targetShapeId: { type: 'string' },
          title: { type: 'string' },
          prompt: { type: 'string' },
          branchLabel: { type: 'string' },
          operationType: { type: 'string' },
          placement: { type: 'string', enum: ['right', 'left', 'below'] },
          margin: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    {
      name: TOOL_EXPORT_EDIT_PACK,
      title: 'Export Edit Pack',
      description: 'Export selected image, annotations, reference layers, and prompt context for Codex image editing.',
      inputSchema: {
        type: 'object',
        properties: {
          canvasUrl: { type: 'string' },
          selectionIds: { type: 'array', items: { type: 'string' } },
          includeSnapshot: { type: 'boolean' }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    {
      name: TOOL_INSERT_ERROR_NOTE,
      title: 'Insert Error Note',
      description: 'Insert a Chinese error explanation node near a target shape using a small common error dictionary.',
      inputSchema: {
        type: 'object',
        properties: {
          canvasUrl: { type: 'string' },
          projectDir: { type: 'string' },
          canvasDir: { type: 'string' },
          pageId: { type: 'string' },
          message: { type: 'string' },
          technicalReason: { type: 'string' },
          retryable: { type: 'boolean' },
          title: { type: 'string' },
          targetShapeId: { type: 'string' },
          placement: { type: 'string', enum: ['right', 'left', 'below'] }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    {
      name: TOOL_EXPORT_ARCHIVE,
      title: 'Export Canvas Archive',
      description: 'Export a project-local JSON archive of canvas pages, assets, selection, view state, and library cache.',
      inputSchema: {
        type: 'object',
        properties: {
          canvasUrl: { type: 'string' },
          outputPath: { type: 'string' }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    {
      name: TOOL_IMPORT_ARCHIVE,
      title: 'Import Canvas Archive',
      description: 'Import a canvas archive into the current project canvas directory using merge or replace mode.',
      inputSchema: {
        type: 'object',
        properties: {
          canvasUrl: { type: 'string' },
          archivePath: { type: 'string' },
          mode: { type: 'string', enum: ['merge', 'replace'] }
        },
        required: ['archivePath'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    }
  ];
}

async function handleToolCall(id, params) {
  if (params?.name === TOOL_OPEN_SERVICE) {
    const result = await openCanvasService(params.arguments ?? {});
    sendResult(id, contentResult(result.running ? `Canvas running at ${result.canvasUrl}` : `Canvas not reachable at ${result.canvasUrl}`, result));
    return;
  }

  if (params?.name === TOOL_GET_SELECTION) {
    const result = await getCanvasSelection(params.arguments ?? {});
    sendResult(id, contentResult(result.summary, result));
    return;
  }

  if (params?.name === TOOL_CREATE_HOLDER) {
    const result = await createAiImageHolder(params.arguments ?? {});
    sendResult(id, contentResult(`Created holder ${result.holderId} on ${result.pageId}.`, result));
    return;
  }

  if (params?.name === TOOL_INSERT_IMAGE) {
    const result = await insertCanvasImage(params.arguments ?? {});
    sendResult(
      id,
      contentResult(
        `${result.dryRun ? 'Planned' : 'Inserted'} ${result.shapeId} on ${result.pageId} at (${result.bounds.x}, ${result.bounds.y}).`,
        result
      )
    );
    return;
  }

  if (params?.name === TOOL_INSERT_REFERENCE_IMAGE) {
    const result = await insertReferenceImage(params.arguments ?? {});
    sendResult(
      id,
      contentResult(
        `${result.dryRun ? 'Planned' : 'Inserted'} reference ${result.shapeId} on ${result.pageId} at (${result.bounds.x}, ${result.bounds.y}).`,
        result
      )
    );
    return;
  }

  if (params?.name === TOOL_READ_LAYERS) {
    const result = await readCanvasLayers(params.arguments ?? {});
    sendResult(id, contentResult(`Read ${result.layerCount} canvas layers.`, result));
    return;
  }

  if (params?.name === TOOL_SEARCH_INSPIRATION) {
    const result = await searchInspirationLibrary(params.arguments ?? {});
    sendResult(id, contentResult(`Found ${result.count} inspiration items.`, result));
    return;
  }

  if (params?.name === TOOL_INSERT_PROMPT_CARD) {
    const result = await insertPromptCard(params.arguments ?? {});
    sendResult(id, contentResult(`Inserted prompt card ${result.shapeId}.`, result));
    return;
  }

  if (params?.name === TOOL_CREATE_BRANCH) {
    const result = await createCanvasBranch(params.arguments ?? {});
    sendResult(id, contentResult(`Created branch ${result.branchLabel} from ${result.sourceShapeId}.`, result));
    return;
  }

  if (params?.name === TOOL_EXPORT_EDIT_PACK) {
    const result = await exportEditPack(params.arguments ?? {});
    sendResult(id, contentResult(`Exported edit pack with ${result.layers?.length ?? 0} layers.`, result));
    return;
  }

  if (params?.name === TOOL_INSERT_ERROR_NOTE) {
    const result = await insertErrorNote(params.arguments ?? {});
    sendResult(id, contentResult(`Inserted ${result.category} error note ${result.shapeId}.`, result));
    return;
  }

  if (params?.name === TOOL_EXPORT_ARCHIVE) {
    const result = await exportCanvasArchive(params.arguments ?? {});
    sendResult(id, contentResult(`Exported canvas archive to ${result.archivePath}.`, result));
    return;
  }

  if (params?.name === TOOL_IMPORT_ARCHIVE) {
    const result = await importCanvasArchive(params.arguments ?? {});
    sendResult(id, contentResult(`Imported canvas archive from ${result.archivePath}.`, result));
    return;
  }

  sendError(id, JsonRpcError.INVALID_PARAMS, `Unknown tool: ${params?.name ?? ''}`);
}

async function handleRequest(message) {
  const { id, method, params } = message;

  if (method === 'initialize') {
    sendResult(id, {
      protocolVersion: params?.protocolVersion ?? '2025-11-25',
      capabilities: { tools: {} },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION
      },
      instructions:
        'Read and update Image Agent Canvas state. Use get_canvas_selection for persisted browser selection, insert_canvas_image for generated local bitmaps, insert_reference_image for reference images, create_canvas_branch for lineage, search_inspiration_library and insert_prompt_card for inspiration workflows, and export_edit_pack for annotated image editing context.'
    });
    return;
  }

  if (method === 'ping') {
    sendResult(id, {});
    return;
  }

  if (method === 'tools/list') {
    sendResult(id, { tools: toolDefinitions() });
    return;
  }

  if (method === 'tools/call') {
    try {
      await handleToolCall(id, params);
    } catch (error) {
      sendError(id, JsonRpcError.INVALID_PARAMS, error instanceof Error ? error.message : String(error));
    }
    return;
  }

  if (id !== undefined) {
    sendError(id, JsonRpcError.METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

const lines = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

lines.on('line', (line) => {
  if (line.trim().length === 0) return;

  let message;
  try {
    message = parseJsonText(line);
  } catch {
    return;
  }

  handleRequest(message).catch((error) => {
    if (message.id !== undefined) {
      sendError(message.id, JsonRpcError.INVALID_PARAMS, error instanceof Error ? error.message : String(error));
    }
  });
});
