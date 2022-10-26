// ----------------------------------------------------------------------
// A javascript / D3 script to take data from lineage tracing experiments
// and plot edits over the barcoded regions we have
//
// December 7th, 2015
//
// ----------------------------------------------------------------------

// the total width of the plots on the right and left sides

var eventNumberToType = {"0": "match", "1": "deletion", "2": "insertion", "3": "uncovered", "4": "scar", "5": "inversion"};
var eventTypeToNumber = {"M": 0, "D": 1, "I": 2, "U": 3, "S": 4, "V": 5};

// sizes for various bounding boxes
var default_global_width = 1200;
var global_width = default_global_width;
var global_height = 700;
var margin_left = 80;

// the right histo size
var right_histo_width = 200;
var right_histo_height = 400;
var right_histo_buffer_x = 10;

// the heat size
var heat_height = 400;
var heat_width = 800;

// should we use the data's high value or 100% on the top of the plot
var highValueTop = false

// top bar dims
var top_height = 100;
var top_width = 800;

// the width of the bars in our set membership
var setMemberWidth = 25

// colors we use for events throughout the plots
// 1) color for unedited
// 2) color for deletions
// 3) color for insertions
// 4) color for mismatch? might be useful for TYR data
var heatmap_colors = [d3.color("rgba(255, 255, 255, 1.0)"), // match
                        d3.color("rgba(255, 0, 0, 1.0)"), // deletion
                        d3.color("rgba(26, 99, 255, 1.0)"), // insertion
                        d3.color("rgba(0,255,0,1.0)"), // uncovered
                        d3.color("rgba(0,0,0,1.0)") // scar
                        ,d3.color("rgba(10, 10, 10,1.0)")]; // inversion
// var heatmap_colors = ['#FFFFFF', '#FF0000', '#1A63FF', '#00FF00','#000000'];

// the labels for types of events we support in the input data
var mutation_values = ["reference", "insertion", "deletion", "mismatch", "inversion"];
var maxValue = mutation_values.length;

// state data -- these are a hack to get around the async data loading in D3 -- sorry!
var xScaleIsLog = false
var topScaleIsLog = false
var occurance_data = ""
var read_block_data = ""

// constant for the maximum height of a row in the heatmap and corresponding righthand barchart
var maxReadHeight = 15

// to give the plots on the bottom a cleaner look, crop the bar sizes to a proportion of their total height (to give white boundries between)
var cropHeightProp = 0.8

// plot up to this many HMID reads on the plot
var topHMIDs = 100


// from http://bl.ocks.org/mbostock/7621155
var superscript = "⁰¹²³⁴⁵⁶⁷⁸⁹",
    formatPower = function(d, i) {
        return (d + "").split("").map(function(c) { return superscript[c]; }).join("");
    };

// ************************************************************************************************************
// setup the SVG panels
// ************************************************************************************************************
var svg = d3.select("#left").append("svg")
    .attr("width", global_width)
    .attr("height", global_height)
    .append("g")
    .attr("transform", "translate(40,40)")

function scaleToHundred() {
    if (highValueTop) {
	highValueTop = false
    } else {
	highValueTop = true
    }
    redrawAll()
}

function logTheTop() {
    d3.select("#topplot").select("svg").remove();
    
    svg = d3.select("#topplot").append("svg")
	.attr("width", top_width)
	.attr("height", top_height)
	.append("g")
	
    if (topScaleIsLog) {
        topScaleIsLog = false
    } else {
        topScaleIsLog = true
    }
    redrawAll()
}

var histogram_top_data = ""
var cut_site_data = ""
var aux_data = ""




if (typeof interval_file != 'undefined') {
    // if we have additional annotations, load them, and add them to the plot
    d3.tsv(interval_file, function (error, data) {
	aux_data = data
	global_width = default_global_width + setMemberWidth * data.length
	right_histo_buffer_x = right_histo_buffer_x + setMemberWidth * data.length
	if (((typeof interval_file == 'undefined') || aux_data != "") && histogram_top_data != "" && cut_site_data != "") {
	    redrawTheTopHistogram()
	}

	if (occurance_data != "") {
	    redrawUnsetMembership()
	}
	
    })
}



