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
    this.grid = [];

    this.hoveredObjectIdx = 0;

    // this.addObject(bgObject);
    // this.build2DIndex();

    this.render = new Render(this);

    const getMouseEventInfo = ev => {
      return {
        x: ev.clientX - this.canvas.offsetLeft,
        y: ev.clientY - this.canvas.offsetTop,
      };
    };

    this.moveState = {
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

      const clickX = click.x / this.camera.scale;
      const clickY = click.y / this.camera.scale;

      let clickedObjId = this.getHoveredObjectIndex(
        clickX - this.camera.x,
        clickY - this.camera.y,
      );

      if (clickedObjId > 0) {
        this.moveState.mode = ToolMode.MOVE;
        this.moveState.moving = true;
        this.moveState.objId = clickedObjId;
        this.moveState.lastX = clickX;
        this.moveState.lastY = clickY;
      } else {
        this.moveState.mode = ToolMode.VIEW;
        this.moveState.moving = true;
        this.moveState.lastX = clickX;
        this.moveState.lastY = clickY;
      }
    });

    this.canvas.addEventListener('mouseup', () => {
      this.moveState.moving = false;

      this.build2DIndex();
    });

    const invalidateL1BuffersIfVisibleChanged = () => {
      const visible = new Set([...this.camera.visibleChunks.keys()]);

      if (this.moveState.lastVisibleChunks.size !== visible.size) {
        this.moveState.lastVisibleChunks = visible;
        this.render.redrawL1Buffers();
      } else {
        const union = new Set([
          ...this.moveState.lastVisibleChunks,
          ...visible,
        ]);

        if (this.moveState.lastVisibleChunks.size !== union.size) {
          this.moveState.lastVisibleChunks = visible;
          this.render.redrawL1Buffers();
        }
      }
    };

    this.canvas.addEventListener('wheel', ev => {
      const mouse = getMouseEventInfo(ev);

      const delta = 0 - ev.deltaY / 1500;

      if (this.camera.scale + delta < 0.5) return;

      const newCamX = this.camera.x - (
        1 / this.camera.scale - 1 / (this.camera.scale + delta)
      ) * mouse.x;
      const newCamY = this.camera.y - (
        1 / this.camera.scale - 1 / (this.camera.scale + delta)
      ) * mouse.y;

      this.camera.scale += delta;

      this.camera.set(newCamX, newCamY);

      this.camera._setVisibleChunks();

     // this.render.lru.invalidate(CacheLabels.FullBuffer());

      this.render.renderScene();

      invalidateL1BuffersIfVisibleChanged();
    });

    this.canvas.addEventListener('mousemove', ev => {
      const mouse = getMouseEventInfo(ev);

      const mouseX = mouse.x / this.camera.scale;
      const mouseY = mouse.y / this.camera.scale;

      if (!this.moveState.moving) {
        this.hoveredObjectIdx = this.getHoveredObjectIndex(
          mouseX - this.camera.x,
          mouseY - this.camera.y,
        );

        if (this.hoveredObjectIdx > 0) {
          this.canvas.style.cursor = 'pointer';
        } else {
          this.canvas.style.cursor = 'move';
        }

        this.render.renderScene();
        return;
      }

      if (this.moveState.mode === ToolMode.MOVE) {
        const obj = this.objects[this.moveState.objId];

        obj.moveDelta(
          mouseX - this.moveState.lastX,
          mouseY - this.moveState.lastY,
        );

        this.moveState.lastX = mouseX;
        this.moveState.lastY = mouseY;

        markObjectForUpdate(this.moveState.objId);
        obj.setRegions();
      } else if (this.moveState.mode === ToolMode.VIEW) {
        this.camera.set(
          this.camera.x + mouseX - this.moveState.lastX,
          this.camera.y + mouseY - this.moveState.lastY,
        );

        this.moveState.lastX = mouseX;
        this.moveState.lastY = mouseY;

        invalidateL1BuffersIfVisibleChanged();
      }

      this.render.renderScene();
    });

    // document.getElementById('btn-view')
    //   .addEventListener('click', () => {
    //     moveState.mode = ToolMode.VIEW;
    //   });
    //
    // document.getElementById('btn-move')
    //   .addEventListener('click', () => {
    //     moveState.mode = ToolMode.MOVE;
    //   })
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

    if (!this.grid[xIdx] || !this.grid[xIdx][yIdx]) {
      return -1;
    }

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

    const objects = this.render._getCached(
      CacheLabels.VisibleObjects(),
      () => {
        return this.render.getVisibleObjects(0, this.objects.length, false);
      },
    );

    for (let obj of objects) {
      let coords = obj.getBounds();

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
        const coords = obj.getBounds();

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
    let ObjectClass = Object;
    if (obj.type === DrawObject.RECTANGLE) {
      ObjectClass = Rectangle;
    } else if (obj.type === DrawObject.TRIANGLE) {
      ObjectClass = Triangle;
    } else if (obj.type === DrawObject.CIRCLE) {
      ObjectClass = Circle;
    }

    const obj_ = new ObjectClass(
      obj.type,
      obj.color,
      obj.meta,
      obj.label,
      obj.params,
      obj.children,
      this.objects.length,
    );
    obj_.setRegions();

    this.objects.push(obj_);

    return obj_;
  }

  initConnections() {
    _.forEach(this.objects, obj => {
      _.forEach(
        obj.childrenIdx,
        idx => {
          obj.outgoing.push(this.objects[idx]);
          this.objects[idx].incoming.push(
            this.objects[obj.idx]
          );
        },
      );

      delete obj.childrenIdx;
    });
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

const objects = new Array(800000);
for (let i = 0; i !== 800000; ++i) {
  switch (_.random(0, 2)) {
    case 0: {
      objects[i] = {
        type: DrawObject.RECTANGLE,
        color: randColor(),
        params: [
          _.random(5, 20000), _.random(5, 20000),
          _.random(5, 25), _.random(5, 25),
        ],
        children: _.map(
          _.range(_.random(0, 10) > 9),
          () => _.random(0, 99999),
        ),
      };
    } break;
    case 1: {
      const [sx, sy] = [_.random(5, 20000), _.random(5, 20000)];

      objects[i] = {
        type: DrawObject.TRIANGLE,
        color: randColor(),
        params: [
          sx, sy,
          sx + 10, sy - 18,
          sx + 20, sy,
        ],
        children: _.map(
          _.range(_.random(0, 10) > 9),
          () => _.random(0, 99999),
        ),
        label: _.random(0, 10) > 9 ? 'Label' : '',
      };
    } break;
    case 2: {
      const [cx, cy] = [];

      objects[i] = {
        type: DrawObject.CIRCLE,
        color: randColor(),
        params: [_.random(5, 20000), _.random(5, 20000), _.random(5, 15)],
        children: _.map(
          _.range(_.random(0, 10) > 9),
          () => _.random(0, 99999),
        ),
      };
    } break;
  }
}
// for (let i = 100000; i !== 100100; ++i) {
//   objects[i] = {
//     type: DrawObject.RECTANGLE,
//     color: randColor(),
//     params: [
//       _.random(50, 10000), _.random(50, 10000),
//       _.random(50, 100), _.random(50, 100),
//     ],
//     children: _.map(
//       _.range(_.random(0, 1)),
//       () => _.random(100000, 100100),
//     ),
//   };
// }

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
scene.initConnections();

scene.camera.set(0, 0);

setTimeout(() => {
  scene.render.renderScene();
  scene.build2DIndex();
  // console.log(scene.ticksX);
  //console.log(scene.render.lru._map.size);
}, 0);

// setInterval(() => {
//   console.log(scene.render.lru._map.size);
// }, 1000);
