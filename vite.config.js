import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { generateKeyBetween } from 'fractional-indexing';

const projectDir = resolve(process.env.IMAGE_AGENT_PROJECT_DIR ?? process.cwd());
const workspaceDir = resolve(
  process.env.IMAGE_AGENT_LIBRARY_DIR ??
  process.env.IMAGE_AGENT_WORKSPACE_DIR ??
  process.env.CODEX_WORKSPACE_DIR ??
  process.env.CODEX_CWD ??
  (existsSync('D:/wiki') ? 'D:/wiki' : projectDir)
);
const canvasDir = resolve(process.env.IMAGE_AGENT_CANVAS_DIR ?? join(projectDir, 'canvas'));
const selectionFile = join(canvasDir, 'image-agent-selection.json');
const viewStateFile = join(canvasDir, 'image-agent-view-state.json');
const runtimeFile = join(canvasDir, 'image-agent-runtime.json');
const generationSettingsFile = join(canvasDir, 'image-agent-generation-settings.json');
const generationSecretsDir = join(canvasDir, '.secrets');
const generationSecretFile = join(generationSecretsDir, 'image-agent-generation-secret.json');
const generationSizeOptions = ['1024x1024', '1536x1024', '1024x1536'];
const canvasPagesDir = join(canvasDir, 'pages');
const canvasAssetsDir = join(canvasDir, 'assets');
const canvasLibraryDir = join(canvasDir, 'library');
const canvasArchivesDir = join(canvasDir, 'archives');
const translationCacheFile = join(canvasLibraryDir, 'translation-cache.json');
const pagesManifestFile = join(canvasPagesDir, 'manifest.json');
const canvasFileName = 'image-agent-canvas.json';
const pageIdPrefix = 'page:';
const globalAssetsRoute = '/assets/';
const pageAssetsRoute = '/page-assets/';
const libraryAssetsRoute = '/library-assets/';
const canvasEventClients = new Set();
let canvasEventVersion = 0;
let inspirationCache = null;
let translationCache = null;
const appDisplayName = '图片插件';

const mimeTypes = new Map([
  ['.apng', 'image/apng'],
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp']
]);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function sendHtml(res, statusCode, html) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(html);
}

