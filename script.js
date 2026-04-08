const SHUTTLE_MODAL_DATA_KEY = 'ttcl.shuttleModalData';

let playerCount = 0;
let shuttleModalTarget = 'b';
let shuttleModalData = loadShuttleModalData();
let syncLock = false;
let exportPreviewDataUrl = '';

const MONEY_CHIP_CONFIG = {
  court: {
    presets: [100000, 150000, 200000],
  },
  shuttle: {
    presets: [50000, 100000, 150000],
  },
};

function attachAutoSelect() {
  document.querySelectorAll('input').forEach((input) => {
    input.removeEventListener('focus', selectText);
    input.addEventListener('focus', selectText);
  });
}

function selectText(e) {
  e.target.select();
}

function formatVND(n) {
  const rounded = Math.round(n / 1000) * 1000;
  return rounded.toLocaleString('vi-VN') + ' đ';
}

function roundVND(n) {
  return Math.round(n / 1000) * 1000;
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.innerHTML = msg;
  el.style.display = msg ? 'block' : 'none';
}

function switchTab(name, btn) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}

function syncMoneyFields(sourcePrefix, targetPrefix, fieldName) {
  if (syncLock) return;

  const sourceEl = document.getElementById(sourcePrefix + '-' + fieldName);
  const targetEl = document.getElementById(targetPrefix + '-' + fieldName);
  if (!sourceEl || !targetEl) return;

  syncLock = true;
  targetEl.value = sourceEl.value;
  renderMoneyChips(sourcePrefix, fieldName);
  renderMoneyChips(targetPrefix, fieldName);
  syncLock = false;
}

function moneyChipLabel(value) {
  return Number(value).toLocaleString('vi-VN');
}

function setMoneyChipVisibility(chipHost, visible) {
  chipHost.style.display = visible ? 'flex' : 'none';
  chipHost.dataset.open = visible ? '1' : '0';
}

function renderMoneyChips(prefix, field, forceVisible) {
  const input = document.getElementById(prefix + '-' + field);
  const chipHost = document.getElementById('chips-' + prefix + '-' + field);
  if (!input || !chipHost) return;

  if (forceVisible === true) {
    setMoneyChipVisibility(chipHost, true);
  } else if (forceVisible === false) {
    setMoneyChipVisibility(chipHost, false);
  }

  const isVisible = chipHost.dataset.open === '1';
  if (!isVisible) {
    chipHost.innerHTML = '';
    return;
  }

  const raw = String(input.value || '').trim();
  const hasValue = raw !== '';
  const numeric = Number(raw);

  const chips = [];
  if (!hasValue) {
    const presets = MONEY_CHIP_CONFIG[field] ? MONEY_CHIP_CONFIG[field].presets : [];
    presets.forEach((preset) => {
      chips.push({
        text: moneyChipLabel(preset),
        value: String(preset),
      });
    });
  } else {
    if (!Number.isNaN(numeric) && numeric > 0 && numeric < 1000) {
      const suggestionA = numeric * 1000;
      const suggestionB = numeric * 10000;
      chips.push({ text: moneyChipLabel(suggestionA), value: String(suggestionA) });
      chips.push({ text: moneyChipLabel(suggestionB), value: String(suggestionB) });
    }
  }

  if (!chips.length) {
    chipHost.innerHTML = '';
    return;
  }

  chipHost.innerHTML = chips
    .map((chip) => '<button type="button" class="money-chip" data-value="' + chip.value + '">' + chip.text + '</button>')
    .join('');

  chipHost.querySelectorAll('.money-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      input.value = btn.getAttribute('data-value') || '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    });
  });
}

function bindMoneyChips() {
  const fields = [
    { prefix: 'b', field: 'court' },
    { prefix: 'b', field: 'shuttle' },
    { prefix: 'a', field: 'court' },
    { prefix: 'a', field: 'shuttle' },
  ];

  fields.forEach(({ prefix, field }) => {
    const input = document.getElementById(prefix + '-' + field);
    const chipHost = document.getElementById('chips-' + prefix + '-' + field);
    if (!input) return;
    if (!chipHost) return;

    setMoneyChipVisibility(chipHost, false);

    input.addEventListener('focus', () => renderMoneyChips(prefix, field, true));
    input.addEventListener('input', () => renderMoneyChips(prefix, field));
    input.addEventListener('blur', () => {
      setTimeout(() => renderMoneyChips(prefix, field, false), 120);
    });
  });
}

