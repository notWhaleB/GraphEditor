'use strict';

const DrawObject = {
  LINE: 0,
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
const L2_BUF_SZ = 30001;
const L1_BUF_SZ = L2_BUF_SZ * 7;

if (L1_BUF_SZ % L2_BUF_SZ !== 0) {
  throw new Error('L1 cache size is not divisible by L2 cache size.');
}

window.DrawObject = DrawObject;
window.ToolMode = ToolMode;
window.CHUNK_SZ = CHUNK_SZ;
window.L1_BUF_SZ = L1_BUF_SZ;
window.L2_BUF_SZ = L2_BUF_SZ;
window.CacheLabels = CacheLabels;
