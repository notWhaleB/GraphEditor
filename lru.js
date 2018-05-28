'use strict';

class LinkedList {
  constructor() {
    this._front = null;
    this._back = null;
  }

  _initElem(newElem) {
    newElem._ll = this;
    return newElem;
  }

  discard(elem) {
    if (elem.left) {
      elem.left.right = elem.right;
    } else {
      this._front = elem.right;
    }

    if (elem.right) {
      elem.right.left = elem.left;
    } else {
      this._back = elem.left;
    }

    return elem;
  }

  pushFront(newElem) {
    const elem = this._initElem(newElem);

    elem.left = null;

    if (this._front !== null) {
      this._front.left = elem;
      elem.right = this._front;
    }

    this._front = elem;

    if (this._back === null) {
      this._back = elem;
    }

    return elem;
  }

  moveToFront(elem) {
    return this.pushFront(
      this.discard(elem),
    );
  }

  get front() {
    return this._front;
  }

  get back() {
    return this._back;
  }
}

class LRUCache extends LinkedList {
  constructor(limit=2048) {
    super();

    this._map = new Map();
    this._limit = limit;
  }

  _initElem(newElem) {
    newElem._lru = this;
    super._initElem(newElem);

    return newElem;
  };

  _remove(elem) {
    this._map.delete(elem.key);
    delete this.discard(elem);

    if (this._front === undefined) {
      this._front = null;
    }

    if (this._back === undefined) {
      this._back = null;
    }
  };

  _clear() {
    _.forEach(
      Array.from(this._map.keys()),
      key => this.invalidate(key),
    );
  }

  get(key) {
    const elem = this._map.get(key);

    if (elem !== undefined) {
      return this.moveToFront(elem).value;
    }
  }

  has(key) {
    return this._map.has(key);
  }

  set(key, value) {
    this.pushFront({
      key: key,
      value: value,
    });

    this._map.set(key, this.front);

    if (this._map.size > this._limit) {
      this._remove(this.back)
    }

    return this.front;
  }

  invalidate(key) {
    const elem = this._map.get(key);
    if (elem === undefined) return;

    this._remove(elem);
  }
}

window.LRUCache = LRUCache;
