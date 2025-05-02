// Initialization
let svg = d3.select("#container").append("svg")
    .attr("width", "100%")
    .attr("height", "100%"),
    width = window.innerWidth,
    height = window.innerHeight,
    mainGroup = svg.append("g").attr("class", "main-container"),
    simulation = null,
    linkDistance = 80,
    chargeStrength = -120,
    gravityStrength = 0.1;

// Size scaling controls
let mainNodeScale = 1.0;    // Scale factor for main paper nodes
let bridgeNodeScale = 1.0;  // Scale factor for bridge paper nodes
let normalNodeScale = 1.0;  // Scale factor for normal nodes (cited/referenced)

// Keep track of the original data for reference
let originalData = null;
let selectedNode = null;
let nodes = [], links = [];
    
// Define arrow markers for directed links
svg.append("defs").append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 20)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#999");

// Define star shape for main papers that are bridges
svg.append("defs")
    .append("path")
    .attr("id", "star")
    .attr("d", d3.symbol().type(d3.symbolStar).size(300)());

// Performance optimization: Set up requestAnimationFrame for simulation updates
let rafId = null;
let isSimulationRunning = false;

function startSimulationLoop() {
    if (!isSimulationRunning && simulation) {
        isSimulationRunning = true;
        rafId = requestAnimationFrame(simulationTick);
    }
}

function stopSimulationLoop() {
    isSimulationRunning = false;
    if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
}

// Optimized tick function using requestAnimationFrame
function simulationTick() {
    if (isSimulationRunning && simulation && simulation.alpha() > 0.001) {
        simulation.tick();
        updateVisualElements();
        rafId = requestAnimationFrame(simulationTick);
    } else {
        stopSimulationLoop();
    }
}

// Update visual elements without recalculating forces
function updateVisualElements() {
    // Performance optimization: Use d3.select once and then update directly
    const linkElements = mainGroup.selectAll(".link");
    const nodeElements = mainGroup.selectAll(".node");
    
    // Update links - faster than using attr for each property separately
    linkElements.each(function(d) {
        d3.select(this)
            .attr("x1", d.source.x)
            .attr("y1", d.source.y)
            .attr("x2", d.target.x)
            .attr("y2", d.target.y);
    });
    
    // Update nodes - faster transform operation
    nodeElements.attr("transform", d => `translate(${d.x}, ${d.y})`);
}

// Debounce function to improve performance
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Cache for node radius calculations
const nodeRadiusCache = new Map();

// Event listeners for controls - optimized with debouncing
d3.select("#linkDistanceSlider").on("input", debounce(function() {
    linkDistance = +this.value;
    d3.select("#linkDistanceValue").text(linkDistance);
    if (simulation) {
        simulation.force("link").distance(linkDistance);
        simulation.alpha(0.3).restart();
        startSimulationLoop();
    }
}, 50));

d3.select("#chargeSlider").on("input", debounce(function() {
    chargeStrength = +this.value;
    d3.select("#chargeValue").text(chargeStrength);
    if (simulation) {
        simulation.force("charge").strength(chargeStrength);
        simulation.alpha(0.3).restart();
        startSimulationLoop();
    }
}, 50));

d3.select("#gravitySlider").on("input", debounce(function() {
    gravityStrength = +this.value;
    d3.select("#gravityValue").text(gravityStrength);
    if (simulation) {
        simulation.force("gravity", d3.forceRadial(0, width / 2, height / 2).strength(gravityStrength));
        simulation.alpha(0.3).restart();
        startSimulationLoop();
    }
}, 50));

// Paper details panel controls
d3.select("#closePanelButton").on("click", function() {
    closeDetailsPanel();
});













// Time period tracking
let allPapers = []; // Store all papers from API
let currentTimeIndex = 0;
let timeChunks = []; // Will store our time chunks once we process the data
let isLoadingTimeChunk = false;

// New time navigation event listeners
d3.select("#prevTimeButton").on("click", function() {
    if (currentTimeIndex > 0 && !isLoadingTimeChunk) {
        currentTimeIndex--;
        loadTimeChunk(currentTimeIndex);
        updateTimeControls();
    }
});

