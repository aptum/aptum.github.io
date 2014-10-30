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

var crabInfo = {};
var osmInfo = [];
var streets = [];
var finished = [];

var tableId = "streetsTableBody";

// HTML WRITERS
/**
 * Makes the html code for a table cell (including links tooltip, ...)
 */
function writeCellHtml(type, streetIdx)
{
	var street = streets[streetIdx];
	var sanName = street.sanName;
	var doc = document.getElementById(sanName + '-' + type);
	if (!street[type].length)
		doc.innerHTML = "0";
	else
		doc.innerHTML = 
			("<a href='#%layerName' "+
					"title='Load this data in JOSM' "+
					"onclick='openInJosm(\"%type\", streets[%i], \"%layerName\")' >"+
				"%num"+
			"</a>")
				.replace(/%type/g, type)
				.replace(/%street/g, sanName)
				.replace(/%i/g, streetIdx)
				.replace(/%layerName/g, sanName + '-' + type)
				.replace(/%num/g, street[type].length);
}

function getTableRow(streetIdx)
{
	var street = streets[streetIdx];
	var sanName = street.sanName;
	return (
		'<tr id="%n">\n' +
		'<td id="%n-name" name="%n-name">'+
			'<a href="#%n-name" ' +
				'onclick="openStreetInJosm(' + streetIdx + ')">' +
				street.name +
			'</a>'+
		'</td>\n' +
		'<td id="%n-full" name="%n-full"></td>\n' +
		'<td id="%n-missing" name="%n-missing"></td>\n' +
		'<td id="%n-missing_overlapping" name="%n-missing_overlapping"></td>\n' +
		'<td id="%n-wrong" name="%n-wrong"></td>\n' +
		'</tr>\n').replace(/%n/g, street.sanName);
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

function showCrabHerkomst()
{
	return document.getElementById("crabHerkomstInput").checked;
}

function includePcode()
{
	return document.getElementById("includePcodeInput").checked;
}

function getStreetsFilter()
{
	var str = document.getElementById("filterStreetsInput").value;
	str = escapeRegExp(str, STAR_AS_WILDCARD);
	if (!str.length)
		str = ".*";
	return "^" + str + "$";
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
		var re = new RegExp(getStreetsFilter(), "i");
		streets = data.streets.filter(function(street) {
			return re.test(street.name);
		});

		var html = "";
		for (var i = 0; i < streets.length; i++)
			html += getTableRow(i);

		document.getElementById(tableId).innerHTML = html;
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
		writeCellHtml("full", num);

		finished[num] = true;
		finishLoading();
	};
	req.open("GET", "data/" + getPcode() + "/" + sanName + ".json", true);
	req.send(null);
}


