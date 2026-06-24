import {
  AssetToolbarItem,
  DefaultToolbar,
  DrawToolbarItem,
  EraserToolbarItem,
  FrameToolbarItem,
  HandToolbarItem,
  NoteToolbarItem,
  RectangleToolbarItem,
  SelectToolbarItem,
  TextToolbarItem,
  Tldraw,
  TldrawUiMenuToolItem,
  createTLStore,
  createShapeId,
  onDragFromToolbarToCreateShape,
  startEditingShapeWithRichText,
  useEditor,
  useValue
} from 'tldraw';
import 'tldraw/tldraw.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const CANVAS_ENDPOINT = '/api/canvas';
const CANVAS_EVENTS_ENDPOINT = '/api/canvas-events';
const INSPIRATION_ENDPOINT = '/api/inspirations/search';
const PROMPT_CARD_ENDPOINT = '/api/prompt-card';
const REFERENCE_IMAGE_ENDPOINT = '/api/reference-image';
const SELECTION_ENDPOINT = '/api/selection';
const VIEW_STATE_ENDPOINT = '/api/view-state';
const GENERATION_SETTINGS_ENDPOINT = '/api/generation-settings';
const AI_IMAGE_TOOL_ID = 'image-agent-ai-image';
const ANNOTATION_TOOL_ID = 'image-agent-annotation';
const APP_DISPLAY_NAME = '图片插件';
const AI_HOLDER_LABEL = 'AI 图片';
const AI_HOLDER_DEFAULT_W = 320;
const AI_HOLDER_DEFAULT_H = 220;
const ANNOTATION_LABEL = '标注';
const ANNOTATION_DEFAULT_TEXT = '在这里写修改意见';
const ANNOTATION_DEFAULT_W = 260;
const ANNOTATION_DEFAULT_H = 96;
const ANNOTATION_NOTE_OFFSET_X = 88;
const ANNOTATION_NOTE_OFFSET_Y = 56;
const LOCALE_STORAGE_KEY = 'image-plugin-locale';
const DEFAULT_GENERATION_SETTINGS = {
  setupComplete: false,
  mode: 'builtin',
  api: {
    baseUrl: '',
    model: 'gpt-image-2',
    envKey: '',
    hasSecretKey: false
  }
};

const UI_TEXT = {
  zh: {
    localeLabel: '语言',
    localeZh: '中文',
    localeEn: 'EN',
    generationSettings: '生图模式设置',
    generationMode: '生图模式',
    builtIn: '内置',
    api: 'API',
    hide: '收起',
    key: '密钥',
    baseUrl: 'Base URL',
    model: '模型',
    envKey: '环境变量名',
    secretKey: 'Secret key',
    secretSavedPlaceholder: '已保存；输入新 key 可替换',
    secretEmptyPlaceholder: '粘贴 API 模式使用的 key',
    saved: '已保存',
    saveFailed: '保存失败',
    secretCleared: '密钥已清除',
    clearFailed: '清除失败',
    secretSaved: '本地已保存密钥',
    noSecret: '未保存本地密钥',
    clearKey: '清除 key',
    saving: '保存中...',
    save: '保存',
    setupTitle: '选择生图方式',
    setupSubtitle: '首次使用先选一个默认入口',
    setupBuiltInTitle: '内置模式',
    setupBuiltInCopy: '使用 Codex 当前登录的图片生成能力。',
    setupApiTitle: 'API 模式',
    setupApiCopy: '使用你配置的 OpenAI 兼容图片接口。',
    setupUseBuiltIn: '使用内置',
    setupUseApi: '使用 API',
    setupSaveFailed: '初始化失败，请稍后重试',
    inspirationAria: '灵感库',
    inspiration: '灵感',
    inspirationLibrary: '灵感库',
    imagesPrompts: (images, prompts) => `${images} 张图片 / ${prompts} 条提示词`,
    close: '关闭',
    closeInspiration: '关闭灵感库',
    searchPlaceholder: '搜索提示词、风格、场景',
    allCategories: '全部分类',
    loadError: '灵感库加载失败。',
    empty: '没有找到灵感。',
    promptOnly: '仅提示词',
    preview: '预览',
    copyPrompt: '复制提示词',
    useReference: '使用参考图',
    copyImage: '复制图片',
    copiedImage: '已复制图片',
    copiedImageLink: '已复制图片链接',
    copyImageFailed: '复制失败',
    inserted: '已插入',
    insertPrompt: '插入提示词',
    reference: '参考图',
    image: '图片',
    prompt: '提示词',
    noPrompt: '暂无提示词。',
    addReference: '加入参考',
    onPlugin: '已在图片插件中',
    insertReference: '插入参考图',
    selectedReferences: '已选参考图',
    clear: '清空',
    referenceImage: '参考图',
    promptCard: '提示词卡片',
    aiImageTool: 'AI 图片',
    annotationTool: '标注',
    annotationDefaultText: '在这里写修改意见',
    annotationHint: '拖动生成直线箭头，然后填写修改意见',
    cancel: '取消',
    loading: '正在加载图片插件...',
    loadCanvasFailed: '图片插件文件加载失败。',
    skippedRecordsTitle: (count) => `已跳过 ${count} 条异常画布记录`,
    skippedRecordsCopy: '可用内容已正常加载。',
    details: '详情',
    historyAria: '生成记录',
    history: '记录',
    generationHistory: '生成记录',
    generationHistorySubtitle: (count) => `${count} 张生成图`,
    refresh: '刷新',
    noGeneratedImages: '画布里还没有生成图。',
    previewImage: '查看大图',
    download: '下载',
    copiedPrompt: '已复制提示词',
    copyPromptFailed: '复制失败',
    modelLabel: '模型',
    sourceLabel: '来源',
    branchLabel: '分支',
    holderLabel: '占位框'
  },
  en: {
    localeLabel: 'Language',
    localeZh: '中文',
    localeEn: 'EN',
    generationSettings: 'Generation mode settings',
    generationMode: 'Generation mode',
    builtIn: 'Built-in',
    api: 'API',
    hide: 'Hide',
    key: 'Key',
    baseUrl: 'Base URL',
    model: 'Model',
    envKey: 'Env key',
    secretKey: 'Secret key',
    secretSavedPlaceholder: 'Saved; enter a new key to replace',
    secretEmptyPlaceholder: 'Paste key for API mode',
    saved: 'Saved',
    saveFailed: 'Save failed',
    secretCleared: 'Secret cleared',
    clearFailed: 'Clear failed',
    secretSaved: 'Secret saved locally',
    noSecret: 'No local secret saved',
    clearKey: 'Clear key',
    saving: 'Saving...',
    save: 'Save',
    setupTitle: 'Choose Generation Mode',
    setupSubtitle: 'Pick the default image generation entry',
    setupBuiltInTitle: 'Built-in Mode',
    setupBuiltInCopy: 'Use the current Codex image generation backend.',
    setupApiTitle: 'API Mode',
    setupApiCopy: 'Use your configured OpenAI-compatible image endpoint.',
    setupUseBuiltIn: 'Use Built-in',
    setupUseApi: 'Use API',
    setupSaveFailed: 'Setup failed. Please try again.',
    inspirationAria: 'Inspiration library',
    inspiration: 'Inspiration',
    inspirationLibrary: 'Inspiration library',
    imagesPrompts: (images, prompts) => `${images} images / ${prompts} prompts`,
    close: 'Close',
    closeInspiration: 'Close inspiration library',
    searchPlaceholder: 'Search prompts, styles, scenes',
    allCategories: 'All categories',
    loadError: 'Could not load inspirations.',
    empty: 'No inspirations found.',
    promptOnly: 'Prompt only',
    preview: 'Preview',
    copyPrompt: 'Copy prompt',
    useReference: 'Use reference',
    copyImage: 'Copy image',
    copiedImage: 'Image copied',
    copiedImageLink: 'Image link copied',
    copyImageFailed: 'Copy failed',
    inserted: 'Inserted',
    insertPrompt: 'Insert prompt',
    reference: 'Reference',
    image: 'Image',
    prompt: 'Prompt',
    noPrompt: 'No prompt available.',
    addReference: 'Add reference',
    onPlugin: 'On plugin',
    insertReference: 'Insert reference',
    selectedReferences: 'Selected references',
    clear: 'Clear',
    referenceImage: 'Reference image',
    promptCard: 'Prompt Card',
    aiImageTool: 'AI Image',
    annotationTool: 'Annotation',
    annotationDefaultText: 'Edit here',
    annotationHint: 'Drag to create a straight arrow, then type the note',
    cancel: 'Cancel',
    loading: 'Loading Image Plugin...',
    loadCanvasFailed: 'Image plugin file could not be loaded.',
    skippedRecordsTitle: (count) => `Skipped ${count} invalid canvas record${count === 1 ? '' : 's'}.`,
    skippedRecordsCopy: 'Valid content was loaded.',
    details: 'Details',
    historyAria: 'Generation history',
    history: 'History',
    generationHistory: 'Generation history',
    generationHistorySubtitle: (count) => `${count} generated image${count === 1 ? '' : 's'}`,
    refresh: 'Refresh',
    noGeneratedImages: 'No generated images on the canvas yet.',
    previewImage: 'Preview image',
    download: 'Download',
    copiedPrompt: 'Prompt copied',
    copyPromptFailed: 'Copy failed',
    modelLabel: 'Model',
    sourceLabel: 'Source',
    branchLabel: 'Branch',
    holderLabel: 'Holder'
  }
};