d3.select("#nextTimeButton").on("click", function() {
    if (currentTimeIndex < timeChunks.length - 1 && !isLoadingTimeChunk) {
        currentTimeIndex++;
        loadTimeChunk(currentTimeIndex);
        updateTimeControls();
    }
});

d3.select("#timeSlider").on("input", function() {
    if (!isLoadingTimeChunk) {
        currentTimeIndex = +this.value;
        loadTimeChunk(currentTimeIndex);
        updateTimeControls();
    }
});

// Function to update time navigation controls
function updateTimeControls() {
    // Update button states
    d3.select("#prevTimeButton").property("disabled", currentTimeIndex === 0);
    d3.select("#nextTimeButton").property("disabled", currentTimeIndex === timeChunks.length - 1);
    
    // Update time slider
    d3.select("#timeSlider")
        .property("value", currentTimeIndex)
        .property("max", timeChunks.length - 1);
    
    // Update time period indicator
    if (timeChunks.length > 0) {
        const currentChunk = timeChunks[currentTimeIndex];
        d3.select("#currentTimePeriod")
            .text(`${formatDate(currentChunk.startDate)} - ${formatDate(currentChunk.endDate)}`);
        
        // Update start and end labels for the entire range
        if (timeChunks.length > 0) {
            d3.select("#startTimeLabel").text(formatDate(timeChunks[0].startDate));
            d3.select("#endTimeLabel").text(formatDate(timeChunks[timeChunks.length - 1].endDate));
        }
    }
}



// Function to close the details panel
function closeDetailsPanel() {
    d3.select("#paperDetailsPanel").style("display", "none");
    
    // Deselect any selected node
    if (selectedNode) {
        d3.selectAll(".node").classed("selected", false);
        selectedNode = null;
    }
}

// Function to update node sizes when scale sliders change - optimized
function updateNodeSizes() {
    if (!simulation) return;
    
    // Performance optimization: Batch DOM updates
    // Create a temporary object to store updates
    const updates = [];
    
    // Prepare all updates without touching the DOM
    mainGroup.selectAll(".node").each(function(d) {
        const element = d3.select(this);
        const radius = getNodeRadius(d);
        
        updates.push({
            element,
            d,
            radius
        });
    });
    
    // Now apply all updates in a batch
    updates.forEach(update => {
        const { element, d, radius } = update;
        
        if (d.type === 'main' && d.isBridge) {
            // Main bridge papers are stars - scale the star symbol
            const starSize = radius * radius * 3;
            element.select("path")
                .attr("d", d3.symbol().type(d3.symbolStar).size(starSize)());
        } else if (d.isBridge) {
            // Other bridge papers remain diamonds
            element.select("rect")
                .attr("width", radius * 2)
                .attr("height", radius * 2)
                .attr("transform", `rotate(45) translate(${-radius}, ${-radius})`);
        } else {
            // Regular papers stay as circles
            element.select("circle")
                .attr("r", radius);
        }
    });
    
    // Update the collision detection radius
    simulation.force("collide").radius(d => getNodeRadius(d) * 1.5);
    
    // Use a lower alpha value to make the transition smoother
    simulation.alpha(0.1).restart();
    startSimulationLoop();
}

// Debounced version of updateNodeSizes for better performance
const debouncedUpdateNodeSizes = debounce(updateNodeSizes, 200);

// Add slider event listeners for node scaling with debouncing
d3.select("#mainNodeScaleSlider").on("input", debounce(function() {
    mainNodeScale = +this.value;
    d3.select("#mainNodeScaleValue").text(mainNodeScale.toFixed(1));
    nodeRadiusCache.clear(); // Clear cache when scale changes
    debouncedUpdateNodeSizes();
}, 100));

