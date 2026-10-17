
let allSales = [];
let salesChart = null;
let categoryChart = null;

const $ = (selector) => document.querySelector(selector);

function getValue(row, possibleNames) {
    const key = Object.keys(row).find(
        (name) => possibleNames.includes(name.toLowerCase().trim())
    );

    return key ? row[key] : "";
}

function getSaleDate(row) {
    return getValue(row, ["date", "order date", "sales date", "transaction date"]);
}

function getRegion(row) {
    return String(getValue(row, ["region", "area", "territory"]) || "Unknown");
}

function getCategory(row) {
    return String(getValue(row, ["category", "product category", "type"]) || "Unknown");
}

function getAmount(row) {
    const value = getValue(row, [
        "sales", "amount", "revenue", "total", "total sales", "sales amount"
    ]);

    const number = Number(String(value).replace(/[₹,$,\s]/g, ""));
    return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
    }).format(value);
}

function parseDate(value) {
    if (value instanceof Date && !isNaN(value)) return value;

    if (typeof value === "number") {
        // Excel serial date
        const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
        return isNaN(date) ? null : date;
    }

    if (!value) return null;

    const text = String(value).trim();
    let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);

    if (match) {
        return new Date(+match[1], +match[2] - 1, +match[3]);
    }

    match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);

    if (match) {
        // Assumes day/month/year for slash-separated dates.
        return new Date(+match[3], +match[2] - 1, +match[1]);
    }

    const date = new Date(text);
    return isNaN(date) ? null : date;
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

function getFilteredSales() {
    const search = ($("#salesSearch")?.value || "").toLowerCase().trim();
    const region = $("#regionFilter")?.value || "";
    const category = $("#categoryFilter")?.value || "";
    const start = $("#startDate")?.value || "";
    const end = $("#endDate")?.value || "";

    return allSales.filter((row) => {
        const rowRegion = getRegion(row);
        const rowCategory = getCategory(row);
        const rowDate = dateKey(getSaleDate(row));

        const matchesSearch = Object.values(row).some((value) =>
            String(value ?? "").toLowerCase().includes(search)
        );

        return (
            matchesSearch &&
            (!region || rowRegion === region) &&
            (!category || rowCategory === category) &&
            (!start || (rowDate && rowDate >= start)) &&
            (!end || (rowDate && rowDate <= end))
        );
    });
}

function populateFilter(selector, values) {
    const select = $(selector);
    if (!select) return;

    const previous = select.value;
    const firstOption = select.options[0]?.outerHTML || '<option value="">All</option>';

    select.innerHTML = firstOption;

    [...new Set(values)]
        .filter(Boolean)
        .sort()
        .forEach((value) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });

    if ([...select.options].some((option) => option.value === previous)) {
        select.value = previous;
    }
}

function updateKPIs(rows) {
    const totalSales = rows.reduce((sum, row) => sum + getAmount(row), 0);
    const orderCount = rows.length;
    const average = orderCount ? totalSales / orderCount : 0;

    const uniqueCustomers = new Set(
        rows.map((row) =>
            getValue(row, ["customer", "customer name", "customer id"])
        ).filter(Boolean)
    ).size;

    if ($("#totalSales")) $("#totalSales").textContent = formatMoney(totalSales);
    if ($("#totalOrders")) $("#totalOrders").textContent = orderCount.toLocaleString("en-IN");
    if ($("#averageOrder")) $("#averageOrder").textContent = formatMoney(average);
    if ($("#totalCustomers")) {
        $("#totalCustomers").textContent = uniqueCustomers.toLocaleString("en-IN");
    }
}

