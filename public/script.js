
const $ = (id) => document.getElementById(id);

let allSales = [];
let filteredSales = [];
let chartInstances = {};
let currentPage = 1;
const pageSize = 12;

const pageConfig = {
  overview: {
    title: "Overview",
    subtitle: "A clear view of your sales performance."
  },
  analytics: {
    title: "Analytics",
    subtitle: "Understand revenue trends and sales distribution."
  },
  records: {
    title: "Transactions",
    subtitle: "Search and review individual sales records."
  }
};

function setStatus(message, type = "success") {
  const el = $("status");
  if (!el) return;
  el.textContent = message;
  el.className = `status visible${type === "error" ? " error" : ""}`;
}

function clearStatus() {
  $("status").className = "status";
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function parseDate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  // Convert Excel date serial numbers into JavaScript dates.
  if (
    typeof value === "number" ||
    (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim()))
  ) {
    const serial = Number(value);

    if (serial > 20000 && serial < 80000) {
      const date = new Date(
        Date.UTC(1899, 11, 30) + serial * 86400000
      );

      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  const text = String(value).trim();
  const parsed = new Date(text);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);

  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += 2000;

    const date = new Date(
      year,
      Number(match[2]) - 1,
      Number(match[1])
    );

    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function dateKey(value) {
  const date = parseDate(value);
  if (!date) return "";

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function displayDate(value) {
  const date = parseDate(value);

  return date
    ? date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      })
    : "—";
}

function getField(row, candidates) {
  const keys = Object.keys(row || {});

  for (const candidate of candidates) {
    const normalizedCandidate = candidate
      .toLowerCase()
      .replace(/[\s_-]/g, "");

    const key = keys.find(
      k => k.toLowerCase().replace(/[\s_-]/g, "") === normalizedCandidate
    );

    if (
      key !== undefined &&
      row[key] !== null &&
      row[key] !== undefined
    ) {
      return row[key];
    }
  }

  return "";
}

function normalizeSale(row) {
  const quantity =
    Number(getField(row, ["Quantity", "Qty"])) || 0;

  const unitPrice =
    Number(getField(row, ["Unit Price", "UnitPrice", "Price"])) || 0;

  const discountRaw =
    Number(getField(row, ["Discount"])) || 0;

  const revenueRaw = getField(row, [
    "Revenue",
    "Total Revenue",
    "Sales"
  ]);

  let revenue = Number(revenueRaw);

  if (!Number.isFinite(revenue)) {
    revenue = quantity * unitPrice;
  }

  // Apply a discount only when revenue is missing.
  if (
    revenueRaw === "" ||
    revenueRaw === null ||
    revenueRaw === undefined
  ) {
    const discountFraction =
      discountRaw > 1 ? discountRaw / 100 : discountRaw;

    revenue =
      quantity *
      unitPrice *
      (1 - Math.min(Math.max(discountFraction, 0), 1));
  }

  return {
    raw: row,
    date: getField(row, ["Date", "Order Date", "Sale Date"]),
    orderId: String(
      getField(row, ["Order ID", "OrderID", "Booking ID", "ID"]) || "—"
    ),
    region: String(getField(row, ["Region"]) || "Unknown"),
    channel: String(
      getField(row, ["Sales Channel", "Channel"]) || "Unknown"
    ),
    customerType: String(
      getField(row, ["Customer Type", "CustomerType"]) || "Unknown"
    ),
    category: String(
      getField(row, ["Product Category", "Category"]) || "Unknown"
    ),
    product: String(
      getField(row, ["Product", "Product Name"]) || "Unknown"
    ),
    salesperson: String(
      getField(row, ["Salesperson", "Sales Person", "Seller"]) || "Unknown"
    ),
    quantity,
    unitPrice,
    discount: discountRaw,
    revenue: Number.isFinite(revenue) ? revenue : 0
  };
}

function uniqueSorted(values) {
  return [
    ...new Set(values.filter(v => v && v !== "Unknown"))
  ].sort((a, b) => a.localeCompare(b));
}

function populateSelect(id, values, allLabel) {
  const select = $(id);
  const oldValue = select.value;

  select.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = allLabel;
  select.appendChild(allOption);

  uniqueSorted(values).forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });

  if ([...select.options].some(option => option.value === oldValue)) {
    select.value = oldValue;
  }
}

