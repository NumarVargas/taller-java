// === Config ===
const API = 'https://pokeapi.co/api/v2';
const MAX = 200; // cuántos Pokémon cargar inicialmente (los primeros)

// Colores por tipo (paleta verde/naranja v2)
const TYPE_COLORS = {
  normal: '#94a3b8', fire: '#f97316', water: '#38bdf8', electric: '#fde047',
  grass: '#22c55e', ice: '#67e8f9', fighting: '#ea580c', poison: '#a78bfa',
  ground: '#eab308', flying: '#60a5fa', psychic: '#fb7185', bug: '#84cc16',
  rock: '#a16207', ghost: '#8b5cf6', dragon: '#0ea5e9', dark: '#334155',
  steel: '#9ca3af', fairy: '#f9a8d4'
};

// Generaciones (1–9, en HTML se muestran 1–3, ampliable)
const GENERATIONS = {
  1: { start: 1, end: 151 }, 2: { start: 152, end: 251 }, 3: { start: 252, end: 386 },
  4: { start: 387, end: 493 }, 5: { start: 494, end: 649 }, 6: { start: 650, end: 721 },
  7: { start: 722, end: 809 }, 8: { start: 810, end: 898 }, 9: { start: 899, end: 1010 }
};

// === Estado global ===
const state = {
  all: [],          // todos los Pokémon cargados (normalizados)
  shown: [],        // lista después de filtros/orden
  cache: new Map(), // cache de peticiones
  favs: new Set(JSON.parse(localStorage.getItem('favs_v2') || '[]')),
  filters: {
    text: '',
    types: new Set(),
    gen: '',
    sortBy: 'id',
    showFavs: false
  }
};

// === DOM ===
const grid = document.getElementById('grid');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');

const searchTop = document.getElementById('search');
const sortTop = document.getElementById('sortBy');

const searchSide = document.getElementById('searchSide');
const generation = document.getElementById('generation');
const sortSide = document.getElementById('sortBySide');
const typeFilters = document.getElementById('typeFilters');

const resetBtn = document.getElementById('resetBtn');
const favBtn = document.getElementById('favBtn');

const pokemonModal = document.getElementById('pokemonModal');
const modalTitle = document.getElementById('modalTitle');
const modalContent = document.getElementById('modalContent');
const closeModal = document.getElementById('closeModal');

// === Paginación ===
let currentPage = 1;
let pageSize = 12;

const pageInfoEl = document.getElementById('pageInfo');
const currentEl  = document.getElementById('currentPage');
const totalEl    = document.getElementById('totalPages');
const pageSizeEl = document.getElementById('pageSize');

const firstBtn = document.getElementById('firstPage');
const prevBtn  = document.getElementById('prevPage');
const nextBtn  = document.getElementById('nextPage');
const lastBtn  = document.getElementById('lastPage');

function renderPage(pageNum = 1) {
  const data = state.shown;
  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  currentPage = Math.min(Math.max(1, pageNum), totalPages);
  const start = (currentPage - 1) * pageSize;
  const end   = start + pageSize;
  const slice = data.slice(start, end);
  emptyState.classList.toggle('hidden', totalItems !== 0);
  renderGrid(slice);
  updatePaginationUI({ currentPage, totalPages, totalItems });
}

function updatePaginationUI({ currentPage, totalPages, totalItems }) {
  if (currentEl)  currentEl.textContent  = String(currentPage);
  if (totalEl)    totalEl.textContent    = String(totalPages);
  if (pageInfoEl) pageInfoEl.textContent = `Página ${currentPage} de ${totalPages} · ${totalItems} resultados`;
  const atFirst = currentPage === 1;
  const atLast  = currentPage === totalPages;
  if (firstBtn) firstBtn.disabled = atFirst;
  if (prevBtn)  prevBtn.disabled  = atFirst;
  if (nextBtn)  nextBtn.disabled  = atLast;
  if (lastBtn)  lastBtn.disabled  = atLast;
}

// Listeners de paginación
firstBtn?.addEventListener('click', () => renderPage(1));
prevBtn?.addEventListener('click', () => renderPage(currentPage - 1));
nextBtn?.addEventListener('click', () => renderPage(currentPage + 1));
lastBtn?.addEventListener('click', () => {
  const totalPages = Math.max(1, Math.ceil(state.shown.length / pageSize));
  renderPage(totalPages);
});

pageSizeEl?.addEventListener('change', () => {
  pageSize = parseInt(pageSizeEl.value, 10) || 12;
  renderPage(1);
});

// === Init ===
document.addEventListener('DOMContentLoaded', async () => {
  setupTypeChips();
  setupEvents();
  showLoading(true);
  try {
    await loadInitial();
  } catch (err) {
    console.error('Error cargando datos:', err);
    showError('No se pudo conectar a la PokéAPI. Revisa tu conexión o vuelve a intentarlo más tarde.');
  } finally {
    showLoading(false);
  }
  computeAndRender();
});

