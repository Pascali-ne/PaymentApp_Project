// Enhanced dashboard to display recent payments + simple charts (no libraries)

function getCanvasContext(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Make canvas look sharp on high DPI screens
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height };
}

function clearCanvas(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);
}

function drawPieChart(canvasId, items) {
    const canvasInfo = getCanvasContext(canvasId);
    if (!canvasInfo) return;
    const { ctx, width, height } = canvasInfo;
    clearCanvas(ctx, width, height);

    const total = items.reduce((sum, item) => sum + item.value, 0);
    if (!total) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = '14px system-ui, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No data yet', width / 2, height / 2);
        return;
    }

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.35;
    let startAngle = -Math.PI / 2;

    items.forEach((item) => {
        const sliceAngle = (item.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = item.color;
        ctx.fill();
        startAngle += sliceAngle;
    });

    // legend
    ctx.font = '12px system-ui, Arial';
    ctx.textAlign = 'left';
    const legendX = 14;
    let legendY = 16;
    items.forEach((item) => {
        ctx.fillStyle = item.color;
        ctx.fillRect(legendX, legendY - 10, 10, 10);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(`${item.label}: ${item.value}`, legendX + 16, legendY);
        legendY += 18;
    });
}

function drawBarChart(canvasId, labels, values) {
    const canvasInfo = getCanvasContext(canvasId);
    if (!canvasInfo) return;
    const { ctx, width, height } = canvasInfo;
    clearCanvas(ctx, width, height);

    const max = Math.max(...values, 0);
    if (!max) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = '14px system-ui, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No data yet', width / 2, height / 2);
        return;
    }

    const padding = 26;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    const barGap = 10;
    const barWidth = (chartWidth - barGap * (values.length - 1)) / values.length;

    // baseline
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding + chartHeight);
    ctx.lineTo(padding + chartWidth, padding + chartHeight);
    ctx.stroke();

    values.forEach((v, i) => {
        const x = padding + i * (barWidth + barGap);
        const h = (v / max) * (chartHeight - 16);
        const y = padding + chartHeight - h;

        const gradient = ctx.createLinearGradient(x, y, x, padding + chartHeight);
        gradient.addColorStop(0, 'rgba(34, 197, 94, 0.95)');
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.65)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, h);

        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.font = '11px system-ui, Arial';
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], x + barWidth / 2, padding + chartHeight + 16);
    });
}

function formatShortDate(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

function computeLast7DaysRevenueRWF(payments) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        days.push(d);
    }

    const map = new Map();
    days.forEach((d) => map.set(d.toISOString().slice(0, 10), 0));

    payments.forEach((p) => {
        if (p.status !== 'successful') return;
        const dateKey = new Date(p.created_at);
        dateKey.setHours(0, 0, 0, 0);
        const key = dateKey.toISOString().slice(0, 10);
        if (!map.has(key)) return;
        map.set(key, map.get(key) + (Number(p.amount) || 0));
    });

    const labels = days.map(formatShortDate);
    const values = days.map((d) => map.get(d.toISOString().slice(0, 10)) || 0);
    return { labels, values };
}

function renderCharts(payments) {
    const statusCounts = { successful: 0, pending: 0, failed: 0 };
    payments.forEach((p) => {
        const s = String(p.status || '').toLowerCase();
        if (statusCounts[s] !== undefined) statusCounts[s] += 1;
    });

    drawPieChart('statusChart', [
        { label: 'Successful', value: statusCounts.successful, color: 'rgba(34, 197, 94, 0.85)' },
        { label: 'Pending', value: statusCounts.pending, color: 'rgba(245, 158, 11, 0.85)' },
        { label: 'Failed', value: statusCounts.failed, color: 'rgba(239, 68, 68, 0.85)' },
    ]);

    const statusCaption = document.getElementById('statusChartCaption');
    if (statusCaption) {
        statusCaption.textContent = `Total: ${payments.length} payments`;
    }

    const revenue = computeLast7DaysRevenueRWF(payments);
    drawBarChart('revenueChart', revenue.labels, revenue.values);

    const revenueCaption = document.getElementById('revenueChartCaption');
    if (revenueCaption) {
        const total = revenue.values.reduce((a, b) => a + b, 0);
        revenueCaption.textContent = `7-day total (successful): RWF ${Math.round(total).toLocaleString()}`;
    }
}