function redrawTheTopHistogram() {
    // make a new data set where we melt down the mutations -- effectively like melt in R
    var muts = (["M","D", "I","S","U","V"].map(function (mutation) {
        return histogram_top_data.map(function (d) {
            return {x: parseInt(d.index), y: +d[eventNumberToType[eventTypeToNumber[mutation]]], type: eventNumberToType[eventTypeToNumber[mutation]]};
        });
    }));
    //var muts = d3.layout.stack();
    //muts(mut_data);

    var maxVal = d3.max(muts[0], function (d) {return +d.x})
    
    var minVal = d3.min(muts[0], function (d) {return +d.x})
    
    var xEvents = d3.scale.linear().domain([minVal,maxVal]).range([margin_left, top_width]);
    
    var yMax =  Math.max(d3.max(muts[2].map(function (d) {return d.y;})),
			 Math.max(d3.max(muts[0].map(function (d) {return d.y;})),
				  d3.max(muts[1].map(function (d) {return d.y;}))));
    
    if (!highValueTop) {
	yMax = 1.0
    }
    var yEvents = d3.scale.linear().domain([0, yMax]).range([top_height, 0]);

    // deal with y-axis format issues when the editing rate drops low, and one sig. digit isn't enough
    var formatter = d3.format("2.1%");
    if (yMax < 0.001) {
	formatter = d3.format("2.2%");
    }

    var yAxis = d3.svg.axis()
        .scale(yEvents)
        .orient("left")
        .ticks(4)
        .tickFormat(formatter)
        .outerTickSize(0);

    var logScaleFactor = 100.0
    var roundPlaces = 2
    
    if (topScaleIsLog) {
	formatter = d3.format("2");

	if (yMax < 0.01) {
	    formatter = d3.format("2.1");
	    logScaleFactor = 1000.0 // yeah our log scaling is a bit ugly
	    roundPlaces = 4
	}
	if (yMax < 0.001) {
	    formatter = d3.format("2.2");
	    logScaleFactor = 10000.0 // yeah our log scaling is a bit ugly
	    roundPlaces = 6
	}
	
	yEvents = d3.scale.log().domain([1, yMax * logScaleFactor]).range([top_height, 0]);
	
	yAxis = d3.svg.axis()
            .scale(yEvents)
            .orient("left")
            .ticks(3)
            .tickFormat(formatter)
            .outerTickSize(0);
    } else {
	if (yMax < 0.01) {
	    roundPlaces = 4
	}
	if (yMax < 0.001) {
	    roundPlaces = 6
	}
    }

    var xAxis = d3.svg.axis()
        .scale(xEvents)
        .orient("bottom");

    // ************************************************************************************************************
    // load in the cutsite data and draw that onto the plot -- this is nested to use the x and y axis object from above
    // ************************************************************************************************************
        
    svg.selectAll('.target')
        .data(cut_site_data)
        .enter().append('rect')
        .attr('class', 'target')
        .attr('x', function (d) {
            return xEvents(+d.position);
        })
        .attr('y', 0)
        .attr('width', function (d) {
            return xEvents(20) - xEvents(0)
        })
        .attr('height', top_height)
        .attr("fill-opacity", .1)
        .attr("stroke", "#888888")
    
    svg.selectAll('.cutsites')
        .data(cut_site_data)
        .enter().append('rect')
        .attr('class', 'cutsites')
        .attr('x', function (d) {
	    // figure out if the cutsite is closer to the end of the events
	    // this is very hacky -- also deal with some people not being able to camel-case their columns like what was asked of them
	    if (typeof d.cutPos === 'undefined') {
		if ((+d.cutpos) - (+d.position) > 10)
		    return xEvents(+d.cutpos + 4)
		else
		    return xEvents(+d.position - 4)
	    } else {
		if ((+d.cutPos) - (+d.position) > 10)
		    return xEvents(+d.cutPos + 4)
		else
		    return xEvents(+d.position - 4)
	    }
        })
        .attr('y', 0)
        .attr('width', function (d) {
            return xEvents(4) - xEvents(0)
        })
        .attr('height', top_height)
        .attr("fill-opacity", .6)
        .attr("fill", "gray")
	.attr("stroke", "#888888")

    var mutbox = svg.selectAll(".bar")
        .data(muts)
        .enter().append("svg:g")
        .attr("class", "cause")
        .style("fill", function (d, i) {
            return heatmap_colors[i + 1];
        })
        .style("stroke", function (d, i) {
            return d3.rgb(heatmap_colors[i + 1]);
        });

    var line = d3.svg.line()
        .x(function (d) {
            return xEvents(d.x);
        })
        .y(function (d) {
            return yEvents(d.y);
        });

    var lineLog = d3.svg.line()
        .x(function (d) {
            return xEvents(d.x);
        })
        .y(function (d) {
            return yEvents(Math.max(1,logScaleFactor * d.y));
        });

    if (topScaleIsLog) {
	    svg.append("svg:path").attr("d", lineLog(muts[0])).attr("class", "line").attr("fill", "none").attr("stroke", heatmap_colors[0]).attr("stroke-width", "3px")
	    svg.append("svg:path").attr("d", lineLog(muts[1])).attr("class", "line").attr("fill", "none").attr("stroke", heatmap_colors[1]).attr("stroke-width", "3px")
	    svg.append("svg:path").attr("d", lineLog(muts[2])).attr("class", "line").attr("fill", "none").attr("stroke", heatmap_colors[2]).attr("stroke-width", "3px")
	    svg.append("svg:path").attr("d", lineLog(muts[3])).attr("class", "line").attr("fill", "none").attr("stroke", heatmap_colors[4]).attr("stroke-width", "3px")
	    svg.append("svg:path").attr("d", lineLog(muts[5])).attr("class", "line").attr("fill", "none").attr("stroke", heatmap_colors[5]).attr("stroke-width", "3px")

    } else {
	    svg.append("svg:path").attr("d", line(muts[0])).attr("class", "line").attr("fill", "none").attr("stroke", heatmap_colors[0]).attr("stroke-width", "3px")
	    svg.append("svg:path").attr("d", line(muts[1])).attr("class", "line").attr("fill", "none").attr("stroke", heatmap_colors[1]).attr("stroke-width", "3px")	
	    svg.append("svg:path").attr("d", line(muts[2])).attr("class", "line").attr("fill", "none").attr("stroke", heatmap_colors[2]).attr("stroke-width", "3px")
	    svg.append("svg:path").attr("d", line(muts[3])).attr("class", "line").attr("fill", "none").attr("stroke", heatmap_colors[4]).attr("stroke-width", "3px")	
        svg.append("svg:path").attr("d", line(muts[5])).attr("class", "line").attr("fill", "none").attr("stroke", heatmap_colors[5]).attr("stroke-width", "3px")

    }
    
    svg.append("g")
        .attr("transform", "translate(" + (xEvents(0) - 5) + ",0)")
        .attr("anchor", "right")
        .call(yAxis)
	.style("fill","none")
    	.style("stroke","#000")
    	.style("shape-rendering","crispEdges")
	.selectAll("text")
	.style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
	.style("fill","black")
    	.style("stroke-width",0)
    	.style("shape-rendering","crispEdges")

    var legendText = "Editing (%)"

    // if we're logged we need to adjust the legend text and manualy remove a bunch of labels /ticks from the y axis
    if (topScaleIsLog) {
	legendText = "Editing percent (log)"

	// god damn do log transform axes in D3 suck -- here's what we do: filter down to 3 or 4 tick points.  Otherwise it's too crowded,
	// or too sparse.  
	var fullSelection = svg.selectAll(".tick")
	var everyNth = Math.ceil(fullSelection.size()/3)
	
        fullSelection.each(function (d, i) {
            if (i % everyNth != 0 && i != fullSelection.size() - 1) {
                this.remove();
            } else {
                var valueToConvert = +this.textContent / (logScaleFactor / 100.0) 
                this.children[1].textContent = d3.round(valueToConvert,roundPlaces) + "%"
            }
        });
    }
    
    //Add the text legend
    svg.append("text")
        .attr("x", function (d) {
            return -1 * top_height; // due to the transform
        })
        .attr("y", function (d) {
            return 0;
        })
        .attr("text-anchor", "left")
        .style("font-size", "20px")
        .text(legendText)
        .attr("transform", "rotate(-90)");

    // ------------------------------------------------------------------------------------------------------------------------
    // now check if we've been supplied additional annotations; if so plot them
    // ------------------------------------------------------------------------------------------------------------------------
    if (!(aux_data === "")) {
	svg.selectAll('.highlightBoxes')
            .data(aux_data)
            .enter().append('rect')
            .attr('class', 'cutsites')
            .attr('x', function (d) {
		return xEvents(+d.start);
            })
            .attr('y', 0)
            .attr('width', function (d) {
		var width = +d.end - +d.start;
		return xEvents(width) - xEvents(minVal)
            })
            .attr('height', top_height)
            .attr("fill-opacity", .5)
            .attr("fill", function (d) {return d.color})
    }
}; 