d3.select("#bridgeNodeScaleSlider").on("input", debounce(function() {
    bridgeNodeScale = +this.value;
    d3.select("#bridgeNodeScaleValue").text(bridgeNodeScale.toFixed(1));
    nodeRadiusCache.clear(); // Clear cache when scale changes
    debouncedUpdateNodeSizes();
}, 100));

d3.select("#normalNodeScaleSlider").on("input", debounce(function() {
    normalNodeScale = +this.value;
    d3.select("#normalNodeScaleValue").text(normalNodeScale.toFixed(1));
    nodeRadiusCache.clear(); // Clear cache when scale changes
    debouncedUpdateNodeSizes();
}, 100));

d3.select("#resetButton").on("click", function() {
    if (simulation) {
        // Reset node positions to random positions near the center
        simulation.nodes().forEach(node => {
            node.x = width / 2 + (Math.random() - 0.5) * 100;
            node.y = height / 2 + (Math.random() - 0.5) * 100;
            node.vx = 0;
            node.vy = 0;
        });
        simulation.alpha(1).restart();
        startSimulationLoop();
    }
});

// Create zoom behavior early to avoid recreating it
const zoom = d3.zoom()
    .scaleExtent([0.1, 8])
    .on("zoom", (event) => {
        // Performance optimization: Use transform attribute instead of attr
        mainGroup.attr("transform", event.transform);
    });

svg.call(zoom);

d3.select("#centerViewButton").on("click", function() {
    // Reset zoom and center the view
    svg.transition()
       .duration(750)
       .call(zoom.transform, d3.zoomIdentity.translate(width/2, height/2).scale(1));
});

// Optimize resize handler with debounce
const handleResize = debounce(function() {
    width = window.innerWidth;
    height = window.innerHeight;
    svg.attr("width", width).attr("height", height);
    if (simulation) {
        simulation.force("center", d3.forceCenter(width / 2, height / 2));
        simulation.alpha(0.3).restart();
        startSimulationLoop();
    }
}, 100);

// Handle window resize
window.addEventListener('resize', handleResize);

// File input handling
async function loadCitationData() {
    const progressBar = d3.select("#loadingProgress");
    const statusMessage = d3.select("#statusMessage");

    try {
        statusMessage.text("Fetching citation data...");
        progressBar.style("width", "0%");

        // Simulate progress updates
        const interval = setInterval(() => {
            const currentWidth = parseFloat(progressBar.style("width")) || 0;
            if (currentWidth < 90) {
                progressBar.style("width", `${currentWidth + 10}%`);
            }
        }, 200);

        // // Fetch all data from the backend
        // const response = await fetch('http://localhost:8000/citation-data?userId=abc123&topic=ai in phishing&year=2023');
        // if (!response.ok) {
        //     throw new Error(`Failed to load data: ${response.status}`);
        // }

        // const data = await response.json();
        clearInterval(interval);
        progressBar.style("width", "100%");
        
        statusMessage.text("Processing data...");

        const dataFromBackend = window.__INITIAL_DATA__;
       

        console.log(dataFromBackend , " here data")
        allPapers=dataFromBackend
        
        // Process papers into time chunks (3-month periods)
        processTimeChunks(allPapers);
        
        // Load the first time chunk
        if (timeChunks.length > 0) {
            loadTimeChunk(0);
            updateTimeControls();
        }
        
        statusMessage.text("Citation network loaded successfully!");
        setTimeout(() => {
            progressBar.style("display", "none");
            statusMessage.style("display", "none");
            d3.select(".loading-section").style("display", "none");
        }, 1000);
        
    } catch (error) {
        console.error("Error loading citation data:", error);
        statusMessage.text("Failed to load citation network.");
        progressBar.style("width", "0%");
    }
}

