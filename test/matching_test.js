var assert = buster.assertions.assert;
var refute = buster.assertions.refute;

// Stubs to avoid reading/writing actual HTML or reading params
getMaxDist = function() {return 0;} 
getPcode = function() {return 1234;} 

/**
 * 
 */
var cloneObj = function(obj)
{
	var ret = {};
	for (var key in obj)
		ret[key] = obj[key];
	return ret;
}

/**
 * The most basic address to be used in comparisons
 * This address must not be altered but cloned
 */ 
const simpleAddr =  {
	"housenumber": "1",
	"lat": 1,
	"lon": 1,
	"pcode": 1234,
	"street": "Dorpsstraat",
};
const simpleAddrCrab =  {
	"housenumber": "1",
	"huisnrlabel": "1",
	"lat": 1,
	"lon": 1,
	"pcode": 1234,
	"street": "Dorpsstraat",
	"source": "afgeleidVanIets",
};

/**
 * Check if two streets (arrays of addresses) would match completely
 */
function testAddrMatching(crabAddresses, osmAddresses) {
	streets = [
		{ "full": crabAddresses, "name": crabAddresses[0].street}
	];
	osmInfo = osmAddresses;
	compareData();
	refute.equals(streets[0].full, []);
	assert.equals(streets[0].missing, []);
	assert.equals(streets[0].wrong, []);
}

function testAddrNonMatching(crabAddresses, osmAddresses)
{
	streets = [
		{ "full": crabAddresses, "name": crabAddresses[0].street}
	];
	osmInfo = osmAddresses;
	compareData();
	refute.equals(streets[0].missing, []);
	refute.equals(streets[0].wrong, []);
}

