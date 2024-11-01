const AUTH = require("./auth.js");

var endpoints = [];
var cors_enabled = true;
var cors_header = "*"

exports.get = function(path, fn, is_authorized, parse_headers)
{
	if (typeof is_authorized == "undefined")
		is_authorized = false;

	// console.log("parse_headers");
	// console.log(parse_headers);

	endpoints.push(["get", path, fn, is_authorized, parse_headers]);
}

exports.post = function(path, fn, is_authorized, parse_headers)
{
	if (typeof is_authorized == "undefined")
		is_authorized = false;

	endpoints.push(["post", path, fn, is_authorized, parse_headers]);
}

exports.bin = function(path, fn, is_authorized, parse_headers)
{
	if (typeof is_authorized == "undefined")
		is_authorized = false;

	endpoints.push(["bin", path, fn, is_authorized, parse_headers]);
}

exports.set_cors_header = function(header)
{
	cors_header = header;
}

function parse_headers(req)
{
	var headers = {};
	req.forEach(function(k, v)
	{
		headers[k] = v;
	})

	return headers;
}

exports.start = function(port, host)
{
	var UW = require('uWebSockets.js');
	var app = UW.App();
	for (let i=0;i<endpoints.length;i++)
	{
		let e = endpoints[i];
		if (e[0] == "get")
		{
			app.get(e[1], function(res, req)
			{
				var should_parse_headers = e[4];
				var headers = {};
				if (should_parse_headers)
					headers = parse_headers(req);

				var url = req.getUrl();
				var q = parse_uws_query(req);

				if (!e[3])
				{
					e[2](q, res, [], req, url, headers);
					return;
				}

				var token_payload;
				if(typeof q["token"] == "undefined")
				{
					end(res, 401);
					return;
				}

				try{
					token_payload = AUTH.decode(q["token"]);
				} catch(e) {
					end(res, 401);
					return;
				}

				e[2](q, res, token_payload, req, url, headers);
			});
		}
		else if(e[0] == "post")
		{
			var should_parse_headers = e[4];
			app.post(e[1], function(res, req)
			{
				var headers = {};
				if (should_parse_headers)
					headers = parse_headers(req);

				var url = req.getUrl();
				read_json(res,
				function(obj)
				{
					var token_payload;
					if (!e[3])
					{
						e[2](obj, res, [], req, url, headers);
						return;
					}

					if(typeof obj["token"] == "undefined")
					{
						end(res, 401);
						return;
					}
	
					try{
						token_payload = AUTH.decode(obj["token"]);
					} catch(e) {
						end(res, 401);
						return;
					}

					e[2](obj, res, token_payload, req, url, headers);
				},
				function()
				{
					end(res, 500);
				});
			});
		}
		else
		{
			var should_parse_headers = e[4];
			app.post(e[1], function(res, req)
			{
				var headers = e[4];
				if (typeof headers == "undefined")
					headers = [];

				var url = req.getUrl();
				var q = parse_uws_query(req);
				read_buffer(res,
				function(buffer)
				{
					var token_payload;
					if (!e[3])
					{
						e[2](q, res, [], req, buffer, url, headers);
						return;
					}

					if(typeof q["token"] == "undefined")
					{
						end(res, 401);
						return;
					}

					try{
						token_payload = AUTH.decode(q["token"]);
					} catch(e) {
						end(res, 401);
						return;
					}

					e[2](q, res, token_payload, req, buffer, url, headers);
				},
				function()
				{
					end(res, 500);
				});
			});
		}
	}

	app.options("/*", function(res, req)
	{
		add_cors(res, cors_header);
		res.end();
	});

	if (typeof host == "undefined")
		app.listen(port, onlisten);
	else
		app.listen(host, port, onlisten);

	function onlisten(p)
	{
		if (p)
		{ 
			console.log("http-server started: " + port);
			if (typeof host != "undefined")
				console.log("http-server on host: " + host);

			console.log("number of endpoints registered: " + endpoints.length);
		}
		else{ throw "can't listen port " + port; }
	}
}

function parse_uws_query(req)
{
	var qs = req.getQuery();
	if (typeof qs == "undefined")
		return {};

	var obj = {};
	var parts = qs.split("&");
	for (var i=0;i<parts.length;i++)
	{
		var p = parts[i];
		var pair = p.split("=");
		if (pair.length != 2)
			return obj;

		obj[pair[0]] = decodeURIComponent(pair[1]);
	}
	return obj;
}

function read_buffer(res, cb, err)
{
	let buffer;
	res.onData((ab, isLast) =>
	{
		let chunk = Buffer.from(ab);
		if (isLast)
		{
			if (buffer)
			{
				try
				{
					buffer = Buffer.concat([buffer, chunk])
				}
				catch (e)
				{
					/* res.close calls onAborted */
					res.close();
					return;
				}
				cb(buffer);
			}
			else
			{
				cb(chunk);
			}
		}
		else
		{
			if (buffer)
			{
				buffer = Buffer.concat([buffer, chunk]);
			}
			else
			{
				buffer = Buffer.concat([chunk]);
			}
		}
	});

	res.onAborted(err);
}