// Process papers into 3-month time chunks
function processTimeChunks(papers) {
    // Sort papers by publication date
    papers.sort((a, b) => {
        const dateA = a.publication_date ? new Date(a.publication_date) : new Date(0);
        const dateB = b.publication_date ? new Date(b.publication_date) : new Date(0);
        return dateA - dateB;
    });
    
    // Find min and max dates
    let minDate = new Date();
    let maxDate = new Date(0);
    
    papers.forEach(paper => {
        if (paper.publication_date) {
            const date = new Date(paper.publication_date);
            if (date < minDate) minDate = new Date(date);
            if (date > maxDate) maxDate = new Date(date);
        }
    });
    
    // Create 3-month chunks
    const chunks = [];
    let currentStart = new Date(minDate);
    
    while (currentStart < maxDate) {
        // Calculate end date (3 months later)
        const endDate = new Date(currentStart);
        endDate.setMonth(endDate.getMonth() + 3);
        
        // Create the chunk
        chunks.push({
            startDate: new Date(currentStart),
            endDate: new Date(endDate),
            papers: []
        });
        
        // Move to next period
        currentStart = new Date(endDate);
    }
    
    // Assign papers to chunks
    papers.forEach(paper => {
        if (paper.publication_date) {
            const pubDate = new Date(paper.publication_date);
            
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                if (pubDate >= chunk.startDate && pubDate < chunk.endDate) {
                    chunk.papers.push(paper);
                    break;
                }
            }
        }
    });
    
    // Remove empty chunks
    timeChunks = chunks.filter(chunk => chunk.papers.length > 0);
    
    // Update the slider max value
    d3.select("#timeSlider").property("max", timeChunks.length - 1);
}

// Load a specific time chunk
function loadTimeChunk(index) {
    if (isLoadingTimeChunk || index < 0 || index >= timeChunks.length) return;
    
    isLoadingTimeChunk = true;
    
    // Show loading indicator
    d3.select("#timeLoader").style("width", "0%");
    
    // Animate loading
    const loadingInterval = setInterval(() => {
        const currentWidth = parseFloat(d3.select("#timeLoader").style("width")) || 0;
        if (currentWidth < 90) {
            d3.select("#timeLoader").style("width", `${currentWidth + 10}%`);
        }
    }, 50);
    
    // Use setTimeout to allow the UI to update before processing
    setTimeout(() => {
        // Process the current chunk
        const chunkData = timeChunks[index].papers;
        processData(chunkData);
        
        // Complete loading
        clearInterval(loadingInterval);
        d3.select("#timeLoader").style("width", "100%");
        
        // Hide loader after transition
        setTimeout(() => {
            d3.select("#timeLoader").style("width", "0%");
            isLoadingTimeChunk = false;
        }, 500);
        
    }, 100);
}



document.addEventListener("DOMContentLoaded", function() {
    loadCitationData();
});

