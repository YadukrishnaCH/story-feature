(function () {
  var KEY = 'stories.v1';
  var TTL = 24 * 60 * 60 * 1000; // 24 hours
  var DUR = 5000;                // 5 seconds per story
  var MAXW = 1080, MAXH = 1920;  // max image size

  var strip = document.getElementById('strip');
  var empty = document.getElementById('empty');
  var fileIn = document.getElementById('file');
  var viewer = document.getElementById('viewer');
  var stage = document.getElementById('stage');
  var pic = document.getElementById('pic');
  var bars = document.getElementById('bars');
  var ageEl = document.getElementById('age');
  var toastEl = document.getElementById('toast');

  var stories = [], seen = {}, cur = 0, t0 = 0, paused = false, pausedAt = 0, raf = 0;

  // ---------- storage ----------
  function load() {
    try { stories = JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (e) { stories = []; }
    if (!Array.isArray(stories)) stories = [];
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(stories)); return true; }
    catch (e) { return false; } // usually quota exceeded
  }
  function prune() {
    var now = Date.now(), n = stories.length;
    stories = stories.filter(function (s) { return now - s.createdAt < TTL; });
    if (stories.length !== n) { save(); return true; }
    return false;
  }

  // ---------- helpers ----------
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { toastEl.classList.remove('on'); }, 2800);
  }
  function left(s) {
    var ms = Math.max(0, TTL - (Date.now() - s.createdAt));
    var h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4);
    return h > 0 ? h + 'h left' : m + 'm left';
  }
  function ago(s) {
    var ms = Date.now() - s.createdAt;
    var h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4);
    return h > 0 ? h + 'h ago' : (m < 1 ? 'Just now' : m + 'm ago');
  }

  // ---------- story list ----------
  function render() {
    strip.innerHTML = '';

    var add = document.createElement('button');
    add.className = 'item add';
    add.setAttribute('aria-label', 'Add story');
    add.innerHTML = '<span class="ring">+</span><span class="lbl">Add story</span>';
    add.onclick = function () { fileIn.click(); };
    strip.appendChild(add);

    stories.forEach(function (s, i) {
      var b = document.createElement('button');
      b.className = 'item';
      b.setAttribute('role', 'listitem');
      b.setAttribute('aria-label', 'Open story ' + (i + 1));
      b.innerHTML = '<span class="ring' + (seen[s.id] ? ' seen' : '') + '"><img alt=""></span><span class="lbl"></span>';
      b.querySelector('img').src = s.src;
      b.querySelector('.lbl').textContent = left(s);
      b.onclick = function () { openViewer(i); };
      strip.appendChild(b);
    });

    empty.hidden = stories.length > 0;
  }

  // ---------- upload: resize to max 1080x1920 and convert to base64 ----------
  function toBase64(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var r = Math.min(1, MAXW / w, MAXH / h); // never upscale
        var cw = Math.round(w * r), ch = Math.round(h * r);
        var c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        var x = c.getContext('2d');
        x.fillStyle = '#000'; x.fillRect(0, 0, cw, ch);
        x.drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('bad image')); };
      img.src = url;
    });
  }

  fileIn.onchange = function () {
    var f = fileIn.files[0];
    fileIn.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast('Please choose an image file.'); return; }
    toBase64(f).then(function (src) {
      stories.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        src: src,
        createdAt: Date.now()
      });
      if (!save()) { stories.pop(); toast('Storage is full. Delete an older story and try again.'); return; }
      render();
      toast('Story added. It will expire in 24 hours.');
    }).catch(function () { toast('Could not read that image.'); });
  };

  // ---------- viewer ----------
  function buildBars() {
    bars.innerHTML = '';
    stories.forEach(function () {
      var d = document.createElement('div');
      d.className = 'bar';
      d.innerHTML = '<i></i>';
      bars.appendChild(d);
    });
  }
  function show(i) {
    if (i < 0) i = 0;
    if (i >= stories.length) { closeViewer(); return; }
    cur = i;
    var s = stories[i];
    seen[s.id] = 1;
    pic.src = s.src;
    ageEl.textContent = ago(s) + ' \u00b7 ' + left(s);
    var bs = bars.children;
    for (var k = 0; k < bs.length; k++) bs[k].firstChild.style.width = k < i ? '100%' : '0';
    t0 = performance.now();
    paused = false;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    if (!viewer.classList.contains('open')) return;
    if (prune()) { // a story expired while viewing
      if (!stories.length) { closeViewer(); return; }
      buildBars();
      show(Math.min(cur, stories.length - 1));
      return;
    }
    if (!paused) {
      var p = Math.min(1, (now - t0) / DUR);
      bars.children[cur].firstChild.style.width = (p * 100) + '%';
      if (p >= 1) { show(cur + 1); return; }
    }
    raf = requestAnimationFrame(tick);
  }
  function openViewer(i) {
    buildBars();
    viewer.classList.add('open');
    document.body.style.overflow = 'hidden';
    show(i);
  }
  function closeViewer() {
    viewer.classList.remove('open');
    document.body.style.overflow = '';
    cancelAnimationFrame(raf);
    render();
  }
  function pause() { if (!paused) { paused = true; pausedAt = performance.now(); } }
  function resume() { if (paused) { t0 += performance.now() - pausedAt; paused = false; } }

  // swipe / tap / hold
  var sx = 0, sy = 0, st = 0;
  stage.addEventListener('pointerdown', function (e) {
    if (e.target.closest('button')) return;
    sx = e.clientX; sy = e.clientY; st = Date.now();
    pause();
  });
  stage.addEventListener('pointerup', function (e) {
    if (e.target.closest('button')) return;
    resume();
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      show(dx < 0 ? cur + 1 : cur - 1);          // swipe left = next, right = previous
    } else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) {
      closeViewer();                              // swipe down = close
    } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && Date.now() - st < 300) {
      var r = stage.getBoundingClientRect();      // tap left third = previous, else next
      show((e.clientX - r.left) < r.width / 3 ? cur - 1 : cur + 1);
    }
  });
  stage.addEventListener('pointercancel', resume);

  document.getElementById('close').onclick = closeViewer;
  document.getElementById('del').onclick = function () {
    stories.splice(cur, 1);
    save();
    if (!stories.length) { closeViewer(); return; }
    buildBars();
    show(Math.min(cur, stories.length - 1));
  };
  document.addEventListener('keydown', function (e) {
    if (!viewer.classList.contains('open')) return;
    if (e.key === 'Escape') closeViewer();
    else if (e.key === 'ArrowRight') show(cur + 1);
    else if (e.key === 'ArrowLeft') show(cur - 1);
  });

  // ---------- init + expiry checks ----------
  load();
  prune();
  render();
  setInterval(function () {
    if (prune() || !viewer.classList.contains('open')) render();
  }, 30000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { prune(); render(); }
  });
})();
