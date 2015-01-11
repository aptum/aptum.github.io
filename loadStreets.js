// vim: tabstop=4:softtabstop=4:shiftwidth=4:noexpandtab

// POLYFILL: browser compatibility
// Source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find
if (!Array.prototype.find) {
	Array.prototype.find = function(predicate) {
		if (this == null) {
			throw new TypeError('Array.prototype.find called on null or undefined');
		}
		if (typeof predicate !== 'function') {
			throw new TypeError('predicate must be a function');
		}
		var list = Object(this);
		var length = list.length >>> 0;
		var thisArg = arguments[1];
		var value;

		for (var i = 0; i < length; i++) {
			value = list[i];
			if (predicate.call(thisArg, value, i, list)) {
				return value;
			}
		}
		return undefined;
	};
}

// GLOBAL VARIABLES
var overpassapi = "http://overpass-api.de/api/interpreter?data=";

var osmInfo = []; // list of all addresses returned by overpass
var streets = []; // list of streets with the addresses divided in several categories + extra info
var finished = []; // list of boolean flags per street to check if the loading is finished and comparison may start
var totals = {}; // object keeping the total number of addresses per category
	
var mapObj;

var tableBodyId = "streetsTableBody";
var mapId = "map"
var tableId = "streetsTable";



// HTML WRITERS
/**
 * Makes the html code for a table cell (including links tooltip, ...)
 */
function getCellHtml(type, streetIdx)
{
	var street = streets[streetIdx];
	var sanName = street.sanName;
	var layerName =  sanName + '-' + type;
	if (!street[type].length)
		return "0";
	else
		return ("<a "+
					"class='blueLink'" +
					"title='Load this data in JOSM (%type)' "+
					"onclick='openInJosm(\"%type\", streets[%i], \"%layerName\")' >"+
				"%num"+
			"</a>")
				.replace(/%type/g, type)
				.replace(/%street/g, sanName)
				.replace(/%i/g, streetIdx)
				.replace(/%layerName/g, layerName)
				.replace(/%num/g, street[type].length);
}

function getTableRow(streetIdx)
{
	var street = streets[streetIdx];
	var sanName = street.sanName;
	return (
		'<tr id="%n" class="dataRow">\n' +
		'<td id="%n-name" name="%n-name">'+
			'<b><a ' +
				'onclick="openStreetInJosm(' + streetIdx + ')" ' +
				'title="Load this street in JOSM in the active layer">' +
				street.name +
			'</a></b>'+
		'</td>\n' +
		'<td id="%n-full" name="%n-full"></td>\n' +
		'<td id="%n-missing" name="%n-missing"></td>\n' +
		'<td id="%n-missing_overlapping" name="%n-missing_overlapping"></td>\n' +
		'<td id="%n-wrong" name="%n-wrong"></td>\n' +
		'<td id="%n-completeness" name="%n-completeness"></td>\n' +
		'</tr>\n').replace(/%n/g, street.sanName);
}

function getMapPopup(i) {
	ret = "<h4><a onclick='openStreetInJosm(" + i + ")'>" + streets[i].name + "</a></h4>";
	ret += "Total: " + getCellHtml("full", i) + "<br/>";
	if (loadOsmData())
	{
		ret += "Missing: " + getCellHtml("missing", i, true) + "<br/>";
		ret += "Missing overlapping: " + getCellHtml("missing_overlapping", i, true) + "<br/>";
		ret += "Wrong: " + getCellHtml("wrong", i, true);
	}
	return ret;
}

// READ URL PARAMETERS
function getPcode()
{
	return document.getElementById("pcodeInput").value;
}

function getMaxDist()
{
	return +document.getElementById("maxDistanceInput").value;
}

function loadOsmData()
{
	return document.getElementById("loadOsmInput").checked;
}

function showCrabInfo()
{
	return document.getElementById("crabInfoInput").checked;
}

