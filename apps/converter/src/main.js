import JSZip from 'jszip'

// ─── Theme ────────────────────────────────────────────────────────────────
const html         = document.documentElement
const themeToggle  = document.getElementById('themeToggle')
const savedTheme   = localStorage.getItem('ngs-theme')
const systemDark   = window.matchMedia('(prefers-color-scheme: dark)').matches

html.setAttribute('data-theme', savedTheme || (systemDark ? 'dark' : 'light'))

themeToggle.addEventListener('click', () => {
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
  html.setAttribute('data-theme', next)
  localStorage.setItem('ngs-theme', next)
})

// ─── State ────────────────────────────────────────────────────────────────
/** @type {Map<number, {file:File, name:string, origSize:number, blob:Blob|null, webpSize:number|null, origDataUrl:string|null, dims:string|null, status:string}>} */
const files = new Map()
let nextId = 0

// ─── DOM ──────────────────────────────────────────────────────────────────
const dropZone       = document.getElementById('dropZone')
const fileInput      = document.getElementById('fileInput')
const dragOverlay    = document.getElementById('dragOverlay')
const workspace      = document.getElementById('workspace')
const addMoreBtn     = document.getElementById('addMoreBtn')
const qualitySlider  = document.getElementById('qualitySlider')
const qualityNum     = document.getElementById('qualityNum')
const convertAllBtn  = document.getElementById('convertAllBtn')
const downloadAllBtn = document.getElementById('downloadAllBtn')
const clearAllBtn    = document.getElementById('clearAllBtn')
const fileGrid       = document.getElementById('fileGrid')
const statFiles      = document.getElementById('statFiles')
const statConverted  = document.getElementById('statConverted')
const statSaved      = document.getElementById('statSaved')
const statRatio      = document.getElementById('statRatio')

// Toast container
const toastWrap = document.createElement('div')
toastWrap.className = 'ngs-toast-wrap'
document.body.appendChild(toastWrap)

// ─── Drag & Drop ──────────────────────────────────────────────────────────
let dragDepth = 0

document.addEventListener('dragenter', (e) => {
  e.preventDefault()
  dragDepth++
  dragOverlay.classList.add('active')
})
document.addEventListener('dragleave', () => {
  dragDepth--
  if (dragDepth <= 0) { dragDepth = 0; dragOverlay.classList.remove('active') }
})
document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => {
  e.preventDefault()
  dragDepth = 0
  dragOverlay.classList.remove('active')
  addFiles([...e.dataTransfer.files].filter(f => f.type === 'image/png'))
})

dropZone.addEventListener('click', () => fileInput.click())
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click() }
})
addMoreBtn.addEventListener('click', () => fileInput.click())

fileInput.addEventListener('change', () => {
  addFiles([...fileInput.files])
  fileInput.value = ''
})

// ─── Quality sync ─────────────────────────────────────────────────────────
qualitySlider.addEventListener('input', () => { qualityNum.value = qualitySlider.value })
qualityNum.addEventListener('input', () => {
  const v = Math.max(1, Math.min(100, parseInt(qualityNum.value) || 85))
  qualitySlider.value = v
  qualityNum.value = v
})
qualityNum.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') qualityNum.blur()
})

// ─── Keyboard shortcuts ───────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && files.size > 0) {
    if (confirm('Clear all files?')) clearAll()
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    convertAll()
  }
})

// ─── Buttons ──────────────────────────────────────────────────────────────
convertAllBtn.addEventListener('click', convertAll)
downloadAllBtn.addEventListener('click', downloadZip)
clearAllBtn.addEventListener('click', () => { if (confirm('Clear all files?')) clearAll() })

function clearAll() {
  files.clear()
  fileGrid.innerHTML = ''
  workspace.classList.add('hidden')
  downloadAllBtn.classList.add('ngs-btn--hidden')
  updateStats()
}

