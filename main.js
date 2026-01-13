// ==========================================
// Chess Analytics Visualization - Main Logic
// ==========================================

// --- Global Settings & State ---
const MAX_SELECTION = 6; // Limit to 6 countries so the chart doesn't look like spaghetti
const colors = d3.scaleOrdinal(d3.schemeCategory10); // Standard D3 colors

let rawData = [];           // Will hold the CSV data
let hierarchyData = {};     // Will hold the JSON tree structure
let selectedNodes = new Set(["World"]); // Start with World selected
let nodeMap = new Map();    // Quick lookup for country names
let availableMonths = [];   // List of all dates in the dataset
let currentMonthIndex = 0;  // Current position in the animation
let isPlaying = false;      // Is the animation running?
let interval;               // The timer for the animation

// --- 1. Canvas & Layout Setup ---
const container = document.getElementById("chart-container");

// We need extra space on the left and bottom for the Axis Labels
const margin = {top: 20, right: 30, bottom: 60, left: 60};

const width = container.clientWidth - margin.left - margin.right;
const height = container.clientHeight - margin.top - margin.bottom - 40; 

const svg = d3.select("#chart-container")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

// --- 2. Initialize Scales & Layers ---

// A. Scales (Start with safe defaults so the chart isn't empty on load)
const x = d3.scaleLinear().domain([1000, 2900]).range([0, width]);
const y = d3.scaleLinear().domain([0, 0.005]).range([height, 0]);

