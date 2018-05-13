'use strict';

class Object {
  constructor(
    type, color, meta, label,
    params, childrenIdx, idx,
    nInitialRegions = 4,
  ) {
    this.type = type;
    this.color = color;
    this.meta = meta;
    this.label = label;
    this.params = params;
    this.idx = idx;
    this.childrenIdx = childrenIdx;
    this.incoming = [];
    this.outgoing = [];
    this.regions = new Int16Array(nInitialRegions);
  }

  getBounds() {
    console.error('Invalid object.', this);
    throw new Error('Invalid object');
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
    const bounds = this.getBounds();

    this.clearRegions();

    const points = [
      [_.max([bounds.x0, 0]), _.max([bounds.y0, 0])],
      [_.max([bounds.x0, 0]), bounds.y1],
      [bounds.x1, _.max([bounds.y0, 0])],
      [bounds.x1, bounds.y1],
    ];

    _.forEach(points, ([x, y]) => {
      this.addToChunk(
        Scene.coordsToChunkId(x, y),
      );
    });
  }

  getCenter() {
  }

  draw(ctx) {
  }

  drawWithBorders(ctx, func, ...args) {
    ctx.fillStyle = this.color;
    func(ctx, ...args);
    ctx.fill();
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    func(ctx, ...args);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}


class Rectangle extends Object {
  getBounds() {
    const [x0, y0, w, h] = this.params;
    const x1 = x0 + w;
    const y1 = y0 + h;

    return { x0, x1, y0, y1 };
  }

  getCenter() {
    return {
      x: this.params[0] + this.params[2] / 2,
      y: this.params[1] + this.params[3] / 2,
    }
  }

  moveDelta(dx, dy) {
    this.params[0] += dx;
    this.params[1] += dy;
  }

  draw(ctx) {
    const bounds = this.getBounds();
    const [x0, y0, x1, y1, x2, y2, x3, y3] = [
      bounds.x0, bounds.y0,
      bounds.x1, bounds.y0,
      bounds.x1, bounds.y1,
      bounds.x0, bounds.y1,
    ];

    this.drawWithBorders(
      ctx,
      (ctx, x0, y0, x1, y1, x2, y2, x3, y3) => {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.lineTo(x0, y0);
      },
      x0, y0, x1, y1, x2, y2, x3, y3,
    );
  }
}

class Triangle extends Object {
  getBounds() {
    let [x0, y0, x1, y1] = _.slice(this.params, 0, 4);

    _.forEach(this.params, (coord, idx) => {
      if (idx % 2 === 0) {
        x0 = _.min([x0, coord]);
        x1 = _.max([x1, coord]);
      } else {
        y0 = _.min([y0, coord]);
        y1 = _.max([y1, coord]);
      }
    });

    return { x0, y0, x1, y1 };
  }

  getCenter() {
    const [x0, y0, x1, y1, x2, y2] = this.params;

    return {
      x: _.sum([x0, x1, x2]) / 3,
      y: _.sum([y0, y1, y2]) / 3,
    }
  }

  moveDelta(dx, dy) {
    this.params[0] += dx;
    this.params[1] += dy;
    this.params[2] += dx;
    this.params[3] += dy;
    this.params[4] += dx;
    this.params[5] += dy;
  }

  draw(ctx) {
    const [x0, y0, x1, y1, x2, y2] = this.params;

    this.drawWithBorders(
      ctx,
      (ctx, x0, y0, x1, y1, x2, y2) => {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x0, y0);
      },
      x0, y0, x1, y1, x2, y2,
    );
  }
}

class Circle extends Object {
  getBounds() {
    let [cx, cy, r] = this.params;

    return {
      x0: cx - r, y0: cy - r,
      x1: cx + r, y1: cy + r,
    };
  }

  getCenter() {
    return {
      x: this.params[0],
      y: this.params[1],
    };
  }

  moveDelta(dx, dy) {
    this.params[0] += dx;
    this.params[1] += dy;
  }

  draw(ctx) {
    const [cx, cy, r] = this.params;

    this.drawWithBorders(
      ctx,
      (ctx, cx, cy, r) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      },
      cx, cy, r,
    );
  }
}

window.Object = Object;
window.Rectangle = Rectangle;
window.Triangle = Triangle;
window.Circle = Circle;