function readInitialLocale() {
  if (typeof window === 'undefined') return 'zh';
  return window.localStorage?.getItem(LOCALE_STORAGE_KEY) === 'en' ? 'en' : 'zh';
}

function isCanvasSnapshot(value) {
  return value && typeof value === 'object' && value.store && value.schema;
}

function firstErrorLine(error) {
  return error instanceof Error ? error.message.split('\n')[0] : String(error).split('\n')[0];
}

function describeSkippedRecord(record, reason) {
  return {
    id: typeof record?.id === 'string' ? record.id : '(missing id)',
    typeName: typeof record?.typeName === 'string' ? record.typeName : '(missing typeName)',
    type: typeof record?.type === 'string' ? record.type : null,
    reason: firstErrorLine(reason)
  };
}

function getRecordDependencies(record) {
  const dependencies = [];
  if (record?.typeName === 'shape') {
    if (typeof record.parentId === 'string') dependencies.push(record.parentId);
    if (record.type === 'image' && typeof record.props?.assetId === 'string') {
      dependencies.push(record.props.assetId);
    }
  }
  if (record?.typeName === 'binding') {
    const fromId = record.fromId ?? record.props?.fromId;
    const toId = record.toId ?? record.props?.toId;
    if (typeof fromId === 'string') dependencies.push(fromId);
    if (typeof toId === 'string') dependencies.push(toId);
  }
  return dependencies;
}

function pruneRecordsWithMissingDependencies(store, skippedRecords) {
  const prunedStore = { ...store };
  let changed = true;

  while (changed) {
    changed = false;
    for (const record of Object.values(prunedStore)) {
      const missingDependency = getRecordDependencies(record).find((id) => !prunedStore[id]);
      if (!missingDependency) continue;

      delete prunedStore[record.id];
      skippedRecords.push(describeSkippedRecord(record, `Missing dependent record: ${missingDependency}`));
      changed = true;
    }
  }

  return prunedStore;
}

function sanitizeCanvasSnapshotForTldraw(snapshot) {
  if (!isCanvasSnapshot(snapshot)) return { snapshot: null, skippedRecords: [] };

  const validationStore = createTLStore();
  const skippedRecords = [];
  let migratedSnapshot;

  try {
    migratedSnapshot = validationStore.migrateSnapshot(snapshot);
  } catch (error) {
    return {
      snapshot: null,
      skippedRecords: [{
        id: '(snapshot)',
        typeName: 'snapshot',
        type: null,
        reason: firstErrorLine(error)
      }]
    };
  }

  const validStore = {};
  for (const record of Object.values(migratedSnapshot.store)) {
    try {
      validationStore.put([record], 'initialize');
      validStore[record.id] = validationStore.get(record.id);
    } catch (error) {
      skippedRecords.push(describeSkippedRecord(record, error));
    }
  }

  return {
    snapshot: {
      schema: migratedSnapshot.schema,
      store: pruneRecordsWithMissingDependencies(validStore, skippedRecords)
    },
    skippedRecords
  };
}

function recordsAreEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function storeChangedSinceSnapshot(editor, baselineStore) {
  const currentStore = editor.store.getStoreSnapshot().store;
  const baselineIds = new Set(Object.keys(baselineStore));

  for (const [id, baselineRecord] of Object.entries(baselineStore)) {
    const currentRecord = currentStore[id];
    if (!currentRecord) return true;
    if (!recordsAreEqual(currentRecord, baselineRecord)) return true;
  }

  for (const id of Object.keys(currentStore)) {
    if (!baselineIds.has(id)) return true;
  }

  return false;
}

function applyRemoteCanvasSnapshot(editor, snapshot, { preserveLocalChanges = false } = {}) {
  if (!isCanvasSnapshot(snapshot)) return { changedRecords: 0, skippedRecords: [] };

  const sanitized = sanitizeCanvasSnapshotForTldraw(snapshot);
  if (!sanitized.snapshot) return { changedRecords: 0, skippedRecords: sanitized.skippedRecords };

  const recordsToPut = Object.values(sanitized.snapshot.store).filter((record) => {
    const localRecord = editor.store.get(record.id);
    if (!localRecord) return true;
    if (preserveLocalChanges) return false;
    return !recordsAreEqual(localRecord, record);
  });

  if (recordsToPut.length === 0) return { changedRecords: 0, skippedRecords: sanitized.skippedRecords };

  let changedRecords = 0;
  editor.store.mergeRemoteChanges(() => {
    for (const record of recordsToPut) {
      try {
        editor.store.put([record]);
        changedRecords += 1;
      } catch (error) {
        sanitized.skippedRecords.push(describeSkippedRecord(record, error));
      }
    }
  });

  return { changedRecords, skippedRecords: sanitized.skippedRecords };
}

function getAiHolderMeta() {
  return {
    imageAgentAiImageHolder: true,
    cowartAiImageHolder: true,
    imageAgentAiImageHolderVersion: 1
  };
}

function getAnnotationMeta() {
  return {
    imageAgentAnnotation: true,
    imageAgentAnnotationVersion: 1,
    imageAgentAnnotationType: 'edit-region',
    imageAgentRole: 'annotation'
  };
}

function getPointAnnotationMeta(groupId, anchorPoint, role, extra = {}) {
  return {
    imageAgentAnnotation: true,
    imageAgentAnnotationVersion: 2,
    imageAgentAnnotationType: 'point-edit',
    imageAgentRole: role,
    imageAgentAnnotationGroupId: groupId,
    imageAgentAnchorPoint: anchorPoint,
    ...extra
  };
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

function createAiHolderShape(editor, id, shapeOverrides = {}) {
  const scale = editor.getResizeScaleFactor();
  const { meta, props, ...shapeRecordOverrides } = shapeOverrides;
  const { scale: _scale, ...frameProps } = props ?? {};

  return editor.createShape({
    ...shapeRecordOverrides,
    id,
    type: 'frame',
    meta: {
      ...getAiHolderMeta(),
      ...meta
    },
    props: {
      w: AI_HOLDER_DEFAULT_W * scale,
      h: AI_HOLDER_DEFAULT_H * scale,
      name: AI_HOLDER_LABEL,
      color: 'blue',
      ...frameProps
    }
  });
}

function createAnnotationShape(editor, id, shapeOverrides = {}) {
  const scale = editor.getResizeScaleFactor();
  const { meta, props, ...shapeRecordOverrides } = shapeOverrides;

  return editor.createShape({
    ...shapeRecordOverrides,
    id,
    type: 'geo',
    meta: {
      ...getAnnotationMeta(),
      ...meta
    },
    props: {
      w: ANNOTATION_DEFAULT_W * scale,
      h: ANNOTATION_DEFAULT_H * scale,
      geo: 'rectangle',
      dash: 'dashed',
      growY: 0,
      url: '',
      scale: 1,
      color: 'red',
      labelColor: 'red',
      fill: 'semi',
      size: 'm',
      font: 'draw',
      align: 'start',
      verticalAlign: 'start',
      richText: richTextFromPlainText(ANNOTATION_DEFAULT_TEXT),
      ...props
    }
  });
}

function createAiHolderAtViewportCenter(editor) {
  const scale = editor.getResizeScaleFactor();
  const w = AI_HOLDER_DEFAULT_W * scale;
  const h = AI_HOLDER_DEFAULT_H * scale;
  const center = editor.getViewportPageBounds().center;
  const id = createShapeId();

  createAiHolderShape(editor, id, {
    x: center.x - w / 2,
    y: center.y - h / 2,
    props: { w, h }
  });
  editor.select(id);
  editor.setCurrentTool('select.idle');
}

function createAnnotationAtViewportCenter(editor) {
  const scale = editor.getResizeScaleFactor();
  const w = ANNOTATION_DEFAULT_W * scale;
  const h = ANNOTATION_DEFAULT_H * scale;
  const center = editor.getViewportPageBounds().center;
  const id = createShapeId();

  createAnnotationShape(editor, id, {
    x: center.x - w / 2,
    y: center.y - h / 2,
    props: { w, h }
  });
  editor.select(id);
  editor.setCurrentTool('select.idle');
}

function findTargetImageShape(editor, point) {
  const shape = editor.getShapeAtPoint(point, {
    hitInside: true,
    hitFrameInside: true,
    margin: 0,
    filter: (shape) => shape.type === 'image'
  });
  if (shape) return shape;

  return editor.getCurrentPageShapesSorted().find((shape) => {
    if (shape.type !== 'image') return false;
    const bounds = editor.getShapePageBounds(shape);
    if (!bounds) return false;
    const left = Number.isFinite(bounds.x) ? bounds.x : bounds.minX;
    const top = Number.isFinite(bounds.y) ? bounds.y : bounds.minY;
    const right = Number.isFinite(bounds.maxX) ? bounds.maxX : left + bounds.w;
    const bottom = Number.isFinite(bounds.maxY) ? bounds.maxY : top + bounds.h;
    return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  });
}

function getPointAnnotationGroupId(shape) {
  if (shape?.typeName !== 'shape') return null;
  if (shape.meta?.imageAgentAnnotationType !== 'point-edit') return null;
  return shape.meta?.imageAgentAnnotationGroupId || null;
}

function registerPointAnnotationGroupDeletion(editor) {
  const pendingGroupIds = new Set();
  let isDeletingLinkedShapes = false;

  const unregisterAfterDelete = editor.sideEffects.registerAfterDeleteHandler('shape', (shape) => {
    if (isDeletingLinkedShapes) return;
    const groupId = getPointAnnotationGroupId(shape);
    if (groupId) pendingGroupIds.add(groupId);
  });

  const unregisterOperationComplete = editor.sideEffects.registerOperationCompleteHandler(() => {
    if (isDeletingLinkedShapes || pendingGroupIds.size === 0) return;
    const groupIds = new Set(pendingGroupIds);
    pendingGroupIds.clear();
    const linkedShapeIds = editor
      .getCurrentPageShapes()
      .filter((shape) => groupIds.has(getPointAnnotationGroupId(shape)))
      .map((shape) => shape.id);

    if (linkedShapeIds.length === 0) return;
    isDeletingLinkedShapes = true;
    try {
      editor.deleteShapes(linkedShapeIds);
    } finally {
      isDeletingLinkedShapes = false;
    }
  });

  return () => {
    unregisterAfterDelete();
    unregisterOperationComplete();
  };
}

function createPointAnnotation(editor, startPoint, endPoint, noteText = ANNOTATION_DEFAULT_TEXT) {
  const scale = editor.getResizeScaleFactor();
  const noteW = ANNOTATION_DEFAULT_W * scale;
  const dragDistance = endPoint
    ? Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y)
    : 0;
  const arrowTip = dragDistance > 8 * scale
    ? endPoint
    : { x: startPoint.x, y: startPoint.y };
  const arrowTail = dragDistance > 8 * scale
    ? startPoint
    : {
        x: startPoint.x + ANNOTATION_NOTE_OFFSET_X * scale,
        y: startPoint.y + ANNOTATION_NOTE_OFFSET_Y * scale
      };
  const noteX = arrowTail.x + 8 * scale;
  const noteY = arrowTail.y - 24 * scale;
  const anchorPoint = {
    x: Math.round(arrowTip.x * 100) / 100,
    y: Math.round(arrowTip.y * 100) / 100
  };
  const groupId = `annotation-${Date.now().toString(36)}`;
  const arrowId = createShapeId();
  const noteId = createShapeId();
  const targetImage = findTargetImageShape(editor, arrowTip);
  const targetPoint = targetImage ? editor.getPointInShapeSpace(targetImage, arrowTip) : null;
  const targetPointMeta = targetPoint
    ? { x: Math.round(targetPoint.x * 100) / 100, y: Math.round(targetPoint.y * 100) / 100 }
    : null;
  const connectorMeta = getPointAnnotationMeta(groupId, anchorPoint, 'connector', {
    imageAgentNoteId: noteId,
    imageAgentTargetShapeId: targetImage?.id ?? null,
    imageAgentTargetPoint: targetPointMeta
  });
  const noteMeta = getPointAnnotationMeta(groupId, anchorPoint, 'note', {
    imageAgentConnectorId: arrowId,
    imageAgentTargetShapeId: targetImage?.id ?? null,
    imageAgentTargetPoint: targetPointMeta
  });

  editor.createShapes([
    {
      id: arrowId,
      type: 'arrow',
      x: arrowTail.x,
      y: arrowTail.y,
      meta: connectorMeta,
      props: {
        kind: 'arc',
        color: 'red',
        labelColor: 'red',
        fill: 'none',
        dash: 'solid',
        size: 'm',
        arrowheadStart: 'none',
        arrowheadEnd: 'arrow',
        font: 'sans',
        start: { x: 0, y: 0 },
        end: { x: arrowTip.x - arrowTail.x, y: arrowTip.y - arrowTail.y },
        bend: 0,
        richText: richTextFromPlainText(''),
        labelPosition: 0.5,
        scale: 1,
        elbowMidPoint: 0.5
      }
    },
    {
      id: noteId,
      type: 'text',
      x: noteX,
      y: noteY,
      meta: noteMeta,
      props: {
        color: 'red',
        size: 's',
        font: 'sans',
        textAlign: 'start',
        w: noteW,
        scale: 1,
        autoSize: true,
        richText: richTextFromPlainText(noteText)
      }
    }
  ]);
  editor.select(noteId);
  editor.setCurrentTool('select.idle');
  editor.timers.requestAnimationFrame(() => {
    startEditingShapeWithRichText(editor, noteId, { selectAll: true });
  });
}

