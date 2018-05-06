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
    this.ctx = this.scene.canvas.getContext('2d');

    this.lru = new LRUCache();

    this.objTypeToRenderer = [
      null,
      (...args) => this.drawRectangle(...args),
      null,
      null,
    ];
  }

  drawRectangle(ctx, rectObj) {
    const bufInfo = this.getBufferInfo();

    ctx.fillStyle = rectObj.color;
    ctx.translate(
      0 - bufInfo.x0,
      0 - bufInfo.y0,
    );
    ctx.fillRect(...rectObj.params);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  renderObject(ctx, obj) {
    return this.objTypeToRenderer[obj.type](ctx, obj);
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

  *getVisibleObjects(pos, lastBlockPos=null, cacheCheck=true) {
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

    for (let zIdx = pos; zIdx < lastPos; ++zIdx) {
      const obj = this.scene.objects[zIdx];
      const minLength = _.min([bitMask.length, obj.regions.length]);

      for (let i = 0; i !== minLength; ++i) {
        if ((bitMask[i] & obj.regions[i]) !== 0) {
          yield obj;
          break;
        }
      }
    }
  }

  getL2TempBuffer(pos) {
    const refresh = () => {
      const bufInfo = this.getBufferInfo();
      const buf = Render.createBuffer(bufInfo.width, bufInfo.height);
      const ctx = buf.getContext('2d');

      for (let obj of this.getVisibleObjects(pos)) {
        this.renderObject(ctx, obj);
      }

      //console.log(Array.from(this.scene.camera.visibleChunks.keys()), bitMask);
      //console.log(count);

      // window.open(buf.toDataURL('image/png'));

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

      if (pos === 0) {
        ctx.fillStyle = `rgb(${_.random(220, 255)}, ${_.random(220, 255)}, ${_.random(220, 255)})`;
        ctx.fillRect(0, 0, CHUNK_SZ, CHUNK_SZ);
      }

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

  renderScene() {
    const bufInfo = this.getBufferInfo();
    this.ctx.fillStyle = 'rgb(255, 255, 255)';
    this.ctx.fillRect(0, 0, this.scene.canvas.width, this.scene.canvas.height);
    //this.ctx.scale(2, 2);
    this.ctx.drawImage(
      this.getFullBuffer(),
      this.scene.camera.x + bufInfo.x0,
      this.scene.camera.y + bufInfo.y0,
    );
    //this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

window.Render = Render;
