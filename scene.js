'use strict';

class Scene {
  constructor(canvasElementId) {
    this.canvas = document.getElementById(canvasElementId);

    this.camera = new Camera(this.canvas);

    // const bgObject = {
    //   type: DrawObject.RECTANGLE,
    //   color: 'rgb(230, 240, 255)',
    //   params: [0, 0, this.canvas.width, this.canvas.height],
    // };

    this.objects = [];

    // this.addObject(bgObject);
    // this.build2DIndex();

    this.render = new Render(this);

    const getMouseEventInfo = ev => {
      return {
        x: ev.clientX - this.canvas.offsetLeft,
        y: ev.clientY - this.canvas.offsetTop,
      };
    };

    let moveState = {
      mode: ToolMode.VIEW,
      lastVisibleChunks: new Set(),
      moving: false,
      objId: undefined,
      lastX: undefined,
      lastY: undefined,
    };

    const markObjectForUpdate = (objId) => {
      _.forEach(
        this.objects[objId].extractChunks(),
        chunkId => {
          const l1Pos = objId - objId % L1_BUF_SZ;
          const l2Pos = objId - objId % L2_BUF_SZ;

          const keysToInvalidate = [
            CacheLabels.L2Chunk(l2Pos, chunkId),
            CacheLabels.L1Chunk(l1Pos, chunkId),
            CacheLabels.L1Buffer(l1Pos),
            CacheLabels.FullBuffer(),
          ];

          _.forEach(
            keysToInvalidate,
            key => this.render.lru.invalidate(key),
          );
        },
      );
    };

    this.canvas.addEventListener('mousedown', ev => {
      const click = getMouseEventInfo(ev);

      if (moveState.mode === ToolMode.MOVE) {
        let clickedObjId = this.getHoveredObjectIndex(
          click.x - this.camera.x,
          click.y - this.camera.y,
        );

        if (!clickedObjId) return;

        moveState.moving = true;
        moveState.objId = clickedObjId;
        moveState.lastX = click.x;
        moveState.lastY = click.y;

      } else if (moveState.mode === ToolMode.VIEW) {
        moveState.moving = true;
        moveState.lastX = click.x;
        moveState.lastY = click.y;
      }
    });

    this.canvas.addEventListener('mouseup', () => {
      moveState.moving = false;

      this.build2DIndex();
    });

    this.canvas.addEventListener('mousemove', ev => {
      if (!moveState.moving) return;

      const mouse = getMouseEventInfo(ev);

      if (moveState.mode === ToolMode.MOVE) {
        const obj = this.objects[moveState.objId];

        obj.params[0] += mouse.x - moveState.lastX;
        obj.params[1] += mouse.y - moveState.lastY;

        moveState.lastX = mouse.x;
        moveState.lastY = mouse.y;

        markObjectForUpdate(moveState.objId);
        obj.setRegions();
      } else if (moveState.mode === ToolMode.VIEW) {
        this.camera.set(
          this.camera.x + mouse.x - moveState.lastX,
          this.camera.y + mouse.y - moveState.lastY,
        );

        moveState.lastX = mouse.x;
        moveState.lastY = mouse.y;

        let redraw = (newVisibleChunks) => {
          moveState.lastVisibleChunks = newVisibleChunks;

          //console.log('MISS', Math.random());

          const lastBlockPos = (
            this.objects.length - this.objects.length % L1_BUF_SZ
          );

          for (let pos = 0; pos <= lastBlockPos; pos += L1_BUF_SZ) {
            this.render.lru.invalidate(CacheLabels.L1Buffer(pos));
            this.render.lru.get(CacheLabels.L1Buffer(pos));
          }

          this.render.lru.invalidate(CacheLabels.FullBuffer());

          this.render.renderScene();
        };

        const visible = new Set([...this.camera.visibleChunks.keys()]);

        if (moveState.lastVisibleChunks.size !== visible.size) {
          redraw(visible);
        } else {
          const union = new Set([
            ...moveState.lastVisibleChunks,
            ...visible,
          ]);

          if (moveState.lastVisibleChunks.size !== union.size) {
            redraw(visible);
          }
        }
      }

      this.render.renderScene();
    });

    document.getElementById('btn-view')
      .addEventListener('click', () => {
        moveState.mode = ToolMode.VIEW;
      });

    document.getElementById('btn-move')
      .addEventListener('click', () => {
        moveState.mode = ToolMode.MOVE;
      })
  }

  static findChunk(xIdx, yIdx) {
    if ((xIdx | yIdx) === 0) {
      return 0;
    }

    const subRegSz = Math.pow(
      2,
      Math.floor(
        Math.log2(
          Math.max(xIdx, yIdx),
        ),
      ),
    );

    const signature = ((yIdx >= subRegSz) << 1) | (xIdx >= subRegSz);
    const offset = subRegSz * subRegSz * signature;

    return offset + Scene.findChunk(xIdx % subRegSz, yIdx % subRegSz);
  };

  static coordsToChunkId(x, y) {
    const xIdx = Math.floor(x / CHUNK_SZ);
    const yIdx = Math.floor(y / CHUNK_SZ);

    return Scene.findChunk(xIdx, yIdx);
  };