function includePcode()
{
	return document.getElementById("includePcodeInput").checked;
}

function includeFlats()
{
	return document.getElementById("includeFlatsInput").checked;
}
function getStreetsFilter()
{
	var str = document.getElementById("filterStreetsInput").value;
	str = escapeRegExp(str, STAR_AS_WILDCARD);
	return str;
}

// DATA PARSING FUNCTIONS
function readPcode()
{
	var pcode = getPcode();
	if (!pcode)
		return;
	document.title = getPcode() + " Addr Import";
	var req = new XMLHttpRequest();
	req.overrideMimeType("application/json");
	req.onreadystatechange = function()
	{
		if (req.readyState != 4)
			return;
		var data = JSON.parse(req.responseText);
		var streetsFilter = getStreetsFilter();
		if (streetsFilter)
		{
			var re = new RegExp("^" + streetsFilter + "$");
			streets = data.streets.filter(function(street) {
				return re.test(street.name);
			});
		}
		else
			streets = data.streets;

		var html = "";
		for (var i = 0; i < streets.length; i++)
			html += getTableRow(i);

		document.getElementById(tableBodyId).innerHTML = html;
		updateData();
	}
	req.open("GET", "data/" + pcode + ".json", true);
	req.send(null);
}

/**
 * Add the street info for that certain streetname to the context object
 */
function getCrabInfo(num) {
	finished[num] = false;
	var sanName = streets[num].sanName;

	var req = new XMLHttpRequest();
	req.overrideMimeType("application/json");
	req.onreadystatechange = function()
	{
		if (req.readyState != 4)
			return;
		var data = JSON.parse(req.responseText);

		streets[num].full = data.addresses;
		streets[num].completeness = 0;
		totals.full += data.addresses.length;

		var doc = document.getElementById(sanName + '-full');
		doc.innerHTML = getCellHtml("full", num);

		finished[num] = true;
		finishLoading();
	};
	req.open("GET", "data/" + getPcode() + "/" + sanName + ".json", true);
	req.send(null);
}


function updateData()
{
	osmInfo = [];
	totals = {
		"full": 0,
		"missing": 0,
		"missing_overlapping": 0,
		"wrong": 0
	};
	for (var i = 0; i < streets.length; i++)
	{
		var sanName = streets[i].sanName;
		document.getElementById(sanName + "-full").innerHTML = "Loading...";
		if (loadOsmData())
		{
			document.getElementById(sanName + "-missing").innerHTML = "Loading...";
			document.getElementById(sanName + "-missing_overlapping").innerHTML = "...";
			document.getElementById(sanName + "-wrong").innerHTML = "...";
			document.getElementById(sanName + "-completeness").innerHTML = "...";
		}
		// Also import the actual CRAB data
		getCrabInfo(i);
	}
	// Load osm data
	if (loadOsmData())
		getOsmInfo();
}

/**
 * Check if everything is loaded, then finish everything
 */
function finishLoading()
{
	if (!finished.every(function(d) { return d; }))
		return;

	document.getElementById("full-total").innerHTML = totals.full;

	if (loadOsmData())
		compareData();
	renderMap();
}

/**
 * Get the data from osm, ret should be an empty array
 */
