'use strict';

class Object {
  static getCoords(obj) {
    if (obj.type === DrawObject.RECTANGLE) {
      const [x0, y0, w, h] = obj.params;
      const x1 = x0 + w;
      const y1 = y0 + h;

      return { x0, x1, y0, y1 };
    }

    console.error('Invalid object.', obj);
    throw new Error('Invalid object');
  }

  constructor(
    type, color, params,
    childrenIdx, idx, nInitialRegions=4,
  ) {
    this.type = type;
    this.color = color;
    this.params = params;
    this.idx = idx;
    this.childrenIdx = childrenIdx;
    this.incoming = [];
    this.outgoing = [];
    this.regions = new Int16Array(nInitialRegions);
  }

  getCoords() {
    return Object.getCoords(this);
  }

  addToChunk(chunkId) {
    const regId = Scene.getRegionByChunk(chunkId);

    if (regId >= this.regions.length) {
      const newRegions = new Int16Array(regId + 1);
      newRegions.set(this.regions);
      this.regions = newRegions;
    }

    this.regions[regId] |= (0x1 << (chunkId % 0x10));
  }

  removeFromChunk(chunkId) {
    const regId = Scene.getRegionByChunk(chunkId);

    if (regId >= this.regions.length) return;

    this.regions[regId] &= ~(0x1 << (chunkId % 0x10));
  }

  clearRegions() {
    this.regions.set(new Int16Array(this.regions.length));
  }

  extractChunks() {
    const chunks = [];

    _.forEach(
      this.regions,
      (region, idx) => {
        for (let i = 0; i !== 0x10; ++i) {
          if ((region & (1 << i)) !== 0) {
            chunks.push(0x10 * idx + i);
          }
        }
      },
    );

    return chunks;
  }

  setRegions() {
    if (this.type === DrawObject.RECTANGLE) {
      const coords = this.getCoords();
      this.clearRegions();

      const points = [
        [_.max([coords.x0, 0]), _.max([coords.y0, 0])],
        [_.max([coords.x0, 0]), coords.y1],
        [coords.x1, _.max([coords.y0, 0])],
        [coords.x1, coords.y1],
      ];

      _.forEach(points, ([x, y]) => {
        this.addToChunk(
          Scene.coordsToChunkId(x, y),
        );
      });
    }
  }

  getCenter() {
    if (this.type === DrawObject.RECTANGLE) {
      return {
        x: this.params[0] + this.params[2] / 2,
        y: this.params[1] + this.params[3] / 2,
      }
    }
  }
}

window.Object = Object;