  static getRegionByChunk(chunkId) {
     return Math.floor(
      chunkId / 0x10,
    );
  }

  getHoveredObjectIndex(x, y) {
    const xIdx = _.sortedLastIndex(this.ticksX, x) - 1;
    const yIdx = _.sortedLastIndex(this.ticksY, y) - 1;

    return this.grid[xIdx][yIdx];
  }

  build2DIndex() {
    this.ticksX = [];
    this.ticksY = [];

    // let limitCoords = coords => {
    //   return {
    //     x0: _.max([0, coords.x0]),
    //     x1: _.min([coords.x1, this.canvas.width]),
    //     y0: _.max([0, coords.y0]),
    //     y1: _.min([coords.y1, this.canvas.height]),
    //   };
    // };

    const objects = Array.from(
      this.render.getVisibleObjects(0, this.objects.length, false),
    );

    for (let obj of objects) {
      if (obj.type !== DrawObject.RECTANGLE) return; // TODO

      let coords = obj.getCoords();

      this.ticksX.push(coords.x0, coords.x1);
      this.ticksY.push(coords.y0, coords.y1);
    }

    this.ticksX = Array
      .from(new Set(this.ticksX))
      .sort((x, y) => x - y);
    this.ticksY = Array
      .from(new Set(this.ticksY))
      .sort((x, y) => x - y);

    this.grid = new Array(this.ticksX.length);
    for (let i = 0; i !== this.ticksX.length; ++i) {
      this.grid[i] = new Array(this.ticksY.length).fill(0);
    }

    _.forEach(
      objects,
      obj => {
        if (obj.type !== DrawObject.RECTANGLE) return; // TODO

        const coords = obj.getCoords();

        const gridIndices = {
          x0: _.sortedIndexOf(this.ticksX, coords.x0),
          x1: _.sortedIndexOf(this.ticksX, coords.x1),
          y0: _.sortedIndexOf(this.ticksY, coords.y0),
          y1: _.sortedIndexOf(this.ticksY, coords.y1),
        };

        for (let xIdx = gridIndices.x0; xIdx !== gridIndices.x1; ++xIdx) {
          for (let yIdx = gridIndices.y0; yIdx !== gridIndices.y1; ++yIdx) {
            this.grid[xIdx][yIdx] = obj.idx;
          }
        }
      },
    );
  }

  addObject(obj) {
    const obj_ = new Object(
      obj.type,
      obj.color,
      obj.params,
      this.objects.length,
    );
    obj_.setRegions();

    this.objects.push(obj_);

    return obj_;
  }

  // renderBuffer(checkComposite) {
  //   if (this.compositeBuffers.length) {
  //     let curIdx = 0;
  //     let curCompositeIdx = 0;
  //
  //     while (curIdx < this.objects.length && curCompositeIdx !== this.compositeBuffers.length) {
  //       const [fromIdx, toIdx, buffer] = this.compositeBuffers[curCompositeIdx];
  //
  //       if (curIdx < fromIdx) {
  //         this.bufferRenderer.renderScene(this.objects, curIdx, fromIdx);
  //         curIdx = fromIdx;
  //       } else {
  //         this.bufferCtx.drawImage(buffer, 0, 0);
  //         curIdx = toIdx;
  //         curCompositeIdx += 1;
  //       }
  //     }
  //
  //     if (curIdx < this.objects.length) {
  //       this.bufferRenderer.renderScene(this.objects, curIdx, this.objects.length);
  //     }
  //
  //     return;
  //   }
  //
  //   if (checkComposite) return;
  //
  //   this.bufferRenderer.renderScene(this.objects);
  // }
}

// - // - // - // - // - //

const scene = new Scene('canvas');

let randColor = () => {
  return `rgb(${_.random(32, 255)}, ${_.random(32, 255)}, ${_.random(32, 255)})`;
};

const objects = new Array(500000);
for (let i = 0; i !== 500000; ++i) {
  objects[i] = {
    type: DrawObject.RECTANGLE,
    color: randColor(),
    params: [
      _.random(50, 10000), _.random(50, 10000),
      _.random(20, 25), _.random(20, 25),
    ],
  };
}

// const objects = [];
// for (let i = 256; i < 5000; i += 512) {
//   for (let j = 256; j < 5000; j += 512) {
//     objects.push({
//       type: DrawObject.RECTANGLE,
//       color: randColor(),
//       params: [
//         i, j,
//         _.random(30, 80), _.random(30, 80),
//       ],
//     });
//   }
// }

// const objects = [
//   {
//     type: DrawObject.RECTANGLE,
//     color: 'green',
//     params: [50, 50, 100, 100],
//     zIndex: 2,
//   }
//   {
//     type: DrawObject.RECTANGLE,
//     color: 'blue',
//     params: [90, 90, 100, 100],
//     zIndex: 1,
//   },
// ];

_.forEach(objects, obj => {
  scene.addObject(obj);
});

scene.camera.set(0, 0);

setTimeout(() => {
  scene.render.renderScene();
  scene.build2DIndex();
  // console.log(scene.ticksX);
  console.log(scene.render.lru._map.size);
}, 0);

setInterval(() => {
  console.log(scene.render.lru._map.size);
}, 1000);