function getOsmInfo() {
	finished[streets.length] = false;
	var streetsFilter = getStreetsFilter();
	var tagSet = '[~"^addr:(official_)?housenumber$"~".*"]';
	if (streetsFilter)
		tagSet += '["addr:street"~"^' + streetsFilter + '$"]';
	else
		tagSet += '["addr:street"]'
	var query = 
		'[out:json];'+
		'area["boundary"="postal_code"]["postal_code"="' + getPcode() + '"]->.area;'+
		'('+
			'node' + tagSet + '(area.area);'+
			'way' + tagSet + '(area.area);'+
			'relation' + tagSet + '(area.area);'+
		');'+
		'out center;'

	var req = new XMLHttpRequest();
	req.onreadystatechange = function()
	{
		if (req.readyState != 4)
			return;
		if (req.status != 200)
			return;
		var data = JSON.parse(req.responseText).elements;
		for (var i = 0; i < data.length; i++)
		{
			var addr = {};
			var d = data[i];
			addr.lat = d.lat || (d.center && d.center.lat);
			addr.lon = d.lon || (d.center && d.center.lon);

			addr.housenumber = d.tags["addr:housenumber"];
			addr.official_housenumber = d.tags["addr:official_housenumber"];
			addr.street = d.tags["addr:street"];
			osmInfo.push(addr);
		}
		finished[streets.length] = true;
		finishLoading();
	}
	console.log("Overpass query:\n" + query);
	req.open("GET", overpassapi + encodeURIComponent(query), true);
	req.send(null);
}


/**
 * This function assumes all crab data and the osm data is loaded
 */
function compareData() {
	for (var i = 0; i < streets.length; i++)
	{
		var street = streets[i];

		// get the list with all housenumbers in this street from the two sources
		var crabStreet = street.full;


		var re = new RegExp("^" + escapeRegExp(street.name, IGNORE_SPELLING) + "$");
		var osmStreet = osmInfo.filter(function(addr) {
			return re.test(addr.street);
		});
		
		street.wrong = [];
		for (var a = 0; a < osmStreet.length; a++)
		{
			var osmAddr = osmStreet[a];
			// expand all osm housenumbers before any comparison
			osmAddr.expandedHnr = expandOsmHnr(osmAddr.housenumber);
			osmAddr.expandedHnr = osmAddr.expandedHnr.concat(expandOsmHnr(osmAddr.official_housenumber));
			if (!isOsmAddrInCrab(osmAddr, crabStreet))
				street.wrong.push(osmAddr);
		}

		street.missing = [];
		street.missing_overlapping = [];
		for (var a = 0; a < crabStreet.length; a++)
		{
			var crabAddr = crabStreet[a];
			if (isCrabAddrInOsm(crabAddr, osmStreet))
				continue;
			if (crabAddr.housenumber == crabAddr.hnrlbls[0])
				street.missing.push(crabAddr);
			else
				street.missing_overlapping.push(crabAddr);
		}

		// express the completeness as a number between 0 and 1
		street.completeness = 1 -
			( street.missing.length +
			street.missing_overlapping.length +
			street.wrong.length ) / street.full.length;
		if (street.completeness < 0)
			street.completeness = 0;

		for (var t = 0; t < 3; t++)
		{
			var type = ["missing", "missing_overlapping", "wrong"][t];
			// Create links
			var doc = document.getElementById(street.sanName + '-' + type);
			if (doc)
				doc.innerHTML = getCellHtml(type, i);

			totals[type] += street[type].length; // sum towards the total
		}
		var doc = document.getElementById(street.sanName);
		if (doc)
			doc.style.backgroundColor = hslToRgb(street.completeness / 3, 1, 0.8);
		doc = document.getElementById(street.sanName + '-completeness');
			doc.innerHTML = Math.round(street.completeness * 1000) / 10;
	}
	for (var t = 0; t < 3; t++)
	{
		var type = ["missing", "missing_overlapping", "wrong"][t];
		// enable GPX button
		var doc = document.getElementById(type + "GpxButton");
		if (doc)
		{
			doc.disabled = false;
			doc.title = "Click to download the results as a GPX file"
		}
	}
	document.getElementById("missing-total").innerHTML = totals.missing;
	document.getElementById("missing_overlapping-total").innerHTML = totals.missing_overlapping;
	document.getElementById("wrong-total").innerHTML = totals.wrong;
	var completeness = (totals.full - totals.missing - totals.missing_overlapping - totals.wrong) / totals.full;
	document.getElementById("completeness-total").innerHTML = Math.round(completeness * 1000) / 10;
}

