'use strict';

const _cartesianProduct = (a, b) => [].concat(...a.map(d => b.map(e => [].concat(d, e))));
const cartesianProduct = (a, b, ...c) => (b ? cartesianProduct(_cartesianProduct(a, b), ...c) : a);

const Util = {
  cartesianProduct: cartesianProduct,
};

window.Util = Util;
