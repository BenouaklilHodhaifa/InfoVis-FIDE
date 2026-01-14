# Interactive Chess Analytics: Global Ratings and Geopolitical Shifts

**Author:** Hodhaifa Benouaklil
**Course:** Information Visualization
**Date:** January 2026

---

## 1. Project Overview

This project visualizes the evolution of FIDE chess ratings over the last decade (2015–2025). It moves beyond simple rankings to explore the *shape* of the chess world. Using an **Interactive Density Plot**, users can analyze the statistical distribution of player skills globally and compare the developmental trajectories of different nations (e.g., Russia vs. India).

The tool is designed to answer two key research questions:

1. **Global Insight:** Is the global rating distribution a perfect bell curve, or is it skewed?
2. **Geopolitical Shift:** How are emerging chess nations overtaking traditional powers in terms of player mass and elite performance?

---

## 2. Dependencies

The project relies on **D3.js (v7)** for the interactive frontend and **Python** for data preprocessing.

### Frontend

* **D3.js v7** (included via CDN in `index.html`)
* No local installation required for the interface

### Backend (Preprocessing)

Python is used to clean the raw FIDE data and pre-calculate the Kernel Density Estimation (KDE) curves to ensure smooth animation performance in the browser.

Required libraries:

* **Python 3.x**
* **Pandas** (data manipulation)
* **NumPy** (math and grid calculations)
* **Tqdm** (progress bars)

To install the required Python libraries:

```bash
pip install -r requirements.txt
```

---

## 3. Project Structure

```
/root
├── index.html              # Main entry point (Structure & Layout)
├── style.css               # Styling (Sidebar, Layout, Typography)
├── main.js                 # Visualization Logic (D3 rendering, interactivity)
├── preprocess.py           # Python script for KDE calculation & data cleaning
├── structure.json          # Generated hierarchy tree + global stats (min/max/density)
├── processed_ratings.csv   # Cleaned dataset (month, federation, rating)
├── requirements.txt        # Python dependencies list
├── README.md               # This documentation
└── data/                   # Raw FIDE data (not included in submission ZIP, see Section 4)
    ├── players.tsv
    ├── ratings.tsv
    ├── countries.tsv
    └── iso3.tsv
```

---

## 4. Data Setup (Important)

The visualization works **out-of-the-box** using the included `processed_ratings.csv` and `structure.json` files. **You do NOT need the raw data to run the website.**

However, due to email attachment size limitations (approximately **100MB+**), the **raw FIDE dataset is excluded** from the submission ZIP file.

The raw data is **only required** if you wish to run the `preprocess.py` script to regenerate the data or adjust the preprocessing calculations.

To do so:

1. Obtain the raw FIDE TSV files (provided separately or downloaded from FIDE).
2. Manually copy the following files into the `data/` folder:

   * `players.tsv`
   * `ratings.tsv`
   * `countries.tsv`
   * `iso3.tsv`

Once these files are in place, you may proceed with data regeneration.

---

## 5. How to Run (Step-by-Step)

### Step 1: Run a Local Server

Because this project loads external data files (`.json` and `.csv`), browser security policies (CORS) prevent it from running by simply double-clicking `index.html`. You must use a local server.

**Using Python (recommended):**

1. Open your terminal or command prompt.

2. Navigate to the project folder.

3. Run:

   ```bash
   python -m http.server 8000
   ```

4. Open your browser and go to: [http://localhost:8000](http://localhost:8000)

### Step 2: (Optional) Regenerate Data

If you wish to regenerate the processed data or modify KDE parameters:

1. Ensure the raw data files are present in the `data/` folder (see **Section 4: Data Setup**).

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Run the preprocessing script:

   ```bash
   python preprocess.py
   ```

This will update:

* `structure.json` (including updated density statistics)
* `processed_ratings.csv`

Refresh the webpage afterward (clear cache if necessary).

---

## 6. User Guide & Features

### Overview Mode

By default, the chart displays the **World** distribution curve.

### Comparison Mode

* Use the **Sidebar** to select specific countries or regions.
* Selection is limited to **6 countries simultaneously** to maintain readability.

### Search

* Use the search bar to quickly find countries.
* Example: typing `Ind` reveals **India** within the Asian hierarchy.

### Time Travel

* Click the **Play** button to animate the evolution from **2015 to 2025**.
* Drag the **time slider** to scrub to a specific month.

### Details-on-Demand

* Hover over any curve to highlight it.
* View the country name and its exact **mean rating** for the selected time step.