/**
 * Brings one OSM address to multiple CRAB format addresses
 * - transform bis and ter into _2 and _3
 * - transform /2, /3, ... into _2, _3, ...
 * - split the address per , or ;
 * - split ranges appropriately: 22-26 -> 22,24 and 26
 *                               10-C  -> 10, 10A, 10B and 10C
 *                               10-10C-> 10, 10A, 10B and 10C
 *                               1-2   -> 1 and 2
 */
function expandOsmHnr(hnr) {
	if (!hnr)
		return [];
	// simple format that's the same in OSM and in CRAB
	// for performance reasons, most housenumbers should stop here
	if (/^[0-9]+[A-Z]?$/.test(hnr))
		return [hnr];
	// split on , or ;
	hnrArray = hnr.split(/,|;/g);

	/**
	 * A housenumber is a number, followed by one possible bis-number
	 * The bisnumber can either be 
	 * - a capitalised letter (A, B, C, ...)
	 * - a '/' followed by a number
	 * - a wordly description: bis, ter, ... (separated with a space)
	 * Possibly it's a number range, connected with a hyphen
	 */
	var validHnrRegex = /^[0-9]+([A-Z]|\/[0-9]+| bis| ter)?(\-[0-9]*([A-Z]|\/[0-9]+| bis| ter)?)?$/;
	for (var i = hnrArray.length - 1; i >= 0; i--)
	{
		// if one of the included housenumbers isn't valid, this number is just wrong
		if (!validHnrRegex.test(hnrArray[i]))
			return [];

		// transform all bis addresses to CRAB format
		hnrArray[i] = hnrArray[i].replace(/ bis/g, "_2");
		hnrArray[i] = hnrArray[i].replace(/ ter/g, "_3");
		hnrArray[i] = hnrArray[i].replace(/\/([0-9]+)/g, "_$1");

		var range = hnrArray[i].split("-");
		if (range.length == 1)
			continue;

		// handle housenumber ranges: 10-12, 10-C, 10B-D, ...
		var start = range[0];
		var stop = range[1];
		// test if both are numbers:
		if (+start == start && +stop == stop)
		{
			var step = 1;
			// if both are odd or both are even, advance per 2
			if (+start % 2 == +stop % 2)
				step = 2;
			for (var num = +start; num <= +stop; num += step) 
				hnrArray.push("" + num);
		}
		else 
		{
			// if only the start is a number (e.g 10-C means 10, 10A, 10B and 10C)
			if (+start == start)
			{
				hnrArray.push(start);
				var number = start;
				var startLetter = "A".charCodeAt(0);
			}
			// if none are numbers, it should be a format like 10B-D, which means 10B, 10C and 10D
			else
			{
				var number = start.match(/[0-9]+/);
				var startLetter = start.match(/[A-Z]/);
				if (!number || !startLetter)
					return [];
				number = number[0];
				startLetter = startLetter[0].charCodeAt(0);
			}
			var stopLetter = stop.match(/[A-Z]/);
			if (!stopLetter)
				return [];
			stopLetter = stopLetter[0].charCodeAt(0);
			for (var c = startLetter; c <= stopLetter; c++)
				hnrArray.push(number + String.fromCharCode(c));
		}
		// delete the originial housenumber
		hnrArray.splice(i,1);
	}
		
	
	return hnrArray;
}

function isOsmAddrInCrab(osmAddr, crabStreet) {
	if (osmAddr.expandedHnr.length == 0)
		return false;
	var maxDist = getMaxDist();
	// every housenumber in the OSM address has to be somewhere in a CRAB address
	return osmAddr.expandedHnr.every(function(hnr) {
		return crabStreet.some(function(crabAddr) {
			if  (hnr != crabAddr.housenumber.toUpperCase())
				return false;
			if (!maxDist)
				return true;
			return getAddrDistance(osmAddr, crabAddr) < maxDist;
		});
	});
}