function changeHistogram() {
    d3.select("#heatmapRight").select("svg").remove();
    
    svgHeatRight = d3.select("#heatmapRight")
        .append("svg")
        .attr("width", right_histo_width)
        .attr("height", right_histo_width)
        .append("g")

    if (xScaleIsLog) {
        xScaleIsLog = false
    } else {
        xScaleIsLog = true
    }
    redrawAll()
}


// ************************************************************************************************************
// draw a set membership on the side of the panel instead of the histogram of alleles
// ************************************************************************************************************
function redrawUnsetMembership() {
    var local_occur_data = occurance_data.filter(function(d){ return +d.array < topHMIDs; })

    // convert the local data into a matrix:
    // 1) figure out how many catagories there are and map them to integers
    // 2) make a matrix of the correct size
    // 3) fill in with the data
    var positionMap = {};
    var key_lookup = aux_data.map(function(ray, index) {
	positionMap[ray.start + "-" + ray.end + "_" + ray.color] = index;
	return positionMap;
    });

    var unsetData = createArray(local_occur_data.length, aux_data.length)
    
    /* fill in the data */
    local_occur_data.map(function (d, i) {
	Object.keys(positionMap).map(function(key,index) {
	    unsetData[i][index] = 0;
	})
	
	d["highlightMembership"].split(",").map(function(dInner,iInner) {
	    var pos = positionMap[dInner];
            unsetData[i][pos] = 1
	})
    });

    var range = Array.apply(null, Array(aux_data.length)).map(function (_, i) {return i;})
    
    // make a new data set where we melt down the mutations -- effectively like melt in R
    var typeHM = d3.layout.stack()(range.map(function (index) {
	var col = aux_data[index]["color"]
	var tp = aux_data[index]["region"]
        return unsetData.map(function (d,i) {
	    if (d[index] == 0) {
		return {y: i, x: index, color: "#FFFFFF", type: tp};
	    } else {
		return {y: i, x: index, color: col, type: tp};
	    }

            });
    }));
    var mergedHM = []
    range.map(function(x) {
	mergedHM = mergedHM.concat(typeHM[x]);
    });
    
    var readCount = d3.max(local_occur_data.map(function (d) {return +d.array;})) + 1;
    var gridHeight = Math.min(maxReadHeight, parseInt(right_histo_height / readCount));
    var totalHistoHeight = gridHeight * readCount
    // var yScale = d3.scale.linear().domain([0,unsetData.length]).range([0, totalHistoHeight])
    var yScale = d3.scale.ordinal().domain(typeHM[0].map(function (d) {
        return d.y;
    })).rangeBands([0, totalHistoHeight]);
    var totalSetWidth = range.length * setMemberWidth
    var xScale = d3.scale.linear().domain([0,aux_data.length]).range([0, totalSetWidth])
    var xWidth = totalSetWidth / aux_data.length
    var yWidth = totalHistoHeight / unsetData.length
    var padding = 0.8
    var shift = (1.0 - padding) / 2.0

    var heatMap = svg.selectAll(".barRightHisto")
        .data(mergedHM)
        .enter().append("svg:rect")
        .attr("x", function (d, i) {
	    return xScale(d.x) + (xWidth * shift)
        })
        .attr("y", function (d, i) {
	    return yScale(d.y) + (yWidth * shift)
        })
        .attr("width", function (d) {
	    // if the far end of the bar is past the end of the plot, cap it at the end of the plot
	    return xWidth * padding;
        })
        .attr("height", function (d) {
	    return yWidth * padding;
        })
        .style("fill", function (d) {
	    return d.color;
        })
	.style("stroke","#FFF") // "#333")
	.style("shape-rendering","crispEdges")
	.attr("transform", "translate(" + (top_width + 5) + "," + ( top_height + 1) + ")");
// + (top_width + right_histo_buffer_x) + "," + -1.0 * ( right_histo_height - top_height) + ")");


    var translatex = (top_width + 5)
    var translatey = ( top_height - 10)
    
    var textnode = svg.selectAll(".texto")
        .data(aux_data)
        .enter()
        .append("g");

    textnode.append("circlePower")
	.attr("class", "dot")
	.attr("x", function(d,i) {
	    return xScale(i);
	})
	.attr("y", function(d) { return yScale(0); })

    textnode.append("text")
	.attr("x", function(d,i) {
	    return yScale(0);
	})
	.attr("y", function(d,i) {
	    return xScale(i) + (setMemberWidth * .70);
	})
	.text(function(d) {
	    return d.region;
	})
	.attr("transform", "rotate(-90) translate(" + -1.0 * translatey + "," + translatex + ")");

}