function updateData()
{
	crabInfo = {};
	osmInfo = [];
	for (var i = 0; i < streets.length; i++)
	{
		var sanName = streets[i].sanName;
		document.getElementById(sanName + "-full").innerHTML = "Loading...";
		if (loadOsmData())
		{
			document.getElementById(sanName + "-missing").innerHTML = "Loading...";
			document.getElementById(sanName + "-missing_overlapping").innerHTML = "Loading...";
			document.getElementById(sanName + "-wrong").innerHTML = "Loading...";
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
	if (!loadOsmData())
		return; // don't compare if you don't load anything
	if (finished.every(function(d) { return d; }))
		compareData();
}

/**
 * Get the data from osm, ret should be an empty array
 */
function getOsmInfo() {
	finished[streets.length] = false;
	var tagSet = '["addr:housenumber"]["addr:street"~"' + getStreetsFilter() + '"]';
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
			addr.lat = d.lat || d.center.lat;
			addr.lon = d.lon || d.center.lon;

			if (!d.tags["addr:housenumber"] || !d.tags["addr:street"])
				continue;
			addr.housenumber = d.tags["addr:housenumber"];
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
		
		var crabStreetPos = crabStreet.filter(function(addr) {
			return addr.housenumber == addr.huisnrlabel;
		});
		var crabStreet_overlapping = crabStreet.filter(function(addr) {
			return addr.housenumber != addr.huisnrlabel;
		});
		// Matches in one direction
		street.missing = compareStreet(crabStreetPos, osmStreet);
		street.missing_overlapping = compareStreet(crabStreet_overlapping, osmStreet);
		street.wrong = compareStreet(osmStreet, crabStreet);


		// Create links
		writeCellHtml("missing", i);
		writeCellHtml("missing_overlapping", i);
		writeCellHtml("wrong", i);
	}
}

function compareStreet(source, comp) {
	var diffList = [];
	for (var i = 0; i < source.length; i++)
	{
		var sourceAddr = source[i];
		if (!comp.find(
			function(compAddr) {
				return compareAddr(sourceAddr, compAddr);
			}
		))
			diffList.push(source[i]);
	}
	return diffList;
}

/**
 * Test if the source housenumber matches with the comparison one
 */
function compareAddr(sourceAddr, compAddr)
{
	function uniformise(hnr)
	{
		if (!hnr)
			return hnr;
		hnr = hnr.replace(/ bis/g, "_2");
		hnr = hnr.replace(/ ter/g, "_3");
		hnr = hnr.replace(/\/([0-9]+)/g, "_$1");
		return hnr;
	}

	sourceHnr = uniformise(sourceAddr.housenumber);
	sourceHnrLabel = uniformise(sourceAddr.huisnrlabel);
	compHnr = uniformise(compAddr.housenumber);
	compHnrLabel = uniformise(compAddr.huisnrlabel);
	
	var matchHnr = false;
	if (compHnr == sourceHnr)
		matchHnr = true;
	else if (compHnrLabel == sourceHnr)
		matchHnr = true;
	else if (compHnr == sourceHnrLabel)
		matchHnr = true;
	if (!matchHnr)
		return false;
	if (!getMaxDist())
		return true;
	// Also test the distance if the housenumbers match and a distance is given
	return getAddrDistance(sourceAddr, compAddr) < getMaxDist();
}

function getOsmXml(type, streetData)
{
	var timeStr = (new Date()).toISOString();
	var str = "<osm version='0.6' generator='flanders-addr-import'>";
	for (var i = 0; i < streetData[type].length; i++)
	{
		var addr = streetData[type][i];

		str += "<node id='" + (-i-1) + "' " +
			"lat='" + addr.lat + "' " +
			"lon='" + addr.lon + "' " +
			"version='0' "+
			"timestamp='" + timeStr + "' " +
			"uid='1' user=''>";
		// tags
		str += "<tag k='addr:housenumber' v='" + escapeXML(addr.housenumber) + "'/>";
		str += "<tag k='addr:street' v='" + escapeXML(addr.street) + "'/>";
		if ("source" in addr)
		{
			str += "<tag k='odbl:note' v='CRAB:" + escapeXML(addr.source) + "'/>";
			if (showCrabHerkomst())
				str += "<tag k='CRAB:herkomst' v='" + escapeXML(addr.source) + "'/>";
		}
		if (includePcode())
			// TODO: also include municipality and get the pcode from the actual address
			str +=  "<tag k='addr:postal_code' v='" + escapeXML("" + getPcode()) + "'/>";

		if (type == "wrong")
			str += "<tag k='fixme' v='This number is not preset in CRAB. It may be a spelling mistake, a non-existing address or an error in CRAB itself.'/>";

		str += "</node>";
	}
	str += "</osm>";	
	return str;
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
	var tb = document.getElementById(tableId);
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
		// Treat hyphen and space as equal
		str = str.replace(/[\-]/g, "[\\- ]");
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
	var url = window.location.protocol + "//";
	url += window.location.host;
	url += window.location.pathname + "?";
	var ids = ["pcode", "filterStreets", "maxDistance"]
	for (var i = 0; i < ids.length; i++)
	{
		var obj = document.getElementById(ids[i] + "Input");
		url += ids[i] + "=" + encodeURIComponent(obj.value) + "&";
	}
	url += "loadOsm=" + document.getElementById("loadOsmInput").checked;
	url += "&includePcode=" + document.getElementById("includePcodeInput").checked;
	url += "&crabHerkomst=" + document.getElementById("crabHerkomstInput").checked;
	url += window.location.hash;
	if (window.location.href == url)
		window.location.reload(true);
	else
		window.location.href = url;
}