function processData(data) {
    // Stop any running simulation
    if (simulation) {
        simulation.stop();
        stopSimulationLoop();
    }

    // Reset the SVG content but keep the main structure
    mainGroup.selectAll("*").remove();
    svg.select("defs").remove();
    
    // Close any open panels
    closeDetailsPanel();
    
    // Redefine markers and star shape
    svg.append("defs").append("marker")
        .attr("id", "arrow")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 20)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "#999");
    
    svg.append("defs")
        .append("path")
        .attr("id", "star")
        .attr("d", d3.symbol().type(d3.symbolStar).size(300)());
    
    // Clear cache when loading new data
    nodeRadiusCache.clear();
    
    // Process the data to create nodes and links
    nodes = [];
    links = [];
    const nodeMap = new Map();
    
    // Count occurrences of each paper ID to identify bridge papers
    const paperOccurrences = new Map();
    
    // Performance optimization: Pre-allocate array size when possible
    // First pass: Count occurrences of papers in references and citations
    data.forEach(paper => {
        // Count the main paper
        incrementPaperCount(paperOccurrences, paper.id);
        
        // Count referenced papers
        if (paper.referenced_works) {
            paper.referenced_works.forEach(ref => {
                incrementPaperCount(paperOccurrences, ref);
            });
        }
        
        // Count citing papers
        if (paper.cited_by_ids) {
            paper.cited_by_ids.forEach(cite => {
                incrementPaperCount(paperOccurrences, cite);
            });
        }
    });
    
    // Performance optimization: Estimate total node and link count
    let estimatedNodeCount = data.length;
    let estimatedLinkCount = 0;
    
    data.forEach(paper => {
        if (paper.referenced_works) estimatedNodeCount += paper.referenced_works.length;
        if (paper.cited_by_ids) estimatedNodeCount += paper.cited_by_ids.length;
        
        if (paper.referenced_works) estimatedLinkCount += paper.referenced_works.length;
        if (paper.cited_by_ids) estimatedLinkCount += paper.cited_by_ids.length;
    });
    
    // Pre-allocate arrays
    nodes = new Array(estimatedNodeCount);
    links = new Array(estimatedLinkCount);
    let nodeIndex = 0;
    let linkIndex = 0;
    
    // Second pass: Create nodes and links
    data.forEach(paper => {
        // Add main paper node if not already in the map
        if (!nodeMap.has(paper.id)) {
            const node = {
                id: paper.id,
                title: paper.title || "Unknown Title",
                cited_by_count: paper.cited_by_count || 0,
                concepts: paper.concepts || [],
                publication_date: paper.publication_date || null,  // Add publication date
                referenced_works: paper.referenced_works || [],
                cited_by_ids: paper.cited_by_ids || [],
                type: 'main',
                isBridge: paperOccurrences.get(paper.id) > 1,
                // Start main papers near the center
                x: width / 2 + (Math.random() - 0.5) * 100,
                y: height / 2 + (Math.random() - 0.5) * 100
            };
            nodes[nodeIndex++] = node;
            nodeMap.set(paper.id, node);
        }
        
        // Add referenced paper nodes and create links
        if (paper.referenced_works) {
            paper.referenced_works.forEach(ref => {
                if (!nodeMap.has(ref)) {
                    const node = {
                        id: ref,
                        title: "Referenced Paper",
                        type: 'reference',
                        isBridge: paperOccurrences.get(ref) > 1,
                        // Start near their respective main paper
                        x: nodeMap.get(paper.id).x + (Math.random() - 0.5) * 50,
                        y: nodeMap.get(paper.id).y + (Math.random() - 0.5) * 50
                    };
                    nodes[nodeIndex++] = node;
                    nodeMap.set(ref, node);
                }
                
                links[linkIndex++] = {
                    source: paper.id,
                    target: ref,
                    direction: 'outgoing'
                };
            });
        }
        
        // Add citing paper nodes and create links
        if (paper.cited_by_ids) {
            paper.cited_by_ids.forEach(cite => {
                if (!nodeMap.has(cite)) {
                    const node = {
                        id: cite,
                        title: "Citing Paper",
                        type: 'citation',
                        isBridge: paperOccurrences.get(cite) > 1,
                        // Start near their respective main paper
                        x: nodeMap.get(paper.id).x + (Math.random() - 0.5) * 50,
                        y: nodeMap.get(paper.id).y + (Math.random() - 0.5) * 50
                    };
                    nodes[nodeIndex++] = node;
                    nodeMap.set(cite, node);
                }
                
                links[linkIndex++] = {
                    source: cite,
                    target: paper.id,
                    direction: 'incoming'
                };
            });
        }
    });
    
    // Trim arrays to actual size
    nodes = nodes.slice(0, nodeIndex);
    links = links.slice(0, linkIndex);
    
    createVisualization(nodes, links);
}

function incrementPaperCount(map, id) {
    if (!map.has(id)) {
        map.set(id, 1);
    } else {
        map.set(id, map.get(id) + 1);
    }
}

