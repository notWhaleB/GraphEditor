'use strict';

class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = 0;
    this.y = 0;
    this.visibleChunks = new Map();
  }

  getBounds() {
    return _.map(
      [
        0 - this.x,
        this.canvas.width - this.x,
        0 - this.y,
        this.canvas.height - this.y,
      ],
      val => {
        return val - val % CHUNK_SZ;
      },
    );
  }

  _setVisibleChunks() {
    const [x0, x1, y0, y1] = this.getBounds();

    this.visibleChunks.clear();

    for (let x = x0; x <= x1; x += CHUNK_SZ) {
      for (let y = y0; y <= y1; y += CHUNK_SZ) {
        this.visibleChunks.set(
          Scene.coordsToChunkId(x, y),
          { x, y },
        );
      }
    }
  }

  set(x, y) {
    this.x = x <= 0 ? x : this.x;
    this.y = y <= 0 ? y : this.y;

    this._setVisibleChunks();
  }
}

window.Camera = Camera;