function setDateRange() {
  const validDates = allSales
    .map(sale => dateKey(sale.date))
    .filter(Boolean)
    .sort();

  if (!validDates.length) return;

  $("startDate").min = validDates[0];
  $("startDate").max = validDates[validDates.length - 1];
  $("endDate").min = validDates[0];
  $("endDate").max = validDates[validDates.length - 1];

  $("startDate").value = validDates[0];
  $("endDate").value = validDates[validDates.length - 1];
}

async function loadSales() {
  $("refreshBtn").disabled = true;
  $("refreshBtn").textContent = "Loading…";

  setStatus("Loading sales data…");

  try {
    const response = await fetch("/api/sales", {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`API returned HTTP ${response.status}`);
    }

    const payload = await response.json();

    const rows = Array.isArray(payload)
      ? payload
      : payload.sales || payload.data || payload.records || [];

    if (!Array.isArray(rows)) {
      throw new Error("The sales API did not return a list of records.");
    }

    allSales = rows.map(normalizeSale);

    populateSelect(
      "regionFilter",
      allSales.map(sale => sale.region),
      "All regions"
    );

    populateSelect(
      "categoryFilter",
      allSales.map(sale => sale.category),
      "All categories"
    );

    setDateRange();

    currentPage = 1;
    applyFilters();

    $("lastUpdated").textContent =
      `Updated ${new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit"
      })}`;

    setStatus(
      `Sales data loaded successfully · ${formatNumber(allSales.length)} records`
    );

    window.setTimeout(clearStatus, 3500);
  } catch (error) {
    console.error("Unable to load sales:", error);

    setStatus(
      `Could not load sales data. ${error.message}. Check that the server is running and /api/sales is available.`,
      "error"
    );

    $("salesTable").innerHTML =
      '<tr><td colspan="9" class="empty-cell">Unable to load records. Check the server/API and refresh.</td></tr>';
  } finally {
    $("refreshBtn").disabled = false;
    $("refreshBtn").textContent = "↻ Refresh data";
  }
}

function applyFilters() {
  const start = $("startDate").value;
  const end = $("endDate").value;
  const region = $("regionFilter").value;
  const category = $("categoryFilter").value;
  const search = $("searchInput").value.trim().toLowerCase();

  filteredSales = allSales.filter(sale => {
    const date = dateKey(sale.date);

    if (start && date && date < start) return false;
    if (end && date && date > end) return false;
    if (region && sale.region !== region) return false;
    if (category && sale.category !== category) return false;

    if (search) {
      const searchable = [
        sale.orderId,
        sale.region,
        sale.channel,
        sale.category,
        sale.product,
        sale.salesperson,
        sale.customerType
      ].join(" ").toLowerCase();

      if (!searchable.includes(search)) return false;
    }

    return true;
  });

  currentPage = Math.min(
    currentPage,
    Math.max(1, Math.ceil(filteredSales.length / pageSize))
  );

  renderDashboard();
}

function aggregateRevenue(rows, keyFn) {
  const totals = new Map();

  rows.forEach(row => {
    const key = keyFn(row);
    if (!key) return;

    totals.set(key, (totals.get(key) || 0) + row.revenue);
  });

  return [...totals.entries()].sort(
    (a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })
  );
}

function getUniqueOrderCount(rows) {
  const ids = rows
    .map(sale => sale.orderId)
    .filter(id => id && id !== "—");

  return ids.length ? new Set(ids).size : rows.length;
}

function updateKPIs() {
  const revenue = filteredSales.reduce(
    (sum, sale) => sum + sale.revenue,
    0
  );

  const orders = getUniqueOrderCount(filteredSales);

  const units = filteredSales.reduce(
    (sum, sale) => sum + sale.quantity,
    0
  );

  $("totalRevenue").textContent = formatMoney(revenue);
  $("totalOrders").textContent = formatNumber(orders);
  $("totalUnits").textContent = formatNumber(units);
  $("averageOrder").textContent = formatMoney(
    orders ? revenue / orders : 0
  );

  $("recordCount").textContent = formatNumber(filteredSales.length);

  const regionTotals = aggregateRevenue(
    filteredSales,
    sale => sale.region
  ).sort((a, b) => b[1] - a[1]);

  const categoryTotals = aggregateRevenue(
    filteredSales,
    sale => sale.category
  ).sort((a, b) => b[1] - a[1]);

  $("topRegion").textContent = regionTotals[0]?.[0] || "—";
  $("topCategory").textContent = categoryTotals[0]?.[0] || "—";
}