// ─── Add files ────────────────────────────────────────────────────────────
function addFiles(incoming) {
  if (!incoming.length) { toast('Only PNG files are accepted', 'error'); return }

  const pngs = incoming.filter(f => f.type === 'image/png')
  const skipped = incoming.length - pngs.length
  if (!pngs.length) { toast('No PNG files found', 'error'); return }
  if (skipped) toast(`${skipped} non-PNG file${skipped > 1 ? 's' : ''} skipped`, 'error')

  pngs.forEach((file, i) => {
    const id = nextId++
    files.set(id, {
      file, name: file.name, origSize: file.size,
      blob: null, webpSize: null, origDataUrl: null, dims: null, status: 'waiting'
    })
    renderCard(id, i * 45)
  })

  workspace.classList.remove('hidden')
  updateStats()
  toast(`${pngs.length} file${pngs.length > 1 ? 's' : ''} added`)
}

// ─── Convert single file ──────────────────────────────────────────────────
function convertFile(id) {
  const entry = files.get(id)
  if (!entry) return Promise.resolve()

  setStatus(id, 'converting')
  const quality = parseInt(qualitySlider.value) / 100

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(entry.file)

    img.onload = () => {
      entry.dims = `${img.naturalWidth} × ${img.naturalHeight}`
      const dimEl = document.getElementById(`ngs-dims-${id}`)
      if (dimEl) dimEl.textContent = entry.dims

      const canvas = document.createElement('canvas')
      canvas.width  = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      URL.revokeObjectURL(url)

      canvas.toBlob((blob) => {
        if (!blob) { setStatus(id, 'error'); resolve(); return }
        entry.blob    = blob
        entry.webpSize = blob.size
        setStatus(id, 'done')
        updateCardMeta(id)
        updateStats()

        // Init comparison slider
        if (entry.origDataUrl) {
          const webpUrl = URL.createObjectURL(blob)
          initComparison(document.getElementById(`ngs-preview-${id}`), entry.origDataUrl, webpUrl)
        }
        resolve()
      }, 'image/webp', quality)
    }

    img.onerror = () => { URL.revokeObjectURL(url); setStatus(id, 'error'); resolve() }
    img.src = url
  })
}

// ─── Convert all ──────────────────────────────────────────────────────────
async function convertAll() {
  if (convertAllBtn.disabled) return

  // Reset done cards so user can re-convert with new quality
  for (const [id, entry] of files) {
    if (entry.status === 'done') {
      entry.status   = 'waiting'
      entry.blob     = null
      entry.webpSize = null
    }
  }

  convertAllBtn.disabled = true
  convertAllBtn.innerHTML = '<span class="ngs-spinner"></span> Converting…'

  const pending = [...files.entries()].filter(([, e]) => e.status !== 'done')
  for (const [id] of pending) {
    await convertFile(id)
  }

  convertAllBtn.disabled = false
  convertAllBtn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M1.5 7.5h12M9 3l4.5 4.5L9 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Convert All`

  const doneCount = [...files.values()].filter(e => e.status === 'done').length
  if (doneCount > 0) {
    downloadAllBtn.classList.remove('ngs-btn--hidden')
    toast(`${doneCount} file${doneCount > 1 ? 's' : ''} converted`, 'success')
  }
}

// ─── Download ZIP ─────────────────────────────────────────────────────────
async function downloadZip() {
  if (downloadAllBtn.disabled) return
  downloadAllBtn.disabled = true
  downloadAllBtn.innerHTML = '<span class="ngs-spinner"></span> Packing…'

  const zip    = new JSZip()
  const folder = zip.folder('ngs-webp-exports')

  for (const [, entry] of files) {
    if (entry.blob) {
      folder.file(entry.name.replace(/\.png$/i, '.webp'), entry.blob)
    }
  }

  const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(content)
  a.download = 'ngs-webp-exports.zip'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 15000)

  downloadAllBtn.disabled = false
  downloadAllBtn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 10L3 5.5 4.4 4.1 6.5 6.2V1h2v5.2l2.1-2.1L12 5.5 7.5 10zM2 11.5h11v2H2z" fill="currentColor"/>
    </svg>
    Download ZIP`
  toast('ZIP download started', 'success')
}

