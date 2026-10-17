
const express = require("express");
const xlsx = require("xlsx");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/sales", (req, res) => {
  try {
    const filePath = path.join(__dirname, "data", "Data.xlsx");
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets["Data"];

    if (!sheet) {
      return res.status(500).json({
        error: "Data sheet not found in Excel file"
      });
    }

    const sales = xlsx.utils.sheet_to_json(sheet);
    res.json(sales);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      error: "Excel file not found. Check the data folder."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