function isCrabAddrInOsm(crabAddr, osmStreet)
{
	var maxDist = getMaxDist();
	return osmStreet.some(function(osmAddr) {
		if (!osmAddr.expandedHnr.some(function(hnr) {
			return hnr == crabAddr.housenumber.toUpperCase();
		}))
			return false;
		if (!maxDist)
			return true;
		return getAddrDistance(osmAddr, crabAddr) < maxDist;
	});
}

function getOsmTag(key, value) {
	return "<tag k='" + escapeXML(key) + "' v='" + escapeXML(value) + "'/>"
}

// XML WRITERS
function getOsmXml(type, streetData)
{
	var timeStr = (new Date()).toISOString();

	// Never upload the layer.
	// Specific changes from the layer should be copied to the data layer, as documented in the best workflow.
	var str = "<osm version='0.6' upload='no' generator='flanders-addr-import'>";
	for (var i = 0; i < streetData[type].length; i++)
	{
		var addr = streetData[type][i];
		var fixme = "";

		str += "<node id='" + (-i-1) + "' " +
			"lat='" + addr.lat + "' " +
			"lon='" + addr.lon + "' " +
			"version='0' "+
			"timestamp='" + timeStr + "' " +
			"uid='1' user=''>";
		// tags
		if (addr.housenumber)
			str += getOsmTag("addr:housenumber", addr.housenumber);
		if (addr.official_housenumber)
			str += getOsmTag("addr:official_housenumber", addr.official_housenumber);
		
		str += getOsmTag("addr:street", addr.street.replace(/_[0-9]+/g,""));
		// Usual fixme notes
		if (addr.street.indexOf(".") > -1)
			fixme += "This street contains abbreviations, please try to expand them. "
		if (addr.housenumber)
		{
			if (addr.housenumber.toUpperCase() != addr.housenumber)
				fixme += "Alphabetic bis-numbers should be capitalised (e.g. 15A instead of 15a). "
			if (addr.housenumber.indexOf("_") > -1)
				fixme += "This housenumber has a numeric bis-number with an underscore. Bis-numbers should be noted as 10/1, 10/2, 10/2, ... or 10 bis, 10 ter, ... Please check locally which format fits best. "
		}

		if (type == "wrong")
		{
			// odbl:note is discarded by JOSM, so never uploaded
			str += getOsmTag("odbl:note", "CRAB:OsmDerived");
			fixme += "This number is not preset in CRAB. It may be a spelling mistake, a non-existing address or an error in CRAB itself. ";
		}
		else
		{
			// odbl:note is discarded by JOSM, so never uploaded
			str += getOsmTag("odbl:note", "CRAB:" + addr.source);
			if (includePcode())
			{
				str += getOsmTag("addr:city", addr.municipality);
				str += getOsmTag("addr:postcode", addr.pcode);
			}
			if (showCrabInfo())
			{
				str += getOsmTag("CRAB:herkomst", addr.source);
				str += getOsmTag("CRAB:hnrLabels", addr.hnrlbls.join(";"));
				if (addr.apptnrs)
					str += getOsmTag("CRAB:apptnrs", addr.apptnrs.join(";"));
				if (addr.busnrs)
					str += getOsmTag("CRAB:busnrs", addr.busnrs.join(";"));
			}
			if (addr.hnrlbls.length > 1)
				fixme += "This number contains multiple housenumber labels. As the housenumber labels is a combination of all housenumbers in that location, this is certainly a mistake in CRAB. Please report it to AGIV. ";
			if (includeFlats())
			{
				if (addr.apptnrs && addr.busnrs)
				{
					fixme += "There are both appartment- and busnumbers on this address. Please check what's visible on the front door as part of the address. ";
					str += getOsmTag("addr:flats:1", getLabelsRange(addr.apptnrs));
					str += getOsmTag("addr:flats:2", getLabelsRange(addr.busnrs));
				}
				else if (addr.apptnrs)
					str += getOsmTag("addr:flats", getLabelsRange(addr.apptnrs));
				else if (addr.busnrs)
					str += getOsmTag("addr:flats", getLabelsRange(addr.busnrs));
			}
				
		}
		if (fixme)
			str += getOsmTag("fixme", fixme);

		str += "</node>";
	}
	str += "</osm>";	
	return str;
}

