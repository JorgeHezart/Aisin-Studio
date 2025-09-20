Vue.config.devtools = true;

Vue.component("card", {
  template: `
    <div class="card-wrap"
      @mousemove="handleMouseMove"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
      ref="card">
      <div class="card"
        :style="cardStyle">
        <div class="card-bg" :style="[cardBgTransform, cardBgImage]"></div>
        <!-- Botón de Play centrado sobre la card (visible en hover) -->
        <button v-if="gifImage" class="play-btn" type="button" @click.stop="toggleGif" :title="isGif ? 'Detener' : 'Reproducir'">
          <img class="play-icon" src="assets/icons/playvideo_card.svg" alt="Play" />
        </button>
        <!-- Overlay de bloqueo por encima de la card -->
        <div v-if="!unlocked" class="lock-overlay">
          <img class="lock-icon" src="assets/icons/lock_card.svg" alt="Bloqueado" />
        </div>
        <div class="card-info">
          <slot name="header"></slot>
          <slot name="content"></slot>
        </div>
      </div>
    </div>`,
  mounted() {
    this.width = this.$refs.card.offsetWidth;
    this.height = this.$refs.card.offsetHeight;
    // Si ya nos pasan un GIF verificado, úsalo como resuelto para alternar al instante
    if (this.gifImage) this.gifResolved = this.gifImage;
  },
  props: ["dataImage", "gifImage", "unlocked"],
  data: () => ({
    width: 0,
    height: 0,
    mouseX: 0,
    mouseY: 0,
    mouseLeaveDelay: null,
    isGif: false,
    gifResolved: "" // URL del GIF validado por precarga
  }),
  computed: {
    mousePX() {
      return this.mouseX / this.width;
    },
    mousePY() {
      return this.mouseY / this.height;
    },
    cardStyle() {
      const rX = this.mousePX * 30;
      const rY = this.mousePY * -30;
      return {
        transform: `rotateY(${rX}deg) rotateX(${rY}deg)`
      };
    },
    cardBgTransform() {
      const tX = this.mousePX * -40;
      const tY = this.mousePY * -40;
      return {
        transform: `translateX(${tX}px) translateY(${tY}px)`
      };
    },
    cardBgImage() {
      // Cuando isGif está activo, usa la URL validada (gifResolved) o el prop de fallback
      const img = this.isGif ? (this.gifResolved || this.gifImage) : this.dataImage;
      return {
        backgroundImage: `url("${img}")`
      };
    }
  },
  methods: {
    toggleGif() {
      // Alterna instantáneamente si hay GIF verificado
      if (!this.gifImage) return; // si no hay GIF disponible, nada que hacer
      // Asegura que gifResolved tenga algún valor utilizable
      if (!this.gifResolved) this.gifResolved = this.gifImage;
      this.isGif = !this.isGif;
    },
    handleMouseMove(e) {
      this.mouseX = e.pageX - this.$refs.card.offsetLeft - this.width / 2;
      this.mouseY = e.pageY - this.$refs.card.offsetTop - this.height / 2;
    },
    handleMouseEnter() {
      clearTimeout(this.mouseLeaveDelay);
    },
    handleMouseLeave() {
      this.mouseLeaveDelay = setTimeout(() => {
        this.mouseX = 0;
        this.mouseY = 0;
      }, 1000);
    }
  }
});

