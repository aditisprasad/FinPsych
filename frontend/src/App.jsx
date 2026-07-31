import { useEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import AuthPage from './AuthPage';

const API_BASE_URL = 'https://finpsych.onrender.com';
const COLORS = ['#64c8ff', '#43c6ac', '#ffbb28', '#ff8042', '#a259ff', '#ff5252', '#69f0ae'];

const defaultForm = {
  description: '',
  amount: '',
  category: 'Lifestyle',
  date: new Date().toISOString().slice(0, 10),
  type: 'expense',
};

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function buildApiUrl(path, email) {
  const separator = path.includes('?') ? '&' : '?';
  return `${API_BASE_URL}${path}${separator}email=${encodeURIComponent(email)}`;
}

function App() {
  const [user, setUser] = useState(() => localStorage.getItem('finpsych-user') || '');
  const [token, setToken] = useState(() => localStorage.getItem('finpsych-token') || '');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [insights, setInsights] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [activities, setActivities] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [editingTx, setEditingTx] = useState(null);
  const [budget, setBudget] = useState(50000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Bulk Selection & Toast Undo State
  const [selectedTxIds, setSelectedTxIds] = useState([]);
  const [bulkCategory, setBulkCategory] = useState('Lifestyle');
  const [toast, setToast] = useState(null);
  const [lastDeletedTx, setLastDeletedTx] = useState(null);

  // Search, Filter, Sort, Pagination
  const [txSearch, setTxSearch] = useState('');
  const [txCategory, setTxCategory] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('');
  const [txSortBy, setTxSortBy] = useState('date');
  const [txOrder, setTxOrder] = useState('desc');
  const [txPage, setTxPage] = useState(1);
  const [txTotalPages, setTxTotalPages] = useState(1);
  const [txTotalCount, setTxTotalCount] = useState(0);

  // AI Coach state
  const [coachQuestion, setCoachQuestion] = useState('How can I save more?');
  const [coachResponse, setCoachResponse] = useState('');

  // CSV Import state
  const [csvData, setCsvData] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [csvPreviewRows, setCsvPreviewRows] = useState([]);
  const [csvMessage, setCsvMessage] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  // Timeline selected month
  const [selectedMonth, setSelectedMonth] = useState('');

  // Auth state
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authLoading, setAuthLoading] = useState(false);

  const searchInputRef = useRef(null);

  // Keyboard Shortcuts (Ctrl+N, Ctrl+F, Escape)
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setActiveTab('dashboard');
        document.querySelector('.transaction-form input')?.focus();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setActiveTab('transactions');
        setTimeout(() => searchInputRef.current?.focus(), 100);
      } else if (e.key === 'Escape') {
        setEditingTx(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (user) {
      loadAllData();
    } else {
      setLoading(false);
    }
  }, [user, txSearch, txCategory, txTypeFilter, txSortBy, txOrder, txPage]);

  function showToast(message, actionLabel = null, actionHandler = null) {
    setToast({ message, actionLabel, actionHandler });
    setTimeout(() => {
      setToast(null);
    }, 6000);
  }

  async function loadAllData() {
    try {
      setLoading(true);
      const [dashRes, insRes, txRes, actRes, subRes, timeRes] = await Promise.all([
        fetch(buildApiUrl('/api/dashboard', user)),
        fetch(buildApiUrl('/api/insights', user)),
        fetch(
          buildApiUrl(
            `/api/transactions?search=${encodeURIComponent(txSearch)}&category=${encodeURIComponent(
              txCategory
            )}&type_filter=${encodeURIComponent(txTypeFilter)}&sort_by=${txSortBy}&order=${txOrder}&page=${txPage}&limit=10`,
            user
          )
        ),
        fetch(buildApiUrl('/api/activities', user)),
        fetch(buildApiUrl('/api/subscriptions', user)),
        fetch(buildApiUrl('/api/timeline', user)),
      ]);

      if (dashRes.ok) {
        const dashData = await dashRes.json();
        setDashboard(dashData);
        setBudget(dashData.monthly_budget || 50000);
        if (!coachResponse) {
          setCoachResponse(dashData.coach_message || '');
        }
      }
      if (insRes.ok) {
        setInsights(await insRes.json());
      }
      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(txData.items || []);
        setTxTotalPages(txData.total_pages || 1);
        setTxTotalCount(txData.total || 0);
      }
      if (actRes.ok) {
        setActivities(await actRes.json());
      }
      if (subRes.ok) {
        setSubscriptions(await subRes.json());
      }
      if (timeRes.ok) {
        const timeData = await timeRes.json();
        setTimeline(timeData);
        if (timeData.length > 0 && !selectedMonth) {
          setSelectedMonth(timeData[0].month);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setError('');
    setAuthLoading(true);

    try {
      const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm),
      });

      if (!response.ok) {
        throw new Error(authMode === 'register' ? 'Registration failed.' : 'Login failed.');
      }

      const data = await response.json();
      setUser(data.user.email);
      if (data.token) {
        setToken(data.token);
        localStorage.setItem('finpsych-token', data.token);
      }
      localStorage.setItem('finpsych-user', data.user.email);
      setAuthForm({ email: '', password: '' });
      showToast(`Welcome back, ${data.user.email}!`);
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('finpsych-user');
    localStorage.removeItem('finpsych-token');
    setUser('');
    setToken('');
    setDashboard(null);
    setInsights(null);
    setTransactions([]);
    setActivities([]);
    setSubscriptions([]);
    setTimeline([]);
    setError('');
  }

  async function handleAddTransaction(event) {
    event.preventDefault();
    setError('');
    try {
      const response = await fetch(buildApiUrl('/api/transactions', user), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      if (!response.ok) throw new Error('Failed to save transaction.');
      const saved = await response.json();
      setForm(defaultForm);
      showToast(`Added '${saved.description}' - ₹${saved.amount}`);
      await loadAllData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleEditSave(event) {
    event.preventDefault();
    if (!editingTx) return;
    try {
      const response = await fetch(buildApiUrl(`/api/transactions/${editingTx.id}`, user), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editingTx, amount: Number(editingTx.amount) }),
      });
      if (!response.ok) throw new Error('Failed to update transaction.');
      setEditingTx(null);
      showToast(`Updated '${editingTx.description}'`);
      await loadAllData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteTx(id) {
    try {
      const response = await fetch(buildApiUrl(`/api/transactions/${id}`, user), {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete transaction.');
      const res = await response.json();
      if (res.transaction) {
        setLastDeletedTx(res.transaction);
        showToast(`Deleted '${res.transaction.description}'`, 'Undo', () => handleUndoDelete(res.transaction));
      } else {
        showToast('Transaction deleted');
      }
      await loadAllData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUndoDelete(txToRestore) {
    if (!txToRestore) return;
    try {
      const response = await fetch(buildApiUrl('/api/transactions/restore', user), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(txToRestore),
      });
      if (!response.ok) throw new Error('Failed to restore transaction.');
      showToast(`Restored '${txToRestore.description}'`);
      setLastDeletedTx(null);
      await loadAllData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDuplicateTx(id) {
    try {
      const response = await fetch(buildApiUrl(`/api/transactions/${id}/duplicate`, user), {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to duplicate transaction.');
      showToast('Transaction duplicated');
      await loadAllData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleBulkDelete() {
    if (!selectedTxIds.length) return;
    try {
      const response = await fetch(buildApiUrl('/api/transactions/bulk-delete', user), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedTxIds }),
      });
      if (!response.ok) throw new Error('Failed to delete selected transactions.');
      const data = await response.json();
      showToast(`Deleted ${data.deleted_count} transactions`);
      setSelectedTxIds([]);
      await loadAllData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleBulkCategoryUpdate() {
    if (!selectedTxIds.length) return;
    try {
      const response = await fetch(buildApiUrl('/api/transactions/bulk-category', user), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedTxIds, category: bulkCategory }),
      });
      if (!response.ok) throw new Error('Failed to update category.');
      const data = await response.json();
      showToast(`Updated category to '${bulkCategory}' for ${data.updated_count} transactions`);
      setSelectedTxIds([]);
      await loadAllData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleBudgetSave(event) {
    event.preventDefault();
    try {
      const response = await fetch(buildApiUrl('/api/budget', user), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthly_budget: Number(budget) }),
      });
      if (!response.ok) throw new Error('Failed to update budget.');
      showToast(`Updated monthly budget to ₹${Number(budget).toLocaleString('en-IN')}`);
      await loadAllData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCoachSubmit(event) {
    event.preventDefault();
    try {
      const response = await fetch(buildApiUrl('/api/coach/message', user), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: coachQuestion }),
      });
      if (!response.ok) throw new Error('AI Coach unavailable.');
      const data = await response.json();
      setCoachResponse(data.response);
      showToast('AI Coach response updated');
      await loadAllData();
    } catch (err) {
      setCoachResponse(err.message);
    }
  }

  async function handleSubscriptionStatus(subId, newStatus) {
    try {
      const response = await fetch(buildApiUrl(`/api/subscriptions/${subId}/status`, user), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) throw new Error('Failed to update subscription status.');
      showToast(`Subscription status updated to ${newStatus}`);
      await loadAllData();
    } catch (err) {
      setError(err.message);
    }
  }

  // CSV Drag & Drop helpers
  function parseCsvPreview(text) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const header = lines[0].split(',').map((col) => col.trim());
    return lines.slice(1).map((line, index) => {
      const values = line.split(',').map((cell) => cell.trim());
      const row = header.reduce((acc, key, colIndex) => {
        acc[key] = values[colIndex] ?? '';
        return acc;
      }, {});
      const amountValue = Number(row.amount);
      const validRow = Boolean(
        row.description && row.category && row.date && row.type && !Number.isNaN(amountValue) && amountValue > 0
      );
      return { id: index + 1, valid: validRow, row };
    });
  }

  function handleFileRead(file) {
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result?.toString() ?? '';
      setCsvData(text);
      setCsvPreviewRows(parseCsvPreview(text));
      setCsvMessage('');
    };
    reader.readAsText(file);
  }

  function handleCsvFileChange(event) {
    const file = event.target.files?.[0];
    handleFileRead(file);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFileRead(file);
  }

  async function handleCsvImport(event) {
    event.preventDefault();
    if (!csvData) return;
    try {
      const response = await fetch(buildApiUrl('/api/import/csv', user), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_text: csvData }),
      });
      if (!response.ok) throw new Error('Unable to import CSV.');
      const data = await response.json();
      setCsvMessage(`Imported ${data.imported} transactions. Rejected ${data.rejected} invalid rows.`);
      showToast(`Imported ${data.imported} transactions`);
      setCsvData('');
      setCsvPreviewRows([]);
      setCsvFileName('');
      await loadAllData();
    } catch (err) {
      setCsvMessage(err.message);
    }
  }

  function handleDownloadReport() {
    window.open(buildApiUrl('/api/reports/pdf', user), '_blank');
  }

  function handleExportCsv() {
    window.open(buildApiUrl('/api/export/csv', user), '_blank');
  }

  function toggleSelectAll(event) {
    if (event.target.checked) {
      setSelectedTxIds(transactions.map((t) => t.id));
    } else {
      setSelectedTxIds([]);
    }
  }

  function toggleSelectTx(id) {
    setSelectedTxIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  if (!user) {
    return (
      <AuthPage
        mode={authMode}
        form={authForm}
        onChange={(event) => setAuthForm({ ...authForm, [event.target.name]: event.target.value })}
        onSubmit={handleAuthSubmit}
        onSwitch={() => {
          setAuthMode(authMode === 'register' ? 'login' : 'register');
          setError('');
        }}
        error={error}
        loading={authLoading}
      />
    );
  }

  const profileDetails = dashboard?.profile_details || {};
  const scores = dashboard?.scores || {};
  const charts = dashboard?.charts || {};
  const anomalies = dashboard?.anomalies || [];
  const mlPipeline = dashboard?.ml_pipeline_info || {};
  const selectedTimelineMonth = timeline.find((m) => m.month === selectedMonth) || timeline[0] || {};

  return (
    <div className="app-shell">
      {/* Toast Notification Banner */}
      {toast && (
        <div className="toast-banner">
          <span>{toast.message}</span>
          {toast.actionLabel && (
            <button
              type="button"
              className="toast-action-btn"
              onClick={() => {
                toast.actionHandler?.();
                setToast(null);
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <header className="hero-card">
        <div>
          <p className="eyebrow">FinPsych • Production Release v2.0</p>
          <h1>Behavioral Finance Intelligence & ML Analytics</h1>
          <p>Scikit-Learn Isolation Forest, K-Means Clustering, and Linear Regression forecasting in INR.</p>
        </div>
        <div className="hero-stats">
          <div>
            <strong>{formatCurrency(dashboard?.total_expenses)}</strong>
            <span>Spent this month</span>
          </div>
          <div>
            <strong>{formatCurrency(dashboard?.net_balance)}</strong>
            <span>Net balance</span>
          </div>
          <div>
            <strong>{scores.financial_health_score ?? 0} / 100</strong>
            <span>Health score ({scores.health_label || 'Good'})</span>
          </div>
        </div>
      </header>

      {/* Top Navbar */}
      <div className="toolbar">
        <div className="nav-tabs">
          <button className={activeTab === 'dashboard' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('dashboard')}>
            📊 Dashboard
          </button>
          <button className={activeTab === 'profile' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('profile')}>
            🧠 Behavioral Profile & ML
          </button>
          <button className={activeTab === 'transactions' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('transactions')}>
            💳 Transactions
          </button>
          <button className={activeTab === 'coach' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('coach')}>
            🤖 AI Coach
          </button>
          <button className={activeTab === 'import' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('import')}>
            📥 Smart CSV Import
          </button>
          <button className={activeTab === 'subscriptions' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('subscriptions')}>
            🔄 Subscriptions
          </button>
          <button className={activeTab === 'timeline' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('timeline')}>
            📅 Financial Timeline
          </button>
          <button className={activeTab === 'reports' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('reports')}>
            📑 PDF Report
          </button>
        </div>
        <div className="user-controls">
          <span className="user-email">{user}</span>
          <button type="button" className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      {/* VIEW 1: DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="tab-content">
          <section className="charts-grid">
            {/* 1. Monthly Spending Trend */}
            <div className="panel chart-panel">
              <h3>Monthly Spending Trend</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={charts.monthly_spending || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
                    <XAxis dataKey="month" stroke="#9bb4cb" />
                    <YAxis stroke="#9bb4cb" />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Line type="monotone" dataKey="value" stroke="#64c8ff" strokeWidth={3} dot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 2. Expense Category Distribution */}
            <div className="panel chart-panel">
              <h3>Expense Category Distribution</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={charts.category_breakdown || []}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {(charts.category_breakdown || []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 3. Income vs Expense */}
            <div className="panel chart-panel">
              <h3>Income vs Expense</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={charts.income_vs_expense || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
                    <XAxis dataKey="name" stroke="#9bb4cb" />
                    <YAxis stroke="#9bb4cb" />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {(charts.income_vs_expense || []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.name === 'Income' ? '#69f0ae' : '#ff8c82'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 4. Weekly Spending Trend */}
            <div className="panel chart-panel">
              <h3>Weekly Spending Trend</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={charts.weekly_spending || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
                    <XAxis dataKey="week" stroke="#9bb4cb" />
                    <YAxis stroke="#9bb4cb" />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Area type="monotone" dataKey="value" stroke="#a259ff" fill="#a259ff33" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 5. Budget Utilization Progress */}
            <div className="panel chart-panel">
              <h3>Budget Utilization Progress ({dashboard?.budget_utilization || 0}%)</h3>
              <div className="budget-progress-box">
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${Math.min(100, dashboard?.budget_utilization || 0)}%`,
                      backgroundColor: (dashboard?.budget_utilization || 0) > 85 ? '#ff5252' : '#43c6ac',
                    }}
                  />
                </div>
                <div className="budget-stats-row">
                  <span>Spent: {formatCurrency(dashboard?.total_expenses)}</span>
                  <span>Budget: {formatCurrency(dashboard?.monthly_budget)}</span>
                  <span>Remaining: {formatCurrency(dashboard?.budget_remaining)}</span>
                </div>
              </div>
            </div>

            {/* 6. Forecast vs Actual Comparison */}
            <div className="panel chart-panel">
              <h3>Forecast vs Actual Comparison</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={charts.forecast_comparison || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
                    <XAxis dataKey="name" stroke="#9bb4cb" />
                    <YAxis stroke="#9bb4cb" />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Bar dataKey="value" fill="#64c8ff" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Quick Controls Grid */}
          <section className="grid-layout secondary-grid">
            {/* Add Transaction Form */}
            <div className="panel">
              <h2>Add Transaction <small style={{ fontSize: '0.75rem', color: '#64c8ff' }}>(Ctrl+N)</small></h2>
              <form onSubmit={handleAddTransaction} className="transaction-form">
                <input
                  required
                  placeholder="Description (e.g., Grocery Shopping)"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
                <input
                  required
                  type="number"
                  min="1"
                  placeholder="Amount (₹)"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="Food">Food & Dining</option>
                  <option value="Lifestyle">Lifestyle & Entertainment</option>
                  <option value="Shopping">Shopping</option>
                  <option value="Subscription">Subscription</option>
                  <option value="Utilities">Utilities & Bills</option>
                  <option value="Travel">Travel & Transport</option>
                  <option value="Salary">Income / Salary</option>
                </select>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
                <button type="submit">Save Transaction</button>
              </form>
            </div>

            {/* Budget Management */}
            <div className="panel">
              <h2>Budget Management</h2>
              <form onSubmit={handleBudgetSave} className="transaction-form">
                <label className="budget-label" htmlFor="budget-input">Monthly Budget Limit (₹)</label>
                <input
                  id="budget-input"
                  type="number"
                  min="1000"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
                <button type="submit">Update Budget Limit</button>
              </form>
              <div className="insight-card" style={{ marginTop: '16px' }}>
                <h3>Budget Status</h3>
                <p>{dashboard?.budget_message}</p>
              </div>
            </div>
          </section>

          {/* Timeline Cards / Activity Log */}
          <section className="panel">
            <div className="panel-header">
              <h2>Timeline Activity Stream</h2>
              <span>Real-Time Audit Trail</span>
            </div>
            <div className="activity-cards">
              {activities.map((act) => (
                <div className="activity-card" key={act.id}>
                  <div className="activity-icon">⚡</div>
                  <div className="activity-content">
                    <strong>{act.title}</strong>
                    <p>{act.details}</p>
                    <span className="activity-time">{act.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* VIEW 2: BEHAVIORAL PROFILE & ML INSIGHTS */}
      {activeTab === 'profile' && (
        <div className="tab-content">
          <section className="panel highlight-panel">
            <div className="profile-header">
              <div>
                <span className="badge">Behavioral Intelligence Profile</span>
                <h2>{profileDetails.name || 'Balanced Planner'}</h2>
                <p className="reason-quote">"{profileDetails.reason}"</p>
              </div>
              <div className="confidence-pill">
                <strong>{profileDetails.confidence || 88}%</strong>
                <span>Confidence</span>
              </div>
            </div>

            <div className="dominant-behaviors">
              <h4>Dominant Behaviors:</h4>
              <div className="tag-list">
                {(profileDetails.dominant_behaviors || []).map((b, i) => (
                  <span className="behavior-tag" key={i}>
                    ✓ {b}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* Detailed ML Pipeline Information Card */}
          <section className="panel">
            <h2>Scikit-Learn ML Pipeline Status & Explainability</h2>
            <div className="ml-pipeline-grid">
              <div className="ml-card">
                <span className="ml-tag">Anomaly Engine</span>
                <h4>{mlPipeline.isolation_forest?.model_name || 'Isolation Forest'}</h4>
                <p>Status: <strong>{mlPipeline.isolation_forest?.status || 'Active'}</strong></p>
                <p>Training Data: {mlPipeline.isolation_forest?.training_size || 0} items</p>
                <p>Anomalies Detected: {mlPipeline.isolation_forest?.anomalies_detected || 0}</p>
                <span className="ml-time">Last Trained: {mlPipeline.isolation_forest?.last_trained || 'Just now'}</span>
              </div>
              <div className="ml-card">
                <span className="ml-tag">Clustering Engine</span>
                <h4>{mlPipeline.kmeans?.model_name || 'K-Means Clustering'}</h4>
                <p>Assigned: <strong>{mlPipeline.kmeans?.assigned_cluster || 'Balanced Planner'}</strong></p>
                <p>Training Size: {mlPipeline.kmeans?.training_size || 0} samples</p>
                <p>Confidence: {mlPipeline.kmeans?.confidence || 88}%</p>
                <span className="ml-time">Last Trained: {mlPipeline.kmeans?.last_trained || 'Just now'}</span>
              </div>
              <div className="ml-card">
                <span className="ml-tag">Forecast Engine</span>
                <h4>{mlPipeline.linear_regression?.model_name || 'Linear Regression'}</h4>
                <p>End of Month: <strong>{formatCurrency(mlPipeline.linear_regression?.end_of_month_prediction)}</strong></p>
                <p>Next Month: <strong>{formatCurrency(mlPipeline.linear_regression?.next_month_prediction)}</strong></p>
                <p>Confidence: {mlPipeline.linear_regression?.r2_confidence || 85}%</p>
                <span className="ml-time">Last Trained: {mlPipeline.linear_regression?.last_trained || 'Just now'}</span>
              </div>
            </div>
          </section>

          {/* Detailed Behavioral Metrics Grid */}
          <section className="metrics-grid">
            <div className="metric-card">
              <h3>Budget Discipline</h3>
              <p className="metric-value">{profileDetails.budget_discipline || 0}%</p>
            </div>
            <div className="metric-card">
              <h3>Impulse Score</h3>
              <p className="metric-value">{profileDetails.impulse_score || 0}%</p>
            </div>
            <div className="metric-card">
              <h3>Financial Wellness</h3>
              <p className="metric-value">{profileDetails.financial_wellness_score || 0}%</p>
            </div>
            <div className="metric-card">
              <h3>Savings Consistency</h3>
              <p className="metric-value">{profileDetails.savings_consistency || 0}%</p>
            </div>
            <div className="metric-card">
              <h3>Spending Frequency</h3>
              <p className="metric-value">{profileDetails.spending_frequency || 0} txs</p>
            </div>
            <div className="metric-card">
              <h3>Weekend Spending</h3>
              <p className="metric-value">{profileDetails.weekend_spending_pct || 0}%</p>
            </div>
            <div className="metric-card">
              <h3>Late Night Spending</h3>
              <p className="metric-value">{profileDetails.late_night_spending_pct || 0}%</p>
            </div>
          </section>

          {/* ML Insights & Explainability */}
          <section className="grid-layout secondary-grid">
            <div className="panel">
              <h2>ML Anomaly Explainability</h2>
              {anomalies.length > 0 ? (
                <div className="insight-list">
                  {anomalies.map((anom, idx) => (
                    <div className="insight-card anomaly-card" key={idx}>
                      <div className="anomaly-header">
                        <strong>{anom.description} — {formatCurrency(anom.amount)}</strong>
                        <span className="anomaly-badge">Score: {anom.anomaly_score || anom.score} ({anom.confidence}% Conf.)</span>
                      </div>
                      <p className="anomaly-reason"><strong>Reason:</strong> {anom.explanation || anom.reason}</p>
                      <span className="category-tag">Category: {anom.category} | Date: {anom.date}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="notice success">
                  ✓ No unusual spending anomalies detected by Isolation Forest algorithm.
                </div>
              )}
            </div>

            <div className="panel">
              <h2>Financial Health Score Formula</h2>
              <div className="score-main-display">
                <div className="score-circle">
                  <span>{scores.financial_health_score || 75}</span>
                  <small>/100</small>
                </div>
                <div>
                  <h3>Overall Rating: {scores.health_label || 'Good'}</h3>
                  <p>Weighted composition across 6 behavioral factors.</p>
                </div>
              </div>

              <div className="score-breakdown-list">
                {(scores.breakdown || []).map((item, index) => (
                  <div className="breakdown-item" key={index}>
                    <div>
                      <strong>{item.factor}</strong> ({item.weight})
                    </div>
                    <div>
                      <span className="item-score">{item.score}%</span>
                      <strong className="item-impact">{item.impact}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* VIEW 3: DEDICATED TRANSACTIONS HISTORY */}
      {activeTab === 'transactions' && (
        <div className="tab-content">
          <section className="panel">
            <div className="panel-header">
              <h2>Transaction History</h2>
              <div className="header-actions">
                <button type="button" className="action-btn" onClick={handleExportCsv}>
                  📥 Export CSV
                </button>
                <button type="button" className="action-btn primary" onClick={handleDownloadReport}>
                  📑 Export PDF
                </button>
              </div>
            </div>

            {/* Bulk Toolbar if items selected */}
            {selectedTxIds.length > 0 && (
              <div className="bulk-toolbar">
                <span>{selectedTxIds.length} transactions selected</span>
                <div className="bulk-actions">
                  <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}>
                    <option value="Food">Food</option>
                    <option value="Lifestyle">Lifestyle</option>
                    <option value="Shopping">Shopping</option>
                    <option value="Subscription">Subscription</option>
                    <option value="Utilities">Utilities</option>
                    <option value="Travel">Travel</option>
                  </select>
                  <button type="button" className="bulk-update-btn" onClick={handleBulkCategoryUpdate}>
                    Set Category
                  </button>
                  <button type="button" className="bulk-delete-btn" onClick={handleBulkDelete}>
                    🗑️ Delete Selected
                  </button>
                </div>
              </div>
            )}

            {/* Search & Filter Toolbar */}
            <div className="tx-toolbar">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search transactions... (Ctrl+F)"
                value={txSearch}
                onChange={(e) => {
                  setTxSearch(e.target.value);
                  setTxPage(1);
                }}
              />
              <select
                value={txCategory}
                onChange={(e) => {
                  setTxCategory(e.target.value);
                  setTxPage(1);
                }}
              >
                <option value="">All Categories</option>
                <option value="Food">Food</option>
                <option value="Lifestyle">Lifestyle</option>
                <option value="Shopping">Shopping</option>
                <option value="Subscription">Subscription</option>
                <option value="Utilities">Utilities</option>
                <option value="Travel">Travel</option>
              </select>
              <select
                value={txTypeFilter}
                onChange={(e) => {
                  setTxTypeFilter(e.target.value);
                  setTxPage(1);
                }}
              >
                <option value="">All Types</option>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              <select value={txSortBy} onChange={(e) => setTxSortBy(e.target.value)}>
                <option value="date">Sort by Date</option>
                <option value="amount">Sort by Amount</option>
              </select>
              <select value={txOrder} onChange={(e) => setTxOrder(e.target.value)}>
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>

            {/* Transactions Table */}
            <div className="tx-table-container">
              <table className="tx-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={transactions.length > 0 && selectedTxIds.length === transactions.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className={selectedTxIds.includes(tx.id) ? 'selected-row' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedTxIds.includes(tx.id)}
                          onChange={() => toggleSelectTx(tx.id)}
                        />
                      </td>
                      <td>{tx.date}</td>
                      <td>
                        <strong>{tx.description}</strong>
                      </td>
                      <td>
                        <span className="category-pill">{tx.category}</span>
                      </td>
                      <td>
                        <span className={tx.type === 'expense' ? 'tx-type expense' : 'tx-type income'}>
                          {tx.type}
                        </span>
                      </td>
                      <td>
                        <strong className={tx.type === 'expense' ? 'expense' : 'income'}>
                          {tx.type === 'expense' ? '-' : '+'}{formatCurrency(tx.amount)}
                        </strong>
                      </td>
                      <td className="actions-cell">
                        <button type="button" title="Edit" onClick={() => setEditingTx(tx)}>
                          ✏️
                        </button>
                        <button type="button" title="Duplicate" onClick={() => handleDuplicateTx(tx.id)}>
                          📋
                        </button>
                        <button type="button" title="Delete" onClick={() => handleDeleteTx(tx.id)}>
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan="7" className="empty-cell">
                        No transactions found matching your criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="pagination-bar">
              <span>
                Showing Page {txPage} of {txTotalPages} ({txTotalCount} Total)
              </span>
              <div>
                <button disabled={txPage <= 1} onClick={() => setTxPage(txPage - 1)}>
                  ◀ Previous
                </button>
                <button disabled={txPage >= txTotalPages} onClick={() => setTxPage(txPage + 1)}>
                  Next ▶
                </button>
              </div>
            </div>
          </section>

          {/* Edit Transaction Modal / Overlay */}
          {editingTx && (
            <div className="modal-overlay">
              <div className="modal-content panel">
                <h3>Edit Transaction</h3>
                <form onSubmit={handleEditSave} className="transaction-form">
                  <input
                    required
                    value={editingTx.description}
                    onChange={(e) => setEditingTx({ ...editingTx, description: e.target.value })}
                  />
                  <input
                    required
                    type="number"
                    value={editingTx.amount}
                    onChange={(e) => setEditingTx({ ...editingTx, amount: e.target.value })}
                  />
                  <input
                    required
                    value={editingTx.category}
                    onChange={(e) => setEditingTx({ ...editingTx, category: e.target.value })}
                  />
                  <input
                    type="date"
                    value={editingTx.date}
                    onChange={(e) => setEditingTx({ ...editingTx, date: e.target.value })}
                  />
                  <select
                    value={editingTx.type}
                    onChange={(e) => setEditingTx({ ...editingTx, type: e.target.value })}
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                  <div className="modal-actions">
                    <button type="submit">Save Changes</button>
                    <button type="button" className="cancel-btn" onClick={() => setEditingTx(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 4: ADVANCED AI COACH */}
      {activeTab === 'coach' && (
        <div className="tab-content">
          <section className="grid-layout secondary-grid">
            <div className="panel">
              <h2>Advanced AI Financial Coach</h2>
              <p>Ask questions grounded directly in your real financial analytics:</p>

              <div className="suggested-questions">
                <button type="button" onClick={() => setCoachQuestion('How can I save more?')}>
                  How can I save more?
                </button>
                <button type="button" onClick={() => setCoachQuestion('Why am I overspending?')}>
                  Why am I overspending?
                </button>
                <button type="button" onClick={() => setCoachQuestion('What category is highest?')}>
                  What category is highest?
                </button>
                <button type="button" onClick={() => setCoachQuestion('Am I financially healthy?')}>
                  Am I financially healthy?
                </button>
                <button type="button" onClick={() => setCoachQuestion('What should I improve next?')}>
                  What should I improve next?
                </button>
              </div>

              <form onSubmit={handleCoachSubmit} className="transaction-form" style={{ marginTop: '16px' }}>
                <textarea
                  rows="3"
                  value={coachQuestion}
                  onChange={(e) => setCoachQuestion(e.target.value)}
                  placeholder="Ask a custom financial query..."
                />
                <button type="submit">Consult AI Coach</button>
              </form>
            </div>

            <div className="panel">
              <h2>Coach Live Response</h2>
              <div className="insight-card coach-card">
                <div className="coach-header">
                  <span className="coach-avatar">🤖</span>
                  <h3>Analytics-Grounded Advice</h3>
                </div>
                <p className="coach-text">{coachResponse || dashboard?.coach_message}</p>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* VIEW 5: SMART CSV IMPORT */}
      {activeTab === 'import' && (
        <div className="tab-content">
          <section className="panel">
            <h2>Smart CSV File Import</h2>
            <p>Upload or drag & drop CSV files. Automatic validation & analytics recalculation.</p>

            <form onSubmit={handleCsvImport} className="transaction-form">
              <div
                className={`dropzone ${isDragOver ? 'drag-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
              >
                <p>📄 Drag & drop your statement CSV here, or</p>
                <label className="file-input-label">
                  Browse File
                  <input type="file" accept=".csv" onChange={handleCsvFileChange} />
                </label>
                {csvFileName && <p className="selected-filename">Selected: {csvFileName}</p>}
              </div>

              {csvPreviewRows.length > 0 && (
                <div className="csv-preview">
                  <h3>Import Preview ({csvPreviewRows.length} Total Rows)</h3>
                  <div className="csv-summary">
                    <span className="status-badge valid">
                      Valid Rows: {csvPreviewRows.filter((r) => r.valid).length}
                    </span>
                    <span className="status-badge invalid">
                      Invalid Rows: {csvPreviewRows.filter((r) => !r.valid).length}
                    </span>
                  </div>
                  <div className="preview-table">
                    <div className="preview-row preview-header">
                      {Object.keys(csvPreviewRows[0].row).map((k) => (
                        <strong key={k}>{k}</strong>
                      ))}
                      <strong>Status</strong>
                    </div>
                    {csvPreviewRows.slice(0, 8).map((item) => (
                      <div className="preview-row" key={item.id}>
                        {Object.values(item.row).map((val, idx) => (
                          <span key={idx}>{val}</span>
                        ))}
                        <span className={item.valid ? 'valid' : 'invalid'}>
                          {item.valid ? '✓ OK' : '✕ Invalid'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button type="submit" disabled={!csvData}>
                Import Verified Transactions
              </button>
            </form>

            {csvMessage && <p className="notice success">{csvMessage}</p>}
          </section>
        </div>
      )}

      {/* VIEW 6: SUBSCRIPTION DETECTOR */}
      {activeTab === 'subscriptions' && (
        <div className="tab-content">
          <section className="panel">
            <h2>Recurring Subscription Detector</h2>
            <p>Automatically identified recurring services from transaction history:</p>

            <div className="subscription-grid">
              {subscriptions.map((sub, idx) => (
                <div className={`sub-card ${sub.status === 'Ignored' ? 'ignored' : ''}`} key={idx}>
                  <div className="sub-header">
                    <strong>{sub.name}</strong>
                    <span className={`status-pill ${sub.status.toLowerCase()}`}>{sub.status}</span>
                  </div>
                  <div className="sub-body">
                    <div>
                      <span>Monthly Cost:</span>
                      <strong>{formatCurrency(sub.amount)}</strong>
                    </div>
                    <div>
                      <span>Annual Cost:</span>
                      <strong>{formatCurrency(sub.annual_cost || sub.amount * 12)}</strong>
                    </div>
                    <div>
                      <span>Next Payment:</span>
                      <strong>{sub.next_date}</strong>
                    </div>
                  </div>
                  <div className="sub-actions">
                    {sub.status !== 'Confirmed' && (
                      <button type="button" onClick={() => handleSubscriptionStatus(sub.id || idx + 1, 'Confirmed')}>
                        Confirm
                      </button>
                    )}
                    {sub.status !== 'Ignored' && (
                      <button
                        type="button"
                        className="ignore-btn"
                        onClick={() => handleSubscriptionStatus(sub.id || idx + 1, 'Ignored')}
                      >
                        Ignore
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {subscriptions.length === 0 && (
                <div className="notice success">No recurring subscriptions detected yet.</div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* VIEW 7: FINANCIAL TIMELINE */}
      {activeTab === 'timeline' && (
        <div className="tab-content">
          <section className="panel">
            <div className="panel-header">
              <h2>Financial Timeline & Monthly Comparison</h2>
              {timeline.length > 0 && (
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                  {timeline.map((m) => (
                    <option key={m.month} value={m.month}>
                      Month: {m.month}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedTimelineMonth && (
              <div className="timeline-month-card highlight-panel">
                <div className="month-header">
                  <h3>Month: {selectedTimelineMonth.month}</h3>
                  <span className="health-score-pill">
                    Health Score: {selectedTimelineMonth.financial_health_score}/100
                  </span>
                </div>
                <div className="month-stats-grid">
                  <div>
                    <span>Monthly Spending</span>
                    <strong>{formatCurrency(selectedTimelineMonth.monthly_spending)}</strong>
                  </div>
                  <div>
                    <span>Monthly Income</span>
                    <strong>{formatCurrency(selectedTimelineMonth.monthly_income)}</strong>
                  </div>
                  <div>
                    <span>Budget Limit</span>
                    <strong>{formatCurrency(selectedTimelineMonth.budget)}</strong>
                  </div>
                  <div>
                    <span>Savings</span>
                    <strong>{formatCurrency(selectedTimelineMonth.savings)}</strong>
                  </div>
                  <div>
                    <span>Behavior Profile</span>
                    <strong>{selectedTimelineMonth.behavior_profile}</strong>
                  </div>
                  <div>
                    <span>Forecast Accuracy</span>
                    <strong>{selectedTimelineMonth.forecast_accuracy}</strong>
                  </div>
                </div>
                <p className="month-summary">
                  <strong>AI Month Summary:</strong> {selectedTimelineMonth.ai_summary}
                </p>
              </div>
            )}

            {/* Month to Month Comparison Table */}
            <h3 style={{ marginTop: '24px' }}>Month-over-Month Historical Trends</h3>
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Spending</th>
                  <th>Income</th>
                  <th>Savings</th>
                  <th>Health Score</th>
                  <th>Profile</th>
                  <th>MoM Change</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td>{formatCurrency(m.monthly_spending)}</td>
                    <td>{formatCurrency(m.monthly_income)}</td>
                    <td>{formatCurrency(m.savings)}</td>
                    <td>{m.financial_health_score}/100</td>
                    <td>{m.behavior_profile}</td>
                    <td>
                      <span className={m.mom_spending_change > 0 ? 'expense' : 'income'}>
                        {m.mom_spending_change > 0 ? `+${m.mom_spending_change}%` : `${m.mom_spending_change}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {/* VIEW 8: PDF REPORT GENERATOR */}
      {activeTab === 'reports' && (
        <div className="tab-content">
          <section className="panel">
            <h2>Monthly Financial Report Generator</h2>
            <p>Generate and download a comprehensive PDF report containing executive analytics, behavioral profiles, anomalies, and AI coach recommendations.</p>

            <div className="report-summary-card">
              <h3>Report Package Includes:</h3>
              <ul className="report-bullets">
                <li>✓ Executive Dashboard Summary Table (Expenses, Income, Net Balance, Health Score)</li>
                <li>✓ Behavioral Intelligence Profile Evaluation & Confidence Level</li>
                <li>✓ ML Isolation Forest Anomaly Detection & Risk Analysis</li>
                <li>✓ Category Breakdown & Spending Trend Analysis</li>
                <li>✓ AI Coach Primary Recommendations</li>
                <li>✓ Itemized Recent Transactions Audit Sheet</li>
              </ul>

              <button type="button" className="download-report-btn" onClick={handleDownloadReport}>
                📄 Download PDF Financial Report
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