// ************************************************************************************************************
// histogram on the right
// ************************************************************************************************************
function redrawHistogram() {

    var local_occur_data = occurance_data.filter(function(d){ return +d.array < topHMIDs; })

    
    // find the maximum number of reads
    var readCount = d3.max(local_occur_data.map(function (d) {return +d.array;})) + 1;
    var gridHeight = Math.min(maxReadHeight, parseInt(right_histo_height / readCount));
    var totalHistoHeight = gridHeight * readCount
    
    formatter = d3.format("2");
    var yScale = d3.scale.ordinal().domain(local_occur_data.map(function (d) {
        return d.array;
    })).rangeBands([0, totalHistoHeight]);
    
    var yAxis = d3.svg.axis().scale(yScale).orient("left").ticks(4)
        .tickFormat(formatter)
        .outerTickSize(0)
	

    // are we using linear or log scales? setup the axis either way
    // --------------------------------------------------------------------------------
    prescale = d3.scale.linear().domain([0, d3.max(local_occur_data, function (d) {
        return +d.rawCount
    })]).range([0, right_histo_width]).nice();

    var xAxisHistoRight = d3.svg.axis().scale(prescale).orient("top")
    if (xScaleIsLog) {
        var maxVal = d3.max(local_occur_data, function (d) {return +d.rawCount})
        var minVal = d3.min(local_occur_data, function (d) {return +d.rawCount})
        prescale = d3.scale.log().domain([minVal, maxVal]).range([0, 150]).nice();
        xAxisHistoRight = d3.svg.axis().scale(prescale).orient("top").tickSize(10).ticks(1);
    }

    var mutbox2 = svg.selectAll(".barRightHisto")
        .data(local_occur_data)
        .enter().append("svg:g")
        .attr("class", "cause")
        .style("fill", function (d, i) {
            return heatmap_colors[0];
        })
	.style("stroke", function (d, i) {
            return "gray";
	})
    	.attr("transform", "translate(" + (top_width + right_histo_buffer_x) + "," + -1.0 * ( right_histo_height - top_height) + ")");
    
    mutbox2.selectAll(".barRightHisto")
        .data(local_occur_data)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", function (d) {
            return 0;
        })
        .attr("width", function (d) {
            return Math.max(0.5,prescale(+d.rawCount));
        })
        .attr("y", function (d) {
            return right_histo_height + yScale(+d.array) + ((1.0 - cropHeightProp) * gridHeight);
        })
        .attr("height", function (d) {
            return gridHeight * cropHeightProp;
        })
        .style("fill", function (d, i) {
            return d.WT;
        })
        .style("stroke", function (d, i) {
            return shadeColor2(d.WT,-0.5);
        })
    
    // this is really hacky, but I can't seem to programmaticly slim down the number of ticks on the x axis in log mode, so do it by hand
    if (xScaleIsLog) {
	svg.append("g")
            .attr("class", "axis")
	    .attr("transform", "translate(" + (top_width + right_histo_buffer_x) + ","  + ( top_height - 5) + ")")
            .call(xAxisHistoRight)
	    .style("fill","none")
    	    .style("stroke","#000")
    	    .style("shape-rendering","crispEdges")
	    .selectAll(".tick")
            .each(function (d, i) {
                if (d == 0 || this.textContent == "" || !(Math.log10(+this.textContent) % 1 === 0)) {
                    this.remove();
                } else {
                    var valueToConvert = +this.textContent
                    this.children[1].textContent = "10" + formatPower(Math.log10(valueToConvert))
                }
            })
	    .selectAll("text")
	    .style("text-anchor", "end")
            .attr("dx", "-.8em")
            .attr("dy", ".15em")
            .attr("transform", "rotate(90)")
            .attr("y", 1)
	    .style("fill","black")
    	    .style("stroke-width",0)
    	    .style("shape-rendering","crispEdges")
        
    } else {
	svg.append("g")
            .attr("class", "axis")
	    .attr("transform", "translate(" + (top_width + right_histo_buffer_x) + ","  + ( top_height - 5) + ")")
            .call(xAxisHistoRight)
	    .style("fill","none")
    	    .style("stroke","#000")
    	    .style("shape-rendering","crispEdges")
	    .selectAll("text")
	    .style("text-anchor", "end")
            .attr("dx", "-.8em")
            .attr("dy", ".15em")
            .attr("transform", "rotate(90)")
            .attr("y", 1)
	    .style("fill","black")
    	    .style("stroke-width",0)
    	    .style("shape-rendering","crispEdges")
            .selectAll(".tick")
            .each(function (d, i) {
                if (i % 2 == 0) {
                    this.remove();
                }
            });
    }

    //Add the text legend
    svg.append("text")
        .attr("x", function (d) {
            return 0;
        })
        .attr("y", function (d) {
            if (xScaleIsLog) {
                return right_histo_height - 70;
            } else {
                return right_histo_height - 100;
            }
        })
        .attr("text-anchor", "left")
        .style("font-size", "20px")
        .text("Number of cells")
	.attr("transform", "translate(" + (top_width + right_histo_buffer_x) + "," + -1.0 * ( right_histo_height - top_height) + ")");

}



