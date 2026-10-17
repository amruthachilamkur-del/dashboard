# Sales Dashboard

An interactive sales analytics dashboard built with HTML, CSS, JavaScript, Node.js, and Chart.js.

## Features

- View total revenue, orders, units sold, and average order value.
- Filter sales records by date, region, and product category.
- Visualize monthly revenue and compare regions, categories, and sales channels.
- Search and browse paginated sales transactions.
- Load sales data through a backend API.
- Responsive layout for desktop, tablet, and mobile screens.

## Technologies

- HTML5
- CSS3
- JavaScript
- Node.js
- Chart.js
- Excel spreadsheet data

## Project Structure

```text
dashborad/
├── public/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── data/              # Local data; not included in Git
├── server.js
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

## Run Locally

1. Install [Node.js](https://nodejs.org/).
2. Clone or download this repository.
3. Open the project folder in a terminal.
4. Install dependencies:

   ```bash
   npm install
   ```

5. Place your own Excel workbook in the `data` folder, using the filename and sheet expected by the application.
6. Start the server:

   ```bash
   node server.js
   ```

7. Open http://localhost:3000 in your browser.

## API

`GET /api/sales` — retrieves the sales records used by the dashboard.

## Data Privacy

The original Excel workbook is excluded from this repository. Use a synthetic or anonymized dataset when sharing the project publicly.

## Future Improvements

- Export filtered records to CSV or Excel.
- Add more sales performance metrics.
- Deploy the dashboard online.

## Author

https://github.com/amruthachilamkur-del