function bindMoneySync() {
  const pairs = [
    { source: 'b', target: 'a', field: 'court' },
    { source: 'a', target: 'b', field: 'court' },
    { source: 'b', target: 'a', field: 'shuttle' },
    { source: 'a', target: 'b', field: 'shuttle' },
  ];

  pairs.forEach(({ source, target, field }) => {
    const sourceEl = document.getElementById(source + '-' + field);
    if (!sourceEl) return;

    sourceEl.addEventListener('input', () => syncMoneyFields(source, target, field));
  });
}

function getShuttleCost(modePrefix) {
  return parseFloat(document.getElementById(modePrefix + '-shuttle').value) || 0;
}

function createModalLine(lineData) {
  const template = document.getElementById('m-line-template');
  const fragment = template.content.cloneNode(true);
  const lineEl = fragment.querySelector('.modal-line');

  lineEl.querySelector('.m-tube-price').value = lineData && lineData.tubePrice !== undefined ? lineData.tubePrice : '';
  lineEl.querySelector('.m-used-shuttles').value = lineData && lineData.usedShuttles !== undefined ? lineData.usedShuttles : '';
  lineEl.querySelector('.m-shuttles-per-tube').value = lineData && lineData.shuttlesPerTube !== undefined ? lineData.shuttlesPerTube : 12;

  return fragment;
}

function getModalLineValues() {
  const lines = Array.from(document.querySelectorAll('#m-lines-container .modal-line'));
  return lines.map((line) => ({
    tubePrice: parseFloat(line.querySelector('.m-tube-price').value),
    usedShuttles: parseFloat(line.querySelector('.m-used-shuttles').value),
    shuttlesPerTube: parseFloat(line.querySelector('.m-shuttles-per-tube').value),
  }));
}

function calcModalShuttleCost() {
  const values = getModalLineValues();
  let total = 0;
  let usedTotal = 0;
  let hasAnyInput = false;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const hasTubePrice = !Number.isNaN(row.tubePrice);
    const hasUsedShuttles = !Number.isNaN(row.usedShuttles);
    const hasShuttlesPerTube = !Number.isNaN(row.shuttlesPerTube);

    if (hasTubePrice || hasUsedShuttles || hasShuttlesPerTube) hasAnyInput = true;

    if (!hasTubePrice && !hasUsedShuttles && !hasShuttlesPerTube) {
      continue;
    }

    if (!hasTubePrice || !hasUsedShuttles || !hasShuttlesPerTube) {
      return { total: Number.NaN, unitPrice: Number.NaN, valid: false, empty: false };
    }

    if (row.tubePrice < 0 || row.usedShuttles < 0 || row.shuttlesPerTube <= 0) {
      return { total: Number.NaN, unitPrice: Number.NaN, valid: false, empty: false };
    }

    const lineUnitPrice = row.tubePrice / row.shuttlesPerTube;
    total += lineUnitPrice * row.usedShuttles;
    usedTotal += row.usedShuttles;
  }

  if (!hasAnyInput) {
    return { total: 0, unitPrice: Number.NaN, valid: true, empty: true };
  }

  const avgUnitPrice = usedTotal > 0 ? total / usedTotal : Number.NaN;
  return { total: total, unitPrice: avgUnitPrice, valid: true, empty: false };
}

function updateModalEstimate() {
  const previewTotal = document.getElementById('m-preview-total');
  const previewMeta = document.getElementById('m-preview-meta');
  showError('m-error', '');

  const result = calcModalShuttleCost();
  if (result.empty) {
    previewTotal.textContent = '—';
    previewMeta.textContent = 'Đơn giá trung bình mỗi trái: —';
    return;
  }

  if (!result.valid || Number.isNaN(result.total)) {
    previewTotal.textContent = 'Chưa đủ dữ liệu';
    previewMeta.textContent = 'Mỗi dòng cần đủ 3 trường số hoặc để trống hoàn toàn.';
    return;
  }

  previewTotal.textContent = formatVND(result.total);
  previewMeta.textContent = Number.isNaN(result.unitPrice)
    ? 'Đơn giá trung bình mỗi trái: —'
    : 'Đơn giá trung bình mỗi trái: ' + formatVND(result.unitPrice);
}

function addModalLine(lineData) {
  const container = document.getElementById('m-lines-container');
  container.appendChild(createModalLine(lineData));
  attachAutoSelect();
  updateModalEstimate();
}