function chartOptions(isHorizontal = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: isHorizontal ? "y" : "x",

    plugins: {
      legend: { display: false },

      tooltip: {
        backgroundColor: "#17213b",
        padding: 11,

        callbacks: {
          label: context =>
            ` ${formatMoney(
              context.parsed.y ??
              context.parsed.x ??
              context.raw
            )}`
        }
      }
    },

    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: "#9299aa",
          maxRotation: 0,
          autoSkip: true
        },
        border: { display: false }
      },

      y: {
        beginAtZero: true,
        grid: { color: "#eff1f6" },
        ticks: {
          color: "#9299aa",
          callback: value => formatMoney(value)
        },
        border: { display: false }
      }
    }
  };
}

function makeChart(id, type, labels, values, options = {}) {
  const canvas = $(id);
  if (!canvas || typeof Chart === "undefined") return;

  if (chartInstances[id]) {
    chartInstances[id].destroy();
  }

  const isHorizontal = options.indexAxis === "y";

  const palette = [
    "#8173e6",
    "#5e9fe3",
    "#46c6a0",
    "#f2b35e",
    "#e57e9c",
    "#7c91b8",
    "#a48be8",
    "#65c4d0"
  ];

  const colors = values.map(
    (_, index) => palette[index % palette.length]
  );

  const dataset = {
    label: "Revenue",
    data: values,

    backgroundColor: type === "line" ? "#8173e6" : colors,
    borderColor: type === "line" ? "#8173e6" : colors,
    borderWidth: type === "line" ? 2.5 : 0,
    borderRadius: type === "bar" ? 5 : 0,
    fill: type === "line",
    tension: 0.35,
    pointRadius: type === "line" ? 3 : 0,
    pointHoverRadius: 5
  };

  const opts = chartOptions(isHorizontal);

  if (type === "doughnut") {
    opts.plugins.legend = {
      display: true,
      position: "bottom",
      labels: {
        usePointStyle: true,
        pointStyle: "circle",
        boxWidth: 7,
        padding: 15,
        color: "#788196"
      }
    };

    opts.cutout = "65%";
    opts.scales = {};
    dataset.borderWidth = 2;
    dataset.borderColor = "#fff";
  }

  if (options.indexAxis === "y") {
    opts.scales.x = {
      beginAtZero: true,
      grid: { color: "#eff1f6" },
      ticks: {
        color: "#9299aa",
        callback: value => formatMoney(value)
      },
      border: { display: false }
    };

    opts.scales.y = {
      grid: { display: false },
      ticks: { color: "#788196" },
      border: { display: false }
    };
  }

  chartInstances[id] = new Chart(canvas, {
    type,
    data: {
      labels,
      datasets: [dataset]
    },
    options: opts
  });
}

function updateCharts() {
  const monthly = aggregateRevenue(filteredSales, sale => {
    const date = parseDate(sale.date);

    return date
      ? `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, "0")}`
      : "";
  });

  const monthLabels = monthly.map(([key]) => {
    const [year, month] = key.split("-");

    return new Date(
      Number(year),
      Number(month) - 1,
      1
    ).toLocaleDateString("en-IN", {
      month: "short",
      year: "2-digit"
    });
  });

  const monthValues = monthly.map(([, value]) => value);

  makeChart(
    "overviewTrendChart",
    "line",
    monthLabels,
    monthValues
  );

  makeChart(
    "monthlyChart",
    "line",
    monthLabels,
    monthValues
  );

  const regions = aggregateRevenue(
    filteredSales,
    sale => sale.region
  ).sort((a, b) => b[1] - a[1]);

  makeChart(
    "regionChart",
    "bar",
    regions.map(([key]) => key),
    regions.map(([, value]) => value),
    { indexAxis: "y" }
  );

  const categories = aggregateRevenue(
    filteredSales,
    sale => sale.category
  ).sort((a, b) => b[1] - a[1]);

  makeChart(
    "categoryChart",
    "doughnut",
    categories.map(([key]) => key),
    categories.map(([, value]) => value)
  );

  const channels = aggregateRevenue(
    filteredSales,
    sale => sale.channel
  ).sort((a, b) => b[1] - a[1]);

  makeChart(
    "channelChart",
    "bar",
    channels.map(([key]) => key),
    channels.map(([, value]) => value),
    { indexAxis: "y" }
  );
}

