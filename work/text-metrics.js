// Older Android WebViews expose text width but omit the glyph's vertical bounds.
var clockMeasureText = (function () {
  var cache = new Map(), probe = null;
  function clearCache() { cache.clear(); }
  function measure(ctx, text) {
    text = String(text);
    var native = ctx.measureText(text);
    if (Number.isFinite(native.actualBoundingBoxAscent) && Number.isFinite(native.actualBoundingBoxDescent)) return native;
    var key = ctx.font + '\n' + text, bounds = cache.get(key);
    if (!bounds) {
      var match = /([\d.]+)px\b/.exec(ctx.font), size = match ? Number(match[1]) : 10;
      if (!Number.isFinite(size) || size <= 0) size = 10;
      // ponytail: scan at most 512 px, then scale only the measurements; visible glyphs keep their full resolution.
      // The probe is temporary, and the bounded cache retains numbers, never pixel buffers or canvases.
      var scale = Math.min(1, 512 / size), scanSize = size * scale, padding = Math.ceil(scanSize / 2) + 2;
      probe = probe || document.createElement('canvas');
      probe.width = Math.max(1, Math.ceil(native.width * scale) + padding * 2);
      probe.height = Math.ceil(scanSize * 2.5) + 4;
      var scan = probe.getContext('2d', {willReadFrequently:true});
      scan.font = ctx.font.replace(/([\d.]+)px\b/, String(scanSize) + 'px');
      scan.textAlign = 'left'; scan.textBaseline = 'alphabetic'; scan.fillStyle = '#fff';
      var baseline = Math.ceil(scanSize * 1.5) + 2;
      scan.fillText(text, padding, baseline);
      var width = probe.width, pixels = scan.getImageData(0, 0, width, probe.height).data, top = -1, bottom = -1;
      for (var i = 3; i < pixels.length; i += 4) if (pixels[i]) { top = Math.floor(i / 4 / width); break; }
      if (top >= 0) for (var j = pixels.length - 1; j >= 3; j -= 4) if (pixels[j]) { bottom = Math.floor(j / 4 / width); break; }
      bounds = {actualBoundingBoxAscent:top < 0 ? 0 : (baseline - top) / scale, actualBoundingBoxDescent:bottom < 0 ? 0 : (bottom + 1 - baseline) / scale};
      probe.width = probe.height = 0;
      cache.set(key, bounds);
      if (cache.size > 128) cache.delete(cache.keys().next().value);
    }
    return {width:native.width, actualBoundingBoxAscent:bounds.actualBoundingBoxAscent, actualBoundingBoxDescent:bounds.actualBoundingBoxDescent};
  }
  measure.clearCache = clearCache;
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', clearCache);
  return measure;
}());