// B. Layers (Order is crucial!)
// 1. Grid goes first (bottom layer)
const gridLayer = svg.append("g").attr("class", "grid-layer");
// 2. Data curves go in the middle
const chartLayer = svg.append("g").attr("class", "chart-layer");
// 3. Axes go on top so text is always legible
const xAxisG = svg.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`);
const yAxisG = svg.append("g").attr("class", "y-axis");

// C. Draw Initial Axes & Labels
xAxisG.call(d3.axisBottom(x));
yAxisG.call(d3.axisLeft(y));

// X-Axis Title
svg.append("text")
    .attr("text-anchor", "middle")
    .attr("x", width / 2)
    .attr("y", height + 40) 
    .attr("fill", "#7f8c8d")
    .style("font-size", "14px")
    .style("font-weight", "500")
    .text("FIDE Standard Rating");

// Y-Axis Title (Rotated)
svg.append("text")
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .attr("y", -margin.left + 15) 
    .attr("x", -height / 2)       
    .attr("fill", "#7f8c8d")
    .style("font-size", "14px")
    .style("font-weight", "500")
    .text("Density (Player Concentration)");

// --- 3. Load Data ---
Promise.all([
    // Add a timestamp (?v=...) to force the browser to ignore old cached files
    d3.json("structure.json?v=" + new Date().getTime()), 
    d3.csv("processed_ratings.csv")
]).then(([structure, data]) => {
    hierarchyData = structure;
    rawData = data;

    // --- Dynamic Axis Configuration ---
    // If our Python script worked, we have exact min/max stats. Use them!
    if (hierarchyData.stats) {
        const stats = hierarchyData.stats;
        
        // Round to nearest 100 for a "clean" look (e.g. 901 -> 900)
        const niceMin = Math.floor(stats.minRating / 100) * 100;
        const niceMax = Math.ceil(stats.maxRating / 100) * 100;

        x.domain([niceMin, niceMax]);
        y.domain([0, stats.maxDensity * 3.5]); // 3.5x buffer for spiky countries

        // Smoothly animate the axes to the new correct positions
        xAxisG.transition().duration(1000).call(d3.axisBottom(x));
        yAxisG.transition().duration(1000).call(d3.axisLeft(y));
        
        // Add gridlines now that we have the real scale
        gridLayer.append("g")
            .attr("class", "grid x-grid")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).ticks(10).tickSize(-height).tickFormat("").tickSizeOuter(0))
            .attr("stroke-opacity", 0.1);
            
        gridLayer.append("g")
            .attr("class", "grid y-grid")
            .call(d3.axisLeft(y).ticks(10).tickSize(-width).tickFormat("").tickSizeOuter(0))
            .attr("stroke-opacity", 0.1);
    }

    // Process data
    buildNodeMap(hierarchyData);
    availableMonths = Array.from(new Set(data.map(d => d.month))).sort();
    
    // Init UI controls
    d3.select("#timeSlider").attr("max", availableMonths.length - 1);
    renderTree(hierarchyData, d3.select("#tree-container"));
    
    // Draw the first frame!
    updateChart();
});

// --- 4. The Core Logic (UpdateChart) ---
function updateChart() {
    const month = availableMonths[currentMonthIndex];
    d3.select("#date-label").text(month);

    // 1. Filter data for the current month
    const monthlyData = rawData.filter(d => d.month === month);
    const datasets = [];

    // 2. Build datasets for each selected country
    selectedNodes.forEach(nodeId => {
        let subsetData = [];
        const nodeName = nodeMap.get(nodeId) ? nodeMap.get(nodeId).name : nodeId;

        if (nodeId === "World") {
            // World uses everything
            subsetData = monthlyData.map(d => +d.rating);
        } else {
            // Filter only the Feds belonging to this Region/Country
            const targetFeds = new Set(getAllLeafIds(nodeId));
            subsetData = monthlyData
                .filter(d => targetFeds.has(d.fed))
                .map(d => +d.rating);
        }

        // Only draw if we have enough data points to make a valid curve
        if(subsetData.length > 20) { 
            const meanRating = d3.mean(subsetData);
            datasets.push({ key: nodeId, name: nodeName, data: subsetData, mean: meanRating });
        }
    });

    // 3. Compute Density (Math)
    const kde = kernelDensityEstimator(kernelEpanechnikov(40), x.ticks(60));
    const densityData = datasets.map(d => ({ 
        key: d.key, 
        name: d.name, 
        density: kde(d.data), 
        mean: d.mean 
    }));

    // 4. Draw! (Using D3 Join Pattern)
    
    // A. Area Fills (The colored shapes)
    const areaGenerator = d3.area()
        .curve(d3.curveBasis)
        .x(d => x(d[0]))
        .y0(height)
        .y1(d => y(d[1])); 

    chartLayer.selectAll(".density-area")
        .data(densityData, d => d.key)
        .join(
            enter => enter.append("path")
                .attr("class", "density-area")
                .attr("fill", d => d.key === "World" ? "#bdc3c7" : colors(d.key))
                .attr("opacity", 0)
                .attr("d", d => areaGenerator(d.density))
                .call(enter => enter.transition().duration(500).attr("opacity", d => d.key === "World" ? 0.1 : 0.2)),
            update => update.transition().duration(200)
                .attr("fill", d => d.key === "World" ? "#bdc3c7" : colors(d.key))
                .attr("opacity", d => d.key === "World" ? 0.1 : 0.2)
                .attr("d", d => areaGenerator(d.density)),
            exit => exit.transition().duration(200).attr("opacity", 0).remove()
        );

    // B. Line Curves (The solid outlines)
    chartLayer.selectAll(".density-line")
        .data(densityData, d => d.key)
        .join(
            enter => enter.append("path")
                .attr("class", "density-line")
                .attr("fill", "none")
                .attr("opacity", 0)
                .attr("stroke", d => d.key === "World" ? "#bdc3c7" : colors(d.key))
                .attr("stroke-width", d => d.key === "World" ? 2 : 3)
                .attr("stroke-opacity", d => d.key === "World" ? 0.6 : 1)
                .attr("d", d => d3.line().curve(d3.curveBasis).x(p => x(p[0])).y(p => y(p[1]))(d.density))
                .call(enter => enter.transition().duration(500).attr("opacity", 1)),
            update => update.transition().duration(200)
                .attr("opacity", 1)
                .attr("stroke", d => d.key === "World" ? "#bdc3c7" : colors(d.key))
                .attr("stroke-width", d => d.key === "World" ? 2 : 3)
                .attr("stroke-opacity", d => d.key === "World" ? 0.6 : 1)
                .attr("d", d => d3.line().curve(d3.curveBasis).x(p => x(p[0])).y(p => y(p[1]))(d.density))
        )
        // Add interactions for tooltips
        .on("mouseover", function(event, d) {
            d3.select(this).attr("stroke-width", 5);
            d3.select("#tooltip").style("opacity", 1)
                   .html(`<strong>${d.name}</strong><br>Mean: ${Math.round(d.mean)}`)
                   .style("left", (event.pageX + 10) + "px")
                   .style("top", (event.pageY - 20) + "px");
        })
        .on("mousemove", function(event) {
            d3.select("#tooltip")
              .style("left", (event.pageX + 10) + "px")
              .style("top", (event.pageY - 20) + "px");
        })
        .on("mouseout", function(event, d) {
            d3.select(this).attr("stroke-width", d.key === "World" ? 2 : 3);
            d3.select("#tooltip").style("opacity", 0);
        });

    // C. Vertical Mean Lines (The dashed average markers)
    chartLayer.selectAll(".mean-line")
        .data(densityData, d => d.key)
        .join(
            enter => enter.append("line")
                .attr("class", "mean-line")
                .attr("stroke", d => d.key === "World" ? "#bdc3c7" : colors(d.key))
                .attr("stroke-width", 2)
                .attr("stroke-dasharray", "5,5")
                .attr("opacity", 0.7)
                .attr("y1", height).attr("y2", height) // Start at bottom
                .attr("x1", d => x(d.mean)).attr("x2", d => x(d.mean))
                .call(enter => enter.transition().duration(500).attr("y2", 0)), // Grow up
            update => update.transition().duration(200)
                .attr("x1", d => x(d.mean)).attr("x2", d => x(d.mean))
                .attr("y1", height).attr("y2", 0) 
                .attr("stroke", d => d.key === "World" ? "#bdc3c7" : colors(d.key)),
            exit => exit.remove()
        );

    // D. Update Legend
    const legendContainer = d3.select("#legend");
    legendContainer.html(""); 
    densityData.forEach(d => {
        const item = legendContainer.append("div").attr("class", "legend-item");
        item.append("div").attr("class", "legend-dot").style("background-color", d.key === "World" ? "#bdc3c7" : colors(d.key));
        item.append("span").text(d.name);
    });
}

// --- 5. Helper Functions ---

// Build a Map to easily find nodes by ID (for tooltips/lookup)
function buildNodeMap(node) {
    nodeMap.set(node.id, node);
    if (node.children) node.children.forEach(child => buildNodeMap(child));
}

// Recursively find all Country IDs (leaves) under a Region/Subregion
function getAllLeafIds(nodeId) {
    const node = nodeMap.get(nodeId);
    if (!node) return [];
    if (!node.children || node.children.length === 0) return [node.id];
    
    let leaves = [];
    node.children.forEach(child => leaves = leaves.concat(getAllLeafIds(child.id)));
    return leaves;
}

// Sidebar Rendering (The Recursive Tree)
function renderTree(node, container) {
    const ul = container.append("ul");
    const li = ul.append("li");
    
    const checkbox = li.append("input")
        .attr("type", "checkbox")
        .attr("value", node.id)
        .on("change", function() {
            if(this.checked) {
                // Check limit before allowing selection
                if (selectedNodes.size >= MAX_SELECTION) {
                    this.checked = false;
                    alert(`To keep the chart readable, you can only select up to ${MAX_SELECTION} locations at a time.`);
                    return; 
                }
                selectedNodes.add(node.id);
            } else { 
                selectedNodes.delete(node.id); 
            }
            updateChart();
        });

    if (selectedNodes.has(node.id)) checkbox.property("checked", true);
    
    li.append("span").text(node.name);

    if (node.children && node.children.length > 0) {
        node.children.forEach(child => renderTree(child, li));
    }
}

// Math: Kernel Density Estimator
function kernelDensityEstimator(kernel, X) {
  return function(V) {
    return X.map(function(x) {
      return [x, d3.mean(V, function(v) { return kernel(x - v); })];
    });
  };
}
function kernelEpanechnikov(k) {
  return function(v) {
    return Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0;
  };
}

// --- 6. Interaction Events ---

// Time Slider
d3.select("#timeSlider").on("input", function() {
    currentMonthIndex = +this.value;
    updateChart();
});

// Play/Pause Button
d3.select("#play-btn").on("click", function() {
    if (isPlaying) {
        clearInterval(interval);
        this.textContent = "▶ Play";
    } else {
        this.textContent = "⏸ Pause";
        interval = setInterval(() => {
            currentMonthIndex++;
            if (currentMonthIndex >= availableMonths.length) {
                currentMonthIndex = 0; // Loop back to start
            }
            d3.select("#timeSlider").property("value", currentMonthIndex);
            updateChart();
        }, 150);
    }
    isPlaying = !isPlaying;
});

// Search Box Logic
document.getElementById('searchBox').addEventListener('input', function(e) {
    const term = e.target.value.toLowerCase();
    const allItems = document.querySelectorAll('#tree-container li');

    // If empty, show everything
    if (term === "") {
        allItems.forEach(item => item.style.display = "");
        return;
    }

    // First hide everything
    allItems.forEach(item => item.style.display = "none");

    // Then show matches + their parents + their children
    allItems.forEach(item => {
        const span = item.querySelector('span');
        if (span && span.textContent.toLowerCase().includes(term)) {
            item.style.display = ""; // Show self
            
            // Walk up the tree to show parents (Context)
            let parent = item.parentElement; 
            while (parent && parent.id !== 'tree-container') {
                if (parent.tagName === 'LI') parent.style.display = "";
                parent = parent.parentElement;
            }
            
            // Walk down to show children
            item.querySelectorAll('li').forEach(child => child.style.display = "");
        }
    });
});