function setAnnotationPointMode(enabled) {
  window.dispatchEvent(new CustomEvent('image-agent-annotation-point-mode', { detail: { enabled } }));
}

function createImageAgentUiOverrides(labels) {
  return {
    translations: {
      en: {
        'tool.image-agent-ai-image': labels.aiImageTool,
        'tool.image-agent-annotation': labels.annotationTool
      },
      'zh-cn': {
        'tool.image-agent-ai-image': labels.aiImageTool,
        'tool.image-agent-annotation': labels.annotationTool
      }
    },
    tools(editor, tools) {
      return {
        ...tools,
        [AI_IMAGE_TOOL_ID]: {
          id: AI_IMAGE_TOOL_ID,
          label: 'tool.image-agent-ai-image',
          icon: 'tool-frame',
          kbd: 'a',
          onSelect() {
            createAiHolderAtViewportCenter(editor);
          },
          onDragStart(_source, info) {
            const scale = editor.getResizeScaleFactor();
            onDragFromToolbarToCreateShape(editor, info, {
              createShape: (id) =>
                createAiHolderShape(editor, id, {
                  props: {
                    w: AI_HOLDER_DEFAULT_W * scale,
                    h: AI_HOLDER_DEFAULT_H * scale
                  }
                }),
              onDragEnd: (id) => editor.select(id)
            });
          },
          meta: {
            imageAgentTool: 'ai-image-holder'
          }
        },
        [ANNOTATION_TOOL_ID]: {
          id: ANNOTATION_TOOL_ID,
          label: 'tool.image-agent-annotation',
          icon: 'tool-arrow',
          kbd: 'm',
          onSelect() {
            setAnnotationPointMode(true);
            editor.setCurrentTool('select.idle');
          },
          onDragStart(_source, info) {
            const scale = editor.getResizeScaleFactor();
            onDragFromToolbarToCreateShape(editor, info, {
              createShape: (id) =>
                createAnnotationShape(editor, id, {
                  props: {
                    w: ANNOTATION_DEFAULT_W * scale,
                    h: ANNOTATION_DEFAULT_H * scale
                  }
                }),
              onDragEnd: (id) => editor.select(id)
            });
          },
          meta: {
            imageAgentTool: 'annotation'
          }
        }
      };
    }
  };
}

function AnnotationPointCapture({ labels }) {
  const editor = useEditor();
  const [isActive, setIsActive] = useState(false);
  const [preview, setPreview] = useState(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const handleMode = (event) => {
      if (!event.detail?.enabled) {
        dragRef.current = null;
        setPreview(null);
      }
      setIsActive(Boolean(event.detail?.enabled));
    };
    window.addEventListener('image-agent-annotation-point-mode', handleMode);
    return () => window.removeEventListener('image-agent-annotation-point-mode', handleMode);
  }, []);

  useEffect(() => {
    if (!isActive) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        dragRef.current = null;
        setPreview(null);
        setIsActive(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

  const cancel = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    editor.markEventAsHandled(event);
    dragRef.current = null;
    setPreview(null);
    setIsActive(false);
  }, [editor]);

  const localPointFromEvent = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }, []);

  const startAnnotation = useCallback((event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    editor.markEventAsHandled(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const pagePoint = editor.screenToPage({ x: event.clientX, y: event.clientY });
    const localPoint = localPointFromEvent(event);
    dragRef.current = {
      pointerId: event.pointerId,
      pageStart: pagePoint,
      localStart: localPoint
    };
    setPreview({
      start: localPoint,
      end: localPoint
    });
  }, [editor, localPointFromEvent]);

  const updateAnnotation = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    editor.markEventAsHandled(event);
    setPreview({
      start: drag.localStart,
      end: localPointFromEvent(event)
    });
  }, [editor, localPointFromEvent]);

  const finishAnnotation = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    editor.markEventAsHandled(event);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const pageEnd = editor.screenToPage({ x: event.clientX, y: event.clientY });
    createPointAnnotation(editor, drag.pageStart, pageEnd, labels.annotationDefaultText);
    dragRef.current = null;
    setPreview(null);
    setIsActive(false);
  }, [editor, labels.annotationDefaultText]);

  const cancelDrag = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setPreview(null);
  }, []);

  if (!isActive) return null;

  return (
    <div
      className="iac-annotation-capture"
      onPointerDown={startAnnotation}
      onPointerMove={updateAnnotation}
      onPointerUp={finishAnnotation}
      onPointerCancel={cancelDrag}
    >
      {preview ? (
        <svg className="iac-annotation-preview" aria-hidden="true">
          <defs>
            <marker id="iac-annotation-preview-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" />
            </marker>
          </defs>
          <line
            x1={preview.start.x}
            y1={preview.start.y}
            x2={preview.end.x}
            y2={preview.end.y}
            markerEnd="url(#iac-annotation-preview-arrow)"
          />
        </svg>
      ) : null}
      <div className="iac-annotation-hint" onPointerDown={(event) => event.stopPropagation()}>
        <span>{labels.annotationHint}</span>
        <button type="button" onClick={cancel}>{labels.cancel}</button>
      </div>
    </div>
  );
}

function ImageAgentToolbarItem({ toolId }) {
  const editor = useEditor();
  const isSelected = useValue(
    `is ${toolId} selected`,
    () => editor.getCurrentToolId() === toolId,
    [editor, toolId]
  );

  return <TldrawUiMenuToolItem toolId={toolId} isSelected={isSelected} />;
}

