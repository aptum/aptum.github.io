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
var missingAddr;
var missingNoPosAddr;
var wrongAddr;
var streets = [];
var finished = [];

var tableId = "streetsTable";
var noOverlappingOffset = 0.00002;
var tableHeaders = 
	'<tr>\n' +
	'<th title="Name of the street">Name</th>\n' +
	'<th title="Total number of housenumbers">Total</th>\n' +
	'<th title="Number of regular housenumbers not present in OSM">Missing</th>\n' +
	'<th title="Housenumbers that don\'t have a position in CRAB, and are not present in OSM">Missing w/o pos</th>\n' +
	'<th title="Housenumbers in OSM but without match in CRAB">Wrong</th>\n' +
	'</tr>\n';

// HTML WRITERS
/**
 * Makes the html code for a table cell (including links tooltip, ...)
 */
function getCellHtml(objName, streetIdx, layerSuffix, msg)
{
	var sanName = streets[streetIdx].sanName;
	if (msg)
		msg = '"' + msg + '"';
	return "<a href='#%layerName' title='Load this data in JOSM' onclick='openInJosm(%obj[\"%street\"], streets[%i], \"%layerName\", %msg)' >%num</a>"
		.replace(/%obj/g, objName)
		.replace(/%street/g, sanName)
		.replace(/%i/g, streetIdx)
		.replace(/%layerName/g, sanName + layerSuffix)
		.replace(/%msg/g, msg)
		.replace(/%num/g, window[objName][sanName].length);
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
		'<td id="%n-missing-nopos" name="%n-missing-noPos"></td>\n' +
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

function getStreetsFilter()
{
	var str = document.getElementById("filterStreetsInput").value;
	str = escapeRegExp(str).replace(/\\\*/g, ".*");
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

		var html = tableHeaders;
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

		crabInfo[sanName] = data.addresses;
		document.getElementById(sanName + '-full').innerHTML = 
			getCellHtml("crabInfo", num, "-full");

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
			document.getElementById(sanName + "-missing-nopos").innerHTML = "Loading...";
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
		'area["boundary"="administrative"]["addr:postcode"="' + getPcode() + '"]->.area;'+
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

			// TODO support Associated Street relations?
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
	missingAddr = {};
	missingNoPosAddr = {};
	wrongAddr = {};
	for (var i = 0; i < streets.length; i++)
	{
		var street = streets[i];

		// get the list with all housenumbers in this street from the two sources
		var crabStreet = crabInfo[street.sanName];

		// Support abbreviations in CRAB data: change . to regex
		// CRAB name         -> Related Regex              -> matching OSM name
		// "J. Gobelijn"     -> /^J.* Gobelijn$/           -> "Jeremias Gobelijn"
		// "Dr. Gobelijn"    -> /^D.*r.* Gobelijn$/        -> "Doctor Gobelijn"
		// "St. Nikolaas"    -> /^S.*t.* Nikolaas$/        -> "Sint Nikolaas"
		// "Burg. Francesco" -> /^B.*u.*r.*g.* Francesco$/ -> "Burgemeester Francesco"
		// "G.W. Bush"       -> /^G.*W.* Bush$/            -> "George Walker Bush"
		var replacer = function(match, p1) {
			var str = "";
			for (var j = 0; j < str.length; j++)
				str += p1[j] + ".*";
			return str;
		}
		var re = new RegExp("^" + escapeRegExp(street.name).replace(/([A-Z,a-z]+\\\.)/g, replacer) + "$");
		var osmStreet = osmInfo.filter(function(addr) {
			return re.test(addr.street);
		});
		
		var crabStreetPos = crabStreet.filter(function(addr) {
			return addr.lat && addr.lon;
		});
		var crabStreetNoPos = crabStreet.filter(function(addr) {
			return !addr.lat || !addr.lon;
		});
		// Matches in one direction
		missingAddr[street.sanName] = compareHnr(crabStreetPos, osmStreet);
		missingNoPosAddr[street.sanName] = compareHnr(crabStreetNoPos, osmStreet);
		wrongAddr[street.sanName] = compareHnr(osmStreet, crabStreet);


		// Create links
		document.getElementById(street.sanName + '-missing').innerHTML = 
			getCellHtml("missingAddr", i, "-missing");

		document.getElementById(street.sanName + '-missing-nopos').innerHTML = 
			getCellHtml("missingNoPosAddr", i, "-missing-noPos");

		document.getElementById(street.sanName + '-wrong').innerHTML = 
			getCellHtml("wrongAddr", i, "-wrong", "Housenumber not found in CRAB, or not close enough ");
	}
}

function compareHnr(source, comp) {
	var diffList = [];
	var maxDist = getMaxDist();
	for (var i = 0; i < source.length; i++)
	{
		// also match double housenumbers "42-44" with single ones "44"
		var housenumberList = source[i].housenumber.split("-");
		var match = true;
		for (var j = 0; j < housenumberList.length; j++)
		{
			var re = new RegExp("-?" + escapeRegExp(housenumberList[j]) + "-?");
			// find a housenumber in the comparison list that matches (probably partially)
			match = match && comp.find( function (addr) {
				var test = re.test(addr.housenumber);
				if (!test)
					return false;
				if (!maxDist)
					return true;
				// Also test the distance if the housenumbers match and a distance is given
				return getAddrDistance(source[i], addr) < maxDist;
			});
		}
		if (!match)
			diffList.push(source[i]);
	}
	return diffList;
}

// REMOTECONTROL BINDINGS
function openInJosm(data, streetData, layerName, message)
{
	var timeStr = (new Date()).toISOString();
	var str = "<osm version='0.6' generator='flanders-addr-import'>\n";
	var numOfAddrWoPos = 0;
	for (var i = 0; i < data.length; i++)
	{
		var addr = data[i];
		// take the precise position when available, else, center on the street
		var lat = addr.lat;
		var lon = addr.lon;
		var msg = message;
		if (!lat || !lon)
		{
			lat = (streetData.t + streetData.b) / 2;
			lon = (streetData.l + streetData.r) / 2 +
				numOfAddrWoPos * noOverlappingOffset;
			msg = (msg || "") + "Position not found in CRAB. Please map with care."
			numOfAddrWoPos++;
		}

		str += "<node id='" + (-i-1) + "' lat='" + lat + "' lon='" + lon + "' version='0' timestamp='" + timeStr + "' uid='1' user=''>";
		str += "<tag k='addr:housenumber' v='" + addr.housenumber.replace(/'/g, "&apos;") + "'/>";
		str += "<tag k='addr:street' v='" + addr.street.replace(/'/g, "&apos;") + "'/>";
		if ("source" in addr)
		    str += "<tag k='CRAB:source' v='" + addr.source.replace(/'/g, "&apos;") + "'/>";
		if (msg)
			str += "<tag k='fixme' v='" + msg + "'/>";
		str += "</node>\n";
	}
	str += "</osm>\n";

	var url =  "http://localhost:8111/load_data?new_layer=true&layer_name="+layerName+"&data=";

	var req = new XMLHttpRequest();
	req.open("GET", url + encodeURIComponent(str), true);
	req.send(null);
	req.onreadystatechange = function()
	{
		if (req.readyState == 4 && req.status == 400)
			testJosmVersion();
	}
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
function escapeRegExp(str) {
	return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

function gotoPermalink() {
	var url = window.location.pathname + "?";
	var ids = ["pcode", "filterStreets", "maxDistance"]
	for (var i = 0; i < ids.length; i++)
	{
		var obj = document.getElementById(ids[i] + "Input");
		url += ids[i] + "=" + encodeURIComponent(obj.value) + "&";
	}
	url += "loadOsm=" + document.getElementById("loadOsmInput").checked;
	url += window.location.hash;
	window.location.href = url;
}

// EXECUTE

// Read the URL query to set stuff
var query = window.location.search.substring(1);
var vars = query.split("&");
for (var i = 0; i < vars.length; i++)
{
	var kv = vars[i].split("=");
	if (kv.length != 2)
		continue;
	kv[0] += "Input"
	if (kv[1] == "true")
		document.getElementById(kv[0]).checked = true;
	else if (kv[1] == "false")
		document.getElementById(kv[0]).checked = false;
	else
		document.getElementById(kv[0]).value = decodeURIComponent(kv[1]);
}

readPcode();
