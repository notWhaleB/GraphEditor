'use strict';

let randColor = () => {
  return `rgb(${_.random(32, 255)}, ${_.random(32, 255)}, ${_.random(32, 255)})`;
};

const randomObjects = () => {
  const objects = new Array(100000);

  for (let i = 0; i !== 100000; ++i) {
    switch (_.random(0, 2)) {
      case 0: {
        objects[i] = {
          type: DrawObject.RECTANGLE,
          color: randColor(),
          params: [
            _.random(5, 20000), _.random(5, 20000),
            _.random(10, 50), _.random(10, 50),
          ],
          children: _.map(
            _.range(_.random(0, 10) > 9),
            () => _.random(0, 9999),
          ),
        };
      } break;
      case 1: {
        const [sx, sy] = [_.random(20, 20000), _.random(20, 20000)];

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
            () => _.random(0, 9999),
          ),
        };
      } break;
      case 2: {
        const [cx, cy] = [];

        objects[i] = {
          type: DrawObject.CIRCLE,
          color: randColor(),
          params: [_.random(20, 20000), _.random(20, 20000), _.random(10, 30)],
          children: _.map(
            _.range(_.random(0, 10) > 9),
            () => _.random(0, 9999),
          ),
          label: _.random(0, 100) > 99 ? 'Label' : '',
        };
      } break;
    }
  }

  return objects;
};

window.randomObjects = randomObjects;