function createVisualization(nodes, links) {
    // Performance optimization: Use quadtree for faster force calculation
    simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(linkDistance))
        .force("charge", d3.forceManyBody().strength(chargeStrength).theta(0.8))  // Higher theta = better performance
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("gravity", d3.forceRadial(0, width / 2, height / 2).strength(gravityStrength))
        // Add collision detection to prevent node overlap
        .force("collide", d3.forceCollide().radius(d => getNodeRadius(d) * 1.5).strength(0.7));  // Reduced strength for better performance

    // Performance: Lower alpha decay for smoother but faster convergence
    simulation.alphaDecay(0.02);
    
    // Performance: Remove automatic ticking and handle it via requestAnimationFrame
    simulation.on("tick", null);
    
    // Create link group first (rendered below nodes)
    const linkGroup = mainGroup.append("g").attr("class", "links");
    
    // Performance optimization: Use object pooling for links
    const link = linkGroup.selectAll("line")
        .data(links)
        .enter().append("line")
        .attr("class", "link")
        .attr("stroke", "#999")
        .attr("stroke-width", 1)
        .attr("marker-end", "url(#arrow)");
    
    // Create node group
    const nodeGroup = mainGroup.append("g").attr("class", "nodes");
    
    // Create a more efficient node container
    const node = nodeGroup.selectAll(".node")
        .data(nodes)
        .enter().append("g")
        .attr("class", "node")
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended)
        )
        .on("click", nodeClicked);
    
    // Performance optimization: Batch DOM operations
    // Add different shapes based on node type
    node.each(function(d) {
        const element = d3.select(this);
        const radius = getNodeRadius(d);
        
        if (d.type === 'main' && d.isBridge) {
            // Main bridge papers are stars
            const starSize = radius * radius * 3;
            element.append("path")
                .attr("d", d3.symbol().type(d3.symbolStar).size(starSize)())
                .attr("fill", "#4285f4");
        } else if (d.isBridge) {
            // Bridge papers are diamonds
            element.append("rect")
                .attr("width", radius * 2)
                .attr("height", radius * 2)
                .attr("transform", `rotate(45) translate(${-radius}, ${-radius})`)
                .attr("fill", "#fbbc05");
        } else if (d.type === 'main') {
            // Main papers are blue circles
            element.append("circle")
                .attr("r", radius)
                .attr("fill", "#4285f4");
        } else if (d.type === 'reference') {
            // Referenced papers are green circles
            element.append("circle")
                .attr("r", radius)
                .attr("fill", "#34a853");
        } else if (d.type === 'citation') {
            // Citing papers are red circles
            element.append("circle")
                .attr("r", radius)
                .attr("fill", "#ea4335");
        } else {
            // Default case - grey circles
            element.append("circle")
                .attr("r", radius)
                .attr("fill", "#999");
        }
    });
    
    // Optimized tooltip handling
    const tooltip = d3.select(".tooltip");
    
    // Performance optimization: Use event delegation
  // Update inside the mouseoverEvent handler in the createVisualization function
nodeGroup.on("mouseover", function(event) {
    const target = event.target;
    if (target.closest(".node")) {
        const d = d3.select(target.closest(".node")).datum();
        
        // Prepare tooltip content
        let tooltipContent = `<strong>${d.title}</strong>`;
        
        // Add publication date if available
        if (d.publication_date) {
            tooltipContent += `<br>Published: ${formatDate(d.publication_date)}`;
        }
        
        // Add citation count if available
        if (d.cited_by_count) {
            tooltipContent += `<br>Citations: ${d.cited_by_count}`;
        }
        
        // Add concepts if available
        if (d.concepts && d.concepts.length > 0) {
            tooltipContent += `<br>Concepts: ${formatConcepts(d.concepts)}`;
        }
        
        // Add bridge paper info if applicable
        if (d.isBridge) {
            tooltipContent += "<br><em>Bridge Paper</em>";
        }
        
        // Show tooltip with enhanced paper information
        tooltip.style("display", "block")
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 30) + "px")
            .html(tooltipContent);
    }
})
.on("mouseout", function(event) {
        const target = event.target;
        if (target.closest(".node")) {
            tooltip.style("display", "none");
        }
    })
    .on("mousemove", function(event) {
        tooltip.style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 30) + "px");
    });
    
    // Start simulation loop using requestAnimationFrame
    startSimulationLoop();
}