// ─── Render card ──────────────────────────────────────────────────────────
function renderCard(id, animDelay = 0) {
  const entry = files.get(id)
  const card  = document.createElement('div')
  card.className  = 'ngs-card'
  card.id         = `ngs-card-${id}`
  card.style.animationDelay = `${Math.min(animDelay, 400)}ms`

  card.innerHTML = `
    <div class="ngs-card__preview" id="ngs-preview-${id}">
      <div class="ngs-card__placeholder">🖼</div>
      <span class="ngs-card__badge ngs-badge--waiting" id="ngs-badge-${id}">Waiting</span>
    </div>
    <div class="ngs-card__body">
      <div class="ngs-card__name" title="${esc(entry.name)}">${esc(entry.name)}</div>
      <div class="ngs-card__meta">
        <div class="ngs-meta">
          <span class="ngs-meta__l">Original</span>
          <span class="ngs-meta__v">${fmt(entry.origSize)}</span>
        </div>
        <div class="ngs-meta ngs-meta--webp">
          <span class="ngs-meta__l">WebP</span>
          <span class="ngs-meta__v" id="ngs-webp-${id}">—</span>
        </div>
        <div class="ngs-meta">
          <span class="ngs-meta__l">Dimensions</span>
          <span class="ngs-meta__v" id="ngs-dims-${id}">—</span>
        </div>
        <div class="ngs-meta ngs-meta--savings">
          <span class="ngs-meta__l">Savings</span>
          <span class="ngs-meta__v" id="ngs-saved-${id}">—</span>
        </div>
      </div>
      <div class="ngs-card__bar">
        <div class="ngs-card__bar-fill" id="ngs-bar-${id}"></div>
      </div>
      <div class="ngs-card__foot">
        <button
          class="ngs-btn ngs-card__dl"
          id="ngs-dl-${id}"
          disabled
          onclick="window.__ngsDownload(${id})"
        >
          ↓ Download .webp
        </button>
      </div>
    </div>`

  fileGrid.prepend(card)

  // Load thumbnail as data URL (needed for comparison)
  const reader = new FileReader()
  reader.onload = (e) => {
    entry.origDataUrl = e.target.result
    const preview = document.getElementById(`ngs-preview-${id}`)
    if (!preview) return
    const badge = preview.querySelector('.ngs-card__badge')
    preview.innerHTML = ''
    const img = document.createElement('img')
    img.className = 'ngs-card__thumb'
    img.src = entry.origDataUrl
    img.alt = entry.name
    preview.appendChild(img)
    if (badge) preview.appendChild(badge)
  }
  reader.readAsDataURL(entry.file)
}

// ─── Set card status ──────────────────────────────────────────────────────
function setStatus(id, status) {
  const entry = files.get(id)
  if (!entry) return
  entry.status = status

  const card  = document.getElementById(`ngs-card-${id}`)
  const badge = document.getElementById(`ngs-badge-${id}`)
  const bar   = document.getElementById(`ngs-bar-${id}`)
  const dlBtn = document.getElementById(`ngs-dl-${id}`)
  if (!card) return

  card.className = `ngs-card${status === 'done' ? ' ngs-card--done' : status === 'error' ? ' ngs-card--error' : ''}`

  if (badge) {
    badge.className = `ngs-card__badge ngs-badge--${status}`
    badge.textContent = status[0].toUpperCase() + status.slice(1)
  }

  if (bar) {
    if (status === 'converting') bar.style.width = '60%'
    else if (status === 'done')  bar.style.width = '100%'
    else                         bar.style.width = '0%'
  }

  if (dlBtn) dlBtn.disabled = status !== 'done'
}

// ─── Update card meta ─────────────────────────────────────────────────────
function updateCardMeta(id) {
  const entry = files.get(id)
  if (!entry?.webpSize) return

  const webpEl  = document.getElementById(`ngs-webp-${id}`)
  const savedEl = document.getElementById(`ngs-saved-${id}`)
  if (webpEl) webpEl.textContent = fmt(entry.webpSize)
  if (savedEl) {
    const pct = Math.round((1 - entry.webpSize / entry.origSize) * 100)
    savedEl.textContent = pct > 0 ? `${pct}%` : `${Math.abs(pct)}% larger`
    if (pct <= 0) savedEl.closest('.ngs-meta').classList.remove('ngs-meta--savings')
  }
}

