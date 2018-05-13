'use strict';

const DrawObject = {
  RECTANGLE: 1,
  TRIANGLE: 2,
  CIRCLE: 3,
};

const ToolMode = {
  VIEW: 0,
  MOVE: 1,
};

const CacheLabels = {
  FullBuffer: () => 'a',
  L1Buffer: (pos) => `b:${pos}`,
  L1Chunk: (pos, chunkId) => `c:${pos}:${chunkId}`,
  L2Chunk: (pos, chunkId) => `d:${pos}:${chunkId}`,
  L2TempBuffer: (pos) => `e:${pos}`,
  VisibleObjects: () => 'f',
};

const CHUNK_SZ = 640;
const L2_BUF_SZ = 40001;
const L1_BUF_SZ = L2_BUF_SZ * 6;

if (L1_BUF_SZ % L2_BUF_SZ !== 0) {
  throw new Error('L1 cache size is not divisible by L2 cache size.');
}

const TEXT_LINE_HEIGHT = 36;

window.DrawObject = DrawObject;
window.ToolMode = ToolMode;
window.CHUNK_SZ = CHUNK_SZ;
window.L1_BUF_SZ = L1_BUF_SZ;
window.L2_BUF_SZ = L2_BUF_SZ;
window.TEXT_LINE_HEIGHT = TEXT_LINE_HEIGHT;
window.CacheLabels = CacheLabels;