function enrich_event_file(events) {
    //event   array   proportion      rawCount        WT      highlightMembership
    let new_events = []
    let total_reads = 0;
    let index = 0;
    events.forEach(event => {
        total_reads += event.count

        let all_wt = "#00FF00";
        
        event.alleles.split("_").forEach(tk => {if (tk != "NONE") all_wt = "#888888"});
        new_events.push({event: event.alleles, array: index, proportion : event.count, rawCount: event.count, WT: all_wt, highlightMembership: "NONE"})
        index += 1;
    });
    let newer_events = []
    new_events.forEach(event => {
        newer_events.push({event: event.event, array: event.array, proportion : event.proportion/total_reads, rawCount: event.rawCount, WT: event.WT, highlightMembership:event.highlightMembership})
    });
    return(newer_events);
}

// ************************************************************************************************************
// read plots -- add a block for each of the high frequency reads we observe
// ************************************************************************************************************
function full_coverage_events_to_per_base_stats(full_coverage_events,length,depth) {
    let coverage = []
    for (let i = 0; i < length; i++) {
        coverage.push({index: i, match : 0, insertion: 0, deletion: 0, scar: 0, inversion: 0})
    }
    let total = 0;
    full_coverage_events.forEach(event => {
        if (event.start == 0) {
            total += event.count;
        }
        try {
            switch (event.event_type) {
                case 0: // match
                    break;
                case 1: // deletion
                    for (let i = event.start; i < Math.min(event.end,length); i++) {coverage[i].deletion += event.count}; break;
                case 2: // insertion
                    for (let i = event.start; i < Math.min(event.end,length); i++) {coverage[i].insertion += event.count}; break;
                case 3: // uncovered
                    break;
                case 4: // scar
                    for (let i = event.start; i < Math.min(event.end,length); i++) {coverage[i].scar += event.count}; break;
                case 5: // inversion
                    for (let i = event.start; i < Math.min(event.end,length); i++) {coverage[i].inversion += event.count}; break;
            }
        } catch (error) {
            console.error(event);
            console.error(error);
        }
    })
    let new_coverage = []
    for (let i = 0; i < length; i++) {
        let insertion_pct = coverage[i].insertion / total
        let deletion_pct = coverage[i].deletion / total
        let scar_pct = coverage[i].scar / total
        let inversion_pct = coverage[i].inversion / total
        let match_pct = 1.0 - insertion_pct - deletion_pct - scar_pct - inversion_pct
        new_coverage.push({index: i, match : match_pct, insertion: insertion_pct, deletion: deletion_pct, scar: scar_pct, inversion: inversion_pct})
    }
    return(new_coverage)
}