// === Carga inicial ===
async function loadInitial() {
  const listRes = await fetch(`${API}/pokemon?limit=${MAX}`, { cache: 'no-store' });
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
  const list = await listRes.json();
  const urls = list.results.map(r => r.url);

  const BATCH = 20;
  for (let i = 0; i < urls.length; i += BATCH) {
    const slice = urls.slice(i, i + BATCH);
    const details = await Promise.all(slice.map(u => getWithCache(u)));
    const normalized = details.filter(Boolean).map(normalizePokemon);
    state.all.push(...normalized);
  }
}

// Cache simple
async function getWithCache(url) {
  if (state.cache.has(url)) return state.cache.get(url);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  state.cache.set(url, data);
  return data;
}

// Normalización de datos de Pokémon
function normalizePokemon(p) {
  return {
    id: p.id,
    name: p.name,
    height: p.height / 10,
    weight: p.weight / 10,
    types: p.types.map(t => t.type.name),
    img: p.sprites.other?.['official-artwork']?.front_default || p.sprites.front_default || '',
    abilities: p.abilities.map(a => a.ability.name),
    stats: p.stats.map(s => ({ name: s.stat.name, value: s.base_stat }))
  };
}

// === UI: Filtros/Controles ===
function setupTypeChips() {
  const allTypes = Object.keys(TYPE_COLORS);
  allTypes.forEach(type => {
    const chip = document.createElement('button');
    chip.className = 'badge';
    chip.textContent = type;
    chip.style.background = TYPE_COLORS[type];
    chip.style.opacity = '0.9';
    chip.style.border = '2px solid transparent';
    chip.style.transition = 'all .15s';

    chip.addEventListener('click', () => {
      if (state.filters.types.has(type)) {
        state.filters.types.delete(type);
        chip.style.borderColor = 'transparent';
        chip.style.transform = 'scale(1)';
      } else {
        state.filters.types.add(type);
        chip.style.borderColor = '#f97316'; // naranja para seleccionado
        chip.style.transform = 'scale(1.05)';
      }
      computeAndRender();
    });

    typeFilters.appendChild(chip);
  });
}

function setupEvents() {
  // Búsqueda con debounce y sincronizada (top <-> side)
  const debounce = (fn, t = 300) => {
    let id; return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), t); };
  };

  searchTop?.addEventListener('input', debounce(() => {
    state.filters.text = (searchTop.value || '').trim().toLowerCase();
    if (searchSide) searchSide.value = searchTop.value;
    computeAndRender();
  }));

  searchSide?.addEventListener('input', debounce(() => {
    state.filters.text = (searchSide.value || '').trim().toLowerCase();
    if (searchTop) searchTop.value = searchSide.value;
    computeAndRender();
  }));

  // Sort sincronizado
  sortTop?.addEventListener('change', () => {
    state.filters.sortBy = sortTop.value;
    if (sortSide) sortSide.value = sortTop.value;
    computeAndRender();
  });
  sortSide?.addEventListener('change', () => {
    state.filters.sortBy = sortSide.value;
    if (sortTop) sortTop.value = sortSide.value;
    computeAndRender();
  });

  // Generación
  generation?.addEventListener('change', () => {
    state.filters.gen = generation.value;
    computeAndRender();
  });

  // Reset
  resetBtn?.addEventListener('click', () => {
    // limpiar inputs
    if (searchTop) searchTop.value = '';
    if (searchSide) searchSide.value = '';
    if (sortTop) sortTop.value = 'id';
    if (sortSide) sortSide.value = 'id';
    if (generation) generation.value = '';

    // limpiar estado
    state.filters = { text: '', types: new Set(), gen: '', sortBy: 'id', showFavs: false };

    // limpiar selección visual de chips
    [...typeFilters.children].forEach(chip => {
      chip.style.borderColor = 'transparent';
      chip.style.transform = 'scale(1)';
    });

    // botón favoritos visual
    favBtn?.classList.remove('ring');

    computeAndRender();
  });

  // Favoritos (mostrar solo favs)
  favBtn?.addEventListener('click', () => {
    state.filters.showFavs = !state.filters.showFavs;
    // feedback visual simple
    if (state.filters.showFavs) favBtn.classList.add('ring');
    else favBtn.classList.remove('ring');
    computeAndRender();
  });

  // Modal
  closeModal?.addEventListener('click', hideModal);
  pokemonModal?.addEventListener('click', (e) => { if (e.target === pokemonModal) hideModal(); });

  // Botón volver arriba
  const scrollTopBtn = document.getElementById('scrollTopBtn');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 200) scrollTopBtn.classList.remove('hidden');
    else scrollTopBtn.classList.add('hidden');
  });
  scrollTopBtn?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// === Lógica de filtrado / orden ===
