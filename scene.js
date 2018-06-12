'use strict';

class Scene {
  constructor(canvasElementId) {
    this.canvas = document.getElementById(canvasElementId);
    this.canvas.width = this.canvas.parentNode.offsetWidth;
    this.canvas.height = this.canvas.parentNode.offsetHeight;

    this.camera = new Camera(this.canvas);

    this.objects = [];
    this.grid = [];

    this.hoveredObjectIdx = -1;
    this.selectedObjects = new Set();

    this.render = new Render(this);

    const getMouseEventInfo = ev => {
      return {
        x: ev.clientX - this.canvas.offsetLeft,
        y: ev.clientY - this.canvas.offsetTop,
      };
    };

    this.moveState = {
      mode: Action.VIEW,
      lastVisibleChunks: new Set(),
      moving: false,
      objId: -1,
      lastX: undefined,
      lastY: undefined,
      startX: undefined,
      startY: undefined,
    };

    this.toolMode = ToolMode.VIEWER;

    const btnSelector = document.getElementById('btn-selector');
    const btnViewer = document.getElementById('btn-viewer');
    const labelInput = document.getElementById('label-input');
    const labelClear = document.getElementById('label-clear');

    const btnSquare = document.getElementById('btn-square');
    const btnTriangle = document.getElementById('btn-triangle');
    const btnCircle = document.getElementById('btn-circle');
    const btnLink = document.getElementById('btn-link');
    const btnUnlink = document.getElementById('btn-unlink');

    const menuSave = document.getElementById('m-save');
    const menuLoad = document.getElementById('m-load');
    const menuNew = document.getElementById('m-new');
    const menuRandom = document.getElementById('m-random');

    const statusTool = document.getElementById('status-tool');
    const statusObjects = document.getElementById('status-objects');
    const statusCoords = document.getElementById('status-coords');
    const statusScale = document.getElementById('status-scale');

    this.updateObjectsStatus = () => {
      statusObjects.innerHTML = `Objects: ${this.objects.length} ${
        this.selectedObjects.size !== 0 
          ? `(${this.selectedObjects.size} selected)` 
          : ''
      }`;
    };


    const markObjectForUpdate = (objIdx) => {
      _.forEach(
        this.objects[objIdx].extractChunks(),
        chunkId => {
          const l1Pos = objIdx - objIdx % L1_BUF_SZ;
          const l2Pos = objIdx - objIdx % L2_BUF_SZ;

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

      if (clickedObjId !== -1) {
        if (!ev.metaKey && !this.selectedObjects.has(clickedObjId)) {
          this.selectedObjects.clear();
        }

        this.moveState.mode = Action.MOVE;
        this.moveState.moving = true;
        this.moveState.objId = clickedObjId;
      } else {
        this.moveState.mode = Action.VIEW;
        this.moveState.moving = true;
      }
      this.moveState.lastX = clickX;
      this.moveState.lastY = clickY;
      this.moveState.startX = clickX;
      this.moveState.startY = clickY;
    });

    this.canvas.addEventListener('mouseup', (ev) => {
      this.moveState.moving = false;

      if (this.toolMode === ToolMode.SELECTOR) {
        if (this.moveState.mode === Action.VIEW) {
          if (!ev.metaKey) {
            this.selectedObjects.clear();
          }

          const [x0, y0, x1, y1] = [
            _.min([this.moveState.startX, this.moveState.lastX]),
            _.min([this.moveState.startY, this.moveState.lastY]),
            _.max([this.moveState.startX, this.moveState.lastX]),
            _.max([this.moveState.startY, this.moveState.lastY]),
          ];

          _.forEach(
            Array.from(
              this.getSelectedObjects(
                x0 - this.camera.x,
                y0 - this.camera.y,
                x1 - this.camera.x,
                y1 - this.camera.y,
              ),
            ),
            (objIdx) => {
              if (objIdx === -1 || objIdx === undefined) return;

              this.selectedObjects.add(objIdx);
            }
          );
        }
      } else if (this.moveState.objId !== -1 && this.moveState.objId !== undefined) {
        this.selectedObjects.add(this.moveState.objId);
      }

      this.updateObjectsStatus();
      if (this.selectedObjects.size === 1) {
        labelInput.value = this.objects[
          Array.from(this.selectedObjects.values())[0]
        ].label || '';
      }

      this.render.renderScene();
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

    const wheelHandler = (acc, ev) => {
      const mouse = getMouseEventInfo(ev);

      const delta = 0 - ev.deltaY * acc;

      if (this.camera.scale + delta < 0.25) return;
      if (this.camera.scale + delta > 10) return;

      const newCamX = this.camera.x - (
        1 / this.camera.scale - 1 / (this.camera.scale + delta)
      ) * mouse.x;
      const newCamY = this.camera.y - (
        1 / this.camera.scale - 1 / (this.camera.scale + delta)
      ) * mouse.y;

      this.camera.scale += delta;

      this.camera.set(newCamX, newCamY);

      this.camera._setVisibleChunks();

      this.render.renderScene();

      invalidateL1BuffersIfVisibleChanged();
    };

    this.canvas.addEventListener('wheel', ev => {
      wheelHandler(0.00005, ev);
      _.debounce(wheelHandler, 70)(0.01, ev);
      statusScale.innerHTML = `Scale: ${_.round(this.camera.scale, 2).toFixed(2)}`;
    });

    this.canvas.addEventListener('mousemove', ev => {
      const mouse = getMouseEventInfo(ev);

      const mouseX = mouse.x / this.camera.scale;
      const mouseY = mouse.y / this.camera.scale;

      statusCoords.innerHTML = `X: ${
        _.round(mouseX - this.camera.x)
      }, Y: ${
        _.round(mouseY - this.camera.y)
      }`;

      if (!this.moveState.moving) {

        const newHoveredObjectIdx = this.getHoveredObjectIndex(
          mouseX - this.camera.x,
          mouseY - this.camera.y,
        );

        if (newHoveredObjectIdx !== -1) {
          this.canvas.style.cursor = 'grab';
        } else {
          this.canvas.style.cursor = (this.toolMode === ToolMode.VIEWER)
            ? 'move'
            : 'crosshair';
        }

        if (this.hoveredObjectIdx === newHoveredObjectIdx) {
          return;
        }
        this.hoveredObjectIdx = newHoveredObjectIdx;

        this.render.renderScene();
        return;
      }

      if (this.moveState.mode === Action.MOVE) {
        _.forEach(
          Array.from(new Set(
            _.concat(
              Array.from(this.selectedObjects),
              [this.hoveredObjectIdx],
            ),
          )),
          (objIdx) => {
            if (objIdx === undefined || objIdx === -1) return;

            const obj = this.objects[objIdx];
            obj.moveDelta(
              mouseX - this.moveState.lastX,
              mouseY - this.moveState.lastY,
            );

            markObjectForUpdate(objIdx);
            obj.setRegions();
          },
        );

        this.moveState.lastX = mouseX;
        this.moveState.lastY = mouseY;
      } else if (this.moveState.mode === Action.VIEW) {
        if (this.toolMode === ToolMode.VIEWER) {
          this.camera.set(
            this.camera.x + mouseX - this.moveState.lastX,
            this.camera.y + mouseY - this.moveState.lastY,
          );
        }

        this.moveState.lastX = mouseX;
        this.moveState.lastY = mouseY;

        invalidateL1BuffersIfVisibleChanged();
      }

      this.render.renderScene();
    });

    const self = this;

    btnSelector
      .addEventListener('click', () => {
        this.toolMode = ToolMode.SELECTOR;
        btnSelector.className = 'btn active';
        btnViewer.className = 'btn';
        statusTool.innerHTML = 'SELECT';
      });

    btnViewer
      .addEventListener('click', () => {
        this.toolMode = ToolMode.VIEWER;
        btnViewer.className = 'btn active';
        btnSelector.className = 'btn';
        statusTool.innerHTML = 'VIEW';
      });

    const labelChange = (value) => {
      _.forEach(Array.from(this.selectedObjects), objIdx => {
        this.objects[objIdx].label = value;
      });
      this.render.renderScene();
    };

    labelInput
      .addEventListener('keyup', function () {
        labelChange(this.value);
      });

    labelClear
      .addEventListener('click', () => {
        labelInput.value = '';
        labelChange(labelInput.value);
      });

    _.forEach(Array.from(document.getElementsByClassName('color-pick')), elem => {
      elem.addEventListener('click', function () {
        const color = this.children[0].style.backgroundColor;
        _.forEach(Array.from(self.selectedObjects), objIdx => {
          self.objects[objIdx].color = color;
          markObjectForUpdate(objIdx);
        });
        self.render.renderScene();
      });
    });

    menuSave
      .addEventListener('click', () => {
        const saved = this.objects
          .map(obj => ({
            type: obj.type,
            color: obj.color,
            params: obj.params,
            children: obj.outgoing.map(obj => obj.idx),
            label: obj.label,
            meta: obj.meta,
          }));

        const blob = new Blob(
          [JSON.stringify(saved)],
          { type: 'text/json' },
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = (new Date()).toISOString() + '.json';
        document.body.appendChild(link);
        link.click();

        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }, 0);
      });

    menuLoad
      .addEventListener('change', function () {
        const file = this.files[0];
        const reader = new FileReader();

        if (!confirm("Are you sure? All unsaved changes will be lost.")) {
          return;
        }

        reader.onload = function (ev) {
          self.objects = [];
          _.forEach(
            JSON.parse(ev.target.result),
            obj => {
              self.addObject(obj);
            },
          );
          self.initConnections();
          self.render.lru._clear();
          self.camera.scale = 1.7;
          self.camera.set(0, 0);
          self.render.renderScene();
          self.build2DIndex();
        };

        reader.readAsText(file);
      });

    menuNew
      .addEventListener('click', () => {
        if (!confirm("Are you sure? All unsaved changes will be lost.")) {
          return;
        }

        this.objects = [];
        this.render.lru._clear();
        this.camera.scale = 1.7;
        this.camera.set(0, 0);
        this.render.renderScene();
        this.build2DIndex();
      });

    menuRandom
      .addEventListener('click', () => {
        if (!confirm("Are you sure? All unsaved changes will be lost.")) {
          return;
        }

        this.objects = [];
        _.forEach(
          randomObjects(),
          obj => this.addObject(obj),
        );
        self.initConnections();
        this.render.lru._clear();
        this.camera.scale = 1.7;
        this.camera.set(0, 0);
        this.render.renderScene();
        this.build2DIndex();
      });

    btnSquare
      .addEventListener('click', () => {
        this.addObject({
          type: DrawObject.RECTANGLE,
          color: 'white',
          params: [
            -this.camera.x + 10, -this.camera.y + 10,
            30, 30,
          ],
        });
        markObjectForUpdate(this.objects.length - 1);
        this.render.lru.invalidate(CacheLabels.VisibleObjects());
        this.build2DIndex();
        this.render.renderScene();
      });

    btnTriangle
      .addEventListener('click', () => {
        const [sx, sy] = [-this.camera.x + 10, -this.camera.y + 30];

        this.addObject({
          type: DrawObject.TRIANGLE,
          color: 'white',
          params: [
            sx, sy,
            sx + 15, sy - 27,
            sx + 30, sy,
          ],
        });
        markObjectForUpdate(this.objects.length - 1);
        this.render.lru.invalidate(CacheLabels.VisibleObjects());
        this.build2DIndex();
        this.render.renderScene();
      });

    btnCircle
      .addEventListener('click', () => {
        this.addObject({
          type: DrawObject.CIRCLE,
          color: 'white',
          params: [
            -this.camera.x + 20, -this.camera.y + 20,
            15,
          ],
        });
        markObjectForUpdate(this.objects.length - 1);
        this.render.lru.invalidate(CacheLabels.VisibleObjects());
        this.build2DIndex();
        this.render.renderScene();
      });

    btnLink
      .addEventListener('click', () => {
        const objects = Array.from(this.selectedObjects);
        _.forEach(objects, objIdx => {
          _.forEach(objects, objIdx_ => {
            if (objIdx_ === objIdx) return;
            if (objIdx < objIdx_) {
              this.objects[objIdx].outgoing.push(this.objects[objIdx_]);
              this.objects[objIdx_].incoming.push(this.objects[objIdx]);
            } else {
              this.objects[objIdx_].outgoing.push(this.objects[objIdx]);
              this.objects[objIdx].incoming.push(this.objects[objIdx_]);
            }
          });
        });

        this.render.renderScene();
      });

    btnUnlink
      .addEventListener('click', () => {
        _.forEach(
          Array.from(this.selectedObjects),
          objIdx => {
            this.objects[objIdx].incoming = _.filter(
              this.objects[objIdx].incoming,
              obj => !this.selectedObjects.has(obj.idx),
            );
            this.objects[objIdx].outgoing = _.filter(
              this.objects[objIdx].outgoing,
              obj => !this.selectedObjects.has(obj.idx),
            );
          },
        );

        this.render.renderScene();
      });
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

    if (
      !this.grid[xIdx] || this.grid[xIdx][yIdx] === -1
      || this.grid[xIdx][yIdx] === undefined
    ) {
      return -1;
    }

    return this.grid[xIdx][yIdx];
  }

  getSelectedObjects(x0, y0, x1, y1) {
    const objects = this.render._getCached(
      CacheLabels.VisibleObjects(),
      () => {
        return this.render.getVisibleObjects(0, this.objects.length, false);
      },
    );

    return _.map(
      _.filter(objects, obj => {
        const coords = obj.getBounds();
        if (x0 > coords.x0 || coords.x0 > x1) return false;
        if (x0 > coords.x1 || coords.x1 > x1) return false;
        if (y0 > coords.y0 || coords.y0 > y1) return false;
        return !(y0 > coords.y1 || coords.y1 > y1)
      }),
      obj => obj.idx,
    );
  }

  build2DIndex() {
    this.ticksX = [];
    this.ticksY = [];

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
      this.grid[i] = new Array(this.ticksY.length).fill(-1);
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
    let ObjectClass = AbstractObject;
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

    this.updateObjectsStatus();

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
}

// - // - // - // - // - //

const scene = new Scene('canvas');

scene.camera.set(0, 0);

setTimeout(() => {
  scene.render.renderScene();
  scene.build2DIndex();
}, 0);