// ************************************************************************************************************
// read plots -- add a block for each of the high frequency reads we observe
// ************************************************************************************************************
function alleles_to_full_coverage_events(allele_string,array_number,count,end_position) {
    // cutsites is: sites   position        cutPos
    let tokens = [...new Set(allele_string.split("_"))];

    let events = [];
    let current_event = {array: array_number, start: 0, end: 0, event_type: 0, count: count};
    let first_event = true;
    const already_added = new Map();

    tokens.forEach(token => {
        if (token != "NONE") {
            let subtokens = token.split("&");
            subtokens.forEach(subtoken => {
                let eventparts = subtoken.split("+");
                let position = +eventparts[1];
                let event_type = eventTypeToNumber[eventparts[0].slice(-1)];
                let length = +eventparts[0].slice(0,eventparts[0].length-1);

                if (current_event.event_type == 0 && event_type == 0) {
                    current_event.end = position + length
                } else {
                    if (first_event) {
                        current_event.end = position - 1
                        first_event = false
                        events.push(current_event);
                        already_added.set(current_event.start + "_" + current_event.event_type,true)
                    } 
                    if (!already_added.has(current_event.start + "_" + current_event.event_type)) {
                        events.push(current_event);
                        already_added.set(current_event.start + "_" + current_event.event_type,true)
                        // add an event to fill the gap between the 'current event' and the new event
                        events.push({array: array_number, start: current_event.end + 1, end: position - 1, event_type: 0, count: count});

                    }
                    
                    
                    current_event = {array: array_number, start: position, end: position + length, event_type: event_type, count: count};

                }
            });
        }
    });
    if (current_event.event_type == 0) {
        
        current_event.end = end_position;
        if (!already_added.has(current_event.start + "_" + current_event.event_type)) {
            events.push(current_event);
        }
    } else {
        if (!already_added.has(current_event)) {
            events.push(current_event);
        }
        events.push({array: array_number, start: current_event.end + 1, end: end_position, event_type: 0, count: count});
    }
    return(events);
}