// Calculate node radius based on node type and importance
function getNodeRadius(d) {
    // Return from cache if already calculated
    if (nodeRadiusCache.has(d.id)) {
        return nodeRadiusCache.get(d.id);
    }
    
    let radius;
    
    if (d.type === 'main') {
        // Main papers: size based on citation count and scaled by mainNodeScale
        const baseCitationSize = Math.max(5, Math.min(15, 5 + Math.log(d.cited_by_count + 1)));
        radius = baseCitationSize * mainNodeScale;
    } else if (d.isBridge) {
        // Bridge papers: slightly larger than normal papers and scaled by bridgeNodeScale
        radius = 6 * bridgeNodeScale;
    } else {
        // Referenced or citing papers: normal size and scaled by normalNodeScale
        radius = 4 * normalNodeScale;
    }
    
    // Cache the result
    nodeRadiusCache.set(d.id, radius);
    return radius;
}

// Drag functions for nodes - optimized
function dragstarted(event, d) {
    stopSimulationLoop(); // Stop animation loop during drag
    if (!event.active) simulation.alphaTarget(0.3);
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
    
    // Update position immediately for smoother dragging
    d3.select(event.sourceEvent.target.closest(".node"))
        .attr("transform", `translate(${d.fx}, ${d.fy})`);
    
    // Update connected links for immediate feedback
    mainGroup.selectAll(".link").each(function(linkData) {
        if (linkData.source === d || linkData.target === d) {
            d3.select(this)
                .attr("x1", linkData.source.x)
                .attr("y1", linkData.source.y)
                .attr("x2", linkData.target.x)
                .attr("y2", linkData.target.y);
        }
    });
}

function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    // Comment these out to keep the node fixed at the position where it was dragged
    // d.fx = null;
    // d.fy = null;
    
    // Restart simulation loop
    startSimulationLoop();
}