function getAdminToken() {
    const existing = sessionStorage.getItem('adminToken');
    if (existing) return existing;
    const token = window.prompt('Enter admin token to approve payments:');
    if (token) {
        sessionStorage.setItem('adminToken', token);
        return token;
    }
    return '';
}

async function approvePayment(id, status) {
    const token = getAdminToken();
    if (!token) return;

    const response = await fetch(`/api/payments/${id}/approve`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Admin-Token': token,
        },
        body: JSON.stringify({ status })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
        alert(data.message || 'Failed to approve payment');
        return;
    }

    await renderDashboard();
}

let allPaymentsCache = [];

function getPaymentFiltersFromUI() {
    const search = document.getElementById('paymentSearch')?.value || '';
    const status = document.getElementById('paymentStatusFilter')?.value || 'all';
    const sort = document.getElementById('paymentSort')?.value || 'newest';
    return { search, status, sort };
}

function filterAndSortPayments(payments, { search, status, sort }) {
    let result = Array.isArray(payments) ? [...payments] : [];

    const q = String(search).trim().toLowerCase();
    if (q) {
        result = result.filter((p) => {
            const name = String(p.name || '').toLowerCase();
            const email = String(p.email || '').toLowerCase();
            const phone = String(p.phone || '').toLowerCase();
            return name.includes(q) || email.includes(q) || phone.includes(q);
        });
    }

    const statusLower = String(status || 'all').toLowerCase();
    if (statusLower !== 'all') {
        result = result.filter((p) => String(p.status || '').toLowerCase() === statusLower);
    }

    const getTime = (d) => {
        const t = new Date(d).getTime();
        return Number.isFinite(t) ? t : 0;
    };

    if (sort === 'oldest') {
        result.sort((a, b) => getTime(a.created_at) - getTime(b.created_at));
    } else if (sort === 'amount_high') {
        result.sort((a, b) => Number(b.amount) - Number(a.amount));
    } else if (sort === 'amount_low') {
        result.sort((a, b) => Number(a.amount) - Number(b.amount));
    } else {
        // newest
        result.sort((a, b) => getTime(b.created_at) - getTime(a.created_at));
    }

    return result;
}