function ToolbarDivider() {
  return <div aria-orientation="vertical" className="iac-toolbar-divider" role="separator" />;
}

function ImageAgentToolbar(props) {
  return (
    <DefaultToolbar {...props} maxItems={10}>
      <SelectToolbarItem />
      <HandToolbarItem />
      <ImageAgentToolbarItem toolId={AI_IMAGE_TOOL_ID} />
      <ImageAgentToolbarItem toolId={ANNOTATION_TOOL_ID} />
      <ToolbarDivider />
      <AssetToolbarItem />
      <DrawToolbarItem />
      <EraserToolbarItem />
      <TextToolbarItem />
      <NoteToolbarItem />
      <RectangleToolbarItem />
      <FrameToolbarItem />
    </DefaultToolbar>
  );
}

function getImageAgentSelection(editor) {
  return editor.getSelectedShapeIds().map((id) => {
    const shape = editor.getShape(id);
    const asset = shape?.props?.assetId ? editor.getAsset(shape.props.assetId) : null;
    return {
      id,
      type: shape?.type ?? null,
      parentId: shape?.parentId ?? null,
      x: shape?.x ?? null,
      y: shape?.y ?? null,
      rotation: shape?.rotation ?? null,
      meta: shape?.meta ?? null,
      isAiImageHolder: shape?.meta?.imageAgentAiImageHolder === true || shape?.meta?.cowartAiImageHolder === true,
      props: shape?.props ?? null,
      asset: asset
        ? {
            id: asset.id,
            type: asset.type,
            name: asset.props?.name ?? null,
            src: asset.props?.src ?? null,
            w: asset.props?.w ?? null,
            h: asset.props?.h ?? null,
            mimeType: asset.props?.mimeType ?? null,
            fileSize: asset.props?.fileSize ?? null
          }
        : null
    };
  });
}

function getSelectionSnapshot(editor) {
  return {
    selectedShapes: getImageAgentSelection(editor)
  };
}

function getViewState(editor) {
  const camera = editor.getCamera();
  return {
    version: 1,
    currentPageId: editor.getCurrentPageId(),
    camera: {
      x: camera.x,
      y: camera.y,
      z: camera.z
    }
  };
}

function isRestorableViewState(viewState) {
  return (
    viewState &&
    typeof viewState === 'object' &&
    typeof viewState.currentPageId === 'string' &&
    viewState.camera &&
    Number.isFinite(viewState.camera.x) &&
    Number.isFinite(viewState.camera.y) &&
    Number.isFinite(viewState.camera.z)
  );
}

function restoreViewState(editor, viewState) {
  if (!isRestorableViewState(viewState)) return;
  if (!editor.getPage(viewState.currentPageId)) return;

  editor.setCurrentPage(viewState.currentPageId);
  editor.setCamera(viewState.camera, { immediate: true, force: true });
}

function escapePromptCardText(value) {
  return String(value || '').trim();
}

function inspirationItemKey(item) {
  return `${item?.kind || 'item'}:${item?.id || item?.title || ''}`;
}

function localizedValue(value, locale = 'zh') {
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value.map((entry) => localizedValue(entry, locale)).filter(Boolean).join('\n').trim();
  }
  if (typeof value === 'object') {
    const fallbackLocale = locale === 'zh' ? 'en' : 'zh';
    return localizedValue(value[locale] ?? value[fallbackLocale] ?? value.zh ?? value.en ?? '', locale);
  }
  return String(value || '').trim();
}

function getItemTitle(item, locale, fallback = '') {
  return localizedValue(item?.titleText, locale) || localizedValue(item?.title, locale) || fallback;
}

function getItemPrompt(item, locale) {
  return (
    localizedValue(item?.promptText, locale) ||
    localizedValue(item?.prompt, locale) ||
    localizedValue(item?.promptPreviewText, locale) ||
    localizedValue(item?.promptPreview, locale)
  );
}

function getItemPromptPreview(item, locale) {
  return (
    localizedValue(item?.promptPreviewText, locale) ||
    localizedValue(item?.promptPreview, locale) ||
    getItemPrompt(item, locale)
  );
}

function getItemCategory(item, locale) {
  return localizedValue(item?.categoryText, locale) || localizedValue(item?.category, locale);
}

function getItemSourceLabel(item, locale) {
  return localizedValue(item?.sourceLabelText, locale) || localizedValue(item?.sourceLabel, locale);
}

function getItemImageAlt(item, locale, fallback = '') {
  return localizedValue(item?.imageAltText, locale) || localizedValue(item?.imageAlt, locale) || fallback;
}

function getRichTextPlainText(richText) {
  if (!richText?.content) return '';
  const lines = [];
  for (const block of richText.content) {
    const text = (block.content || [])
      .map((entry) => entry.text || '')
      .join('')
      .trim();
    if (text) lines.push(text);
  }
  return lines.join('\n').trim();
}

function getShapeTitle(shape, fallback = '') {
  return (
    shape?.props?.name ||
    shape?.props?.text ||
    getRichTextPlainText(shape?.props?.richText) ||
    fallback
  );
}

function isGeneratedImageShape(shape, asset) {
  if (shape?.type !== 'image' || !asset?.props?.src) return false;
  return (
    shape.meta?.imageAgentGeneratedAsset === true ||
    shape.meta?.imageAgentGenerationMode ||
    shape.meta?.imageAgentTestFlow === true ||
    asset.meta?.imageAgentGeneratedAsset === true ||
    asset.meta?.imageAgentGenerationMode
  );
}

function toGeneratedImageRecords(snapshot) {
  const store = snapshot?.store || {};
  return Object.values(store)
    .filter((record) => record?.typeName === 'shape' && record.type === 'image')
    .map((shape) => {
      const asset = store[shape.props?.assetId];
      if (!isGeneratedImageShape(shape, asset)) return null;
      const parent = store[shape.parentId];
      const meta = { ...(asset?.meta || {}), ...(shape.meta || {}) };
      const title =
        getShapeTitle(parent) ||
        meta.branchLabel ||
        meta.imageAgentBranchLabel ||
        asset?.props?.name ||
        shape.id;
      const branchLabel = meta.branchLabel || meta.imageAgentBranchLabel || '';
      return {
        id: shape.id,
        assetId: shape.props?.assetId || '',
        src: asset.props.src,
        title,
        branchLabel,
        holderTitle: getShapeTitle(parent),
        prompt: escapePromptCardText(meta.prompt),
        model: meta.imageAgentGenerationModel || asset.meta?.imageAgentGenerationModel || '',
        mode: meta.imageAgentGenerationMode || asset.meta?.imageAgentGenerationMode || '',
        sourceShapeId: meta.sourceShapeId || meta.imageAgentSourceShapeId || '',
        targetShapeId: meta.targetShapeId || meta.imageAgentTargetShapeId || '',
        promptCardId: meta.promptCardId || meta.imageAgentPromptCardId || '',
        arrowId: meta.arrowId || meta.imageAgentArrowId || '',
        fileName: asset.props.name || `${shape.id.replace(/^shape:/, '')}.png`,
        width: asset.props.w || shape.props?.w || null,
        height: asset.props.h || shape.props?.h || null,
        fileSize: asset.props.fileSize || null,
        zIndex: shape.index || ''
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.zIndex).localeCompare(String(a.zIndex)));
}

function normalizeDownloadName(name, fallback = 'image.png') {
  const value = String(name || fallback).replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim();
  return value || fallback;
}

async function blobToPngBlob(blob) {
  if (blob.type === 'image/png') return blob;

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare image clipboard data.');
  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!pngBlob) throw new Error('Could not encode image clipboard data.');
  return pngBlob;
}

async function copyImageUrlToClipboard(imageUrl) {
  if (!imageUrl) throw new Error('Image URL is empty.');
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Image clipboard is not supported.');
  }

  const requestUrl = /^https?:\/\//i.test(imageUrl)
    ? `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`
    : imageUrl;
  const response = await fetch(requestUrl);
  if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
  const sourceBlob = await response.blob();
  if (!sourceBlob.type.startsWith('image/')) throw new Error('Clipboard source is not an image.');
  const clipboardBlob = await blobToPngBlob(sourceBlob);

  await navigator.clipboard.write([
    new ClipboardItem({
      [clipboardBlob.type || 'image/png']: clipboardBlob
    })
  ]);
}

function InspirationActionIcon({ type }) {
  if (type === 'preview') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }

  if (type === 'copy') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="8" y="8" width="10" height="10" rx="1.8" />
        <path d="M6 14H5.8A1.8 1.8 0 0 1 4 12.2V5.8A1.8 1.8 0 0 1 5.8 4h6.4A1.8 1.8 0 0 1 14 5.8V6" />
      </svg>
    );
  }

  if (type === 'reference') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.5" />
        <path d="m7 17 4-4 3 3 2-2 3 3" />
      </svg>
    );
  }

  if (type === 'copyImage') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h12" />
        <path d="m13 8 4 4-4 4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

function normalizeGenerationSettings(value = {}) {
  return {
    ...DEFAULT_GENERATION_SETTINGS,
    setupComplete: value.setupComplete === true,
    mode: value.mode === 'api' ? 'api' : 'builtin',
    api: {
      ...DEFAULT_GENERATION_SETTINGS.api,
      ...(value.api || {})
    }
  };
}