function renderTable() {
  const startIndex = (currentPage - 1) * pageSize;

  const pageRows = filteredSales.slice(
    startIndex,
    startIndex + pageSize
  );

  const tbody = $("salesTable");

  if (!pageRows.length) {
    tbody.innerHTML =
      '<tr><td colspan="9" class="empty-cell">No transactions match your filters.</td></tr>';
  } else {
    tbody.innerHTML = pageRows.map(sale => `
      <tr>
        <td>${escapeHtml(displayDate(sale.date))}</td>
        <td>${escapeHtml(sale.orderId)}</td>
        <td>${escapeHtml(sale.region)}</td>
        <td>${escapeHtml(sale.channel)}</td>
        <td>${escapeHtml(sale.category)}</td>
        <td>${escapeHtml(sale.product)}</td>
        <td>${escapeHtml(sale.salesperson)}</td>
        <td class="numeric">${formatNumber(sale.quantity)}</td>
        <td class="numeric">${formatMoney(sale.revenue)}</td>
      </tr>
    `).join("");
  }

  const totalPages = Math.max(
    1,
    Math.ceil(filteredSales.length / pageSize)
  );

  $("tableSummary").textContent =
    `Showing ${formatNumber(filteredSales.length)} matching records`;

  $("tablePageInfo").textContent = filteredSales.length
    ? `Page ${currentPage} of ${totalPages} · ${formatNumber(filteredSales.length)} records`
    : "No records";

  $("prevPage").disabled = currentPage <= 1;
  $("nextPage").disabled = currentPage >= totalPages;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function renderDashboard() {
  updateKPIs();
  updateCharts();
  renderTable();
}

function showPage(pageName) {
  const config = pageConfig[pageName] || pageConfig.overview;

  document.querySelectorAll(".page-section").forEach(section => {
    section.hidden = section.dataset.section !== pageName;
    section.classList.toggle("active-page", !section.hidden);
  });

  document.querySelectorAll(".nav-link").forEach(link => {
    const active = link.dataset.page === pageName;

    link.classList.toggle("active", active);

    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  $("pageTitle").textContent = config.title;
  $("pageSubtitle").textContent = config.subtitle;

  if (pageName === "analytics" || pageName === "overview") {
    requestAnimationFrame(() => {
      Object.values(chartInstances).forEach(chart => chart.resize());
    });
  }
}

// Sidebar navigation.
document.querySelectorAll(".nav-link").forEach(link => {
  link.addEventListener("click", event => {
    event.preventDefault();

    const page = link.dataset.page;
    showPage(page);

    history.replaceState(
      null,
      "",
      `#${page === "records" ? "records" : page}`
    );
  });
});

// Date and dropdown filters.
["startDate", "endDate", "regionFilter", "categoryFilter"].forEach(id => {
  $(id).addEventListener("change", () => {
    currentPage = 1;
    applyFilters();
  });
});

// Transaction search.
$("searchInput").addEventListener("input", () => {
  currentPage = 1;
  applyFilters();
});

// Reset all filters.
$("resetFilters").addEventListener("click", () => {
  setDateRange();

  $("regionFilter").value = "";
  $("categoryFilter").value = "";
  $("searchInput").value = "";

  currentPage = 1;
  applyFilters();
});

// Reload data from the API.
$("refreshBtn").addEventListener("click", loadSales);

// Table pagination.
$("prevPage").addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderTable();
  }
});

$("nextPage").addEventListener("click", () => {
  if (currentPage < Math.ceil(filteredSales.length / pageSize)) {
    currentPage++;
    renderTable();
  }
});

// Open the page specified in the URL, if present.
const initialPage =
  location.hash === "#analytics"
    ? "analytics"
    : location.hash === "#records"
      ? "records"
      : "overview";

showPage(initialPage);
loadSales();