function removeModalLine(btn) {
  const container = document.getElementById('m-lines-container');
  const lines = container.querySelectorAll('.modal-line');
  if (lines.length <= 1) {
    showError('m-error', 'Cần ít nhất 1 dòng để nhập thông tin.');
    return;
  }

  btn.closest('.modal-line').remove();
  showError('m-error', '');
  updateModalEstimate();
}

function openShuttleModal(modePrefix) {
  document.body.classList.add('modal-open');
  shuttleModalTarget = modePrefix;

  const container = document.getElementById('m-lines-container');
  container.innerHTML = '';

  const saved = shuttleModalData[modePrefix];
  const lines = saved && Array.isArray(saved.lines) && saved.lines.length ? saved.lines : [
    { tubePrice: '', usedShuttles: '', shuttlesPerTube: 12 },
  ];

  lines.forEach((line) => addModalLine(line));

  const modal = document.getElementById('shuttle-modal');
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');

  attachAutoSelect();
  updateModalEstimate();
}

function closeShuttleModal() {
  document.body.classList.remove('modal-open');
  const modal = document.getElementById('shuttle-modal');
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  showError('m-error', '');
}

function saveShuttleModal() {
  const result = calcModalShuttleCost();
  if (!result.valid || Number.isNaN(result.total)) {
    showError('m-error', 'Vui lòng nhập hợp lệ cho từng dòng: giá ống, số cầu dùng, số cầu/ống.');
    return;
  }

  const lines = getModalLineValues()
    .filter((row) => !Number.isNaN(row.tubePrice) || !Number.isNaN(row.usedShuttles) || !Number.isNaN(row.shuttlesPerTube))
    .map((row) => ({
      tubePrice: Number.isNaN(row.tubePrice) ? '' : row.tubePrice,
      usedShuttles: Number.isNaN(row.usedShuttles) ? '' : row.usedShuttles,
      shuttlesPerTube: Number.isNaN(row.shuttlesPerTube) ? 12 : row.shuttlesPerTube,
    }));

  document.getElementById(shuttleModalTarget + '-shuttle').value = roundVND(result.total);
  syncMoneyFields(shuttleModalTarget, shuttleModalTarget === 'b' ? 'a' : 'b', 'shuttle');

  shuttleModalData[shuttleModalTarget] = {
    lines: lines.length ? lines : [{ tubePrice: '', usedShuttles: '', shuttlesPerTube: 12 }],
  };

  saveShuttleModalData(shuttleModalData);
  closeShuttleModal();
}