function renderPaymentList(paymentsToShow) {
    const paymentList = document.querySelector('#paymentList');
    const paymentListMeta = document.getElementById('paymentListMeta');

    if (!paymentList) return;

    if (paymentListMeta) {
        paymentListMeta.textContent = `Showing ${paymentsToShow.length} of ${allPaymentsCache.length} payments`;
    }

    paymentList.innerHTML = '';

    if (paymentsToShow.length === 0) {
        paymentList.innerHTML = `
            <li>
                <div class="empty-state">
                    <div class="empty-state-icon">No Data</div>
                    <div class="empty-state-text">No payments match your filters</div>
                    <div class="empty-state-subtext">Try changing the search term or status.</div>
                </div>
            </li>
        `;
        return;
    }

    paymentsToShow.forEach((payment) => {
        const li = document.createElement('li');
        const statusClass = `status-${payment.status}`;
        const formattedDate = new Date(payment.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const isPending = String(payment.status || '').toLowerCase() === 'pending';

        li.innerHTML = `
            <div class="payment-entry">
                <div class="payment-name">${payment.name}</div>
                <div class="payment-amount">RWF ${Number(payment.amount).toLocaleString()}</div>
                <div class="entry-details">
                    <span>Email: ${payment.email}</span>
                    <span>Phone: ${payment.phone}</span>
                    <span class="status-badge ${statusClass}">${payment.status}</span>
                </div>
                <div class="entry-details">
                    <span>Ref: ${payment.tx_ref}</span>
                    <span>Date: ${formattedDate}</span>
                </div>
                ${isPending ? `
                <div class="entry-actions">
                    <button class="action-btn action-success" data-action="approve-success" data-id="${payment.id}">Mark Successful</button>
                    <button class="action-btn action-fail" data-action="approve-failed" data-id="${payment.id}">Mark Failed</button>
                </div>
                ` : ''}
            </div>
        `;

        paymentList.appendChild(li);
    });
}

function renderFilteredPayments() {
    const filters = getPaymentFiltersFromUI();
    const filtered = filterAndSortPayments(allPaymentsCache, filters);
    renderPaymentList(filtered);
}

function bindApproveHandlerOnce() {
    const paymentList = document.querySelector('#paymentList');
    if (!paymentList) return;
    if (paymentList.dataset.approveBound === '1') return;

    paymentList.dataset.approveBound = '1';
    paymentList.onclick = (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
        if (!btn) return;

        const id = Number(btn.getAttribute('data-id'));
        const action = btn.getAttribute('data-action');
        if (!id) return;

        if (action === 'approve-success') approvePayment(id, 'successful');
        if (action === 'approve-failed') approvePayment(id, 'failed');
    };
}

function bindFilterListenersOnce() {
    const searchInput = document.getElementById('paymentSearch');
    const statusSelect = document.getElementById('paymentStatusFilter');
    const sortSelect = document.getElementById('paymentSort');

    // If any control is missing, skip binding.
    if (!searchInput || !statusSelect || !sortSelect) return;
    if (searchInput.dataset.filtersBound === '1') return;

    searchInput.dataset.filtersBound = '1';

    searchInput.addEventListener('input', renderFilteredPayments);
    statusSelect.addEventListener('change', renderFilteredPayments);
    sortSelect.addEventListener('change', renderFilteredPayments);
}

const renderDashboard = async () => {
    const paymentList = document.querySelector('#paymentList');
    const statsDiv = document.querySelector('#stats');

    try {
        // Show loading states
        statsDiv.innerHTML = `
            <div class="stats-card">
                <h3>Loading Statistics...</h3>
                <div class="loading">Please wait while we load your payment statistics...</div>
            </div>
        `;
        paymentList.innerHTML = '<li class="loading">Loading payment history...</li>';

        // Fetch data
        const [paymentsResponse, statsResponse] = await Promise.all([
            fetch('/api/payments'),
            fetch('/api/stats')
        ]);

        if (!paymentsResponse.ok || !statsResponse.ok) {
            throw new Error('Failed to fetch data from server');
        }

        const paymentsData = await paymentsResponse.json();
        const statsData = await statsResponse.json();

        // Display payment statistics with enhanced styling
        const stats = statsData.stats;
        statsDiv.innerHTML = `
            <div class="stats-card">
                <h3>Payment Summary</h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-value">${stats.total_payments || 0}</div>
                        <div class="stat-label">Total Payments</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.successful_payments || 0}</div>
                        <div class="stat-label">Successful</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.pending_payments || 0}</div>
                        <div class="stat-label">Pending</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.failed_payments || 0}</div>
                        <div class="stat-label">Failed</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">RWF ${(stats.total_successful_amount || 0).toLocaleString()}</div>
                        <div class="stat-label">Total Revenue</div>
                    </div>
                </div>
            </div>
        `;

        // Clear payment list
        paymentList.innerHTML = '';

        const payments = paymentsData.payments || [];
        allPaymentsCache = payments;
        renderCharts(allPaymentsCache);

        bindApproveHandlerOnce();
        bindFilterListenersOnce();
        renderFilteredPayments();

    } catch (error) {
        console.error('Error loading dashboard:', error);
        
        // Show error states
        statsDiv.innerHTML = `
            <div class="stats-card">
                <h3>Error Loading Statistics</h3>
                <div class="error-message">Unable to load payment statistics. Please refresh the page.</div>
            </div>
        `;
        
        paymentList.innerHTML = `
            <li>
                <div class="error-message">Error loading payments. Please check your connection and try again.</div>
            </li>
        `;
    }
};

document.addEventListener('DOMContentLoaded', renderDashboard);