function parseReadCountFile(dt,length) {
    // convert the alleles file to an object with the following structure:
    // array   start   end     event
    // 
    // we assume alleles is structured with AT LEAST the following columns: 
    // alleles count
    let array_of_events = [];
    let index = 0;
    dt.forEach(row => {
        let per_event = alleles_to_full_coverage_events(row.alleles,index,+row.count,length);
        array_of_events.push.apply(array_of_events,per_event);
        index += 1;
    });
    return(array_of_events);
}

// ************************************************************************************************************
// read plots -- add a block for each of the high frequency reads we observe
// ************************************************************************************************************

// ************************************************************************************************************
// histrogram of events over the length of our amplicon -- taken from all reads
// ************************************************************************************************************
/* d3.tsv(per_base_histogram_data, function (error, data) {
    histogram_top_data = data
    if (((typeof interval_file == 'undefined') || aux_data != "") && histogram_top_data != "" && cut_site_data != "") {
	redrawTheTopHistogram()
    }
}) 

d3.tsv(occurance_file, function (error, data) {
    occurance_data = data
    if (aux_data != "") {
	redrawUnsetMembership()
    }
    redrawHistogram();
});
*/
d3.tsv(cut_site_file, function (error, data) {
    cut_site_data = data
    if (((typeof interval_file == 'undefined') || aux_data != "")&& histogram_top_data != "" && cut_site_data != "") {
	redrawTheTopHistogram()
    }
})
/*
d3.tsv(top_read_melted_to_base, function (error, data) {
    read_block_data = data
    redraw_read_block();
});
*/

d3.tsv(all_read_count_file, function (error, data) {
    read_block_data = parseReadCountFile(data,4500);
    histogram_top_data = full_coverage_events_to_per_base_stats(read_block_data,4500);
    occurance_data = enrich_event_file(data);
    let x = 6;

    redrawTheTopHistogram();
    //redrawUnsetMembership();
    redrawHistogram();
    redraw_read_block();
});