// ─── Comparison Slider ────────────────────────────────────────────────────
function initComparison(previewEl, origSrc, webpSrc) {
  if (!previewEl) return
  const badge = previewEl.querySelector('.ngs-card__badge')

  previewEl.innerHTML = `
    <div class="ngs-cmp">
      <img class="ngs-cmp__after"  src="${webpSrc}" alt="WebP" draggable="false">
      <img class="ngs-cmp__before" src="${origSrc}" alt="PNG"  draggable="false" style="clip-path:inset(0 50% 0 0)">
      <div class="ngs-cmp__line"   style="left:50%"></div>
      <div class="ngs-cmp__knob"   style="left:50%">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="#333">
          <path d="M6 4L2 9l4 5V4zM12 4v10l4-5-4-5z"/>
        </svg>
      </div>
      <div class="ngs-cmp__labels">
        <span class="ngs-cmp__label ngs-cmp__label--before">PNG</span>
        <span class="ngs-cmp__label ngs-cmp__label--after">WebP</span>
      </div>
    </div>`

  if (badge) previewEl.appendChild(badge)

  const cmp      = previewEl.querySelector('.ngs-cmp')
  const before   = cmp.querySelector('.ngs-cmp__before')
  const line     = cmp.querySelector('.ngs-cmp__line')
  const knob     = cmp.querySelector('.ngs-cmp__knob')
  let dragging   = false
  let pos        = 50

  function applyPos(p) {
    pos = Math.max(2, Math.min(98, p))
    before.style.clipPath = `inset(0 ${100 - pos}% 0 0)`
    line.style.left  = `${pos}%`
    knob.style.left  = `${pos}%`
  }

  function clientToPos(clientX) {
    const r = cmp.getBoundingClientRect()
    return ((clientX - r.left) / r.width) * 100
  }

  cmp.addEventListener('mousedown',  (e) => { dragging = true; applyPos(clientToPos(e.clientX)); e.preventDefault() })
  window.addEventListener('mousemove', (e) => { if (dragging) applyPos(clientToPos(e.clientX)) })
  window.addEventListener('mouseup',   ()  => { dragging = false })

  cmp.addEventListener('touchstart',  (e) => { dragging = true; applyPos(clientToPos(e.touches[0].clientX)) }, { passive: true })
  window.addEventListener('touchmove', (e) => { if (dragging) applyPos(clientToPos(e.touches[0].clientX)) }, { passive: true })
  window.addEventListener('touchend',  ()  => { dragging = false })

  // Entrance animation: sweep from full PNG → 50/50
  let a = 98
  const sweep = () => {
    if (a > 50) { a -= 3; applyPos(a); requestAnimationFrame(sweep) }
  }
  requestAnimationFrame(sweep)
}

// ─── Update stats bar ────────────────────────────────────────────────────
function updateStats() {
  const total    = files.size
  const done     = [...files.values()].filter(e => e.status === 'done')
  const origSum  = done.reduce((s, e) => s + e.origSize, 0)
  const webpSum  = done.reduce((s, e) => s + (e.webpSize || 0), 0)
  const saved    = origSum - webpSum
  const avgRatio = origSum > 0 ? Math.round((1 - webpSum / origSum) * 100) : null

  statFiles.textContent     = total
  statConverted.textContent = done.length
  statSaved.textContent     = saved > 0 ? fmt(saved) : '—'
  statRatio.textContent     = avgRatio && avgRatio > 0 ? `${avgRatio}%` : '—'
}

// ─── Single file download ─────────────────────────────────────────────────
window.__ngsDownload = (id) => {
  const entry = files.get(id)
  if (!entry?.blob) return
  const a = document.createElement('a')
  a.href = URL.createObjectURL(entry.blob)
  a.download = entry.name.replace(/\.png$/i, '.webp')
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 15000)
  toast(`Downloading ${a.download}`, 'success')
}

// ─── Toast ────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.createElement('div')
  el.className = `ngs-toast${type ? ` ngs-toast--${type}` : ''}`
  el.textContent = msg
  toastWrap.appendChild(el)
  // auto-remove after animation
  el.addEventListener('animationend', (e) => {
    if (e.animationName === 'toastOut') el.remove()
  })
  // Fallback remove
  setTimeout(() => el.remove(), 3200)
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function fmt(bytes) {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1048576)     return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(2)} MB`
}

function esc(s) {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