async function saveGenerationSettingsRequest(settings, apiKey = '') {
  const body = {
    mode: settings.mode,
    api: {
      baseUrl: settings.api.baseUrl,
      model: settings.api.model,
      envKey: settings.api.envKey
    }
  };
  if (apiKey.trim()) body.apiKey = apiKey.trim();

  const response = await fetch(GENERATION_SETTINGS_ENDPOINT, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  return normalizeGenerationSettings(payload.settings);
}

function GenerationSettingsPanel({ labels }) {
  const [settings, setSettings] = useState(DEFAULT_GENERATION_SETTINGS);
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSettings() {
      try {
        const response = await fetch(GENERATION_SETTINGS_ENDPOINT, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        setSettings(normalizeGenerationSettings(payload.settings));
        setStatus('ready');
      } catch (error) {
        if (error.name === 'AbortError') return;
        setStatus('error');
      }
    }

    loadSettings();
    return () => controller.abort();
  }, []);

  const updateMode = useCallback(async (mode) => {
    const nextSettings = { ...settings, mode };
    setSettings(nextSettings);
    if (mode === 'builtin') setIsExpanded(false);
    setMessage('');
    setStatus('saving');
    try {
      const savedSettings = await saveGenerationSettingsRequest(nextSettings);
      setSettings(savedSettings);
      setStatus('ready');
      setMessage(labels.saved);
    } catch {
      setStatus('error');
      setMessage(labels.saveFailed);
    }
  }, [labels.saveFailed, labels.saved, settings]);

  const updateApi = useCallback((field, value) => {
    setSettings((current) => ({
      ...current,
      api: {
        ...current.api,
        [field]: value
      }
    }));
    setMessage('');
  }, []);

  const saveSettings = useCallback(async () => {
    setStatus('saving');
    setMessage('');
    try {
      setSettings(await saveGenerationSettingsRequest(settings, apiKey));
      setApiKey('');
      setStatus('ready');
      setMessage(labels.saved);
    } catch {
      setStatus('error');
      setMessage(labels.saveFailed);
    }
  }, [apiKey, labels.saveFailed, labels.saved, settings]);

  const clearSecret = useCallback(async () => {
    setStatus('saving');
    setMessage('');
    try {
      const response = await fetch(GENERATION_SETTINGS_ENDPOINT, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: settings.mode,
          api: {
            baseUrl: settings.api.baseUrl,
            model: settings.api.model,
            envKey: settings.api.envKey
          },
          apiKey: ''
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
        setSettings(normalizeGenerationSettings(payload.settings));
        setApiKey('');
        setStatus('ready');
        setMessage(labels.secretCleared);
      } catch (error) {
        setStatus('error');
        setMessage(labels.clearFailed);
      }
  }, [labels.clearFailed, labels.secretCleared, settings]);

  return (
    <section className={`iac-generation-panel ${isExpanded ? 'expanded' : 'compact'}`} aria-label={labels.generationSettings}>
      <div className="iac-generation-modes" role="group" aria-label={labels.generationMode}>
        <button
          className={settings.mode === 'builtin' ? 'active' : ''}
          type="button"
          onClick={() => updateMode('builtin')}
        >
          {labels.builtIn}
        </button>
        <button
          className={settings.mode === 'api' ? 'active' : ''}
          type="button"
          onClick={() => updateMode('api')}
        >
          {labels.api}
        </button>
        {settings.mode === 'api' ? (
          <button className="iac-generation-details" type="button" onClick={() => setIsExpanded((value) => !value)}>
            {isExpanded ? labels.hide : labels.key}
          </button>
        ) : null}
      </div>
      {settings.mode === 'api' && isExpanded ? (
        <div className="iac-generation-fields">
          <label>
            <span>{labels.baseUrl}</span>
            <input
              value={settings.api.baseUrl}
              onChange={(event) => updateApi('baseUrl', event.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label>
            <span>{labels.model}</span>
            <input
              value={settings.api.model}
              onChange={(event) => updateApi('model', event.target.value)}
              placeholder="gpt-image-2"
            />
          </label>
          <label>
            <span>{labels.envKey}</span>
            <input
              value={settings.api.envKey}
              onChange={(event) => updateApi('envKey', event.target.value)}
              placeholder="OPENAI_API_KEY"
            />
          </label>
          <label>
            <span>{labels.secretKey}</span>
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={settings.api.hasSecretKey ? labels.secretSavedPlaceholder : labels.secretEmptyPlaceholder}
              type="password"
            />
          </label>
          <footer>
            <span>{message || (settings.api.hasSecretKey ? labels.secretSaved : labels.noSecret)}</span>
            {settings.api.hasSecretKey ? <button type="button" onClick={clearSecret}>{labels.clearKey}</button> : null}
            <button type="button" onClick={saveSettings} disabled={status === 'saving'}>
              {status === 'saving' ? labels.saving : labels.save}
            </button>
          </footer>
        </div>
      ) : null}
    </section>
  );
}

function GenerationSetupModal({ labels }) {
  const [settings, setSettings] = useState();
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadSettings() {
      try {
        const response = await fetch(GENERATION_SETTINGS_ENDPOINT, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        setSettings(normalizeGenerationSettings(payload.settings));
        setStatus('ready');
      } catch (error) {
        if (error.name === 'AbortError') return;
        setSettings({ ...DEFAULT_GENERATION_SETTINGS });
        setStatus('error');
        setMessage(labels.setupSaveFailed);
      }
    }

    loadSettings();
    return () => controller.abort();
  }, [labels.setupSaveFailed]);

  const updateMode = useCallback((mode) => {
    setSettings((current) => ({ ...(current || DEFAULT_GENERATION_SETTINGS), mode }));
    setMessage('');
    setStatus('ready');
  }, []);

  const updateApi = useCallback((field, value) => {
    setSettings((current) => ({
      ...(current || DEFAULT_GENERATION_SETTINGS),
      api: {
        ...(current?.api || DEFAULT_GENERATION_SETTINGS.api),
        [field]: value
      }
    }));
    setMessage('');
  }, []);

  const finishSetup = useCallback(async () => {
    if (!settings) return;
    setStatus('saving');
    setMessage('');
    try {
      const savedSettings = await saveGenerationSettingsRequest(settings, apiKey);
      setSettings(savedSettings);
      setApiKey('');
      setStatus('ready');
    } catch {
      setStatus('error');
      setMessage(labels.setupSaveFailed);
    }
  }, [apiKey, labels.setupSaveFailed, settings]);

  if (!settings || settings.setupComplete) return null;

  return (
    <div className="iac-setup-backdrop" role="presentation">
      <section className="iac-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="iac-setup-title">
        <header>
          <span>{labels.setupSubtitle}</span>
          <strong id="iac-setup-title">{labels.setupTitle}</strong>
        </header>
        <div className="iac-setup-options" role="group" aria-label={labels.generationMode}>
          <button
            className={settings.mode === 'builtin' ? 'active' : ''}
            type="button"
            onClick={() => updateMode('builtin')}
          >
            <strong>{labels.setupBuiltInTitle}</strong>
            <span>{labels.setupBuiltInCopy}</span>
          </button>
          <button
            className={settings.mode === 'api' ? 'active' : ''}
            type="button"
            onClick={() => updateMode('api')}
          >
            <strong>{labels.setupApiTitle}</strong>
            <span>{labels.setupApiCopy}</span>
          </button>
        </div>
        {settings.mode === 'api' ? (
          <div className="iac-setup-fields">
            <label>
              <span>{labels.baseUrl}</span>
              <input
                value={settings.api.baseUrl}
                onChange={(event) => updateApi('baseUrl', event.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label>
              <span>{labels.model}</span>
              <input
                value={settings.api.model}
                onChange={(event) => updateApi('model', event.target.value)}
                placeholder="gpt-image-2"
              />
            </label>
            <label>
              <span>{labels.envKey}</span>
              <input
                value={settings.api.envKey}
                onChange={(event) => updateApi('envKey', event.target.value)}
                placeholder="OPENAI_API_KEY"
              />
            </label>
            <label>
              <span>{labels.secretKey}</span>
              <input
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={settings.api.hasSecretKey ? labels.secretSavedPlaceholder : labels.secretEmptyPlaceholder}
                type="password"
              />
            </label>
          </div>
        ) : null}
        <footer>
          <span>{message || (settings.mode === 'api' && settings.api.hasSecretKey ? labels.secretSaved : '')}</span>
          <button type="button" onClick={finishSetup} disabled={status === 'saving' || status === 'loading'}>
            {status === 'saving'
              ? labels.saving
              : settings.mode === 'api'
                ? labels.setupUseApi
                : labels.setupUseBuiltIn}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ImageAgentInCanvasUi({ labels }) {
  return <AnnotationPointCapture labels={labels} />;
}

function InspirationDrawer({ labels, locale, setLocale }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, imageCount: 0, promptOnlyCount: 0, categories: [], categoryOptions: [] });
  const [status, setStatus] = useState('idle');
  const [preview, setPreview] = useState(null);
  const [previewMode, setPreviewMode] = useState('image');
  const [insertedId, setInsertedId] = useState('');
  const [copiedImageId, setCopiedImageId] = useState('');
  const [copiedImageMode, setCopiedImageMode] = useState('');
  const [canvasReferenceId, setCanvasReferenceId] = useState('');
  const [referenceItems, setReferenceItems] = useState([]);
  const [referenceShapeIds, setReferenceShapeIds] = useState({});

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus('loading');
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set('q', query.trim());
        if (category) params.set('category', category);
        params.set('limit', '16');
        params.set('locale', locale);
        const response = await fetch(`${INSPIRATION_ENDPOINT}?${params.toString()}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const categoryOptions = payload.categoryOptions || (payload.categories || []).map((item) => ({ value: item, label: item }));
        setItems(payload.items || []);
        setMeta({
          total: payload.total || 0,
          imageCount: payload.imageCount || 0,
          promptOnlyCount: payload.promptOnlyCount || 0,
          categories: payload.categories || [],
          categoryOptions
        });
        setStatus('ready');
      } catch (error) {
        if (error.name === 'AbortError') return;
        setStatus('error');
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, category, locale]);

  const openPreview = useCallback((item, mode) => {
    if (!item) return;
    const hasImage = Boolean(item.hasImage && item.image);
    setPreview(item);
    setPreviewMode(mode || (hasImage ? 'image' : 'prompt'));
  }, []);

  const insertPrompt = useCallback(async (item) => {
    const prompt = escapePromptCardText(getItemPrompt(item, locale));
    if (!prompt) return;
    const itemKey = inspirationItemKey(item);
    const title = getItemTitle(item, locale, labels.promptCard);
    try {
      const response = await fetch(PROMPT_CARD_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          source: getItemSourceLabel(item, locale) || item.kind || '',
          text: prompt,
          image: item.image || '',
          inspirationId: item.id || ''
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await response.json();
      setInsertedId(itemKey);
      window.setTimeout(() => setInsertedId(''), 1400);
    } catch (error) {
      setStatus('error');
    }
  }, [labels, locale]);

  const addReference = useCallback((item) => {
    if (!item?.hasImage || !item.image) return;
    setReferenceItems((current) => {
      const key = inspirationItemKey(item);
      const title = getItemTitle(item, locale, labels.referenceImage);
      const prompt = getItemPrompt(item, locale);
      const promptPreview = getItemPromptPreview(item, locale);
      return [
        {
          key,
          id: item.id || key,
          kind: item.kind || 'reference',
          title,
          titleText: item.titleText,
          image: item.image,
          hasImage: true,
          imageAlt: getItemImageAlt(item, locale, title),
          sourceLabel: getItemSourceLabel(item, locale) || item.kind || '',
          sourceLabelText: item.sourceLabelText,
          sourceUrl: item.sourceUrl || '',
          prompt,
          promptText: item.promptText,
          promptPreview,
          promptPreviewText: item.promptPreviewText,
          category: getItemCategory(item, locale),
          categoryText: item.categoryText
        },
        ...current.filter((entry) => entry.key !== key)
      ].slice(0, 6);
    });
  }, [labels, locale]);

  const copyPrompt = useCallback((item) => {
    const prompt = escapePromptCardText(getItemPrompt(item, locale));
    if (prompt) navigator.clipboard?.writeText(prompt);
  }, [locale]);

  const insertReferenceIntoCanvas = useCallback(async (item) => {
    if (!item?.hasImage || !item.image) return;
    const itemKey = item.key || inspirationItemKey(item);
    const title = getItemTitle(item, locale, labels.referenceImage);
    setStatus('saving');
    try {
      const response = await fetch(REFERENCE_IMAGE_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          referenceKey: itemKey,
          title,
          sourceLabel: getItemSourceLabel(item, locale) || item.kind || '',
          sourceUrl: item.sourceUrl || '',
          image: item.image,
          prompt: getItemPrompt(item, locale),
          inspirationId: item.id || ''
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const shapeId = payload.shapeId || '';
      setReferenceShapeIds((current) => ({ ...current, [itemKey]: shapeId }));
      setReferenceItems((current) =>
        current.map((entry) => (entry.key === itemKey ? { ...entry, canvasShapeId: shapeId } : entry))
      );
      setPreview((current) => {
        if (!current) return current;
        const currentKey = current.key || inspirationItemKey(current);
        return currentKey === itemKey ? { ...current, key: itemKey, canvasShapeId: shapeId } : current;
      });
      setCanvasReferenceId(itemKey);
      setStatus('ready');
      window.setTimeout(() => setCanvasReferenceId(''), 1400);
    } catch (error) {
      setStatus('error');
    }
  }, [labels, locale]);

  const copyImage = useCallback(async (item) => {
    if (!item?.hasImage || !item.image) return;
    const itemKey = inspirationItemKey(item);
    try {
      await copyImageUrlToClipboard(item.image);
      setCopiedImageMode('image');
    } catch (error) {
      try {
        await navigator.clipboard?.writeText(item.image);
        setCopiedImageMode('link');
      } catch (_clipboardError) {
        setCopiedImageMode('error');
      }
    }
    setCopiedImageId(itemKey);
    window.setTimeout(() => {
      setCopiedImageId('');
      setCopiedImageMode('');
    }, 1400);
  }, []);

  const copyImageLabel = useCallback((item) => {
    const itemKey = item ? inspirationItemKey(item) : '';
    if (copiedImageId !== itemKey) return labels.copyImage;
    if (copiedImageMode === 'image') return labels.copiedImage;
    if (copiedImageMode === 'link') return labels.copiedImageLink;
    if (copiedImageMode === 'error') return labels.copyImageFailed;
    return labels.copyImage;
  }, [copiedImageId, copiedImageMode, labels]);

  const previewTitle = preview ? getItemTitle(preview, locale, labels.referenceImage) : '';
  const previewCategory = preview ? getItemCategory(preview, locale) : '';
  const previewSourceLabel = preview ? getItemSourceLabel(preview, locale) : '';
  const previewPrompt = preview ? escapePromptCardText(getItemPrompt(preview, locale)) : '';
  const previewHasImage = Boolean(preview?.hasImage && preview.image);
  const activePreviewMode = previewHasImage ? previewMode : 'prompt';

  return (
    <aside className={`iac-inspiration ${isOpen ? 'open' : 'closed'}`} aria-label={labels.inspirationAria}>
      <button className="iac-inspiration-toggle" type="button" onClick={() => setIsOpen((value) => !value)}>
        <span>{labels.inspiration}</span>
        <strong>{meta.total || 0}</strong>
      </button>
      {isOpen ? (
        <section className="iac-inspiration-panel">
          <header>
            <div>
              <strong>{labels.inspirationLibrary}</strong>
              <span>{labels.imagesPrompts(meta.imageCount, meta.promptOnlyCount)}</span>
            </div>
            <div className="iac-inspiration-header-actions">
              <div className="iac-locale-switch" role="group" aria-label={labels.localeLabel}>
                <button
                  className={locale === 'zh' ? 'active' : ''}
                  type="button"
                  onClick={() => setLocale('zh')}
                >
                  {labels.localeZh}
                </button>
                <button
                  className={locale === 'en' ? 'active' : ''}
                  type="button"
                  onClick={() => setLocale('en')}
                >
                  {labels.localeEn}
                </button>
              </div>
              <button className="iac-icon-button" type="button" onClick={() => setIsOpen(false)} title={labels.closeInspiration} aria-label={labels.closeInspiration}>
                <CloseIcon />
              </button>
            </div>
          </header>
          <div className="iac-inspiration-controls">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.searchPlaceholder}
            />
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">{labels.allCategories}</option>
              {(meta.categoryOptions || []).map((item) => (
                <option value={item.value} key={item.value}>{item.label || item.value}</option>
              ))}
            </select>
          </div>
          <GenerationSettingsPanel labels={labels} />
          <div className="iac-inspiration-list" aria-busy={status === 'loading'}>
            {status === 'error' ? <p className="iac-inspiration-empty">{labels.loadError}</p> : null}
            {status !== 'error' && items.length === 0 ? <p className="iac-inspiration-empty">{labels.empty}</p> : null}
            {items.map((item) => {
              const itemKey = inspirationItemKey(item);
              const itemTitle = getItemTitle(item, locale, labels.referenceImage);
              const itemSubtitle = getItemCategory(item, locale) || getItemSourceLabel(item, locale) || item.kind;
              const itemPromptPreview = getItemPromptPreview(item, locale);
              const imageAlt = getItemImageAlt(item, locale, itemTitle);
              return (
                <article className={`iac-inspiration-card ${item.hasImage ? '' : 'prompt-only'}`} key={`${item.kind}-${item.id}`}>
                  {item.hasImage ? (
                    <button type="button" className="iac-inspiration-thumb" onClick={() => openPreview(item)} aria-label={`${labels.preview} ${itemTitle}`}>
                      <img loading="lazy" src={item.image} alt={imageAlt} onError={(event) => { event.currentTarget.closest('.iac-inspiration-card')?.classList.add('image-missing'); }} />
                    </button>
                  ) : (
                    <button type="button" className="iac-inspiration-prompt-zone" onClick={() => openPreview(item, 'prompt')}>
                      {labels.promptOnly}
                    </button>
                  )}
                  <div className="iac-inspiration-body">
                    <strong>{itemTitle}</strong>
                    <span>{itemSubtitle}</span>
                    <p>{itemPromptPreview}</p>
                    <div className="iac-inspiration-actions">
                      <button className="iac-card-action" type="button" title={labels.preview} aria-label={`${labels.preview} ${itemTitle}`} onClick={() => openPreview(item)}>
                        <InspirationActionIcon type="preview" />
                      </button>
                      <button className="iac-card-action" type="button" title={labels.copyPrompt} aria-label={labels.copyPrompt} onClick={() => copyPrompt(item)}>
                        <InspirationActionIcon type="copy" />
                      </button>
                      {item.hasImage ? (
                        <button className="iac-card-action" type="button" title={labels.useReference} aria-label={labels.useReference} onClick={() => addReference(item)}>
                          <InspirationActionIcon type="reference" />
                        </button>
                      ) : null}
                      {item.hasImage ? (
                        <button
                          className={`iac-card-action iac-action-image ${copiedImageId === itemKey ? 'is-active' : ''}`}
                          type="button"
                          title={copyImageLabel(item)}
                          aria-label={copyImageLabel(item)}
                          onClick={() => copyImage(item)}
                        >
                          <InspirationActionIcon type="copyImage" />
                        </button>
                      ) : null}
                      <button
                        className={`iac-card-action iac-card-action-primary ${insertedId === itemKey ? 'is-active' : ''}`}
                        type="button"
                        title={insertedId === itemKey ? labels.inserted : labels.insertPrompt}
                        aria-label={insertedId === itemKey ? labels.inserted : labels.insertPrompt}
                        onClick={() => insertPrompt(item)}
                      >
                        <InspirationActionIcon type="insert" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
      {preview ? (
        <div className="iac-inspiration-preview" role="dialog" aria-modal="false">
          <section>
            <header>
              <div className="iac-preview-title">
                <strong>{previewTitle}</strong>
                <span>{previewCategory || previewSourceLabel || preview.kind || labels.reference}</span>
              </div>
              <button className="iac-icon-button" type="button" onClick={() => setPreview(null)} title={labels.close} aria-label={labels.close}>
                <CloseIcon />
              </button>
            </header>
            <div className="iac-preview-tabs" role="tablist" aria-label={labels.preview}>
              {previewHasImage ? (
                <button
                  className={activePreviewMode === 'image' ? 'active' : ''}
                  type="button"
                  onClick={() => setPreviewMode('image')}
                >
                  {labels.image}
                </button>
              ) : null}
              <button
                className={activePreviewMode === 'prompt' ? 'active' : ''}
                type="button"
                onClick={() => setPreviewMode('prompt')}
              >
                {labels.prompt}
              </button>
            </div>
            {activePreviewMode === 'image' && previewHasImage ? (
              <div className="iac-preview-image-frame">
                <img src={preview.image} alt={getItemImageAlt(preview, locale, previewTitle)} />
              </div>
            ) : (
              <div className="iac-preview-prompt-panel">
                {previewPrompt ? <p>{previewPrompt}</p> : <p className="iac-preview-prompt-empty">{labels.noPrompt}</p>}
              </div>
            )}
            <footer>
              {previewHasImage ? <button type="button" onClick={() => addReference(preview)}>{labels.addReference}</button> : null}
              {previewHasImage ? (
                <button
                  type="button"
                  disabled={Boolean(preview.canvasShapeId || referenceShapeIds[inspirationItemKey(preview)])}
                  onClick={() => insertReferenceIntoCanvas(preview)}
                >
                  {canvasReferenceId === inspirationItemKey(preview) || preview.canvasShapeId || referenceShapeIds[inspirationItemKey(preview)]
                    ? labels.onPlugin
                    : labels.insertReference}
                </button>
              ) : null}
              {previewHasImage ? (
                <button className="iac-action-image" type="button" onClick={() => copyImage(preview)}>
                  {copyImageLabel(preview)}
                </button>
              ) : null}
              <button type="button" onClick={() => copyPrompt(preview)} disabled={!previewPrompt}>{labels.copyPrompt}</button>
              <button type="button" onClick={() => insertPrompt(preview)}>
                {insertedId === inspirationItemKey(preview) ? labels.inserted : labels.insertPrompt}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {referenceItems.length > 0 ? (
        <section className="iac-reference-tray" aria-label={labels.selectedReferences}>
          <header>
            <strong>{labels.selectedReferences}</strong>
            <button type="button" onClick={() => setReferenceItems([])}>{labels.clear}</button>
          </header>
          <div>
            {referenceItems.map((item) => (
              <button
                type="button"
                key={item.key}
                title={`${getItemTitle(item, locale, labels.referenceImage)} - ${labels.preview}`}
                aria-label={`${labels.preview} ${getItemTitle(item, locale, labels.referenceImage)}`}
                onClick={() => openPreview(item)}
              >
                <img src={item.image} alt={getItemImageAlt(item, locale, getItemTitle(item, locale, labels.referenceImage))} />
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </aside>
  );
}

function GeneratedImageHistory({ labels, snapshot, refreshCanvas }) {
  const [isOpen, setIsOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [copiedPromptId, setCopiedPromptId] = useState('');
  const [copyFailedId, setCopyFailedId] = useState('');
  const records = useMemo(() => toGeneratedImageRecords(snapshot), [snapshot]);

  const copyPrompt = useCallback(async (record) => {
    if (!record?.prompt) return;
    try {
      await navigator.clipboard?.writeText(record.prompt);
      setCopiedPromptId(record.id);
      setCopyFailedId('');
    } catch (error) {
      setCopyFailedId(record.id);
      setCopiedPromptId('');
    }
    window.setTimeout(() => {
      setCopiedPromptId('');
      setCopyFailedId('');
    }, 1400);
  }, []);

  useEffect(() => {
    if (!preview) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setPreview(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [preview]);

  return (
    <aside className={`iac-history ${isOpen ? 'open' : 'closed'}`} aria-label={labels.historyAria}>
      <button className="iac-history-toggle" type="button" onClick={() => setIsOpen((value) => !value)}>
        <span>{labels.history}</span>
        <strong>{records.length}</strong>
      </button>
      {isOpen ? (
        <section className="iac-history-panel">
          <header>
            <div>
              <strong>{labels.generationHistory}</strong>
              <span>{labels.generationHistorySubtitle(records.length)}</span>
            </div>
            <div className="iac-history-header-actions">
              <button type="button" onClick={refreshCanvas}>{labels.refresh}</button>
              <button className="iac-icon-button" type="button" onClick={() => setIsOpen(false)} title={labels.close} aria-label={labels.close}>
                <CloseIcon />
              </button>
            </div>
          </header>
          <div className="iac-history-list">
            {records.length === 0 ? <p className="iac-history-empty">{labels.noGeneratedImages}</p> : null}
            {records.map((record) => {
              const promptCopyLabel = copyFailedId === record.id
                ? labels.copyPromptFailed
                : copiedPromptId === record.id
                  ? labels.copiedPrompt
                  : labels.copyPrompt;
              return (
                <article className="iac-history-card" key={record.id}>
                  <button type="button" className="iac-history-thumb" onClick={() => setPreview(record)} aria-label={`${labels.previewImage} ${record.title}`}>
                    <img src={record.src} alt={record.title} />
                  </button>
                  <div className="iac-history-body">
                    <strong>{record.title}</strong>
                    <div className="iac-history-meta">
                      {record.branchLabel ? <span>{labels.branchLabel}: {record.branchLabel}</span> : null}
                      {record.model ? <span>{labels.modelLabel}: {record.model}</span> : null}
                      {record.sourceShapeId ? <span>{labels.sourceLabel}: {record.sourceShapeId.replace(/^shape:/, '')}</span> : null}
                    </div>
                    <p>{record.prompt || labels.noPrompt}</p>
                    <div className="iac-history-actions">
                      <button type="button" onClick={() => setPreview(record)}>{labels.previewImage}</button>
                      <button type="button" onClick={() => copyPrompt(record)} disabled={!record.prompt}>{promptCopyLabel}</button>
                      <a href={record.src} download={normalizeDownloadName(record.fileName)}>{labels.download}</a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
      {preview ? (
        <div className="iac-history-preview" role="dialog" aria-modal="true" aria-label={preview.title}>
          <section>
            <header>
              <div className="iac-preview-title">
                <strong>{preview.title}</strong>
                <span>
                  {[preview.branchLabel, preview.model, preview.mode].filter(Boolean).join(' / ') || labels.image}
                </span>
              </div>
              <button className="iac-icon-button" type="button" onClick={() => setPreview(null)} title={labels.close} aria-label={labels.close}>
                <CloseIcon />
              </button>
            </header>
            <div className="iac-history-preview-image">
              <img src={preview.src} alt={preview.title} />
            </div>
            <footer>
              <div>
                {preview.sourceShapeId ? <span>{labels.sourceLabel}: {preview.sourceShapeId}</span> : null}
                {preview.promptCardId ? <span>{labels.promptCard}: {preview.promptCardId}</span> : null}
              </div>
              <div className="iac-history-preview-actions">
                <button type="button" onClick={() => copyPrompt(preview)} disabled={!preview.prompt}>
                  {copiedPromptId === preview.id ? labels.copiedPrompt : labels.copyPrompt}
                </button>
                <a href={preview.src} download={normalizeDownloadName(preview.fileName)}>{labels.download}</a>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </aside>
  );
}

export default function App() {
  const [locale, setLocale] = useState(readInitialLocale);
  const [snapshot, setSnapshot] = useState();
  const [viewState, setViewState] = useState();
  const [loadError, setLoadError] = useState(null);
  const [skippedRecords, setSkippedRecords] = useState([]);
  const labels = UI_TEXT[locale];
  const imageAgentUiOverrides = useMemo(() => createImageAgentUiOverrides(labels), [labels]);
  const imageAgentComponents = useMemo(() => ({
    Toolbar: ImageAgentToolbar,
    InFrontOfTheCanvas: () => <ImageAgentInCanvasUi labels={labels} />
  }), [labels]);

  useEffect(() => {
    window.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCanvas() {
      try {
        const [canvasResponse, viewStateResponse] = await Promise.all([
          fetch(CANVAS_ENDPOINT, { signal: controller.signal }),
          fetch(VIEW_STATE_ENDPOINT, { signal: controller.signal })
        ]);
        if (!canvasResponse.ok) throw new Error(`Failed to load canvas: ${canvasResponse.status}`);
        if (!viewStateResponse.ok) throw new Error(`Failed to load canvas view state: ${viewStateResponse.status}`);

        const [canvasData, viewStateData] = await Promise.all([canvasResponse.json(), viewStateResponse.json()]);
        const sanitized = sanitizeCanvasSnapshotForTldraw(canvasData.snapshot);
        setSnapshot(sanitized.snapshot);
        setSkippedRecords(sanitized.skippedRecords);
        setViewState(viewStateData.viewState ?? null);
      } catch (error) {
        if (error.name === 'AbortError') return;
        setLoadError(error);
        setSnapshot(null);
        setViewState(null);
      }
    }

    loadCanvas();
    return () => controller.abort();
  }, []);

  const refreshCanvas = useCallback(async () => {
    try {
      const [canvasResponse, viewStateResponse] = await Promise.all([
        fetch(CANVAS_ENDPOINT),
        fetch(VIEW_STATE_ENDPOINT)
      ]);
      if (!canvasResponse.ok) throw new Error(`Failed to refresh canvas: ${canvasResponse.status}`);
      if (!viewStateResponse.ok) throw new Error(`Failed to refresh canvas view state: ${viewStateResponse.status}`);

      const [canvasData, viewStateData] = await Promise.all([canvasResponse.json(), viewStateResponse.json()]);
      const sanitized = sanitizeCanvasSnapshotForTldraw(canvasData.snapshot);
      setSnapshot(sanitized.snapshot);
      setSkippedRecords(sanitized.skippedRecords);
      setViewState(viewStateData.viewState ?? null);
    } catch (error) {
      console.error(error);
    }
  }, []);

  const handleMount = useCallback((editor) => {
    window.__imageAgentCanvasEditor = editor;
    window.__imageAgentCanvasSelection = () => getImageAgentSelection(editor);
    window.__imageAgentCanvasViewState = () => getViewState(editor);

    let lastSyncedSelectionState = '';
    let selectionSaveInFlight = false;
    let selectionSaveQueued = false;
    let lastSyncedViewState = '';
    let viewStateSaveInFlight = false;
    let viewStateSaveQueued = false;
    let saveTimer = null;
    let saveInFlight = false;
    let saveQueued = false;
    let hasUnsavedChanges = false;
    let remoteLoadController = null;
    const unregisterPointAnnotationGroupDeletion = registerPointAnnotationGroupDeletion(editor);

    editor.timers.requestAnimationFrame(() => restoreViewState(editor, viewState));

    async function syncSelectionState() {
      const selectionSnapshot = {
        ...getSelectionSnapshot(editor),
        updatedAt: new Date().toISOString()
      };
      const nextSelection = JSON.stringify(selectionSnapshot);
      if (nextSelection === lastSyncedSelectionState) return;
      lastSyncedSelectionState = nextSelection;

      if (selectionSaveInFlight) {
        selectionSaveQueued = true;
        return;
      }

      selectionSaveInFlight = true;
      try {
        const response = await fetch(SELECTION_ENDPOINT, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: nextSelection
        });
        if (!response.ok) throw new Error(`Failed to save selection: ${response.status}`);
      } catch (error) {
        console.error(error);
      } finally {
        selectionSaveInFlight = false;
        if (selectionSaveQueued) {
          selectionSaveQueued = false;
          syncSelectionState();
        }
      }
    }

    async function syncViewState() {
      const viewStateSnapshot = {
        ...getViewState(editor),
        updatedAt: new Date().toISOString()
      };
      const nextViewState = JSON.stringify(viewStateSnapshot);
      if (nextViewState === lastSyncedViewState) return;
      lastSyncedViewState = nextViewState;

      if (viewStateSaveInFlight) {
        viewStateSaveQueued = true;
        return;
      }

      viewStateSaveInFlight = true;
      try {
        const response = await fetch(VIEW_STATE_ENDPOINT, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: nextViewState
        });
        if (!response.ok) throw new Error(`Failed to save view state: ${response.status}`);
      } catch (error) {
        console.error(error);
      } finally {
        viewStateSaveInFlight = false;
        if (viewStateSaveQueued) {
          viewStateSaveQueued = false;
          syncViewState();
        }
      }
    }

    async function saveCanvas() {
      if (!hasUnsavedChanges) return;
      if (saveInFlight) {
        saveQueued = true;
        return;
      }

      saveInFlight = true;
      try {
        const response = await fetch(CANVAS_ENDPOINT, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(editor.store.getStoreSnapshot())
        });
        if (!response.ok) throw new Error(`Failed to save canvas: ${response.status}`);
        hasUnsavedChanges = false;
      } catch (error) {
        console.error(error);
      } finally {
        saveInFlight = false;
        if (saveQueued) {
          saveQueued = false;
          scheduleSave();
        }
      }
    }

    function scheduleSave() {
      hasUnsavedChanges = true;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(saveCanvas, 450);
    }

    async function loadRemoteCanvasSnapshot() {
      remoteLoadController?.abort();
      const controller = new AbortController();
      remoteLoadController = controller;

      const preserveLocalChanges = hasUnsavedChanges || saveInFlight;
      const preFetchStore = preserveLocalChanges ? null : editor.store.getStoreSnapshot().store;

      try {
        const response = await fetch(CANVAS_ENDPOINT, { signal: controller.signal });
        if (!response.ok) throw new Error(`Failed to refresh canvas: ${response.status}`);

        const canvasData = await response.json();
        const effectivePreserve =
          preserveLocalChanges || (preFetchStore && storeChangedSinceSnapshot(editor, preFetchStore));
        const { changedRecords, skippedRecords: nextSkippedRecords } = applyRemoteCanvasSnapshot(editor, canvasData.snapshot, {
          preserveLocalChanges: effectivePreserve
        });
        setSkippedRecords(nextSkippedRecords);

        if (changedRecords > 0 && effectivePreserve) {
          hasUnsavedChanges = true;
          if (saveInFlight) saveQueued = true;
          else scheduleSave();
        }
      } catch (error) {
        if (error.name === 'AbortError') return;
        console.error(error);
      } finally {
        if (remoteLoadController === controller) remoteLoadController = null;
      }
    }

    syncSelectionState();
    syncViewState();
    scheduleSave();
    const selectionTimer = window.setInterval(syncSelectionState, 250);
    const viewStateTimer = window.setInterval(syncViewState, 500);
    const unsubscribe = editor.store.listen(scheduleSave, {
      source: 'user',
      scope: 'document'
    });

    let canvasEvents = null;
    if ('EventSource' in window) {
      canvasEvents = new EventSource(CANVAS_EVENTS_ENDPOINT);
      canvasEvents.addEventListener('canvas-changed', loadRemoteCanvasSnapshot);
      canvasEvents.onerror = (error) => {
        console.warn(APP_DISPLAY_NAME + ' live refresh disconnected.', error);
      };
    }

    return () => {
      window.clearTimeout(saveTimer);
      window.clearInterval(selectionTimer);
      window.clearInterval(viewStateTimer);
      remoteLoadController?.abort();
      canvasEvents?.close();
      unregisterPointAnnotationGroupDeletion();
      unsubscribe();
      syncViewState();
      saveCanvas();
      if (window.__imageAgentCanvasEditor === editor) {
        delete window.__imageAgentCanvasEditor;
        delete window.__imageAgentCanvasSelection;
        delete window.__imageAgentCanvasViewState;
      }
    };
  }, [viewState]);

  if (snapshot === undefined || viewState === undefined) {
    return (
        <main className="iac-status" aria-live="polite">
        {labels.loading}
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="iac-status" aria-live="polite">
        {labels.loadCanvasFailed}
      </main>
    );
  }

  return (
    <main className="iac-canvas" aria-label={APP_DISPLAY_NAME}>
      <SkippedRecordsNotice labels={labels} records={skippedRecords} />
      <Tldraw
        snapshot={snapshot ?? undefined}
        inferDarkMode
        onMount={handleMount}
        overrides={imageAgentUiOverrides}
        components={imageAgentComponents}
      />
      <InspirationDrawer labels={labels} locale={locale} setLocale={setLocale} />
      <GeneratedImageHistory labels={labels} snapshot={snapshot} refreshCanvas={refreshCanvas} />
      <GenerationSetupModal labels={labels} />
    </main>
  );
}

function SkippedRecordsNotice({ labels, records }) {
  if (!records.length) return null;

  return (
    <aside className="iac-skipped-records" aria-live="polite">
      <strong>{labels.skippedRecordsTitle(records.length)}</strong>
      <span>{labels.skippedRecordsCopy}</span>
      <details>
        <summary>{labels.details}</summary>
        <ul>
          {records.slice(0, 8).map((record, index) => (
            <li key={`${record.id}:${index}`}>
              <code>{record.id}</code>
              {record.typeName ? ` ${record.typeName}` : ''}
              {record.type ? `/${record.type}` : ''}: {record.reason}
            </li>
          ))}
        </ul>
      </details>
    </aside>
  );
}
