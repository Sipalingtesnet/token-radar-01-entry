// Token Radar-01 Dashboard App Logic (Revised Edition)
(function () {
  'use strict';

  const data = window.RADAR;
  if (!data) {
    document.body.innerHTML = '<div style="padding:40px;color:#f87171;font-family:monospace;">Error: RADAR data not loaded. Check data.js.</div>';
    return;
  }

  function fmtUSD(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n.toLocaleString();
  }

  function fmtPct(p) {
    if (p === null || p === undefined) return '—';
    const sign = p > 0 ? '+' : '';
    return `<span class="${p > 0 ? 'pos' : p < 0 ? 'neg' : ''}">${sign}${p.toFixed(1)}%</span>`;
  }

  function fmtAge(days) {
    if (days === null || days === undefined) return '365d (est)';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return days + 'd';
  }

  const metaAsOf = document.getElementById('meta-as-of');
  const metaWatchlist = document.getElementById('meta-watchlist');
  const metaRows = document.getElementById('meta-rows');
  const metaMult = document.getElementById('meta-mult');
  const searchInput = document.getElementById('search-input');
  const categorySelect = document.getElementById('category-select');
  const chainSelect = document.getElementById('chain-select');
  const watchlistCheckbox = document.getElementById('watchlist-checkbox');
  const rowCounter = document.getElementById('row-counter');
  const radarTbody = document.getElementById('radar-tbody');
  const emptyState = document.getElementById('empty-state');
  const liveTbody = document.getElementById('live-tbody');
  const comparablesMeta = document.getElementById('comparables-meta');

  const detailPanel = document.getElementById('detail-panel');
  const detailClose = document.getElementById('detail-close');
  const detailName = document.getElementById('detail-name');
  const detailSlug = document.getElementById('detail-slug');
  const detailTvl = document.getElementById('detail-tvl');
  const detailImplied = document.getElementById('detail-implied');
  const detailChange = document.getElementById('detail-change');
  const detailAge = document.getElementById('detail-age');
  const detailBreakdown = document.getElementById('detail-breakdown');
  const detailSteps = document.getElementById('detail-steps');

  metaAsOf.textContent = data.as_of;
  metaWatchlist.textContent = data.watchlist_size;
  metaRows.textContent = data.rows.length;
  metaMult.textContent = data.base_multiple.toFixed(2) + 'x';
  comparablesMeta.textContent = `Live-token comparables (trimmed mean multiple: ${data.base_multiple.toFixed(2)}x)`;

  const categories = new Set();
  const chains = new Set();
  data.rows.forEach(r => {
    if (r.category) categories.add(r.category);
    if (Array.isArray(r.chains)) r.chains.forEach(c => chains.add(c));
  });

  [...categories].sort().forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });

  [...chains].sort().forEach(chain => {
    const opt = document.createElement('option');
    opt.value = chain;
    opt.textContent = chain;
    chainSelect.appendChild(opt);
  });

  data.live.forEach(l => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div class="proto-name-cell"><b>${l.name}</b><span class="proto-slug">${l.slug}</span></div></td>
      <td>${l.category || '—'}</td>
      <td class="num">${(l.chains || []).slice(0, 2).join(', ')}</td>
      <td class="num">${fmtUSD(l.tvl_usd)}</td>
      <td class="num"><b>${fmtUSD(l.mcap_usd)}</b></td>
      <td class="num"><span style="color:var(--secondary);font-weight:600;">${l.mcap_tvl_ratio.toFixed(2)}x</span></td>
      <td class="num">${fmtPct(l.change_7d)}</td>
    `;
    liveTbody.appendChild(tr);
  });

  let currentSortCol = 'rank';
  let currentSortAsc = true;

  function getFilteredRows() {
    const q = searchInput.value.trim().toLowerCase();
    const cat = categorySelect.value;
    const chain = chainSelect.value;
    const watchlistOnly = watchlistCheckbox.checked;

    return data.rows.filter(r => {
      if (watchlistOnly && !r.is_watchlist) return false;
      if (cat && r.category !== cat) return false;
      if (chain && (!Array.isArray(r.chains) || !r.chains.includes(chain))) return false;
      if (q) {
        const matchName = r.name.toLowerCase().includes(q);
        const matchSlug = r.slug.toLowerCase().includes(q);
        if (!matchName && !matchSlug) return false;
      }
      return true;
    });
  }

  function sortRows(rows) {
    return [...rows].sort((a, b) => {
      let valA, valB;
      switch (currentSortCol) {
        case 'name':
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          return currentSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        case 'category':
          valA = (a.category || '').toLowerCase();
          valB = (b.category || '').toLowerCase();
          return currentSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        case 'tvl':
          valA = a.tvl_usd;
          valB = b.tvl_usd;
          break;
        case 'change':
          valA = a.change_7d ?? -9999;
          valB = b.change_7d ?? -9999;
          break;
        case 'age':
          valA = a.age_days ?? 365;
          valB = b.age_days ?? 365;
          break;
        case 'implied':
          valA = a.implied_value_usd;
          valB = b.implied_value_usd;
          break;
        case 'rank':
        default:
          valA = a.rank;
          valB = b.rank;
          break;
      }
      return currentSortAsc ? valA - valB : valB - valA;
    });
  }

  function renderTable() {
    const filtered = getFilteredRows();
    const sorted = sortRows(filtered);

    radarTbody.innerHTML = '';
    if (sorted.length === 0) {
      emptyState.style.display = 'block';
      rowCounter.textContent = `Showing 0 of ${data.rows.length} protocols`;
      return;
    }
    emptyState.style.display = 'none';
    rowCounter.textContent = `Showing ${sorted.length} of ${data.rows.length} protocols`;

    const frag = document.createDocumentFragment();
    sorted.forEach(r => {
      const tr = document.createElement('tr');
      const badge = r.is_watchlist ? '<span class="watchlist-badge">WATCHLIST</span>' : '';
      tr.innerHTML = `
        <td class="num"><b>#${r.rank}</b></td>
        <td>
          <div class="proto-name-cell">
            <div><b>${r.name}</b>${badge}</div>
            <span class="proto-slug">${r.slug}</span>
          </div>
        </td>
        <td>${r.category || '—'}</td>
        <td class="num">${(r.chains || []).slice(0, 2).join(', ')}</td>
        <td class="num">${fmtUSD(r.tvl_usd)}</td>
        <td class="num">${fmtPct(r.change_7d)}</td>
        <td class="num">${fmtAge(r.age_days)}</td>
        <td class="num"><span class="implied-val">${fmtUSD(r.implied_value_usd)}</span></td>
      `;
      tr.addEventListener('click', () => openDetail(r));
      frag.appendChild(tr);
    });
    radarTbody.appendChild(frag);
  }

  function openDetail(r) {
    detailName.textContent = r.name;
    detailSlug.textContent = r.slug;
    detailTvl.textContent = fmtUSD(r.tvl_usd);
    detailImplied.textContent = fmtUSD(r.implied_value_usd);
    detailChange.innerHTML = fmtPct(r.change_7d);
    detailAge.textContent = (r.age_days ?? 365) + ' days';

    detailBreakdown.innerHTML = `
      <div><span>TVL:</span> <b>${fmtUSD(r.tvl_usd)}</b></div>
      <div><span>Base Multiple:</span> <b>${r.model.base_multiple.toFixed(2)}x</b> (live trimmed mean)</div>
      <div><span>Growth Factor:</span> <b>${r.model.growth_factor}x</b> (${r.model.growth_pct > 0 ? '+' : ''}${r.model.growth_pct}%)</div>
      <div><span>Age Factor:</span> <b>${r.model.age_factor}x</b> (${r.model.age_days ?? 365} days)</div>
      <div><span>Implied Value:</span> <b style="color:var(--accent);">${fmtUSD(r.implied_value_usd)}</b></div>
    `;

    detailSteps.innerHTML = '';
    (r.farm_steps || []).forEach(step => {
      const li = document.createElement('li');
      li.textContent = step;
      detailSteps.appendChild(li);
    });

    detailPanel.classList.add('open');
    detailPanel.setAttribute('aria-hidden', 'false');
  }

  function closeDetail() {
    detailPanel.classList.remove('open');
    detailPanel.setAttribute('aria-hidden', 'true');
  }

  detailClose.addEventListener('click', closeDetail);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDetail();
  });

  searchInput.addEventListener('input', renderTable);
  categorySelect.addEventListener('change', renderTable);
  chainSelect.addEventListener('change', renderTable);
  watchlistCheckbox.addEventListener('change', renderTable);

  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort');
      if (currentSortCol === col) {
        currentSortAsc = !currentSortAsc;
      } else {
        currentSortCol = col;
        currentSortAsc = col === 'rank' || col === 'tvl' || col === 'implied' ? false : true;
      }

      document.querySelectorAll('th.sortable .sort-indicator').forEach(ind => ind.textContent = '');
      th.querySelector('.sort-indicator').textContent = currentSortAsc ? '▴' : '▾';

      renderTable();
    });
  });

  renderTable();

})();