function read_json(res, cb, err)
{
	let buffer;
	/* Register data cb */
	res.onData((ab, isLast) =>
	{
		let chunk = Buffer.from(ab);
		if (isLast)
		{
			let json;
			if (buffer)
			{
				try
				{
					json = JSON.parse(Buffer.concat([buffer, chunk]));
				}
				catch (e)
				{
					/* res.close calls onAborted */
					res.close();
					return;
				}
				cb(json);
			}
			else
			{
				try
				{
					json = JSON.parse(chunk);
				}
				catch (e)
				{
					/* res.close calls onAborted */
					res.close();
					return;
				}
				cb(json);
			}
		}
		else
		{
			if (buffer)
			{
				buffer = Buffer.concat([buffer, chunk]);
			}
			else
			{
				buffer = Buffer.concat([chunk]);
			}
		}
	});

	/* Register error cb */
	res.onAborted(err);
}

var status_map =
{
	"200": "200 OK",
	"204": "204 No Content",
	"206": "206 Partial Content",
	"301": "301 Moved Permanently",
	"302": "302 Found",
	"304": "304 Not Modified",
	"400": "400 Bad Request",
	"401": "401 Unauthorized",
	"402": "402 Payment Required",
	"403": "403 Forbidden",
	"404": "404 Not Found",
	"405": "405 Method Not Allowed",
	"406": "406 Not Acceptable",
	"408": "408 Request Timeout",
	"500": "500 Internal Server Error",
	"502": "502 Bad Gateway",
	"503": "503 Service Unavailable"
}

function write_status(code, res)
{
	var status = status_map[code];
	if (typeof status == "undefined")
		throw("invalid status code " + code);

	res.writeStatus(status);
}

function add_cors(res, header)
{
	res.writeHeader('Access-Control-Allow-Origin', header);
	res.writeHeader('Access-Control-Request-Method', "*");
	res.writeHeader('Access-Control-Allow-Headers', "*");
	res.writeHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, DELETE');
}

function end(res, status, data, mime, redirect_url, encoding)
{
	res.cork(function()
	{
		write_status(status, res);

		if (status == 301 || status == 302)
			res.writeHeader("Location", redirect_url);
	
		if (cors_enabled)
			add_cors(res, cors_header);
	
		if (mime)
			res.writeHeader("Content-Type", mime);
		else
			res.writeHeader("Content-Type", "application/json; charset=utf-8");
	
		if (encoding)
			res.writeHeader("Content-Encoding", encoding);		
		
		res.end(data);
	});
}



exports.write_status = write_status;
exports.end = end;
exports.enable_cors = function(){ console.log("enable_cors() is DEPRECATED"); cors_enabled = true; }
exports.disable_cors = function(){ cors_enabled = false; }

exports.enable_auth = function(key, expire_duration)
{
	AUTH.init(key, expire_duration);
}

exports.create_token = function(payload)
{
	return AUTH.encode(payload);
}

function value_check(condition_array, res)
{
	for (var i=0;i<condition_array.length;i++)
	{
		if (!condition_array[i])
		{
			end(res, 400, '{"error":"bad value"}');
			return false;
		}
	}

	return true;
}

function is_type_valid(type, value, res)
{
	switch(type)
	{
	case "int":
	value = Number(value);
	if (isNaN(value))
		return false;

	if (!Number.isInteger(value))
		return false;

	break;
	case "number":
	value = Number(value);
	if (isNaN(value))
		return false;

	break;
	}

	return true;
}

function parse_fields(q, res, keys, optional_keys)
{
	var obj = {};
	for (var i in keys)
	{
		if (typeof q[i] === "undefined")
		{
			end(res, 400, '{"error":"missing field '+i+'"}');
			return false;
		}

		var t = keys[i];
		if (!is_type_valid(t, q[i]))
		{
			var body = 
			{
				"error": "invalid_type",
				"field": i,
				"expected_type": t,
				"received_value": q[i]
			}
			
			end(res, 400, JSON.stringify(body));
			return false;
		}

		if (t == "int" || t == "number")
			obj[i] = Number(q[i]);
		else
			obj[i] = q[i];
	}

	for (var i in optional_keys)
	{
		if (typeof q[i] === "undefined")
			continue;

		var t = optional_keys[i];
		if (!is_type_valid(t, q[i]))
		{
			var body = 
			{
				"error": "invalid_type",
				"field": i,
				"expected_type": t,
				"received_value": q[i]
			}
			
			end(res, 400, JSON.stringify(body));
			return false;
		}

		if (t == "int" || t == "number")
			obj[i] = Number(q[i]);
		else
			obj[i] = q[i];
	}
	return obj;
}

exports.parse_fields = parse_fields;
exports.value_check = value_check;