function redraw_read_block() {
    var local_rbd = read_block_data.filter(function(d){ return +d.array < topHMIDs; })
    
    var readCount = parseInt(d3.max(local_rbd , function (d) {
        return +d.array;
    })) + 1;
    var gridHeight = Math.min(maxReadHeight, parseInt(heat_height / readCount));
    var totalHeatHeight = gridHeight * readCount

    var maxVal = d3.max(local_rbd , function (d) {return +d.end})
    var minVal = d3.min(local_rbd , function (d) {return +d.start})
    
    // the scales and axis for the heatmap data
    var yScale = d3.scale.ordinal().domain(local_rbd.map(function (d) {
        return +d.array;
    })).rangeBands([0, totalHeatHeight]);
    
    var xScale = d3.scale.linear().domain([minVal,maxVal]).range([margin_left, heat_width]);
    var maxXPlot = xScale(maxVal)

    var dmt = xScale.domain().end;
    var gridWidth = parseInt((heat_width - margin_left) / dmt);
    var readCount = parseInt(d3.max(local_rbd, function (d) {
        return +d.array;
    })) + 1;
    var gridOffset = parseInt(gridWidth + (gridWidth / 2));
    var max = d3.entries(local_rbd ).sort(function (a, b) {
            return d3.descending(+a.value.start, +b.value.start);
        }
    )[0].value.start;

    var min = d3.entries(local_rbd ).sort(function (a, b) {
            return d3.ascending(+a.value.start, +b.value.start);
        }
    )[0].value.start;

    var heatMap = svg.selectAll(".heatmap")
        .data(local_rbd )
        .enter().append("svg:rect")
        .attr("x", function (d, i) {
	    var lowBound = Math.max(minVal,+d.start)
            return xScale(lowBound)
        })
        .attr("y", function (d, i) {
            return yScale(+d.array) + ((1.0 - cropHeightProp) * gridHeight)
        })
        .attr("width", function (d) {
	    // if the far end of the bar is past the end of the plot, cap it at the end of the plot
	    if (+d.end > maxVal) {
		return maxXPlot - xScale(+d.start); //  - (xScale(+d.position));
	    } else {
		return xScale((+d.end - +d.start) + minVal) - xScale(minVal);
	    }
        })
        .attr("height", function (d) {
            return gridHeight * cropHeightProp;
        })
        .style("fill", function (d) {
            return heatmap_colors[+d.event_type];
        })
	.attr("transform", "translate(0," + top_height + ")");
};

function changeSelection() {
    var e = document.getElementById("topX");
    topHMIDs = +e.options[e.selectedIndex].value;
    redrawAll()
}

function redrawAll() {
    d3.select("#left").select("svg").remove();

    if (topHMIDs > 100) {
	// sizes for various bounding boxes
	global_height = 1400;

	// the heat size
	heat_height = 1100;
	right_histo_height = 1100;

	svg = d3.select("#left").append("svg")
	    .attr("width", global_width)
	    .attr("height", global_height)
	    .append("g")
	    .attr("transform", "translate(40,40)")
	
    } else {
	global_height = 700;
	heat_height = 400;
	right_histo_height = 400;

	svg = d3.select("#left").append("svg")
	    .attr("width", global_width)
	    .attr("height", global_height)
	    .append("g")
	    .attr("transform", "translate(40,40)")
    }


    if (aux_data != "") {
	redrawUnsetMembership();
    }
    redrawTheTopHistogram();
    redraw_read_block();
    redrawHistogram();
}    

// from http://stackoverflow.com/questions/5560248/programmatically-lighten-or-darken-a-hex-color-or-rgb-and-blend-colors
function shadeColor2(color, percent) {   
    var f=parseInt(color.slice(1),16),
	t=percent<0?0:255,
	p=percent<0?percent*-1:percent,
	R=f>>16,
	G=f>>8&0x00FF,
	B=f&0x0000FF;
    
    return "#"+(0x1000000+(Math.round((t-R)*p)+R)*0x10000+(Math.round((t-G)*p)+G)*0x100+(Math.round((t-B)*p)+B)).toString(16).slice(1);
}

// http://stackoverflow.com/questions/966225/how-can-i-create-a-two-dimensional-array-in-javascript/966938#966938
function createArray(length) {
    var arr = new Array(length || 0),
        i = length;

    if (arguments.length > 1) {
        var args = Array.prototype.slice.call(arguments, 1);
        while(i--) arr[length-1 - i] = createArray.apply(this, args);
    }

    return arr;
}
