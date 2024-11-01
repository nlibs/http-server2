var H = require("./nano-http.js");
H.get("/", handler);
H.start(2323);

var counter = 0;
function handler(q, res)
{
	var mandatory = 
	{
		"x": "int",
		"y": "number"
	}

	var optional = 
	{
		"z": "int"
	}

	q = H.parse_query_string(q, res, mandatory, optional);
	if (!q)
		return;

	counter++;
	res.end(JSON.stringify(q) + " hello " + counter);
}
