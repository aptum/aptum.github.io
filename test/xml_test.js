var assert = buster.assertions.assert;
var refute = buster.assertions.refute;

xmlValidityTest = function(xmlDoc) {
	var root = xmlDoc.firstChild;
	assert.equals(root.localName, "osm");
	for (var i = 0; i < root.childNodes.length; i++)
	{
		var node = root.childNodes[i];
		assert.equals(node.localName, "node");
		assert(node.attributes.lat.value);
		assert(node.attributes.lon.value);
		assert.equals(node.attributes.version.value, "0");
		assert.equals(node.attributes.user.value, "");
		assert(+node.attributes.id.value < 0);
		// tags
		for (var j = 0; j < node.childNodes.length; j++)
		{
			var tag = node.childNodes[j];
			assert.equals(tag.localName, "tag");
			var possibleKeys = [
				"addr:housenumber",
				"addr:street",
				"addr:postal_code",
			];
			assert(tag.attributes.v.value);
			assert(possibleKeys.indexOf(tag.attributes.k.value) > -1);
		}
	}
};

var parser = new DOMParser();

buster.testCase("XmlGeneration", {
	"basicXmlTest": function()

	{
		var street = {
			"full": [cloneObj(simpleAddr)]
		};
		var xml = getOsmXml("full", street);
		xmlDoc = parser.parseFromString(xml,"text/xml");
		xmlValidityTest(xmlDoc);
	},

	"specialStreetXmlTest": function()
	{
		var addr = cloneObj(simpleAddr);
		addr.street = "\"'/\\ & <> =.(()[[]";
		var xml = getOsmXml("full", {"full": [addr]});
		xmlDoc = parser.parseFromString(xml,"text/xml");
		xmlValidityTest(xmlDoc);
		var tags = xmlDoc.firstChild.childNodes[0].childNodes;
		for (var j = 0; j < tags.length; j++)
			if (tags[j].attributes.k.value == "addr:street")
				assert.equals(tags[j].attributes.v.value, addr.street);
	},

	"specialHousenumberXmlTest": function()
	{
		var addr = cloneObj(simpleAddr);
		addr.housenumber = "\"'/\\ & <> =.(()[[]";
		var xml = getOsmXml("full", {"full": [addr]});
		xmlDoc = parser.parseFromString(xml,"text/xml");
		xmlValidityTest(xmlDoc);
		var tags = xmlDoc.firstChild.childNodes[0].childNodes;
		for (var j = 0; j < tags.length; j++)
			if (tags[j].attributes.k.value == "addr:housenumber")
				assert.equals(tags[j].attributes.v.value, addr.housenumber);
	},

});
