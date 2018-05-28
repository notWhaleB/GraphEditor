'use strict';

class Render {
  static createBuffer(width, height) {
    const buf = document.createElement('canvas');
    buf.width = width;
    buf.height = height;

    return buf;
  }

  constructor(scene) {
    this.scene = scene;
    this.ctx = this.scene.canvas.getContext('2d', { alpha: false });

    this.ctx.imageSmoothingEnabled = false;       /* standard */
    this.ctx.oImageSmoothingEnabled = false;      /* Opera */
    this.ctx.webkitImageSmoothingEnabled = false; /* Safari */
    this.ctx.msImageSmoothingEnabled = false;     /* IE */

    this.lru = new LRUCache();
  }

  drawObjectConnections(ctx, obj) {
    const bufInfo = this.getBufferInfo();
    const fromCenter = obj.getCenter();

    const drawConnection = (obj) => {
      const toCenter = obj.getCenter();
      ctx.translate(
        0 - bufInfo.x0,
        0 - bufInfo.y0,
      );
      ctx.beginPath();
      ctx.moveTo(fromCenter.x, fromCenter.y);
      ctx.lineTo(toCenter.x, toCenter.y);
      ctx.stroke();
      ctx.translate(bufInfo.x0, bufInfo.y0);
    };

    _.forEach(obj.incoming, drawConnection);
    _.forEach(obj.outgoing, drawConnection);
  }