const app = new Vue({
  el: "#app",
  data: () => ({
    cards: [],
    error: "",
    showModal: false,
    activeCard: {},
    gallery: [],
    // Búsqueda
    searchQuery: "",
    // Prompt de desbloqueo
    showUnlockPrompt: false,
    unlockFor: null,
    unlockInput: "",
    // Control para auto-desbloqueo basado en archivos .txt (desactivado por defecto)
    enableTxtAutoUnlock: false,
    // Image viewer
    showImageViewer: false,
    currentImageIndex: 0,
    imageZoom: 1,
    imagePanX: 0,
    imagePanY: 0,
    isPanning: false,
    lastPanX: 0,
    lastPanY: 0,
    // Mapa id -> code para validar por card
    codesMap: {}
  }),
  computed: {
    currentViewerImage() {
      return this.gallery[this.currentImageIndex] || {};
    },
    filteredCards() {
      const q = (this.searchQuery || "").trim().toLowerCase();
      if (!q) return this.cards;
      return this.cards.filter(c => String(c.name || "").toLowerCase().includes(q));
    }
  },
  created() {
    // Leer flag de URL para permitir auto-desbloqueo desde codes_txt si se desea
    try {
      const params = new URLSearchParams(window.location.search);
      const val = (params.get('autoUnlock') || '').toString().toLowerCase();
      this.enableTxtAutoUnlock = val === '1' || val === 'true' || val === 'yes';
    } catch (_) { /* noop */ }
    // Cargar los códigos legibles para validación por card
    this.loadCodes();
    // Carga el manifest con múltiples rutas para compatibilidad
    this.loadManifest();
  },
  methods: {
    async loadCodes() {
      try {
        const r = await fetch('assets/codes.plain.json', { cache: 'no-store' });
        if (!r.ok) return;
        const arr = await r.json();
        if (!Array.isArray(arr)) return;
        const map = {};
        arr.forEach(row => {
          if (!row || typeof row !== 'object') return;
          const id = String(row.id || '').trim();
          const code = typeof row.code === 'string' ? row.code.trim() : '';
          if (id && code) map[id] = code;
        });
        this.codesMap = map;
      } catch (_) {
        // Ignorar si no existe el archivo
      }
    },
    async loadManifest() {
      try {
        // Intentar cargar desde diferentes rutas para compatibilidad
        let manifestData;
        const possiblePaths = [
          './assets/manifest.json',
          'assets/manifest.json',
          '/assets/manifest.json'
        ];
        
        for (const path of possiblePaths) {
          try {
            const response = await fetch(path, { cache: 'no-store' });
            if (response.ok) {
              manifestData = await response.json();
              console.log(`Manifest cargado desde: ${path}`);
              break;
            }
          } catch (e) {
            console.warn(`No se pudo cargar desde ${path}:`, e.message);
          }
        }
        
        if (!manifestData) {
          throw new Error('No se pudo cargar el manifest desde ninguna ruta');
        }
        
        if (!Array.isArray(manifestData)) {
          throw new Error('Manifest inválido - no es un array');
        }
        
        // Normalizar rutas para GitHub Pages
        const basePath = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
          ? './' 
          : './';
          
        // Normaliza rutas: usa / y codifica espacios/caracteres
        const norm = (p) => {
          if (!p) return p;
          const withSlash = p.replace(/\\\\/g, '/');
          // encodeURI mantiene / sin codificar pero escapa espacios y otros
          return encodeURI(withSlash);
        };
        
        this.cards = manifestData
          .filter(it => it && it.file)
          .map(it => ({
            ...it,
            file: norm(it.file),
            // Preparar propiedades reactivas para GIF
            gifCandidate: this.gifPath(norm(it.file)), // ruta tentativa
            gifFile: "", // se llenará si se verifica que existe
            patreon: "https://www.patreon.com/example", // Test patreon link to make button visible
            unlocked: false
          }));
          
        console.log(`${this.cards.length} cards cargadas correctamente`);
        
        // Pre-carga y verificación de GIFs por cada card
        this.preloadGifs();
        // Revisar si existe codes_txt/<Nombre>.txt para auto-desbloquear (sólo si está habilitado)
        if (this.enableTxtAutoUnlock) this.markUnlockedFromTxt();
        
      } catch (error) {
        console.error("Error cargando manifest:", error);
        this.error = `Error cargando contenido: ${error.message}`;
        
        // Fallback: mostrar cards de ejemplo para debugging
        this.cards = [
          {
            id: 'debug-1',
            name: "Card de prueba",
            scene: "Escena de prueba",
            photos: 10,
            videos: 5,
            file: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='320'%3E%3Crect width='100%25' height='100%25' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' fill='white'%3ECard de prueba%3C/text%3E%3C/svg%3E",
            gifFile: null,
            patreon: null,
            unlocked: true
          }
        ];
        console.log('Usando card de fallback para debugging');
      }
    },
    markUnlockedFromTxt() {
      const tasks = this.cards.map(async (c) => {
        const url = `codes_txt/${encodeURIComponent(c.name)}.txt`;
        try {
          const res = await fetch(url, { cache: 'no-store' });
          if (res.ok) c.unlocked = true;
        } catch (e) {
          // ignorar 404/errores
        }
      });
      Promise.allSettled(tasks);
    },
    // Intercepta el click en la card para pedir código
    onCardClick(item, e) {
      e && e.preventDefault && e.preventDefault();
      if (item && item.unlocked) {
        this.openModal(item);
        return;
      }
      this.unlockFor = item;
      this.unlockInput = "";
      this.showUnlockPrompt = true;
    },
    validateUnlock() {
      // Validar contra el código específico de la card seleccionada
      const input = String(this.unlockInput || "").trim();
      if (!input) return;
      const target = this.unlockFor;
      if (!target) return;
      const expected = this.codesMap[target.id] || '';
      if (!expected || expected.toUpperCase() !== input.toUpperCase()) {
        this.error = 'Código inválido para esta card';
        return;
      }
      // Correcto: desbloquear solo esta card y abrir modal
      target.unlocked = true;
      this.error = '';
      this.showUnlockPrompt = false;
      this.unlockFor = null;
      this.unlockInput = "";
      this.openModal(target);
    },
    cancelUnlock() {
      this.showUnlockPrompt = false;
      this.unlockFor = null;
      this.unlockInput = "";
    },
    // Genera la ruta del GIF a partir del path de la imagen
    gifPath(filePath) {
      if (!filePath) return '';
      try {
        // Quita extensión y cambia carpeta a assets/gif
        const noQuery = filePath.split('?')[0];
        const lastSlash = noQuery.lastIndexOf('/');
        const dir = noQuery.substring(0, lastSlash);
        const base = noQuery.substring(lastSlash + 1);
        const baseNoExt = base.replace(/\.[^.]+$/, '');
        // Preferir carpeta 'gifs' (plural) y extensión .gif
        const gif = `assets/gifs/${baseNoExt}.gif`;
        return encodeURI(gif);
      } catch (e) {
        return '';
      }
    },
    // Verifica qué GIFs existen realmente y los precarga para alternar sin delay
    preloadGifs() {
      const tryCandidates = (c) => {
        if (!c.gifCandidate) return;
        const raw = decodeURI(c.gifCandidate); // variante sin codificar (espacios)
        const enc = encodeURI(raw); // aseguramos versión codificada
        // Variante con brackets codificados
        const bracketEnc = enc
          .replace(/\[/g, '%5B')
          .replace(/\]/g, '%5D');
        const withSingular = (p) => p.replace('/gifs/', '/gif/');
        const withUpperExt = (p) => p.replace(/\.gif$/i, '.GIF');

        const set = new Set([
          enc,
          withUpperExt(enc),
          withSingular(enc),
          withUpperExt(withSingular(enc)),
          raw,
          withUpperExt(raw),
          withSingular(raw),
          withUpperExt(withSingular(raw)),
          bracketEnc,
          withUpperExt(bracketEnc),
          withSingular(bracketEnc),
          withUpperExt(withSingular(bracketEnc))
        ]);
        const candidates = Array.from(set);

        const tryLoad = (idx = 0) => {
          if (idx >= candidates.length) return; // no encontrado
          const url = candidates[idx];
          const img = new Image();
          img.onload = () => {
            c.gifFile = url; // marca como disponible
            console.info('[GIF OK]', c.name || c.id || c.file, '→', url);
          };
          img.onerror = () => {
            if (idx === candidates.length - 1 && !c.gifFile) {
              console.warn('[GIF NO ENCONTRADO]', c.name || c.id || c.file, 'probados:', candidates);
            }
            tryLoad(idx + 1);
          };
          img.src = url;
        };
        tryLoad(0);
      };
      this.cards.forEach(tryCandidates);
    },
    
    // Modal methods
    openModal(item) {
      this.activeCard = item;
      this.gallery = [];
      this.showModal = true;
      document.body.style.overflow = 'hidden'; // Prevent background scroll
    },
    
    closeModal() {
      this.showModal = false;
      this.activeCard = {};
      this.gallery = [];
      document.body.style.overflow = ''; // Restore scroll
      
      // Force all cards to recalculate their dimensions and reset parallax
      this.$nextTick(() => {
        // Reset all card transforms and recalculate positions
        this.resetAllCardsParallax();
      });
    },
    
    resetAllCardsParallax() {
      // Force all card components to reset their mouse positions and dimensions
      if (this.$refs.cards) {
        const cardComponents = Array.isArray(this.$refs.cards) ? this.$refs.cards : [this.$refs.cards];
        cardComponents.forEach(cardComponent => {
          if (cardComponent && cardComponent.$refs && cardComponent.$refs.card) {
            // Recalculate dimensions
            cardComponent.width = cardComponent.$refs.card.offsetWidth;
            cardComponent.height = cardComponent.$refs.card.offsetHeight;
            // Reset mouse position to center (no transform)
            cardComponent.mouseX = 0;
            cardComponent.mouseY = 0;
          }
        });
      }
    },
    
    openPack() {
      if (this.$refs && this.$refs.filePicker) {
        this.$refs.filePicker.click();
      }
    },
    
    onFilesPicked(e) {
      // Handle file picker - add images to gallery
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      
      files.forEach(file => {
        if (!file.type.startsWith('image/')) {
          console.warn('Archivo no es imagen, omitido:', file.name);
          return;
        }
        
        try {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target.result) {
              this.gallery.push({
                url: event.target.result,
                name: file.name,
                size: file.size
              });
            }
          };
          reader.onerror = () => {
            console.warn('Error al leer archivo:', file.name);
          };
          reader.readAsDataURL(file);
        } catch (err) {
          console.warn('Error procesando archivo:', file.name, err);
        }
      });
      
      // Clear input to allow re-selecting same files
      e.target.value = '';
    },
    
    onGalleryDrop(e) {
      // Handle gallery drop - add dropped images to gallery
      const files = Array.from(e.dataTransfer.files || []);
      if (!files.length) return;
      
      files.forEach(file => {
        if (!file.type.startsWith('image/')) {
          console.warn('Archivo arrastrado no es imagen, omitido:', file.name);
          return;
        }
        
        try {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target.result) {
              this.gallery.push({
                url: event.target.result,
                name: file.name,
                size: file.size
              });
            }
          };
          reader.onerror = () => {
            console.warn('Error al leer archivo arrastrado:', file.name);
          };
          reader.readAsDataURL(file);
        } catch (err) {
          console.warn('Error procesando archivo arrastrado:', file.name, err);
        }
      });
    },
    
    onQrClick() {
      // Handle QR click (placeholder)
      console.log('QR clicked');
    },

    openImageViewer(index) {
      this.currentImageIndex = index;
      this.showImageViewer = true;
      this.resetZoom();
      
      // Add keyboard listener for ESC and navigation
      this._onKeyDown = (e) => {
        if (e.key === 'Escape') this.closeImageViewer();
        else if (e.key === 'ArrowLeft') this.prevImage();
        else if (e.key === 'ArrowRight') this.nextImage();
        else if (e.key === '+' || e.key === '=') this.zoomIn();
        else if (e.key === '-') this.zoomOut();
        else if (e.key === '0') this.resetZoom();
      };
      document.addEventListener('keydown', this._onKeyDown);
      document.body.style.overflow = 'hidden';
    },

    closeImageViewer() {
      this.showImageViewer = false;
      this.resetZoom();
      if (this._onKeyDown) {
        document.removeEventListener('keydown', this._onKeyDown);
        this._onKeyDown = null;
      }
      document.body.style.overflow = '';
    },

    prevImage() {
      if (this.gallery.length > 1) {
        this.currentImageIndex = (this.currentImageIndex - 1 + this.gallery.length) % this.gallery.length;
        this.resetZoom();
      }
    },

    nextImage() {
      if (this.gallery.length > 1) {
        this.currentImageIndex = (this.currentImageIndex + 1) % this.gallery.length;
        this.resetZoom();
      }
    },

    zoomIn() {
      this.imageZoom = Math.min(this.imageZoom * 1.2, 5);
    },

    zoomOut() {
      this.imageZoom = Math.max(this.imageZoom / 1.2, 0.1);
    },

    resetZoom() {
      this.imageZoom = 1;
      this.imagePanX = 0;
      this.imagePanY = 0;
    },

    onImageWheel(e) {
      e.preventDefault();
      if (e.deltaY < 0) {
        this.zoomIn();
      } else {
        this.zoomOut();
      }
    },

    startImagePan(e) {
      this.isPanning = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      
      const onMouseMove = (e) => {
        if (!this.isPanning) return;
        const deltaX = e.clientX - this.lastPanX;
        const deltaY = e.clientY - this.lastPanY;
        this.imagePanX += deltaX / this.imageZoom;
        this.imagePanY += deltaY / this.imageZoom;
        this.lastPanX = e.clientX;
        this.lastPanY = e.clientY;
      };
      
      const onMouseUp = () => {
        this.isPanning = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }
  }
});