function computeAndRender() {
  let list = [...state.all];

  // Texto
  if (state.filters.text) {
    list = list.filter(p => p.name.includes(state.filters.text));
  }

  // Tipos (todos los seleccionados deben estar presentes)
  if (state.filters.types.size) {
    const selected = [...state.filters.types];
    list = list.filter(p => selected.every(t => p.types.includes(t)));
  }

  // Generación
  if (state.filters.gen) {
    const { start, end } = GENERATIONS[state.filters.gen];
    list = list.filter(p => p.id >= start && p.id <= end);
  }

  // Favoritos
  if (state.filters.showFavs) {
    list = list.filter(p => state.favs.has(p.id));
  }

  // Orden
  switch (state.filters.sortBy) {
    case 'name': list.sort((a, b) => a.name.localeCompare(b.name)); break;
    case 'height': list.sort((a, b) => a.height - b.height); break;
    case 'weight': list.sort((a, b) => a.weight - b.weight); break;
    default: list.sort((a, b) => a.id - b.id);
  }

  state.shown = list;

  // al cambiar filtros/orden, iniciar en página 1
  renderPage(1);
}

// === Render ===
function renderGrid(list = null) {
  const data = Array.isArray(list)
    ? list
    : state.shown.slice((currentPage - 1) * pageSize, (currentPage - 1) * pageSize + pageSize);

  grid.innerHTML = '';

  data.forEach(p => {
    const card = document.createElement('article');
    card.className = 'card';

    const isFav = state.favs.has(p.id);
    const favClass = isFav ? '' : 'opacity-60';

    const typesHtml = p.types.map(t => {
      const color = TYPE_COLORS[t] || '#94a3b8';
      return `<span class="badge" style="background:${color}">${t}</span>`;
    }).join(' ');

    card.innerHTML = `
      <div class="flex items-start justify-between">
        <h3 class="font-bold capitalize">#${p.id} ${p.name}</h3>
        <button class="btn-secondary !px-2 !py-1 text-xs fav ${favClass}" data-id="${p.id}">⭐</button>
      </div>
      <img src="${p.img}" alt="${p.name}" class="w-full h-40 object-contain my-2 bg-white rounded-md">
      <div class="flex flex-wrap gap-1 justify-center">${typesHtml}</div>
      <div class="mt-2 flex items-center justify-between">
        <button class="btn !px-3 !py-1 text-sm more" data-id="${p.id}">Ver detalle</button>
        <span class="text-xs opacity-80">${p.height} m · ${p.weight} kg</span>
      </div>
    `;

    grid.appendChild(card);
  });

  // Listeners de botones dentro de las cards
  grid.querySelectorAll('.more').forEach(btn =>
    btn.addEventListener('click', () => openDetail(parseInt(btn.dataset.id, 10)))
  );
  grid.querySelectorAll('.fav').forEach(btn =>
    btn.addEventListener('click', () => toggleFav(parseInt(btn.dataset.id, 10), btn))
  );
}

function toggleFav(id, el) {
  if (state.favs.has(id)) {
    state.favs.delete(id);
    el.classList.add('opacity-60');
  } else {
    state.favs.add(id);
    el.classList.remove('opacity-60');
  }
  localStorage.setItem('favs_v2', JSON.stringify([...state.favs]));
}

// === Modal ===
function hideModal() {
  pokemonModal.classList.add('hidden');
  pokemonModal.classList.remove('flex');
}

async function openDetail(id) {
  const data = state.all.find(p => p.id === id);
  if (!data) return;

  modalTitle.textContent = `#${data.id} ${capitalize(data.name)}`;
  modalContent.innerHTML = `
    <div class="text-center">
      <img src="${data.img}" alt="${data.name}" class="w-40 h-40 object-contain mx-auto mb-3">
    </div>

    <div class="grid grid-cols-2 gap-3 text-sm">
      <div><span class="opacity-70">Altura:</span> ${data.height} m</div>
      <div><span class="opacity-70">Peso:</span> ${data.weight} kg</div>

      <div class="col-span-2">
        <span class="opacity-70">Tipos:</span>
        ${data.types.map(t => `<span class="badge" style="background:${TYPE_COLORS[t]}; margin-left:.25rem">${t}</span>`).join('')}
      </div>

      <div class="col-span-2">
        <h4 class="font-semibold mt-2">Habilidades</h4>
        <ul class="list-disc list-inside capitalize">
          ${data.abilities.map(a => `<li>${a.replace('-', ' ')}</li>`).join('')}
        </ul>
      </div>

      <div class="col-span-2">
        <h4 class="font-semibold mt-2">Estadísticas</h4>
        ${statsBars(data.stats)}
      </div>
    </div>
  `;

  pokemonModal.classList.remove('hidden');
  pokemonModal.classList.add('flex');
}

function statsBars(stats) {
  return stats.map(s => {
    const pct = Math.min(100, (s.value / 200) * 100);
    // barras con acento naranja para seguir la paleta
    return `
      <div class="mb-2">
        <div class="flex justify-between text-xs">
          <span>${s.name.replace('-', ' ')}</span>
          <span>${s.value}</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2">
          <div class="h-2 rounded-full" style="width:${pct}%; background:#f97316"></div>
        </div>
      </div>
    `;
  }).join('');
}

// === Utils ===
function showLoading(show) {
  loadingState.classList.toggle('hidden', !show);
}
function showError(msg) {
  emptyState.textContent = msg;
  emptyState.classList.remove('hidden');
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