  renderObject(ctx, obj) {
    const bufInfo = this.getBufferInfo();

    ctx.translate(
      0 - bufInfo.x0,
      0 - bufInfo.y0,
    );

    obj.draw(ctx);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  getBufferInfo() {
    const [x0, x1, y0, y1] = this.scene.camera.getBounds();

    return {
      x0,
      y0,
      width: x1 - x0 + CHUNK_SZ,
      height: y1 - y0 + CHUNK_SZ,
    }
  }

  _getCached(key, func, ...args) {
    if (this.lru.has(key)) {
      return this.lru.get(key);
    }

    const buffer = func(...args);

    this.lru.set(key, buffer);

    return buffer;
  }

  getVisibleObjects(pos, lastBlockPos=null, cacheCheck=true) {
    let mxRegionId = 0;
    const toRender = [];

    _.forEach(
      Array.from(this.scene.camera.visibleChunks.keys()),
      chunkId_ => {
        if (cacheCheck && this.lru.has(CacheLabels.L2Chunk(pos, chunkId_))) {
          return;
        }

        toRender.push(chunkId_);

        mxRegionId = _.max([
          mxRegionId,
          Scene.getRegionByChunk(chunkId_),
        ]);
      },
    );

    const bitMask = new Int16Array(mxRegionId + 1);

    _.forEach(toRender, chunkId_ => {
      bitMask[Scene.getRegionByChunk(chunkId_)] |= (0x1 << (chunkId_ % 0x10));
    });

    // console.log(bitMask, toRender);

    const lastPos = _.min([lastBlockPos || (pos + L2_BUF_SZ), this.scene.objects.length]);

    const objects = [];

    for (let zIdx = pos; zIdx < lastPos; ++zIdx) {
      const obj = this.scene.objects[zIdx];
      const minLength = _.min([bitMask.length, obj.regions.length]);

      for (let i = 0; i !== minLength; ++i) {
        if ((bitMask[i] & obj.regions[i]) !== 0) {
          objects.push(obj);
          break;
        }
      }
    }

    return objects;
  }

  getL2TempBuffer(pos) {
    const refresh = () => {
      const bufInfo = this.getBufferInfo();
      const buf = Render.createBuffer(bufInfo.width, bufInfo.height);
      const ctx = buf.getContext('2d');

      _.forEach(this.getVisibleObjects(pos), obj => {
        this.renderObject(ctx, obj);
      });

      return buf;
    };

    return this._getCached(CacheLabels.L2TempBuffer(pos), refresh);
  }

  getL2Chunk(pos, chunkId) {
    const refresh = () => {
      const buf = Render.createBuffer(CHUNK_SZ, CHUNK_SZ);
      const ctx = buf.getContext('2d');

      const bufInfo = this.getBufferInfo();
      const { x, y } = this.scene.camera.visibleChunks.get(chunkId);

      // if (pos === 0) {
      //   ctx.fillStyle = `rgb(${_.random(220, 255)}, ${_.random(220, 255)}, ${_.random(220, 255)})`;
      //   ctx.fillRect(0, 0, CHUNK_SZ, CHUNK_SZ);
      // }

      ctx.drawImage(
        this.getL2TempBuffer(pos),
        bufInfo.x0 - x,
        bufInfo.y0 - y,
      );

      return buf;
    };

    return this._getCached(CacheLabels.L2Chunk(pos, chunkId), refresh);
  }

  getL1Chunk(pos, chunkId) {
    const refresh = () => {
      const buf = Render.createBuffer(CHUNK_SZ, CHUNK_SZ);
      const ctx = buf.getContext('2d');

      const lastBlockPos = pos + L1_BUF_SZ;
      for (let curPos = pos; curPos !== lastBlockPos; curPos += L2_BUF_SZ) {
        ctx.drawImage(this.getL2Chunk(curPos, chunkId), 0, 0);
      }

      return buf;
    };

    return this._getCached(CacheLabels.L1Chunk(pos, chunkId), refresh);
  }

  getL1Buffer(pos) {
    const refresh = () => {
      const bufInfo = this.getBufferInfo();
      const buf = Render.createBuffer(bufInfo.width, bufInfo.height);
      const ctx = buf.getContext('2d');

      _.forEach(
        Array.from(this.scene.camera.visibleChunks.entries()),
        ([chunkId, { x, y }]) => {
          ctx.drawImage(
            this.getL1Chunk(pos, chunkId),
            x - bufInfo.x0,
            y - bufInfo.y0,
          );
        },
      );

      const lastBlockPos = pos + L1_BUF_SZ;
      for (let curPos = pos; curPos !== lastBlockPos; curPos += L2_BUF_SZ) {
        this.lru.invalidate(CacheLabels.L2TempBuffer(curPos));
      }

      return buf;
    };

    return this._getCached(CacheLabels.L1Buffer(pos), refresh);
  }

  drawConnections(ctx, movingObjId=-1) {
    const objects = this._getCached(
      CacheLabels.VisibleObjects(),
      () => {
        return this.getVisibleObjects(0, this.scene.objects.length, false);
      },
    );

    for (let obj of objects) {
      if (obj.idx === movingObjId) return;

      this.drawObjectConnections(ctx, obj);
    }
  }

  redrawL1Buffers() {
    const lastBlockPos = (
      this.scene.objects.length - this.scene.objects.length % L1_BUF_SZ
    );

    for (let pos = 0; pos <= lastBlockPos; pos += L1_BUF_SZ) {
      this.lru.invalidate(CacheLabels.L1Buffer(pos));
      this.lru.get(CacheLabels.L1Buffer(pos));
    }

    this.lru.invalidate(CacheLabels.VisibleObjects());
    this.lru.invalidate(CacheLabels.FullBuffer());

    this.renderScene();
  };

  getFullBuffer() {
    const refresh = () => {
      const bufInfo = this.getBufferInfo();
      const buf = Render.createBuffer(bufInfo.width, bufInfo.height);
      const ctx = buf.getContext('2d');

      const lastBlockPos = (
        this.scene.objects.length - this.scene.objects.length % L1_BUF_SZ
      );

      for (let pos = 0; pos <= lastBlockPos; pos += L1_BUF_SZ) {
        ctx.drawImage(this.getL1Buffer(pos), 0, 0);
      }

      return buf;
    };

    return this._getCached(CacheLabels.FullBuffer(), refresh);
  }

  drawFrame(ctx, x0, y0, x1, y1) {
    const draw = () => {
      this.ctx.beginPath();
      this.ctx.moveTo(x0, y0);
      this.ctx.lineTo(x0, y1);
      this.ctx.lineTo(x1, y1);
      this.ctx.lineTo(x1, y0);
      this.ctx.lineTo(x0, y0);
      this.ctx.stroke();
    };

    this.ctx.strokeStyle = 'white';
    draw();
    this.ctx.strokeStyle = 'black';
    this.ctx.setLineDash([1, 1]);
    draw();
    this.ctx.setLineDash([]);
  }

  renderScene() {
    const bufInfo = this.getBufferInfo();
    this.ctx.fillStyle = 'rgb(245, 245, 255)';
    this.ctx.fillRect(0, 0, this.scene.canvas.width, this.scene.canvas.height);

    this.ctx.scale(
      this.scene.camera.scale,
      this.scene.camera.scale,
    );
    this.ctx.translate(
      this.scene.camera.x + bufInfo.x0,
      this.scene.camera.y + bufInfo.y0,
    );
    this.drawConnections(this.ctx);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);

    this.ctx.scale(this.scene.camera.scale, this.scene.camera.scale);
    this.ctx.drawImage(
      this.getFullBuffer(),
      this.scene.camera.x + bufInfo.x0,
      this.scene.camera.y + bufInfo.y0,
    );

    if (
      this.scene.moveState.moving
      && this.scene.toolMode === ToolMode.SELECTOR
      && this.scene.moveState.mode === Action.VIEW
    ) {
      this.drawFrame(
        this.ctx,
        this.scene.moveState.startX,
        this.scene.moveState.startY,
        this.scene.moveState.lastX,
        this.scene.moveState.lastY,
      );
    }

    this.ctx.translate(
      this.scene.camera.x,
      this.scene.camera.y,
    );

    _.forEach(
      _.concat(
        Array.from(this.scene.selectedObjects),
        [this.scene.hoveredObjectIdx],
      ),
      (objIdx) => {
        if (objIdx >= 0) {
          const bounds = this.scene.objects[objIdx].getBounds();

          this.drawFrame(
            this.ctx,
            bounds.x0, bounds.y0,
            bounds.x1, bounds.y1,
          );
        }
      },
    );

    const objects = this._getCached(
      CacheLabels.VisibleObjects(),
      () => {
        return this.getVisibleObjects(0, this.scene.objects.length, false);
      },
    );

    this.ctx.scale(
      1 / this.scene.camera.scale,
      1 / this.scene.camera.scale,
    );

    _.forEach(objects, obj => {
      if (!obj.label) return;

      this.ctx.font = `${TEXT_LINE_HEIGHT}px Arial Black, sans-serif`;
      const textWidth = this.ctx.measureText(obj.label).width;
      const center = obj.getCenter();
      const [text, cx, cy] = [
        obj.label,
        center.x * this.scene.camera.scale - textWidth / 2,
        center.y * this.scene.camera.scale + 10,
      ];

      this.ctx.fillStyle = 'white';
      this.ctx.fillText(text, cx, cy);
      this.ctx.strokeStyle = 'black';
      this.ctx.lineWidth = 2;
      this.ctx.strokeText(text, cx, cy);
      this.ctx.lineWidth = 1;
    });

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

window.Render = Render;
