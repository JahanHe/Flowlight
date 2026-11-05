/* TV-only compatibility for the Chrome 66 build target. No runtime package is loaded. */
(function () {
  'use strict';
  var diagnostics = window.clockTVDiagnostics || (window.clockTVDiagnostics = {stage:'compatibility', reason:'', firstError:''});
  diagnostics.stage = 'compatibility';
  function method(target, name, value) {
    if (!target[name]) Object.defineProperty(target, name, {value:value, configurable:true, writable:true});
  }
  method(Object, 'hasOwn', function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); });
  method(Object, 'fromEntries', function (entries) {
    var result = {}, iterator = entries[Symbol.iterator](), step;
    while (!(step = iterator.next()).done) {
      var pair = step.value;
      if (pair === null || (typeof pair !== 'object' && typeof pair !== 'function')) throw new TypeError('Entry must be an object');
      Object.defineProperty(result, pair[0], {value:pair[1], enumerable:true, configurable:true, writable:true});
    }
    return result;
  });
  [Element.prototype, Document.prototype, DocumentFragment.prototype].forEach(function (prototype) {
    method(prototype, 'replaceChildren', function () {
      var fragment = document.createDocumentFragment();
      for (var i = 0; i < arguments.length; i++) fragment.appendChild(arguments[i] instanceof Node ? arguments[i] : document.createTextNode(String(arguments[i])));
      while (this.firstChild) this.removeChild(this.firstChild);
      this.appendChild(fragment);
    });
  });
  if (window.MediaQueryList) {
    method(MediaQueryList.prototype, 'addEventListener', function (type, listener) { if (type === 'change') this.addListener(listener); });
    method(MediaQueryList.prototype, 'removeEventListener', function (type, listener) { if (type === 'change') this.removeListener(listener); });
  }
  // ponytail: older engines require a system WebView update, not a bundled second browser on a 1 GB TV.
  var version = /(?:Chrome|Chromium)\/(\d+)/.exec(navigator.userAgent);
  var canvas = null;
  try { canvas = document.createElement('canvas').getContext('2d'); } catch (error) {}
  var missing = [];
  if (version && Number(version[1]) < 66) missing.push('网页内核 ' + version[1] + '，当前版本需要 66 或以上');
  if (!canvas) missing.push('Canvas 2D');
  if (!window.fetch) missing.push('fetch');
  if (!window.AbortController) missing.push('AbortController');
  var incompatible = missing.length > 0;
  diagnostics.reason = missing.join('；');
  diagnostics.stage = incompatible ? 'unsupported' : 'compatible';
  window.clockTVIncompatible = Boolean(incompatible);
  function explain() {
    if (document.getElementById('tv-compat-error')) return;
    var panel = document.createElement('div'), heading = document.createElement('h1'), text = document.createElement('p');
    panel.id = 'tv-compat-error'; panel.setAttribute('role', 'alert');
    panel.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:9999;background:#080b12;color:#edf4ff;padding:12vh 10vw;font:22px/1.8 sans-serif';
    heading.textContent = incompatible ? '请先更新电视的网页组件' : '时钟没有完成加载';
    text.textContent = incompatible ? '检测到：' + diagnostics.reason + '。此版本需要 WebView 66 或以上。请保留这页的检测信息，用于适配该电视；反复重新打开不会更新组件。按遥控器返回键退出。' : '启动阶段：' + diagnostics.stage + '。' + (diagnostics.firstError || '页面未完成初始化，请保留这页的检测信息。');
    panel.appendChild(heading); panel.appendChild(text); document.body.appendChild(panel);
  }
  if (incompatible) {
    if (document.body) explain(); else document.addEventListener('DOMContentLoaded', explain);
  } else setTimeout(function () { if (!window.clockTVReady) explain(); }, 20000);
}());