// Helper function to format publication date
function formatDate(dateString) {
    if (!dateString) return "Unknown";
    
    try {
        const date = new Date(dateString);
        // Check if date is valid
        if (isNaN(date.getTime())) return dateString;
        
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (e) {
        return dateString;
    }
}

// Helper function to format concepts
function formatConcepts(concepts) {
    if (!concepts || concepts.length === 0) return "None";
    
    // Handle both string concepts and concept objects
    const conceptNames = concepts.map(concept => {
        if (typeof concept === 'string') return concept;
        return concept.display_name || concept.name || "Unknown concept";
    });
    
    // Return first 3 concepts to keep tooltip compact
    if (conceptNames.length > 3) {
        return conceptNames.slice(0, 3).join(", ") + ` +${conceptNames.length - 3} more`;
    }
    
    return conceptNames.join(", ");
}

// Handle node click to show paper details - optimized
// Update the nodeClicked function
function nodeClicked(event, d) {
    event.stopPropagation(); // Prevent bubbling to SVG
    
    // Set as selected node
    selectedNode = d;
    
    // Update visual selection - optimized to only change classes for relevant nodes
    d3.selectAll(".node.selected").classed("selected", false);
    d3.select(this).classed("selected", true);
    
    // Get paper details from the original data if it's a main paper
    let paperDetails = d;
    if (d.type === 'main' && originalData) {
        paperDetails = originalData.find(paper => paper.id === d.id) || d;
    }
    
    // Update paper info panel - batch DOM updates
    const paperInfoUpdates = {
        "#paperTitle": paperDetails.title || "Unknown Title",
        "#paperCitations": paperDetails.cited_by_count !== undefined ? `Citations: ${paperDetails.cited_by_count}` : ""
    };
    
    // Add publication date if available
    if (paperDetails.publication_date) {
        paperInfoUpdates["#paperType"] = `${d.type === 'main' ? "Main Paper" : 
            d.type === 'reference' ? "Referenced Paper" : 
            d.type === 'citation' ? "Citing Paper" : "Paper"}${d.isBridge ? " (Bridge)" : ""} · Published: ${formatDate(paperDetails.publication_date)}`;
    } else {
        // Set paper type without date
        let typeText = "";
        if (d.type === 'main') typeText = "Main Paper";
        else if (d.type === 'reference') typeText = "Referenced Paper";
        else if (d.type === 'citation') typeText = "Citing Paper";
        
        if (d.isBridge) typeText += " (Bridge)";
        paperInfoUpdates["#paperType"] = typeText;
    }
    
    // Apply all text updates in one batch
    Object.entries(paperInfoUpdates).forEach(([selector, text]) => {
        d3.select(selector).text(text);
    });
    
    // Set concepts if available - use document fragment for better performance
    const conceptsDiv = d3.select("#paperConcepts");
    conceptsDiv.html("");
    
    if (paperDetails.concepts && paperDetails.concepts.length > 0) {
        // Performance: Create document fragment for batch append
        const fragment = document.createDocumentFragment();
        
        // Add a small label for concepts
        const conceptLabel = document.createElement("div");
        conceptLabel.className = "concept-label";
        conceptLabel.textContent = "Concepts:";
        fragment.appendChild(conceptLabel);
        
        paperDetails.concepts.forEach(concept => {
            const span = document.createElement("span");
            span.className = "concept-tag";
            span.textContent = typeof concept === 'string' ? concept : (concept.display_name || concept.name || "Unknown");
            fragment.appendChild(span);
        });
        
        conceptsDiv.node().appendChild(fragment);
    }
    
    // Set OpenAlex link
    d3.select("#openAlexLink")
        .attr("href", `${d.id}`);
    
    // Performance optimization: Batch DOM operations for related papers lists
    // Use setTimeout to defer heavy operations and keep UI responsive
    setTimeout(() => {
        populateRelatedPapersList(paperDetails, "citing");
        populateRelatedPapersList(paperDetails, "referenced");
        
        // Show the panel
        d3.select("#paperDetailsPanel").style("display", "block");
    }, 0);
}

// Populate the lists of citing and referenced papers - optimized
function populateRelatedPapersList(paperDetails, listType) {
    const listElement = listType === "citing" ? 
        d3.select("#citingPapersList") : 
        d3.select("#referencedPapersList");
    
    listElement.html("");
    
    const paperIds = listType === "citing" ? 
        paperDetails.cited_by_ids : 
        paperDetails.referenced_works;
    
    if (!paperIds || paperIds.length === 0) {
        listElement.append("li")
            .text("No papers available");
        return;
    }
    
    // Performance optimization: Use document fragment for batch DOM operations
    const fragment = document.createDocumentFragment();
    
    // Get paper details if available in original data
    paperIds.forEach(id => {
        const li = document.createElement("li");
        
        // Try to find paper details in original data
        let paperInfo = null;
        if (originalData) {
            paperInfo = originalData.find(paper => paper.id === id);
        }
        
        const a = document.createElement("a");
        if (paperInfo) {
            a.href = "#";
            a.setAttribute("data-id", id);
            a.textContent = paperInfo.title || id;
            a.addEventListener("click", function(event) {
                event.preventDefault();
                const paperId = this.getAttribute("data-id");
                const nodeElement = mainGroup.selectAll(".node").filter(d => d.id === paperId);
                if (!nodeElement.empty()) {
                    nodeClicked.call(nodeElement.node(), event, nodeElement.datum());
                }
            });
        } else {
            a.href = `${id}`;
            a.target = "_blank";
            a.textContent = id;
        }
        
        li.appendChild(a);
        fragment.appendChild(li);
    });
    
    listElement.node().appendChild(fragment);
}

// Close details panel when clicking on the background
svg.on("click", function() {
    closeDetailsPanel();
});

// Clean up resources when window is closed or component is unmounted
window.addEventListener('beforeunload', function() {
    if (simulation) {
        simulation.stop();
    }
    stopSimulationLoop();
});

// Load sample data or wait for user upload
document.addEventListener("DOMContentLoaded", function() {
    // Optional: Load sample data automatically
    // fetch('sample_data.json')
    //    .then(response => response.json())
    //    .then(data => {
    //        originalData = data;
    //        processData(data);
    //    })
    //    .catch(error => console.error('Error loading sample data:', error));
});