function getGpxXml(type) {
	var gpx = "<gpx>";
	for (var i = 0; i < streets.length; i++)
	{
		for (var j = 0; j < streets[i][type].length; j++)
		{
			var addr = streets[i][type][j];
			gpx += "<wpt lat='" + addr.lat + "' ";
			gpx += "lon='" + addr.lon + "'>";
			gpx += "<name>"
			gpx += escapeXML(addr.housenumber) + escapeXML(addr.street) + " (" + type + ")";
			gpx += "</name>";
			gpx += "</wpt>";
			
		}
	}
	gpx += "</gpx>";
	return gpx;
}

function getGpx(type) {
	var xml = getGpxXml(type);
	var uri = 'data:application/xml;charset=utf-8,' + encodeURIComponent(xml);

	var link = document.createElement('a');
    if (typeof link.download === 'string') {
        document.body.appendChild(link); //Firefox requires the link to be in the body
        link.download = getPcode() + "_" + type + ".gpx";
        link.href = uri;
        link.click();
        document.body.removeChild(link); //remove the link when done
    } else {
        location.replace(uri);
    }
}

// REMOTECONTROL BINDINGS
function openInJosm(type, streetData, layerName)
{

	var url =  "http://localhost:8111/load_data?new_layer=true&layer_name="+layerName+"&data=";
	var xml = getOsmXml(type, streetData);

	var req = new XMLHttpRequest();
	req.onreadystatechange = function()
	{
		if (req.readyState == 4 && req.status == 400)
			// something went wrong. Alert the user with appropriate messages
			testJosmVersion();
	}
	req.open("GET", url + encodeURIComponent(xml), true);
	req.send(null);
}

function openStreetInJosm(streetNumber)
{
	var street = streets[streetNumber];
	// Get the BBOX of the addresses in the street, and add some margins
	var link = "http://localhost:8111/load_and_zoom"+
		"?left=" + (street.l - 0.001) +
		"&right=" + (street.r + 0.001) +
		"&top=" + (street.t + 0.0005) +
		"&bottom=" + (street.b - 0.0005);

	var req = new XMLHttpRequest();
	req.open("GET", link, true);
	req.send(null);
}

function testJosmVersion() {
	var req = new XMLHttpRequest();
	req.open("GET", "http://localhost:8111/version", true);
	req.send(null);
	req.onreadystatechange = function()
	{
		if (req.readyState != 4)
			return;
		var version = JSON.parse(req.responseText).protocolversion;
		if (version.minor < 6)
			alert("Your JOSM installation does not yet support load_data requests. Please update JOSM to version 7643 or newer");
	}
}

function sortTable(col, reverse) {
	var tb = document.getElementById(tableBodyId);
	var sortFunction = function (r1, r2) {
		var t1 = r1.cells[col].textContent;
		var t2 = r2.cells[col].textContent;
		if (t1 == t2)
			return 0;
		if (t1 == "" + (+t1) && t2 == "" + (+t2)) 
		{
			// when comparing numbers, don't use the lexicographic comparison
			t1 = +t1;
			t2 = +t2;
		}
		var m = reverse ? 1 : -1;
		return t1 < t2 ? m : -m;
	};
	var rows =  Array.prototype.slice.call(tb.rows, 0);
	rows.sort(sortFunction);
	for(i = 0; i < rows.length; ++i)
		tb.appendChild(rows[i]);
}

