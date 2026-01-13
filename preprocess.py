# ==========================================
# Chess Analytics Preprocessor
# ==========================================
# This script converts raw FIDE data (TSV) into a structured format for D3.js.
# It performs heavy mathematical calculations (KDE) upfront to ensure
# the web visualization runs smoothly without lag.

import pandas as pd
import json
import numpy as np
from tqdm import tqdm  # Progress bar for the heavy calculation loop

print("Loading raw data...")

# --- 1. Load Data ---
# We use 'usecols' to load only what we need, saving memory.
# We force IDs to be strings to prevent leading zeros from being dropped.
players = pd.read_csv('data/players.tsv', sep='\t', usecols=['#id', 'fed'], dtype={'#id': str})
countries = pd.read_csv('data/countries.tsv', sep='\t')
iso3 = pd.read_csv('data/iso3.tsv', sep='\t')

# --- 2. Build Hierarchy (World -> Region -> Subregion -> Country) ---
# We merge country data with ISO-3166 codes to get Region/Subregion info.
merged_locs = countries.merge(iso3, left_on='alpha3', right_on='#alpha3', how='left')
merged_locs = merged_locs[['ioc', '#country', 'subregion', 'region']]
merged_locs.columns = ['fed', 'country_name', 'subregion', 'region']

# Root node
hierarchy = {"name": "World", "id": "World", "children": []}
regions = {}

# Organize flat country list into a nested tree structure
for _, row in merged_locs.iterrows():
    r, s, c, fed = row['region'], row['subregion'], row['country_name'], row['fed']
    
    # Handle missing geographical data
    if pd.isna(r): r = "Other"
    if pd.isna(s): s = "Other"

    if r not in regions: regions[r] = {}
    if s not in regions[r]: regions[r][s] = []
    
    # Add country (leaf node)
    regions[r][s].append({"name": c, "id": fed})

# Convert the dictionary structure into a JSON-compatible list format
for r_name, subs in regions.items():
    r_node = {"name": r_name, "id": r_name, "children": []}
    for s_name, countries_list in subs.items():
        s_node = {"name": s_name, "id": s_name, "children": countries_list}
        r_node["children"].append(s_node)
    hierarchy["children"].append(r_node)

# --- 3. Process Ratings ---
print("Processing ratings...")
ratings = pd.read_csv('data/ratings.tsv', sep='\t', usecols=['#id', 'rating', 'month'], dtype={'#id': str})

# Join ratings with player nationalities (Fed)
full_data = ratings.merge(players, how='inner', left_on='#id', right_on='#id')
final_df = full_data[['month', 'fed', 'rating']]

# --- 4. Dynamic Grid Calculation (Crucial for Visualization Sync) ---
# We calculate the X-Axis bounds (Min/Max rating) here in Python.
# We pass these exact numbers to D3 so the backend math matches the frontend pixels.
print("Calculating global max density for Y-Axis...")

# A. Find the range of ratings in the dataset
min_r = final_df['rating'].min()
max_r = final_df['rating'].max()
padding = 100 # Add breathing room on both sides

# B. Create the evaluation grid
# This grid defines where we measure the "height" of the curve.
grid_min = min_r - padding
grid_max = max_r + padding
x_grid = np.linspace(grid_min, grid_max, 60) # 60 points matches D3's ticks
bandwidth = 40.0 # Smoothing factor (Bandwidth)

# --- 5. Kernel Density Estimation (Epanechnikov) ---
# We calculate the curve height manually using NumPy for speed.
def kde_epanechnikov(values, grid, bw):
    # Vectorized calculation: processes all grid points at once
    grid_col = grid[:, np.newaxis]
    val_row = values[np.newaxis, :]
    
    u = (grid_col - val_row) / bw
    
    # Epanechnikov Formula: 0.75 * (1 - u^2)
    k = 0.75 * (1 - u**2)
    k[np.abs(u) > 1] = 0 # Zero out values outside the bandwidth window
    
    return np.mean(k, axis=1) / bw

# --- 6. Global Max Scan ---
# We scan EVERY month in the 10-year history to find the highest curve peak.
# This value allows us to fix the Y-Axis height in D3, preventing the
# chart from "jumping" up and down during animation.
global_max_density = 0
months = final_df['month'].unique()

for m in tqdm(months, desc="Calculating densities"):
    month_ratings = final_df[final_df['month'] == m]['rating'].values
    if len(month_ratings) > 0:
        density = kde_epanechnikov(month_ratings, x_grid, bandwidth)
        peak = np.max(density)
        if peak > global_max_density:
            global_max_density = peak

print(f"Global Max Density found: {global_max_density}")

# --- 7. Save Results ---
# Inject the calculated stats into the JSON so D3 can read them
hierarchy["stats"] = {
    "maxDensity": float(global_max_density),
    "minRating": float(grid_min),
    "maxRating": float(grid_max)
}

# Save hierarchy and stats
with open('structure.json', 'w') as f:
    json.dump(hierarchy, f, indent=4)
print("Saved structure.json (with stats)")

# Save the cleaned rating data
final_df.to_csv('processed_ratings.csv', index=False)
print(f"Saved processed_ratings.csv with {len(final_df)} records.")