function loadShuttleModalData() {
  try {
    const raw = localStorage.getItem(SHUTTLE_MODAL_DATA_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveShuttleModalData(data) {
  try {
    localStorage.setItem(SHUTTLE_MODAL_DATA_KEY, JSON.stringify(data));
  } catch (_) {
    // Ignore storage errors.
  }
}

function calcBasic() {
  showError('b-error', '');
  document.getElementById('b-result').style.display = 'none';

  const people = parseInt(document.getElementById('b-people').value, 10);
  const court = parseFloat(document.getElementById('b-court').value) || 0;
  const shuttle = getShuttleCost('b');

  if (!people || people < 1) {
    showError('b-error', 'Vui lòng nhập số người hợp lệ (>= 1)');
    return;
  }

  if (court === 0 && shuttle === 0) {
    showError('b-error', 'Vui lòng nhập ít nhất tiền sân hoặc tiền cầu');
    return;
  }

  const perCourt = court / people;
  const perShuttle = shuttle / people;
  const perTotal = perCourt + perShuttle;

  document.getElementById('b-sum-court').textContent = formatVND(perCourt);
  document.getElementById('b-sum-shuttle').textContent = formatVND(perShuttle);
  document.getElementById('b-sum-total').textContent = formatVND(perTotal);

  document.getElementById('b-result').style.display = 'block';
}

function addPlayer() {
  const id = Date.now() + '_' + (++playerCount);
  const container = document.getElementById('players-container');
  const row = document.createElement('div');

  row.className = 'player-row';
  row.id = 'player-' + id;
  row.innerHTML =
    '<input type="text" id="pname-' + id + '" placeholder="Người ' + playerCount + '" class="auto-select" />' +
    '<input type="number" id="pcourt-' + id + '" min="0" step="0.5" value="1" class="auto-select" />' +
    '<input type="number" id="pshuttle-' + id + '" min="0" step="0.5" value="1" class="auto-select" />' +
    '<input type="number" id="pfixed-' + id + '" min="0" step="1000" placeholder="0" class="auto-select" />' +
    '<button class="remove-btn" onclick="removePlayer(\'' + id + '\')" title="Xóa">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>' +
    '</button>';

  container.appendChild(row);
  attachAutoSelect();
}

function removePlayer(id) {
  const row = document.getElementById('player-' + id);
  if (row) row.remove();
}

function calcAdvanced() {
  showError('a-error', '');
  document.getElementById('a-result').style.display = 'none';

  const totalCourt = parseFloat(document.getElementById('a-court').value) || 0;
  const totalShuttle = getShuttleCost('a');

  if (totalCourt === 0 && totalShuttle === 0) {
    showError('a-error', 'Vui lòng nhập ít nhất tiền sân hoặc cầu');
    return;
  }

  const rows = document.querySelectorAll('#players-container .player-row');
  if (rows.length === 0) {
    showError('a-error', 'Vui lòng thêm ít nhất một người chơi');
    return;
  }

  const players = [];
  for (let i = 0; i < rows.length; i++) {
    const rid = rows[i].id.replace('player-', '');
    const nameInput = document.getElementById('pname-' + rid);
    const name = nameInput.value.trim() || nameInput.placeholder;

    let hsCourt = parseFloat(document.getElementById('pcourt-' + rid).value);
    let hsShuttle = parseFloat(document.getElementById('pshuttle-' + rid).value);

    let pFixed = parseFloat(document.getElementById('pfixed-' + rid).value);
    
    if (Number.isNaN(hsCourt)) hsCourt = 0;
    if (Number.isNaN(hsShuttle)) hsShuttle = 0;
    if (Number.isNaN(pFixed)) pFixed = 0;

    if (hsCourt < 0 || hsShuttle < 0 || pFixed < 0) {
      showError('a-error', 'Hệ số hoặc tiền cố định của "' + name + '" không được âm');
      return;
    }

    players.push({ name: name, hsCourt: hsCourt, hsShuttle: hsShuttle, pFixed: pFixed });
  }

  const totalFixed = players.reduce((s, p) => s + p.pFixed, 0);
  const totalBill = totalCourt + totalShuttle;
  
  // Calculate proportional split for displaying the fixed amount correctly (for visual breakdown only)
  const ratioC = totalBill > 0 ? (totalCourt / totalBill) : 0;
  const ratioS = totalBill > 0 ? (totalShuttle / totalBill) : 0;

  // The remaining pool to be shared
  const effTotalCourt = totalCourt - totalFixed * ratioC;
  const effTotalShuttle = totalShuttle - totalFixed * ratioS;

  const sumHsCourt = players.filter(p => p.pFixed === 0).reduce((s, p) => s + p.hsCourt, 0);
  const sumHsShuttle = players.filter(p => p.pFixed === 0).reduce((s, p) => s + p.hsShuttle, 0);

  if (effTotalCourt > 0 && sumHsCourt === 0 && players.some(p => p.pFixed === 0)) {
    showError('a-error', 'Tổng hệ số sân của các thành viên còn lại bằng 0, không thể chia phần tiền sân còn dư');
    return;
  }

  if (effTotalShuttle > 0 && sumHsShuttle === 0 && players.some(p => p.pFixed === 0)) {
    showError('a-error', 'Tổng hệ số cầu của các thành viên còn lại bằng 0, không thể chia phần tiền cầu còn dư');
    return;
  }

  const tbody = document.getElementById('a-tbody');
  tbody.innerHTML = '';

  let sumCourt = 0;
  let sumShuttle = 0;

  players.forEach((p) => {
    let pCourt = 0;
    let pShuttle = 0;
    let pTotal = 0;

    if (p.pFixed > 0) {
      pCourt = p.pFixed * ratioC;
      pShuttle = p.pFixed * ratioS;
      pTotal = p.pFixed;
    } else {
      pCourt = sumHsCourt > 0 ? (p.hsCourt / sumHsCourt) * effTotalCourt : 0;
      pShuttle = sumHsShuttle > 0 ? (p.hsShuttle / sumHsShuttle) * effTotalShuttle : 0;
      pTotal = pCourt + pShuttle;
    }

    sumCourt += pCourt;
    sumShuttle += pShuttle;

    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + escHtml(p.name) + '</td>' +
      '<td>' + formatVND(pCourt) + '</td>' +
      '<td>' + formatVND(pShuttle) + '</td>' +
      '<td>' + formatVND(pTotal) + '</td>';
    tbody.appendChild(tr);
  });

  document.getElementById('a-foot-court').textContent = formatVND(sumCourt);
  document.getElementById('a-foot-shuttle').textContent = formatVND(sumShuttle);
  document.getElementById('a-foot-total').textContent = formatVND(sumCourt + sumShuttle);

  document.getElementById('a-result').style.display = 'block';
}

async function exportAdvancedResult() {
  const resultSection = document.getElementById('a-result');
  const tableCard = resultSection ? resultSection.querySelector('.table-card') : null;
  const helperText = resultSection ? resultSection.querySelector('p') : null;

  if (!resultSection || resultSection.style.display === 'none' || !tableCard) {
    showError('a-error', 'Vui lòng tính tiền trước khi xuất bảng.');
    return;
  }

  if (typeof window.html2canvas !== 'function') {
    showError('a-error', 'Không tải được thư viện xuất ảnh. Vui lòng thử lại.');
    return;
  }

  const exportShell = document.createElement('div');
  exportShell.style.position = 'fixed';
  exportShell.style.left = '-99999px';
  exportShell.style.top = '0';
  exportShell.style.padding = '16px';
  exportShell.style.background = '#ffffff';
  exportShell.style.width = 'max-content';
  exportShell.style.maxWidth = 'none';
  exportShell.style.zIndex = '-1';

  const title = document.createElement('div');
  title.style.fontSize = '18px';
  title.style.fontWeight = '800';
  title.style.color = '#111827';
  title.style.marginBottom = '10px';

  const clonedCard = tableCard.cloneNode(true);
  clonedCard.style.width = 'max-content';
  clonedCard.style.maxWidth = 'none';

  const clonedWrap = clonedCard.querySelector('.table-wrap');
  if (clonedWrap) {
    clonedWrap.style.overflow = 'visible';
  }

  const clonedTable = clonedCard.querySelector('table');
  if (clonedTable) {
    clonedTable.style.width = 'max-content';
    clonedTable.style.minWidth = '100%';
  }

  exportShell.appendChild(title);
  exportShell.appendChild(clonedCard);


  document.body.appendChild(exportShell);

  try {
    const canvas = await window.html2canvas(exportShell, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    });

    exportPreviewDataUrl = canvas.toDataURL('image/png');

    const previewImg = document.getElementById('export-preview-image');
    const previewModal = document.getElementById('export-preview-modal');
    const previewErr = document.getElementById('export-preview-error');
    if (previewErr) showError('export-preview-error', '');

    if (previewImg) previewImg.src = exportPreviewDataUrl;
    if (previewModal) {
      document.body.classList.add('modal-open');
      previewModal.style.display = 'flex';
      previewModal.setAttribute('aria-hidden', 'false');
    }
  } catch (_) {
    showError('a-error', 'Xuất ảnh thất bại. Vui lòng thử lại.');
  } finally {
    exportShell.remove();
  }
}

function closeExportPreview() {
  const previewModal = document.getElementById('export-preview-modal');
  if (!previewModal) return;

  document.body.classList.remove('modal-open');
  previewModal.style.display = 'none';
  previewModal.setAttribute('aria-hidden', 'true');
}

function downloadExportPreview() {
  if (!exportPreviewDataUrl) {
    showError('export-preview-error', 'Chưa có ảnh để tải. Vui lòng tạo preview trước.');
    return;
  }

  const link = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  link.download = 'bang-chia-tien-' + stamp + '.png';
  link.href = exportPreviewDataUrl;
  link.click();
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

(function init() {
  for (let i = 0; i < 4; i++) addPlayer();
  attachAutoSelect();
  bindMoneySync();
  bindMoneyChips();

  const modal = document.getElementById('shuttle-modal');
  modal.addEventListener('click', (e) => {
    if (e.target.id === 'shuttle-modal') {
      closeShuttleModal();
    }
  });

  const exportPreviewModal = document.getElementById('export-preview-modal');
  if (exportPreviewModal) {
    exportPreviewModal.addEventListener('click', (e) => {
      if (e.target.id === 'export-preview-modal') {
        closeExportPreview();
      }
    });
  }
})();