function renderMap() {
	var bbox = {t: -90, b: 90, l: 180, r: -180};
	mapObj = L.map('map');
	var icons = [];
	for (var i = 0; i <= 10; i++)
	{
		var colour = hslToRgb(i / 30, 1, 0.5);
		icons[i] = L.MakiMarkers.icon({icon: "circle", color: colour, size: "m"});
	}
	for (var i = 0; i < streets.length; i++)
	{
		var street = streets[i];
		bbox.t = bbox.t < street.t ? street.t : bbox.t;
		bbox.b = bbox.b > street.b ? street.b : bbox.b;
		bbox.l = bbox.l > street.l ? street.l : bbox.l;
		bbox.r = bbox.r < street.r ? street.r : bbox.r;
		var icon = icons[Math.floor(street.completeness * 10)];
		var marker = L.marker([(street.t + street.b) / 2, (street.l + street.r) / 2], {icon: icon}).addTo(mapObj);
		marker.bindPopup(getMapPopup(i)).openPopup();
	}
	L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
		attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
		maxZoom: 18
	}).addTo(mapObj);
	mapObj.setView([(bbox.t + bbox.b) / 2, (bbox.l + bbox.r) / 2], 13);
}

// HELPER FUNCTIONS
/**
 * Calculate the distance between two address objects
 * @returns -1 if one of the addresses is either missing lat or lon
 * @returns the spherical distance in meters otherwise
 */
function getAddrDistance(addr1, addr2)
{
	if (!addr1.lat || !addr2.lat || !addr1.lon || !addr2.lon)
		return -1;
	var R = 6.371e6; // average radius of the earth in m
	var dLat = (addr2.lat-addr1.lat) * Math.PI/180;
	var dLon = (addr2.lon-addr1.lon) * Math.PI/180; 
	var a = 
		0.5 - Math.cos(dLat)/2 +
		(0.5 - Math.cos(dLon)/2) *
		Math.cos(addr1.lat * Math.PI/180) *
		Math.cos(addr2.lat * Math.PI/180);
	return R * 2 * Math.asin(Math.sqrt(a)); // Distance in m
}

/**
 * Helper function that escapes all special characters from regex
 */
const DEFAULT = 0;
const STAR_AS_WILDCARD = 1;
const IGNORE_SPELLING = 2;
function escapeRegExp(str, flag) {
	str = str.replace(/[\[\]\/\{\}\(\)\+\?\\\^\$\|]/g, "\\$&");
	if (flag == STAR_AS_WILDCARD)
	{
		str = str.replace(/[\-\.]/g, "\\$&");
		str = str.replace(/[\*]/g, ".*");
	}
	else if (flag == IGNORE_SPELLING)
	{
		str = str.replace(/[\*]/g, "\\$&");
		// Support abbreviations in CRAB data: change . to regex
		// CRAB name         -> Related Regex              -> matching OSM name
		// "J. Gobelijn"     -> /^J.* Gobelijn$/           -> "Jeremias Gobelijn"
		// "Dr. Gobelijn"    -> /^D.*r.* Gobelijn$/        -> "Doctor Gobelijn"
		// "St. Nikolaas"    -> /^S.*t.* Nikolaas$/        -> "Sint Nikolaas"
		// "Burg. Francesco" -> /^B.*u.*r.*g.* Francesco$/ -> "Burgemeester Francesco"
		// "G.W. Bush"       -> /^G.*W.* Bush$/            -> "George Walker Bush"
		var replacer = function(match, p1) {
			var str = "";
			for (var j = 0; j < p1.length; j++)
				str += p1[j] + ".*";
			return str;
		}
		str = str.replace(/([A-Z,a-z]+)\./g, replacer);
		// _num suffixes are added by AGIV to differ streets with the same name, but these suffixes shouldnt' appear in OSM in most cases, so make them optional
		str = str.replace(/_[0-9]+/g, "($&)?");
		// Treat hyphen and space as equal
		str = str.replace(/[\- ]/g, "[\\- ]");
	}
	else
		str = str.replace(/[\.\*\-]/g, "\\.");
	return str;
}