function updateTable(rows) {
    const tbody = $("#salesTableBody");
    if (!tbody) return;

    tbody.replaceChildren();

    if (!rows.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 20;
        td.className = "empty-state";
        td.textContent = "No sales records match your filters.";
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    rows.forEach((row) => {
        const tr = document.createElement("tr");

        const fields = [
            getValue(row, ["order id", "orderid", "id", "transaction id"]),
            getSaleDate(row),
            getValue(row, ["customer", "customer name", "customer id"]),
            getRegion(row),
            getCategory(row),
            formatMoney(getAmount(row))
        ];

        fields.forEach((value) => {
            const td = document.createElement("td");
            td.textContent = value instanceof Date
                ? value.toLocaleDateString("en-IN")
                : String(value ?? "");
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });
}

function updateCharts(rows) {
    if (typeof Chart === "undefined") {
        console.warn("Chart.js is not loaded. Charts were skipped.");
        return;
    }

    const monthly = {};
    const categories = {};

    rows.forEach((row) => {
        const date = parseDate(getSaleDate(row));
        const amount = getAmount(row);

        if (date) {
            const month = date.toLocaleDateString("en-IN", {
                month: "short",
                year: "numeric"
            });

            monthly[month] = (monthly[month] || 0) + amount;
        }

        const category = getCategory(row);
        categories[category] = (categories[category] || 0) + amount;
    });

    const monthlyEntries = Object.entries(monthly).sort(
        (a, b) => new Date(a[0]) - new Date(b[0])
    );

    if ($("#salesChart")) {
        if (salesChart) salesChart.destroy();

        salesChart = new Chart($("#salesChart"), {
            type: "line",
            data: {
                labels: monthlyEntries.map(([month]) => month),
                datasets: [{
                    label: "Sales",
                    data: monthlyEntries.map(([, amount]) => amount),
                    borderColor: "#2563eb",
                    backgroundColor: "rgba(37, 99, 235, 0.12)",
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true }
                }
            }
        });
    }

    if ($("#categoryChart")) {
        if (categoryChart) categoryChart.destroy();

        categoryChart = new Chart($("#categoryChart"), {
            type: "doughnut",
            data: {
                labels: Object.keys(categories),
                datasets: [{
                    data: Object.values(categories)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
}

function updateDashboard() {
    const rows = getFilteredSales();
    updateKPIs(rows);
    updateTable(rows);
    updateCharts(rows);

    if ($("#resultsCount")) {
        $("#resultsCount").textContent = `${rows.length} records`;
    }
}

async function loadSales() {
    try {
        const response = await fetch("/api/sales");

        if (!response.ok) {
            throw new Error(`API returned HTTP ${response.status}`);
        }

        const result = await response.json();

        // Supports either an array or { sales: [...] } / { data: [...] }.
        allSales = Array.isArray(result)
            ? result
            : Array.isArray(result.sales)
                ? result.sales
                : Array.isArray(result.data)
                    ? result.data
                    : [];

        populateFilter("#regionFilter", allSales.map(getRegion));
        populateFilter("#categoryFilter", allSales.map(getCategory));

        updateDashboard();

        if (!allSales.length) {
            console.warn("The sales API returned no records.");
        }
    } catch (error) {
        console.error("Unable to load sales:", error);

        const message = $("#salesError");
        if (message) {
            message.textContent =
                "Could not load sales data. Check your Express server and /api/sales endpoint.";
        }
    }
}

// Separate navigation pages.
function setupNavigation() {
    document.querySelectorAll("[data-page]").forEach((link) => {
        link.addEventListener("click", (event) => {
            event.preventDefault();

            const page = link.dataset.page;

            document.querySelectorAll(".page-section").forEach((section) => {
                section.classList.toggle("active", section.id === page);
            });

            document.querySelectorAll("[data-page]").forEach((item) => {
                item.classList.toggle("active", item === link);
            });

            const heading = $("#pageTitle");
            if (heading) {
                heading.textContent = link.textContent.trim();
            }

            updateDashboard();
        });
    });
}

document.addEventListener("DOMContentLoaded", () => {
    setupNavigation();

    ["#salesSearch", "#regionFilter", "#categoryFilter", "#startDate", "#endDate"]
        .forEach((selector) => {
            $(selector)?.addEventListener("input", updateDashboard);
            $(selector)?.addEventListener("change", updateDashboard);
        });

    $("#resetFilters")?.addEventListener("click", () => {
        ["#salesSearch", "#regionFilter", "#categoryFilter", "#startDate", "#endDate"]
            .forEach((selector) => {
                const element = $(selector);
                if (element) element.value = "";
            });

        updateDashboard();
    });

    loadSales();
});