buster.testCase("Comparisons", {

    "escapeStreetFilterTest": function () {
        assert.equals(escapeRegExp("G*", STAR_AS_WILDCARD), "G.*");
        assert.equals(escapeRegExp("*str*", STAR_AS_WILDCARD), ".*str.*");
		assert.equals(escapeRegExp("Sint-Jan*", STAR_AS_WILDCARD), "Sint\\-Jan.*");
    },

	"simpleDataCompareTest": function()
	{
		testAddrMatching([simpleAddrCrab], [simpleAddr]);
	},

	"abbrevDataCompareTest1": function()
	{

		var addrCRAB = cloneObj(simpleAddrCrab);
		addrCRAB.street = "G. Gezellelaan";

		var addrOSM = cloneObj(simpleAddr);
		addrOSM.street = "Guido Gezellelaan";

		testAddrMatching([addrCRAB], [addrOSM]);
	},

	"abbrevDataCompareTest2": function()
	{

		var addrCRAB = cloneObj(simpleAddrCrab);
		addrCRAB.street = "Dr. Gobelijnlaan";

		var addrOSM = cloneObj(simpleAddr);
		addrOSM.street = "Dokter Gobelijnlaan";

		testAddrMatching([addrCRAB], [addrOSM]);
	},

	"hyphenDataCompareTest": function()
	{
		var addrCRAB = cloneObj(simpleAddrCrab);
		addrCRAB.street = "Sint-Nikolaaslaan";

		var addrOSM = cloneObj(addrCRAB);
		addrOSM.street = "Sint Nikolaaslaan";

		testAddrMatching([addrCRAB], [addrOSM]);
	},

	"houseNumberRangeToRangeTest1": function()
	{
		var addrCRAB1 = cloneObj(simpleAddrCrab);
		addrCRAB1.huisnrlabel = "1-3";

		var addrCRAB2 = cloneObj(simpleAddrCrab);
		addrCRAB2.housenumber = "3";
		addrCRAB2.huisnrlabel = "1-3";

		var addrOSM = cloneObj(simpleAddr);
		addrOSM.housenumber = "1-3";

		testAddrMatching([addrCRAB1, addrCRAB2], [addrOSM]);

	},

	"houseNumberRangeToRangeTest2": function()
	{
		var addrCRAB1 = cloneObj(simpleAddrCrab);
		addrCRAB1.huisnrlabel = "1-5";

		var addrCRAB2 = cloneObj(simpleAddrCrab);
		addrCRAB2.housenumber = "3";
		addrCRAB2.huisnrlabel = "1-5";

		var addrCRAB3 = cloneObj(simpleAddrCrab);
		addrCRAB3.housenumber = "5";
		addrCRAB3.huisnrlabel = "1-5";

		var addrOSM = cloneObj(simpleAddr);
		addrOSM.housenumber = "1-5";

		testAddrMatching([addrCRAB1, addrCRAB2, addrCRAB3], [addrOSM]);

	},

	"housenumberRangeToSinglesTest1": function()
	{
		var addrCRAB1 = cloneObj(simpleAddrCrab);
		addrCRAB1.huisnrlabel = "1-3";

		var addrCRAB2 = cloneObj(simpleAddrCrab);
		addrCRAB2.housenumber = "3";
		addrCRAB2.huisnrlabel = "1-3";

		var addrOSM1 = cloneObj(simpleAddr);

		var addrOSM2 = cloneObj(simpleAddr);
		addrOSM2.housenumber = "3";

		testAddrMatching([addrCRAB1, addrCRAB2], [addrOSM1, addrOSM2]);
	},

	"housenumberRangeToSinglesTest2": function()
	{
		var addrCRAB1 = cloneObj(simpleAddrCrab);
		addrCRAB1.huisnrlabel = "1-5";

		var addrCRAB2 = cloneObj(simpleAddrCrab);
		addrCRAB2.housenumber = "3";
		addrCRAB2.huisnrlabel = "1-5";

		var addrCRAB3 = cloneObj(simpleAddrCrab);
		addrCRAB3.housenumber = "5";
		addrCRAB3.huisnrlabel = "1-5";

		var addrOSM1 = cloneObj(simpleAddr);

		var addrOSM2 = cloneObj(simpleAddr);
		addrOSM2.housenumber = "3";

		var addrOSM3 = cloneObj(simpleAddr);
		addrOSM3.housenumber = "5";

		testAddrMatching([addrCRAB1, addrCRAB2, addrCRAB3], [addrOSM1, addrOSM2, addrOSM3]);
	},
	
	"bisNumberAlphabeticTest1": function()
	{
		var addrCRAB = cloneObj(simpleAddrCrab);
		addrCRAB.housenumber = "1A";
		addrCRAB.huisnrlabel = "1A";

		var addrOSM = cloneObj(simpleAddr);
		addrOSM.housenumber = "1a";

		testAddrNonMatching([addrCRAB], [addrOSM]);
	},

	"bisNumberAlphabeticTest2": function()
	{
		var addrCRAB = cloneObj(simpleAddrCrab);
		addrCRAB.housenumber = "1A";
		addrCRAB.huisnrlabel = "1A";

		var addrOSM = cloneObj(simpleAddr);
		addrOSM.housenumber = "1A";

		testAddrMatching([addrCRAB], [addrOSM]);
	},

	"bisNumberNumeric1": function()
	{
		var addrCRAB = cloneObj(simpleAddrCrab);
		addrCRAB.housenumber = "1_2";
		addrCRAB.huisnrlabel = "1_2";

		var addrOSM = cloneObj(simpleAddr);
		addrOSM.housenumber = "1 bis";

		testAddrMatching([addrCRAB], [addrOSM]);
	},

	"bisNumberNumeric2": function()
	{
		var addrCRAB = cloneObj(simpleAddrCrab);
		addrCRAB.housenumber = "1_3";
		addrCRAB.huisnrlabel = "1_3";

		var addrOSM = cloneObj(simpleAddr);
		addrOSM.housenumber = "1 ter";

		testAddrMatching([addrCRAB], [addrOSM]);
	},

	"bisNumberNumeric3": function()
	{
		var addrCRAB = cloneObj(simpleAddrCrab);
		addrCRAB.housenumber = "1_2";
		addrCRAB.huisnrlabel = "1_2";

		var addrOSM = cloneObj(simpleAddr);
		addrOSM.housenumber = "1/2";

		testAddrMatching([addrCRAB], [addrOSM]);
	},

});