function safePageHtml() {
  const payload = JSON.stringify({
    ok: true,
    name: appDisplayName,
    projectDir,
    canvasRoot: canvasDir,
    canvasAppPath: '/canvas/'
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appDisplayName}安全检查</title>
    <style>
      html, body { margin: 0; min-height: 100%; background: #f8fafc; color: #111827; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { display: grid; min-height: 100vh; place-items: center; padding: 24px; }
      section { width: min(640px, 100%); border: 1px solid #dbe3ee; border-radius: 12px; background: #fff; padding: 24px; box-shadow: 0 16px 44px rgba(15, 23, 42, .08); }
      h1 { margin: 0 0 8px; font-size: 24px; line-height: 1.2; }
      p { margin: 0 0 16px; color: #475569; line-height: 1.55; }
      code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; padding: 10px; color: #0f172a; }
      a { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; margin-top: 16px; padding: 0 16px; border-radius: 8px; background: #2563eb; color: white; font-weight: 700; text-decoration: none; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${appDisplayName}安全检查通过。</h1>
        <p>这是一页纯 HTML。如果能看到这里，说明本地服务和 Codex 浏览器路由已经正常，再进入工作区。</p>
        <code>${payload.replaceAll('<', '&lt;')}</code>
        <a href="/canvas/">打开${appDisplayName}</a>
      </section>
    </main>
  </body>
</html>`;
}

function sendCanvasEvent(res, payload) {
  res.write('event: canvas-changed\n');
  res.write(`id: ${payload.version}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastCanvasChanged(result) {
  const payload = {
    version: ++canvasEventVersion,
    updatedAt: new Date().toISOString(),
    storage: result.storage,
    paths: result.paths
  };

  for (const client of canvasEventClients) {
    if (client.destroyed) {
      canvasEventClients.delete(client);
      continue;
    }
    try {
      sendCanvasEvent(client, payload);
    } catch {
      canvasEventClients.delete(client);
    }
  }
}

function readRequestBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) {
        rejectBody(new Error('Canvas payload is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => resolveBody(body));
    req.on('error', rejectBody);
  });
}

function parseJsonText(text) {
  return JSON.parse(String(text ?? '').replace(/^\uFEFF/, ''));
}

function isSnapshot(value) {
  return value && typeof value === 'object' && value.store && value.schema;
}

function isSelectionState(value) {
  return value && typeof value === 'object' && Array.isArray(value.selectedShapes);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isViewState(value) {
  return (
    value &&
    typeof value === 'object' &&
    value.version === 1 &&
    (value.currentPageId === null || typeof value.currentPageId === 'string') &&
    value.camera &&
    typeof value.camera === 'object' &&
    isFiniteNumber(value.camera.x) &&
    isFiniteNumber(value.camera.y) &&
    isFiniteNumber(value.camera.z)
  );
}

function isSafeChildPath(parent, child) {
  const pathToChild = relative(parent, child);
  return pathToChild && !pathToChild.startsWith('..') && !pathToChild.includes(`..${sep}`);
}

function hasSafeRelativePath(parent, child) {
  const pathToChild = relative(parent, child);
  return pathToChild === '' || (!pathToChild.startsWith('..') && !pathToChild.includes(`..${sep}`));
}

function compactText(value, maxLength = 12000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, maxLength);
}

function hasChineseText(value) {
  return /[\u3400-\u9fff]/.test(String(value ?? ''));
}

function countChineseChars(value) {
  return (String(value ?? '').match(/[\u3400-\u9fff]/g) || []).length;
}

function countLatinLetters(value) {
  return (String(value ?? '').match(/[a-zA-Z]/g) || []).length;
}

function isChinesePromptText(value) {
  const text = compactText(value);
  const chineseChars = countChineseChars(text);
  if (chineseChars < 8) return false;
  return chineseChars >= countLatinLetters(text) * 0.35;
}

function extractLocaleBlocks(value) {
  const text = compactText(value);
  if (!text) return {};

  const markerPattern = /\[(中文|Chinese|ZH|CN|英文|English|EN)\]/gi;
  const matches = [...text.matchAll(markerPattern)];
  if (matches.length === 0) return {};

  const blocks = {};
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const label = match[1].toLowerCase();
    const locale = ['中文', 'chinese', 'zh', 'cn'].includes(label) ? 'zh' : 'en';
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    const block = compactText(text.slice(start, end));
    if (block) blocks[locale] = block;
  }
  return blocks;
}

function textValueForLocale(value, locale = 'zh') {
  if (value == null) return '';
  if (Array.isArray(value)) {
    return compactText(value.map((item) => textValueForLocale(item, locale)).filter(Boolean).join('\n'));
  }
  if (typeof value === 'object') {
    const primary = textValueForLocale(value[locale], locale);
    if (primary) return primary;
    const fallbackLocale = locale === 'zh' ? 'en' : 'zh';
    const fallback = textValueForLocale(value[fallbackLocale], fallbackLocale);
    if (fallback) return fallback;
    return textValueForLocale(value.text ?? value.label ?? value.name ?? value.title ?? value.description, locale);
  }
  const blocks = extractLocaleBlocks(value);
  if (blocks.zh || blocks.en) return compactText(blocks[locale] || '');
  return compactText(value);
}

function firstTextForLocale(locale, ...values) {
  for (const value of values) {
    const text = textValueForLocale(value, locale);
    if (text) return text;
  }
  return '';
}

function textVariants(...values) {
  const zhSource = firstTextForLocale('zh', ...values);
  const enSource = firstTextForLocale('en', ...values);
  const en = compactText(enSource || zhSource);
  const zh = compactText(isChinesePromptText(zhSource) ? zhSource : '');
  return { zh, en };
}

function promptPreviewVariants(promptText, previewSource) {
  const previewText = textVariants(previewSource);
  return {
    zh: compactText(previewText.zh || promptText.zh, 280),
    en: compactText(previewText.en || promptText.en, 280)
  };
}

function templatePromptVariants(item) {
  const explicitPrompt = item?.prompt || item?.finalPrompt || item?.template;
  if (explicitPrompt) return textVariants(explicitPrompt);

  const description = textVariants(item?.description);
  const useWhen = textVariants(item?.useWhen);
  const guidance = textVariants(item?.guidance);
  return {
    zh: compactText([
      description.zh,
      useWhen.zh,
      guidance.zh ? `要点：\n${guidance.zh}` : ''
    ].filter(Boolean).join('\n')),
    en: compactText([
      description.en,
      useWhen.en,
      guidance.en ? `Guidance:\n${guidance.en}` : ''
    ].filter(Boolean).join('\n'))
  };
}

function searchTextValue(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(searchTextValue).filter(Boolean).join('\n');
  if (typeof value === 'object') return Object.values(value).map(searchTextValue).filter(Boolean).join('\n');
  return compactText(value);
}

function translationCacheKey(value) {
  return createHash('sha256').update(compactText(value)).digest('hex');
}

async function loadTranslationCache() {
  if (translationCache) return translationCache;
  const cached = await readJsonFileOrNull(translationCacheFile);
  translationCache = cached && typeof cached === 'object' && cached.entries
    ? cached
    : { version: 1, entries: {} };
  return translationCache;
}

async function saveTranslationCache(cache) {
  await writeJsonAtomic(translationCacheFile, {
    ...cache,
    updatedAt: new Date().toISOString()
  });
}

function parseGoogleTranslatePayload(payload) {
  if (!Array.isArray(payload?.[0])) return '';
  return compactText(payload[0].map((part) => Array.isArray(part) ? part[0] : '').filter(Boolean).join(''));
}

function splitTextForTranslation(value, maxLength = 3600) {
  const text = compactText(value);
  if (text.length <= maxLength) return text ? [text] : [];

  const chunks = [];
  let current = '';
  for (const segment of text.split(/(\n\n|\n|(?<=[.!?。！？])\s+)/)) {
    if (!segment) continue;
    if ((current + segment).length > maxLength && current) {
      chunks.push(compactText(current));
      current = '';
    }
    if (segment.length > maxLength) {
      for (let index = 0; index < segment.length; index += maxLength) {
        chunks.push(compactText(segment.slice(index, index + maxLength)));
      }
    } else {
      current += segment;
    }
  }
  if (compactText(current)) chunks.push(compactText(current));
  return chunks;
}

async function translateChunkToChinese(text) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'en');
  url.searchParams.set('tl', 'zh-CN');
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);
  const response = await fetch(url, { headers: { 'user-agent': 'image-agent-canvas/0.1' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseGoogleTranslatePayload(await response.json());
}

async function translateTextToChinese(value) {
  const text = compactText(value);
  if (!text || isChinesePromptText(text)) return text;

  const cache = await loadTranslationCache();
  const key = translationCacheKey(text);
  const cached = compactText(cache.entries[key]?.zh || '');
  if (cached) return cached;

  try {
    const translated = compactText((await Promise.all(
      splitTextForTranslation(text).map((chunk) => translateChunkToChinese(chunk))
    )).join('\n\n'));
    if (translated) {
      cache.entries[key] = {
        source: text,
        zh: translated,
        createdAt: new Date().toISOString()
      };
      await saveTranslationCache(cache);
      return translated;
    }
  } catch {
    // Keep the original prompt if the optional translation helper is unavailable.
  }
  return text;
}

async function localizeLibraryItem(item, locale = 'zh') {
  if (locale !== 'zh') return item;
  const promptZh = compactText(item.promptText?.zh || '');
  if (promptZh && isChinesePromptText(promptZh)) return item;

  const translatedPrompt = await translateTextToChinese(item.promptText?.en || item.prompt || '');
  const promptPreviewZh = compactText(translatedPrompt, 280);
  return {
    ...item,
    prompt: translatedPrompt,
    promptText: {
      ...(item.promptText || {}),
      zh: translatedPrompt
    },
    promptPreview: promptPreviewZh,
    promptPreviewText: {
      ...(item.promptPreviewText || {}),
      zh: promptPreviewZh
    }
  };
}

async function localizeLibraryItems(items, locale = 'zh') {
  if (locale !== 'zh') return items;
  return Promise.all(items.map((item) => localizeLibraryItem(item, locale)));
}

const categoryZhLabels = new Map([
  ['Architecture & Spaces', '建筑与空间'],
  ['Brand & Logos', '品牌与 Logo'],
  ['Characters & People', '角色与人物'],
  ['Charts & Infographics', '图表与信息图'],
  ['Community Prompts', '社区提示词'],
  ['Documents & Publishing', '文档与出版'],
  ['Fashion & Beauty', '时尚与美妆'],
  ['Games & Entertainment', '游戏与娱乐'],
  ['History & Classical Themes', '历史与古典主题'],
  ['Illustration & Art', '插画与艺术'],
  ['Other Use Cases', '其他用途'],
  ['Photography & Realism', '摄影与写实'],
  ['Posters & Typography', '海报与字体'],
  ['Products & E-commerce', '产品与电商'],
  ['Scenes & Storytelling', '场景与叙事'],
  ['UI & Interfaces', 'UI 与界面']
]);

function categoryOption(value, locale = 'zh') {
  const text = compactText(value, 160);
  return {
    value: text,
    label: locale === 'zh' ? (categoryZhLabels.get(text) || text) : text
  };
}

function categoryOptions(categories, locale = 'zh') {
  return categories.map((category) => categoryOption(category, locale));
}

function sanitizeIdPart(value, fallback = 'shape') {
  return String(value || fallback)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;
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

function richTextFromPlainText(value) {
  const lines = String(value ?? '').replace(/\r\n/g, '\n').split('\n');
  return {
    type: 'doc',
    content: lines.map((line) => (
      line
        ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
        : { type: 'paragraph' }
    ))
  };
}

function pageDirName(pageId) {
  return encodeURIComponent(String(pageId).replace(pageIdPrefix, ''));
}

function pageFilePath(pageId) {
  return join(canvasPagesDir, pageDirName(pageId), canvasFileName);
}

function pageAssetsDir(pageId) {
  return join(canvasPagesDir, pageDirName(pageId), 'assets');
}

function pageAssetUrl(pageId, fileName) {
  return `${pageAssetsRoute}${pageDirName(pageId)}/${encodeURIComponent(fileName)}`;
}

function chooseIndex(store, parentId) {
  const siblingIndexes = Object.values(store)
    .filter((record) => record?.typeName === 'shape' && record.parentId === parentId && typeof record.index === 'string')
    .map((record) => record.index)
    .sort();
  return generateKeyBetween(siblingIndexes.at(-1) ?? null, null);
}

function getPageRecords(snapshot) {
  return Object.values(snapshot.store)
    .filter((record) => record?.typeName === 'page')
    .sort((a, b) => String(a.index ?? '').localeCompare(String(b.index ?? '')));
}

function getAssetIdsForShapes(shapes) {
  return new Set(shapes.map((shape) => shape?.props?.assetId).filter((assetId) => typeof assetId === 'string'));
}

function getShapeRecordsForPage(snapshot, pageId) {
  const shapesByParent = new Map();
  for (const record of Object.values(snapshot.store)) {
    if (record?.typeName !== 'shape') continue;
    const siblings = shapesByParent.get(record.parentId) ?? [];
    siblings.push(record);
    shapesByParent.set(record.parentId, siblings);
  }

  const shapes = [];
  const queue = [...(shapesByParent.get(pageId) ?? [])];
  while (queue.length > 0) {
    const shape = queue.shift();
    shapes.push(shape);
    queue.push(...(shapesByParent.get(shape.id) ?? []));
  }
  return shapes;
}

function isBindingForShapes(record, shapeIds) {
  if (record?.typeName !== 'binding') return false;
  const fromId = record.fromId ?? record.props?.fromId;
  const toId = record.toId ?? record.props?.toId;
  return shapeIds.has(fromId) || shapeIds.has(toId);
}

function snapshotForPage(snapshot, page) {
  const pageId = page.id;
  const pageShapes = getShapeRecordsForPage(snapshot, pageId);
  const shapeIds = new Set(pageShapes.map((shape) => shape.id));
  const assetIds = getAssetIdsForShapes(pageShapes);
  const store = {};

  for (const record of Object.values(snapshot.store)) {
    if (!record?.id) continue;
    if (record.typeName === 'page') {
      if (record.id === pageId) store[record.id] = record;
      continue;
    }
    if (record.typeName === 'shape') {
      if (shapeIds.has(record.id)) store[record.id] = record;
      continue;
    }
    if (record.typeName === 'asset') {
      if (assetIds.has(record.id)) store[record.id] = record;
      continue;
    }
    if (record.typeName === 'binding') {
      if (isBindingForShapes(record, shapeIds)) store[record.id] = record;
      continue;
    }
    store[record.id] = record;
  }

  return {
    schema: snapshot.schema,
    store
  };
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

function sanitizeAssetFileName(name, fallbackName, mimeType) {
  const rawName = basename(String(name || fallbackName || 'asset'));
  const extension = extname(rawName) || extensionFromMimeType(mimeType);
  const baseName = rawName
    .slice(0, rawName.length - extname(rawName).length)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${baseName || 'asset'}${extension}`;
}

async function uniqueAssetFilePath(dir, requestedName, mimeType) {
  const safeName = sanitizeAssetFileName(requestedName, 'reference', mimeType);
  const extension = extname(safeName);
  const baseName = safeName.slice(0, safeName.length - extension.length);
  let candidate = safeName;
  let counter = 2;

  while (true) {
    const filePath = join(dir, candidate);
    try {
      await stat(filePath);
      candidate = `${baseName}-v${counter}${extension}`;
      counter += 1;
    } catch (error) {
      if (error.code === 'ENOENT') return { fileName: candidate, filePath };
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

async function resolveReferenceImageBody(body = {}) {
  const image = compactText(body.image || body.imageUrl || body.src, 4000);
  if (!image) throw new Error('image is required.');

  const dataUrl = image.startsWith('data:') ? parseDataUrl(image) : null;
  if (dataUrl) {
    return {
      buffer: dataUrl.buffer,
      mimeType: dataUrl.mimeType,
      sourceUrl: 'data:',
      fileName: sanitizeAssetFileName(body.fileName || body.title, 'reference', dataUrl.mimeType)
    };
  }

  const localPath = localAssetFilePathFromUrl(image);
  if (localPath) {
    const mimeType = mimeTypes.get(extname(localPath).toLowerCase()) ?? 'application/octet-stream';
    if (!mimeType.startsWith('image/')) throw new Error(`Reference file is not an image: ${mimeType}`);
    return {
      buffer: await readFile(localPath),
      mimeType,
      sourceUrl: image,
      fileName: sanitizeAssetFileName(body.fileName || body.title, basename(localPath), mimeType)
    };
  }

  if (/^https?:\/\//i.test(image)) {
    const response = await fetch(image, {
      headers: { 'user-agent': 'image-agent-canvas/0.1' }
    });
    if (!response.ok) throw new Error(`Could not download reference image: HTTP ${response.status}`);
    const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || mimeTypes.get(extname(new URL(image).pathname).toLowerCase()) || 'application/octet-stream';
    if (!mimeType.startsWith('image/')) throw new Error(`Reference URL is not an image: ${mimeType}`);
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType,
      sourceUrl: image,
      fileName: sanitizeAssetFileName(body.fileName || body.title, basename(new URL(image).pathname), mimeType)
    };
  }

  throw new Error('Only canvas assets, library assets, data URLs, and http(s) image URLs are supported.');
}

function localAssetFilePathFromUrl(src) {
  let route = null;
  let baseDir = null;
  if (src.startsWith(globalAssetsRoute)) {
    route = globalAssetsRoute;
    baseDir = canvasAssetsDir;
  } else if (src.startsWith(pageAssetsRoute)) {
    const parts = src.slice(pageAssetsRoute.length).split('/');
    const pageDir = decodeURIComponent(parts.shift() ?? '');
    if (!pageDir || parts.length === 0) return null;
    const filePath = resolve(join(canvasPagesDir, pageDir, 'assets'), ...parts.map(decodeURIComponent));
    return isSafeChildPath(join(canvasPagesDir, pageDir, 'assets'), filePath) ? filePath : null;
  } else if (src.startsWith(libraryAssetsRoute)) {
    const requestedPath = decodeURIComponent(src.slice(libraryAssetsRoute.length));
    const sourceRoots = sourceCandidates('cases.json')
      .map((filePath) => dirname(filePath))
      .filter((value, index, list) => list.indexOf(value) === index);
    for (const sourceRoot of sourceRoots) {
      const filePath = resolve(sourceRoot, requestedPath);
      if (hasSafeRelativePath(sourceRoot, filePath) && existsSync(filePath)) return filePath;
    }
    return null;
  } else {
    return null;
  }

  const requestedPath = decodeURIComponent(src.slice(route.length));
  const filePath = resolve(baseDir, requestedPath);
  return isSafeChildPath(baseDir, filePath) ? filePath : null;
}

async function localizePageAsset(asset, pageId) {
  const src = asset?.props?.src;
  if (!src || typeof src !== 'string' || /^https?:\/\//.test(src)) return asset;

  const currentPagePrefix = `${pageAssetsRoute}${pageDirName(pageId)}/`;
  if (src.startsWith(currentPagePrefix)) return asset;

  const localizedAsset = structuredClone(asset);
  const dataUrl = src.startsWith('data:') ? parseDataUrl(src) : null;
  const sourceFilePath = dataUrl ? null : localAssetFilePathFromUrl(src);
  if (!dataUrl && !sourceFilePath) return localizedAsset;

  const fileName = sanitizeAssetFileName(
    dataUrl ? null : localizedAsset.props.name,
    sourceFilePath ? basename(sourceFilePath) : localizedAsset.id.replace(':', '-'),
    dataUrl?.mimeType ?? localizedAsset.props.mimeType
  );
  const destinationDir = pageAssetsDir(pageId);
  const destinationPath = join(destinationDir, fileName);

  await mkdir(destinationDir, { recursive: true });
  if (dataUrl) {
    await writeFile(destinationPath, dataUrl.buffer);
    localizedAsset.props.mimeType = localizedAsset.props.mimeType ?? dataUrl.mimeType;
    localizedAsset.props.fileSize = dataUrl.buffer.length;
  } else if (resolve(sourceFilePath) !== resolve(destinationPath)) {
    await copyFile(sourceFilePath, destinationPath);
    localizedAsset.props.fileSize = (await stat(destinationPath)).size;
  }

  localizedAsset.props.name = fileName;
  localizedAsset.props.src = pageAssetUrl(pageId, fileName);
  return localizedAsset;
}

async function localizePageAssets(pageSnapshot, pageId) {
  const entries = await Promise.all(
    Object.entries(pageSnapshot.store).map(async ([id, record]) => {
      if (record?.typeName !== 'asset') return [id, record];
      return [id, await localizePageAsset(record, pageId)];
    })
  );
  return {
    ...pageSnapshot,
    store: Object.fromEntries(entries)
  };
}

async function readJsonFile(filePath) {
  return parseJsonText(await readFile(filePath, 'utf8'));
}

async function readJsonFileOrNull(filePath) {
  try {
    return await readJsonFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    return null;
  }
}

const defaultGenerationSettings = {
  version: 1,
  setupComplete: false,
  mode: 'builtin',
  size: '1024x1024',
  api: {
    baseUrl: '',
    model: 'gpt-image-2',
    envKey: '',
    keyRef: 'local-secret'
  }
};

function normalizeGenerationSettings(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  const mode = value.mode === 'api' ? 'api' : 'builtin';
  const size = generationSizeOptions.includes(value.size) ? value.size : defaultGenerationSettings.size;
  const api = value.api && typeof value.api === 'object' ? value.api : {};
  return {
    ...defaultGenerationSettings,
    setupComplete: value.setupComplete === true,
    mode,
    size,
    api: {
      ...defaultGenerationSettings.api,
      baseUrl: compactText(api.baseUrl, 1000),
      model: compactText(api.model, 120) || defaultGenerationSettings.api.model,
      envKey: compactText(api.envKey, 120),
      keyRef: 'local-secret'
    }
  };
}

async function readGenerationSettings() {
  const savedSettings = await readJsonFileOrNull(generationSettingsFile);
  const settings = normalizeGenerationSettings(savedSettings);
  const secret = await readJsonFileOrNull(generationSecretFile);
  return {
    ...settings,
    setupComplete: savedSettings?.setupComplete === true,
    api: {
      ...settings.api,
      hasSecretKey: Boolean(secret?.apiKey)
    }
  };
}

async function writeGenerationSettings(body = {}) {
  const settings = normalizeGenerationSettings(body);
  await writeJsonAtomic(generationSettingsFile, {
    ...settings,
    setupComplete: true,
    updatedAt: new Date().toISOString()
  });

  if (Object.prototype.hasOwnProperty.call(body, 'apiKey')) {
    const apiKey = compactText(body.apiKey, 4000);
    if (apiKey) {
      await writeJsonAtomic(generationSecretFile, {
        version: 1,
        apiKey,
        updatedAt: new Date().toISOString()
      });
    } else {
      await rm(generationSecretFile, { force: true });
    }
  }

  return readGenerationSettings();
}

function uniqueFilePaths(filePaths) {
  return [...new Set(filePaths.map((filePath) => resolve(filePath)))];
}

function sourceRootCandidates(rootDir, fileName) {
  return [
    join(rootDir, '.backups', 'awesome-gpt-image-2-sub2api-2026-05-17', 'data', fileName),
    join(rootDir, 'awesome-gpt-image-2-sub2api-local-archive-20260521-155632', 'dist-old', fileName),
    join(rootDir, 'awesome-gpt-image-2-sub2api', 'public', fileName),
    join(rootDir, 'awesome-gpt-image-2-sub2api', 'dist', fileName),
    join(rootDir, 'public', fileName),
    join(rootDir, 'dist', fileName),
    join(rootDir, 'image-sub2api-studio', 'public', fileName),
    join(rootDir, 'image-sub2api-studio', 'dist', fileName)
  ];
}

function sourceCandidates(fileName) {
  return uniqueFilePaths([
    join(canvasLibraryDir, fileName),
    ...sourceRootCandidates(projectDir, fileName),
    ...sourceRootCandidates(workspaceDir, fileName)
  ]);
}

async function firstReadableJson(fileName) {
  for (const filePath of sourceCandidates(fileName)) {
    const payload = await readJsonFileOrNull(filePath);
    if (payload) return { payload, filePath };
  }
  return { payload: null, filePath: null };
}

function normalizeImageUrl(image, sourceFilePath) {
  const value = compactText(image, 2000);
  if (!value) return '';
  if (/^(https?:|data:)/i.test(value)) return value;
  if (!sourceFilePath) return value;
  const sourceDir = dirname(sourceFilePath);
  const normalized = value.startsWith('/') ? value.slice(1) : value;
  const localPath = resolve(sourceDir, normalized);
  if (!hasSafeRelativePath(sourceDir, localPath)) return '';
  return `${libraryAssetsRoute}${encodeURIComponent(relative(sourceDir, localPath).replaceAll('\\', '/'))}`;
}

function normalizeLibraryItem(item, kind, sourceFilePath, index) {
  const promptText = kind === 'template'
    ? templatePromptVariants(item)
    : textVariants(item?.prompt || item?.finalPrompt || item?.template || item?.description);
  const promptPreviewText = promptPreviewVariants(promptText, item?.promptPreview);
  const titleText = textVariants(item?.title || item?.name || item?.id || `${kind} ${index + 1}`);
  const categoryText = textVariants(item?.category || '');
  if (!categoryText.zh && categoryZhLabels.has(categoryText.en)) categoryText.zh = categoryZhLabels.get(categoryText.en);
  const sourceLabelText = textVariants(item?.sourceLabel || item?.sourceName || item?.repository || kind);
  const prompt = promptText.zh || promptText.en;
  const title = compactText(titleText.zh || titleText.en || `${kind} ${index + 1}`, 160);
  const image = normalizeImageUrl(item?.image || item?.imageUrl || item?.thumbnail || item?.cover || item?.src, sourceFilePath);
  return {
    id: compactText(item?.id || `${kind}-${index}`, 120),
    kind,
    title,
    titleText,
    image,
    hasImage: Boolean(image),
    imageAlt: compactText(item?.imageAlt || title, 200),
    sourceLabel: compactText(sourceLabelText.zh || sourceLabelText.en || kind, 120),
    sourceLabelText,
    sourceUrl: compactText(item?.sourceUrl || item?.sourceRepository || '', 1000),
    prompt,
    promptText,
    promptPreview: compactText(promptPreviewText.zh || promptPreviewText.en || prompt, 280),
    promptPreviewText,
    category: compactText(categoryText.en || categoryText.zh || '', 120),
    categoryText,
    styles: Array.isArray(item?.styles) ? item.styles.slice(0, 8) : [],
    scenes: Array.isArray(item?.scenes) ? item.scenes.slice(0, 8) : [],
    featured: item?.featured === true,
    promptOnly: !image,
    raw: {
      sourceId: item?.id ?? null,
      external: item?.external === true
    }
  };
}

async function loadInspirationLibrary() {
  if (inspirationCache) return inspirationCache;

  const [casesSource, inspirationSource, styleSource] = await Promise.all([
    firstReadableJson('cases.json'),
    firstReadableJson('inspirations.json'),
    firstReadableJson('style-library.json')
  ]);
  const localCases = Array.isArray(casesSource.payload?.cases) ? casesSource.payload.cases : [];
  const remoteCases = Array.isArray(inspirationSource.payload?.cases) ? inspirationSource.payload.cases : [];
  const styleTemplates = Array.isArray(styleSource.payload?.templates) ? styleSource.payload.templates : [];
  const styleItems = styleTemplates.map((item, index) => ({
    ...item,
    id: item.id || `template-${index}`
  }));
  const items = [
    ...localCases.map((item, index) => normalizeLibraryItem(item, 'case', casesSource.filePath, index)),
    ...remoteCases.map((item, index) => normalizeLibraryItem(item, 'inspiration', inspirationSource.filePath, index)),
    ...styleItems.map((item, index) => normalizeLibraryItem(item, 'template', styleSource.filePath, index))
  ].filter((item) => item.prompt || item.image || item.title);
  const categories = [...new Set([
    ...(Array.isArray(casesSource.payload?.categories) ? casesSource.payload.categories : []),
    ...(Array.isArray(inspirationSource.payload?.categories) ? inspirationSource.payload.categories : []),
    ...items.map((item) => item.category).filter(Boolean)
  ])].sort((a, b) => String(a).localeCompare(String(b)));

  inspirationCache = {
    ok: true,
    canvasRoot: canvasDir,
    sources: [
      { name: 'cases.json', path: casesSource.filePath, count: localCases.length },
      { name: 'inspirations.json', path: inspirationSource.filePath, count: remoteCases.length },
      { name: 'style-library.json', path: styleSource.filePath, count: styleItems.length }
    ],
    total: items.length,
    imageCount: items.filter((item) => item.hasImage).length,
    promptOnlyCount: items.filter((item) => !item.hasImage).length,
    categories,
    items
  };
  try {
    await writeJsonAtomic(join(canvasLibraryDir, 'index.json'), {
      version: 1,
      generatedAt: new Date().toISOString(),
      total: inspirationCache.total,
      imageCount: inspirationCache.imageCount,
      promptOnlyCount: inspirationCache.promptOnlyCount,
      categories: inspirationCache.categories,
      sources: inspirationCache.sources,
      items: inspirationCache.items.map(({ raw, ...item }) => item)
    });
  } catch {
    // The live library can still work when the optional project-local cache is not writable.
  }
  return inspirationCache;
}

function searchLibraryItems(library, { q = '', category = '', limit = 60, promptOnly = false } = {}) {
  const query = compactText(q, 240).toLowerCase();
  const categoryFilter = compactText(category, 160);
  const max = Math.max(1, Math.min(200, Number(limit) || 60));
  return library.items
    .filter((item) => !promptOnly || !item.hasImage)
    .filter((item) => !categoryFilter || item.category === categoryFilter)
    .map((item) => {
      const haystack = [
        item.title,
        item.titleText,
        item.prompt,
        item.promptText,
        item.promptPreview,
        item.promptPreviewText,
        item.category,
        item.categoryText,
        item.sourceLabel,
        item.sourceLabelText,
        ...(item.styles || []),
        ...(item.scenes || [])
      ].map(searchTextValue).join('\n').toLowerCase();
      const score = !query
        ? (item.featured ? 2 : 1)
        : haystack.includes(query)
          ? (item.title.toLowerCase().includes(query) ? 6 : 3)
          : query.split(/\s+/).filter((token) => token && haystack.includes(token)).length;
      return { item, score };
    })
    .filter(({ score }) => !query || score > 0)
    .sort((a, b) => b.score - a.score || Number(b.item.featured) - Number(a.item.featured))
    .slice(0, max)
    .map(({ item }) => item);
}

function layerText(shape) {
  const props = shape.props || {};
  const rich = props.richText?.content;
  if (Array.isArray(rich)) {
    return rich
      .map((paragraph) => (paragraph.content || []).map((node) => node.text).filter(Boolean).join(''))
      .join('\n')
      .trim();
  }
  return props.text || props.plainText || props.name || '';
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
  const w = isFiniteNumber(shape.props?.w) ? shape.props.w : shape.type === 'text' ? 160 : 1;
  const h = isFiniteNumber(shape.props?.h) ? shape.props.h : shape.type === 'text' ? 40 : 1;
  return { x: 0, y: 0, w, h };
}

function pageBoundsForShape(store, shape) {
  const local = localBoundsForShape(shape);
  if (!local) return null;
  let x = (isFiniteNumber(shape.x) ? shape.x : 0) + local.x;
  let y = (isFiniteNumber(shape.y) ? shape.y : 0) + local.y;
  let parent = store[shape.parentId];
  const visited = new Set([shape.id]);
  while (parent?.typeName === 'shape' && !visited.has(parent.id)) {
    visited.add(parent.id);
    x += isFiniteNumber(parent.x) ? parent.x : 0;
    y += isFiniteNumber(parent.y) ? parent.y : 0;
    parent = store[parent.parentId];
  }
  return { x, y, w: local.w, h: local.h };
}

function compactLayer(record, store) {
  const asset = record.props?.assetId ? store[record.props.assetId] ?? null : null;
  return {
    id: record.id,
    type: record.type,
    parentId: record.parentId,
    bounds: pageBoundsForShape(store, record),
    text: layerText(record),
    assetRef: record.props?.assetId ?? null,
    asset,
    meta: record.meta ?? null,
    props: record.props ?? null
  };
}

function sourceImageFromLayer(layer) {
  return {
    shapeId: layer.id,
    assetId: layer.assetRef,
    src: layer.asset?.props?.src ?? null,
    bounds: layer.bounds,
    prompt: layer.meta?.prompt ?? layer.meta?.generationPrompt ?? ''
  };
}

function uniqueSourceImages(layers) {
  const byShapeId = new Map();
  for (const layer of layers) {
    if (!layer?.shapeId) continue;
    byShapeId.set(layer.shapeId, layer);
  }
  return Array.from(byShapeId.values());
}

function pointFromMeta(meta) {
  const point = meta?.imageAgentAnchorPoint;
  if (!point || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) return null;
  return { x: point.x, y: point.y };
}

function targetPointFromMeta(meta) {
  const point = meta?.imageAgentTargetPoint;
  if (!point || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) return null;
  return { x: point.x, y: point.y };
}

function buildPointAnnotationSummaries(annotations) {
  const groups = new Map();
  for (const layer of annotations) {
    if (layer.meta?.imageAgentAnnotationType !== 'point-edit') continue;
    const groupId = compactText(layer.meta?.imageAgentAnnotationGroupId || layer.id, 240);
    const current = groups.get(groupId) ?? {
      groupId,
      shapeIds: [],
      markerShapeId: null,
      noteShapeId: null,
      markerRingShapeId: null,
      connectorShapeId: null,
      anchorPoint: null,
      targetImageShapeId: null,
      targetPoint: null,
      markerLabel: '',
      instruction: '',
      markerBounds: null,
      noteBounds: null
    };

    current.shapeIds.push(layer.id);
    current.anchorPoint ??= pointFromMeta(layer.meta);
    current.targetImageShapeId ??= layer.meta?.imageAgentTargetShapeId ?? null;
    current.targetPoint ??= targetPointFromMeta(layer.meta);

    if (layer.meta?.imageAgentRole === 'marker') {
      current.markerShapeId = layer.id;
      current.markerLabel = layer.text || current.markerLabel;
      current.markerBounds = layer.bounds;
    } else if (layer.meta?.imageAgentRole === 'marker-ring') {
      current.markerRingShapeId = layer.id;
    } else if (layer.meta?.imageAgentRole === 'connector') {
      current.connectorShapeId = layer.id;
    } else if (layer.meta?.imageAgentRole === 'note') {
      current.noteShapeId = layer.id;
      current.instruction = layer.text || current.instruction;
      current.noteBounds = layer.bounds;
    } else if (layer.text && !current.instruction) {
      current.instruction = layer.text;
    }

    groups.set(groupId, current);
  }

  return Array.from(groups.values());
}

async function exportEditPack(body = {}) {
  const { snapshot, path: snapshotPath, storage } = await loadCanvasSnapshot();
  const selectionPayload = await readJsonFileOrNull(selectionFile);
  const requested = Array.isArray(body.selectionIds) ? body.selectionIds : [];
  const selectionIds = requested.length
    ? requested
    : (Array.isArray(selectionPayload?.selectedShapes) ? selectionPayload.selectedShapes.map((shape) => shape.id) : []);
  const selectedSet = new Set(selectionIds);
  const store = snapshot?.store ?? {};
  const allLayers = Object.values(store)
    .filter((record) => record?.typeName === 'shape')
    .map((record) => compactLayer(record, store));
  const selectedLayers = allLayers.filter((layer) => selectedSet.size === 0 || selectedSet.has(layer.id));
  const annotationTypes = new Set(['text', 'note', 'geo', 'draw', 'arrow', 'highlight']);
  const annotations = allLayers.filter((layer) => annotationTypes.has(layer.type) || layer.meta?.imageAgentAnnotation === true);
  const selectedAnnotations = selectedLayers.filter((layer) => layer.meta?.imageAgentAnnotation === true);
  const pointAnnotations = buildPointAnnotationSummaries(annotations);
  const pointAnnotationTargetImageIds = new Set(pointAnnotations.map((annotation) => annotation.targetImageShapeId).filter(Boolean));
  const sourceImages = uniqueSourceImages([
    ...selectedLayers.filter((layer) => layer.type === 'image').map(sourceImageFromLayer),
    ...allLayers
      .filter((layer) => layer.type === 'image' && pointAnnotationTargetImageIds.has(layer.id))
      .map(sourceImageFromLayer)
  ]);
  const selectedPointAnnotationGroupIds = new Set(
    selectedAnnotations.map((layer) => layer.meta?.imageAgentAnnotationGroupId).filter(Boolean)
  );
  const selectedPointAnnotations = pointAnnotations.filter((annotation) =>
    selectedPointAnnotationGroupIds.has(annotation.groupId)
  );
  const pointAnnotationText = pointAnnotations
    .map((annotation) =>
      [
        annotation.markerLabel ? `标注 ${annotation.markerLabel}` : '',
        annotation.instruction,
        annotation.anchorPoint ? `位置 ${annotation.anchorPoint.x}, ${annotation.anchorPoint.y}` : ''
      ].filter(Boolean).join(' - ')
    )
    .filter(Boolean)
    .join('\n\n');
  const promptText = [...selectedLayers, ...annotations]
    .map((layer) => layer.meta?.prompt || layer.text)
    .filter(Boolean)
    .concat(pointAnnotationText ? [pointAnnotationText] : [])
    .join('\n\n');
  const payload = {
    ok: true,
    version: 1,
    createdAt: new Date().toISOString(),
    canvasRoot: canvasDir,
    storage,
    snapshotPath,
    selectionIds,
    sourceImages,
    annotations,
    pointAnnotations,
    layers: selectedLayers,
    promptPack: {
        goal: compactText(promptText, 2000),
        sourceImages,
        annotations: annotations.map((layer) => ({
          shapeId: layer.id,
          type: layer.type,
          bounds: layer.bounds,
          text: layer.text,
          annotationType: layer.meta?.imageAgentAnnotationType ?? null,
          isImageAgentAnnotation: layer.meta?.imageAgentAnnotation === true,
          annotationGroupId: layer.meta?.imageAgentAnnotationGroupId ?? null,
          anchorPoint: pointFromMeta(layer.meta),
          targetImageShapeId: layer.meta?.imageAgentTargetShapeId ?? null,
          targetPoint: targetPointFromMeta(layer.meta)
        })),
        pointAnnotations,
        selectedAnnotations: selectedAnnotations.map((layer) => layer.id),
        selectedPointAnnotations,
        mask: null,
        positivePrompt: compactText(promptText),
        negativePrompt: '',
      constraints: [],
      size: '',
      modelPreference: '',
      generationMode: sourceImages.length ? 'edit' : 'generate'
    }
  };
  if (body.includeSnapshot === true) payload.snapshot = snapshot;
  return payload;
}

async function collectCanvasFiles() {
  const files = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const filePath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(filePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relativePath = relative(canvasDir, filePath).replaceAll('\\', '/');
      if (relativePath.startsWith('archives/')) continue;
      if (relativePath.startsWith('.secrets/')) continue;
      const buffer = await readFile(filePath);
      files.push({
        path: relativePath,
        encoding: 'base64',
        content: buffer.toString('base64')
      });
    }
  }
  await walk(canvasDir);
  return files;
}

function safeArchiveOutputPath(requestedPath) {
  const fileName = `image-agent-canvas-${new Date().toISOString().replace(/[:.]/g, '-')}.iacanvas.json`;
  const fallback = join(canvasArchivesDir, fileName);
  if (!requestedPath) return fallback;
  const resolved = resolve(String(requestedPath));
  if (hasSafeRelativePath(canvasDir, resolved)) return resolved;
  return fallback;
}

async function exportCanvasArchive(body = {}) {
  const archivePath = safeArchiveOutputPath(body.outputPath);
  await mkdir(dirname(archivePath), { recursive: true });
  const library = await loadInspirationLibrary();
  const archive = {
    type: 'image-agent-canvas-archive',
    version: 1,
    createdAt: new Date().toISOString(),
    projectDir,
    canvasRoot: canvasDir,
    files: await collectCanvasFiles(),
    library: {
      total: library.total,
      imageCount: library.imageCount,
      promptOnlyCount: library.promptOnlyCount,
      categories: library.categories,
      sources: library.sources
    }
  };
  await writeJsonAtomic(archivePath, archive);
  return { ok: true, archivePath, fileCount: archive.files.length, bytes: (await stat(archivePath)).size };
}

async function importCanvasArchive(body = {}) {
  const archivePath = resolve(String(body.archivePath || ''));
  if (!archivePath) throw new Error('archivePath is required.');
  const archive = await readJsonFile(archivePath);
  if (archive?.type !== 'image-agent-canvas-archive' || !Array.isArray(archive.files)) {
    throw new Error('Expected an Image Agent Canvas archive.');
  }
  if (body.mode === 'replace') {
    await rm(canvasPagesDir, { recursive: true, force: true });
    await rm(canvasAssetsDir, { recursive: true, force: true });
    await rm(canvasLibraryDir, { recursive: true, force: true });
  }
  const written = [];
  for (const file of archive.files) {
    const relativePath = String(file.path || '').replace(/\\/g, '/');
    if (!relativePath || relativePath.startsWith('../') || relativePath.includes('/../')) {
      throw new Error(`Unsafe archive path: ${relativePath}`);
    }
    const destination = resolve(canvasDir, relativePath);
    if (!hasSafeRelativePath(canvasDir, destination)) throw new Error(`Unsafe archive destination: ${relativePath}`);
    const buffer = Buffer.from(String(file.content || ''), file.encoding === 'base64' ? 'base64' : 'utf8');
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    written.push(destination);
  }
  const result = { storage: 'per-page', paths: written };
  broadcastCanvasChanged(result);
  return { ok: true, archivePath, mode: body.mode === 'replace' ? 'replace' : 'merge', fileCount: written.length };
}

async function insertPromptCard(body = {}) {
  const text = compactText(body.text || body.prompt);
  if (!text) throw new Error('text is required.');
  const loaded = await loadCanvasSnapshot();
  if (!loaded.snapshot?.store) throw new Error('Canvas snapshot is not ready.');

  const snapshot = loaded.snapshot;
  const store = snapshot.store;
  const viewState = await readJsonFileOrNull(viewStateFile);
  const pageId = compactText(body.pageId, 120) || viewState?.currentPageId || getPageRecords(snapshot)[0]?.id;
  if (!pageId || !store[pageId]) throw new Error('Could not determine target pageId.');

  const width = Math.max(220, Math.min(720, Number(body.width) || 360));
  const height = Math.max(140, Math.min(600, Number(body.height) || 220));
  const camera = viewState?.camera ?? { x: 0, y: 0, z: 1 };
  const x = Number.isFinite(body.x) ? body.x : -camera.x + 160;
  const y = Number.isFinite(body.y) ? body.y : -camera.y + 140;
  const title = compactText(body.title || 'Prompt Card', 160);
  const source = compactText(body.source || '', 200);
  const shapeId = uniqueRecordId(store, 'shape', title || 'prompt-card');
  const cardText = [title, source ? `Source: ${source}` : '', text].filter(Boolean).join('\n\n');

  store[shapeId] = {
    x,
    y,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {
      imageAgentPromptCard: true,
      imageAgentInspirationId: compactText(body.inspirationId || '', 160),
      title,
      source,
      prompt: text,
      image: compactText(body.image || '', 1000),
      createdAt: new Date().toISOString()
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
      color: 'blue',
      labelColor: 'black',
      fill: 'semi',
      size: 'm',
      font: 'draw',
      align: 'start',
      verticalAlign: 'start',
      richText: richTextFromPlainText(cardText)
    },
    parentId: pageId,
    index: chooseIndex(store, pageId),
    typeName: 'shape'
  };

  const result = await saveCanvasSnapshot(snapshot);
  broadcastCanvasChanged(result);
  return { ok: true, shapeId, pageId, bounds: { x, y, w: width, h: height } };
}

async function insertReferenceImage(body = {}) {
  const loaded = await loadCanvasSnapshot();
  if (!loaded.snapshot?.store) throw new Error('Canvas snapshot is not ready.');

  const snapshot = loaded.snapshot;
  const store = snapshot.store;
  const viewState = await readJsonFileOrNull(viewStateFile);
  const pageId = compactText(body.pageId, 120) || viewState?.currentPageId || getPageRecords(snapshot)[0]?.id;
  if (!pageId || !store[pageId]) throw new Error('Could not determine target pageId.');

  const source = await resolveReferenceImageBody(body);
  const dimensions = await getImageDimensionsFromBuffer(source.buffer);
  const maxWidth = Math.max(140, Math.min(480, Number(body.maxWidth) || 260));
  const scale = Math.min(1, maxWidth / Math.max(dimensions.width, 1));
  const width = Math.max(80, Math.round(dimensions.width * scale));
  const height = Math.max(80, Math.round(dimensions.height * scale));
  const camera = viewState?.camera ?? { x: 0, y: 0, z: 1 };
  const x = Number.isFinite(body.x) ? body.x : -camera.x + 120;
  const y = Number.isFinite(body.y) ? body.y : -camera.y + 120;
  const assetDir = pageAssetsDir(pageId);
  const { fileName, filePath } = await uniqueAssetFilePath(assetDir, source.fileName, source.mimeType);
  const assetId = uniqueRecordId(store, 'asset', fileName);
  const shapeId = uniqueRecordId(store, 'shape', body.referenceKey || body.title || fileName);
  const title = compactText(body.title || 'Reference Image', 160);
  const prompt = compactText(body.prompt || body.promptPreview || '');
  const sourceLabel = compactText(body.sourceLabel || body.source || '', 200);

  await mkdir(assetDir, { recursive: true });
  await writeFile(filePath, source.buffer);

  store[assetId] = {
    id: assetId,
    typeName: 'asset',
    type: 'image',
    props: {
      name: fileName,
      src: pageAssetUrl(pageId, fileName),
      w: dimensions.width,
      h: dimensions.height,
      fileSize: source.buffer.length,
      mimeType: source.mimeType,
      isAnimated: false
    },
    meta: {
      imageAgentReferenceAsset: true,
      sourceUrl: compactText(body.sourceUrl || source.sourceUrl || '', 1000),
      referenceKey: compactText(body.referenceKey || '', 200)
    }
  };

  store[shapeId] = {
    x,
    y,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {
      imageAgentReferenceImage: true,
      referenceKey: compactText(body.referenceKey || '', 200),
      inspirationId: compactText(body.inspirationId || '', 160),
      title,
      sourceLabel,
      sourceUrl: compactText(body.sourceUrl || source.sourceUrl || '', 1000),
      prompt,
      createdAt: new Date().toISOString()
    },
    id: shapeId,
    type: 'image',
    props: {
      w: width,
      h: height,
      assetId,
      playing: true,
      url: '',
      crop: null,
      flipX: false,
      flipY: false,
      altText: compactText(body.altText || title, 200)
    },
    parentId: pageId,
    index: chooseIndex(store, pageId),
    typeName: 'shape'
  };

  const result = await saveCanvasSnapshot(snapshot);
  broadcastCanvasChanged(result);
  return {
    ok: true,
    shapeId,
    assetId,
    pageId,
    imageUrl: pageAssetUrl(pageId, fileName),
    bounds: { x, y, w: width, h: height }
  };
}

async function readPageSnapshots() {
  let entries;
  try {
    entries = await readdir(canvasPagesDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const snapshots = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = join(canvasPagesDir, entry.name, canvasFileName);
    try {
      const snapshot = await readJsonFile(filePath);
      if (isSnapshot(snapshot)) snapshots.push({ filePath, snapshot });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return snapshots;
}

async function loadCanvasSnapshot() {
  const pageSnapshots = await readPageSnapshots();
  if (pageSnapshots.length > 0) {
    const [{ snapshot: firstSnapshot }] = pageSnapshots;
    const mergedSnapshot = {
      schema: firstSnapshot.schema,
      store: {}
    };

    for (const { snapshot } of pageSnapshots) {
      Object.assign(mergedSnapshot.store, snapshot.store);
    }
    return {
      snapshot: mergedSnapshot,
      path: canvasPagesDir,
      storage: 'per-page'
    };
  }

  return { snapshot: null, path: canvasPagesDir, storage: 'empty' };
}

async function writeJsonAtomic(filePath, payload) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(payload, null, 2)}\n`);
  await rename(tempFile, filePath);
}

async function removeStalePageDirs(currentPageIds) {
  let entries;
  try {
    entries = await readdir(canvasPagesDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  const currentDirNames = new Set([...currentPageIds].map(pageDirName));
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !currentDirNames.has(entry.name))
      .map((entry) => rm(join(canvasPagesDir, entry.name), { recursive: true, force: true }))
  );
}

async function saveCanvasSnapshot(snapshot) {
  const pages = getPageRecords(snapshot);
  if (pages.length === 0) {
    await writeJsonAtomic(join(canvasPagesDir, 'main', canvasFileName), snapshot);
    return { storage: 'per-page', paths: [join(canvasPagesDir, 'main', canvasFileName)] };
  }

  const currentPageIds = new Set(pages.map((page) => page.id));
  await removeStalePageDirs(currentPageIds);

  const paths = [];
  for (const page of pages) {
    const filePath = pageFilePath(page.id);
    const pageSnapshot = await localizePageAssets(snapshotForPage(snapshot, page), page.id);
    await writeJsonAtomic(filePath, pageSnapshot);
    paths.push(filePath);
  }

  const manifest = {
    version: 1,
    source: 'image-agent-canvas',
    pages: pages.map((page) => ({
      id: page.id,
      name: page.name,
      index: page.index,
      path: relative(canvasDir, pageFilePath(page.id))
    }))
  };
  await writeJsonAtomic(pagesManifestFile, manifest);

  return { storage: 'per-page', paths };
}

async function serveCanvasAsset(req, res, next) {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (
    !url.pathname.startsWith(globalAssetsRoute) &&
    !url.pathname.startsWith(pageAssetsRoute) &&
    !url.pathname.startsWith(libraryAssetsRoute)
  ) {
    next();
    return;
  }

  const filePath = localAssetFilePathFromUrl(url.pathname);
  if (!filePath) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', mimeTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream');
    res.setHeader('content-length', String(fileStat.size));
    res.setHeader('cache-control', 'no-cache');
    createReadStream(filePath).pipe(res);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    next(error);
  }
}

async function serveInspirationImageProxy(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const imageUrl = compactText(url.searchParams.get('url') || '', 2000);
  if (!/^https?:\/\//i.test(imageUrl)) {
    sendJson(res, 400, { error: 'Expected a remote image URL.' });
    return;
  }

  const library = await loadInspirationLibrary();
  const allowed = library.items.some((item) => item.image === imageUrl);
  if (!allowed) {
    sendJson(res, 403, { error: 'Image URL is not in the inspiration library.' });
    return;
  }

  const response = await fetch(imageUrl, {
    headers: { 'user-agent': 'image-agent-canvas/0.1' }
  });
  if (!response.ok) {
    sendJson(res, response.status, { error: `Could not fetch image: HTTP ${response.status}` });
    return;
  }

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || '';
  if (!contentType.startsWith('image/')) {
    sendJson(res, 415, { error: `Remote URL is not an image: ${contentType || 'unknown'}` });
    return;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  res.statusCode = 200;
  res.setHeader('content-type', contentType);
  res.setHeader('content-length', String(buffer.length));
  res.setHeader('cache-control', 'no-cache');
  res.end(buffer);
}

function canvasUrlForServer(server) {
  const port = server.config.server?.port ?? server.config.preview?.port ?? process.env.IMAGE_AGENT_CANVAS_PORT ?? 43217;
  return `http://127.0.0.1:${port}/`;
}

function registerCanvasMiddlewares(server) {
  server.middlewares.use(serveCanvasAsset);

  server.middlewares.use('/safe', (_req, res) => {
    sendHtml(res, 200, safePageHtml());
  });

  server.middlewares.use('/health', (_req, res) => {
        sendJson(res, 200, {
          ok: true,
          name: 'image-agent-canvas',
          projectDir,
          canvasRoot: canvasDir,
          pagesRoot: canvasPagesDir,
          selectionPath: selectionFile,
          viewStatePath: viewStateFile,
          runtimePath: runtimeFile
        });
      });

      server.middlewares.use('/api/service', (_req, res) => {
        sendJson(res, 200, {
          ok: true,
          running: true,
          canvasUrl: canvasUrlForServer(server),
          projectDir,
          canvasRoot: canvasDir,
          selectionPath: selectionFile,
          viewStatePath: viewStateFile,
          runtimePath: runtimeFile
        });
      });

      server.middlewares.use('/api/generation-settings', async (req, res) => {
        try {
          if (req.method === 'GET') {
            sendJson(res, 200, {
              ok: true,
              settings: await readGenerationSettings(),
              path: generationSettingsFile
            });
            return;
          }

          if (req.method === 'PUT') {
            const body = await readRequestBody(req);
            sendJson(res, 200, {
              ok: true,
              settings: await writeGenerationSettings(body ? parseJsonText(body) : {}),
              path: generationSettingsFile
            });
            return;
          }

          res.statusCode = 405;
          res.setHeader('allow', 'GET, PUT');
          res.end();
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/canvas-events', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.setHeader('allow', 'GET');
          res.end();
          return;
        }

        res.statusCode = 200;
        res.setHeader('content-type', 'text/event-stream');
        res.setHeader('cache-control', 'no-cache, no-transform');
        res.setHeader('connection', 'keep-alive');
        res.setHeader('x-accel-buffering', 'no');
        res.write(': connected\n\n');

        canvasEventClients.add(res);
        const heartbeat = setInterval(() => {
          res.write(`: heartbeat ${Date.now()}\n\n`);
        }, 25000);

        req.on('close', () => {
          clearInterval(heartbeat);
          canvasEventClients.delete(res);
        });
      });

      server.middlewares.use('/api/selection', async (req, res) => {
        try {
          if (req.method === 'GET') {
            try {
              sendJson(res, 200, {
                selection: await readJsonFile(selectionFile),
                path: selectionFile
              });
            } catch (error) {
              if (error.code === 'ENOENT') {
                sendJson(res, 200, {
                  selection: { selectedShapes: [], updatedAt: null },
                  path: selectionFile
                });
                return;
              }
              throw error;
            }
            return;
          }

          if (req.method === 'PUT') {
            const body = await readRequestBody(req);
            const selection = parseJsonText(body);
            if (!isSelectionState(selection)) {
              sendJson(res, 400, { error: 'Expected an Image Agent Canvas selection state.' });
              return;
            }

            await writeJsonAtomic(selectionFile, selection);
            sendJson(res, 200, { ok: true, path: selectionFile });
            return;
          }

          res.statusCode = 405;
          res.setHeader('allow', 'GET, PUT');
          res.end();
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/view-state', async (req, res) => {
        try {
          if (req.method === 'GET') {
            try {
              sendJson(res, 200, {
                viewState: await readJsonFile(viewStateFile),
                path: viewStateFile
              });
            } catch (error) {
              if (error.code === 'ENOENT') {
                sendJson(res, 200, {
                  viewState: {
                    version: 1,
                    currentPageId: null,
                    camera: { x: 0, y: 0, z: 1 },
                    updatedAt: null
                  },
                  path: viewStateFile
                });
                return;
              }
              throw error;
            }
            return;
          }

          if (req.method === 'PUT') {
            const body = await readRequestBody(req);
            const viewState = parseJsonText(body);
            if (!isViewState(viewState)) {
              sendJson(res, 400, { error: 'Expected an Image Agent Canvas view state.' });
              return;
            }

            await writeJsonAtomic(viewStateFile, viewState);
            sendJson(res, 200, { ok: true, path: viewStateFile });
            return;
          }

          res.statusCode = 405;
          res.setHeader('allow', 'GET, PUT');
          res.end();
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/inspirations/search', async (req, res) => {
        try {
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.setHeader('allow', 'GET');
            res.end();
            return;
          }

          const url = new URL(req.url, 'http://127.0.0.1');
          const locale = url.searchParams.get('locale') === 'en' ? 'en' : 'zh';
          const library = await loadInspirationLibrary();
          const items = await localizeLibraryItems(searchLibraryItems(library, {
            q: url.searchParams.get('q') || '',
            category: url.searchParams.get('category') || '',
            limit: Number(url.searchParams.get('limit') || 60),
            promptOnly: url.searchParams.get('promptOnly') === 'true'
          }), locale);
          sendJson(res, 200, {
            ok: true,
            total: library.total,
            imageCount: library.imageCount,
            promptOnlyCount: library.promptOnlyCount,
            categories: library.categories,
            categoryOptions: categoryOptions(library.categories, locale),
            sources: library.sources,
            items
          });
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/inspirations', async (req, res) => {
        try {
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.setHeader('allow', 'GET');
            res.end();
            return;
          }

          const url = new URL(req.url, 'http://127.0.0.1');
          const locale = url.searchParams.get('locale') === 'en' ? 'en' : 'zh';
          const library = await loadInspirationLibrary();
          sendJson(res, 200, {
            ...library,
            categoryOptions: categoryOptions(library.categories, locale),
            items: await localizeLibraryItems(library.items.slice(0, 80), locale)
          });
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/image-proxy', async (req, res) => {
        try {
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.setHeader('allow', 'GET');
            res.end();
            return;
          }

          await serveInspirationImageProxy(req, res);
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/export/edit-pack', async (req, res) => {
        try {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('allow', 'POST');
            res.end();
            return;
          }

          const body = await readRequestBody(req);
          sendJson(res, 200, await exportEditPack(body ? parseJsonText(body) : {}));
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/prompt-card', async (req, res) => {
        try {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('allow', 'POST');
            res.end();
            return;
          }

          const body = await readRequestBody(req);
          sendJson(res, 200, await insertPromptCard(body ? parseJsonText(body) : {}));
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/reference-image', async (req, res) => {
        try {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('allow', 'POST');
            res.end();
            return;
          }

          const body = await readRequestBody(req);
          sendJson(res, 200, await insertReferenceImage(body ? parseJsonText(body) : {}));
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/archive/export', async (req, res) => {
        try {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('allow', 'POST');
            res.end();
            return;
          }

          const body = await readRequestBody(req);
          sendJson(res, 200, await exportCanvasArchive(body ? parseJsonText(body) : {}));
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/archive/import', async (req, res) => {
        try {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('allow', 'POST');
            res.end();
            return;
          }

          const body = await readRequestBody(req);
          sendJson(res, 200, await importCanvasArchive(body ? parseJsonText(body) : {}));
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/canvas', async (req, res) => {
        try {
          if (req.method === 'GET') {
            sendJson(res, 200, await loadCanvasSnapshot());
            return;
          }

          if (req.method === 'PUT') {
            const body = await readRequestBody(req);
            const snapshot = parseJsonText(body);
            if (!isSnapshot(snapshot)) {
              sendJson(res, 400, { error: 'Expected a tldraw store snapshot.' });
              return;
            }

            const result = await saveCanvasSnapshot(snapshot);
            sendJson(res, 200, { ok: true, ...result });
            broadcastCanvasChanged(result);
            return;
          }

          res.statusCode = 405;
          res.setHeader('allow', 'GET, PUT');
          res.end();
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });
}

function canvasStoragePlugin() {
  return {
    name: 'image-agent-canvas-storage',
    configureServer: registerCanvasMiddlewares,
    configurePreviewServer: registerCanvasMiddlewares
  };
}

export default defineConfig({
  plugins: [react(), canvasStoragePlugin()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.IMAGE_AGENT_CANVAS_PORT || 43217),
    hmr: false
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