function escapeXML(str)
{
	return str.replace(/&/g, "&amp;")
		.replace(/'/g, "&apos;")
		.replace(/>/g, "&gt;")
		.replace(/</g, "&lt;");
}

function gotoPermalink() {
	var search = "?";
	// free options
	var ids = ["pcode", "filterStreets", "maxDistance"]
	for (var i = 0; i < ids.length; i++)
	{
		var obj = document.getElementById(ids[i] + "Input");
		if (obj.value)
			search += ids[i] + "=" + encodeURIComponent(obj.value) + "&";
	}
	// checkboxes
	var ids = ["loadOsm", "includePcode", "includeFlats", "crabInfo"]
	for (var i = 0; i < ids.length; i++)
	{
		var obj = document.getElementById(ids[i] + "Input");
		if (obj.checked)
			search += ids[i] + "=" + obj.checked + "&";
	}

	// collapsed sections
	search += "collapsedSections=";
	var ids = ["comparison", "export", "data", "map"]
	search += ids.filter(function (id) {
		var section = document.getElementById(id + "Section");
		return section.style.display == "none";
	}).join(",");	
	
	if (window.location.search == search)
		window.location.reload(true);
	else
	{
		var url = window.location.protocol + "//";
		url += window.location.host;
		url += window.location.pathname;
		url += search;
		window.location.href = url;
	}
}

function collapseSection(id) {
	var section = document.getElementById(id + "Section");
	var collapser = document.getElementById(id + "Collapser");
	if (!section || !collapser)
		return;
	if (section.style.display == "none")
	{
		section.style.display = "";
		collapser.innerHTML = "\u25bc";
		// Hack to get leaflet to recalculate the screen center
		if (id == "map" && mapObj)
			window.dispatchEvent(new Event('resize'));
	}
	else
	{
		section.style.display = "none";
		collapser.innerHTML = "\u25b6";
	}
}

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 *
 * @param   Number  h       The hue
 * @param   Number  s       The saturation
 * @param   Number  l       The lightness
 * @return  Array           The RGB representation
 */
function hslToRgb(h, s, l){
	var r, g, b;

	if(s == 0)
	{
		r = g = b = l; // achromatic
	}
	else
	{
		function hue2rgb(p, q, t) {
			if(t < 0) t += 1;
			if(t > 1) t -= 1;
			if(t < 1/6) return p + (q - p) * 6 * t;
			if(t < 1/2) return q;
			if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
			return p;
		}

		var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		var p = 2 * l - q;
		r = hue2rgb(p, q, h + 1/3);
		g = hue2rgb(p, q, h);
		b = hue2rgb(p, q, h - 1/3);
	}

	function toHex(n) {
		var h = Math.round(n * 255).toString(16);
		if (h.length < 2)
			h = "0" + h;
		return h;
	}

	return "#" + toHex(r) + toHex(g) + toHex(b);
}

/**
 * Try to group a list of labels into a range
 * Like ["1", "2", "3", "4"] -> ["1-4"]
 */
function getLabelsRange(labels) {
	var numericLabels = [];
	for (var i = 0; i < labels.length; i++)
	{
		if (labels[i] == "" + (+labels[i]))
			numericLabels.push(+labels[i]);
		else // if not all labels are numeric, we can't make a range
			return labels.join(";");
	}
	var rangeStart = numericLabels[0];
	var current = numericLabels[0];
	var ranges = [];
	for (var i = 1; i < numericLabels.length; i++)
	{
		if (current +1 == numericLabels[i])
		{
			current++;
			continue;
		}
		// if not, close this range
		if (rangeStart == current)
			ranges.push("" + rangeStart);
		else
			ranges.push(rangeStart + "-" + current);
		rangeStart = numericLabels[i];
		current = numericLabels[i];
	}
	if (rangeStart == current)
		ranges.push("" + rangeStart);
	else
		ranges.push(rangeStart + "-" + current);

	return ranges.join(";");
}


