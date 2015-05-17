var pool = require('./lib/mysql-connection.js');
var clone = require('clone');
var deasync = require('deasync');
var tables = {};

function gateway (table, obj, callback) {
	if (!table) {
		return false;
	}
	obj = obj || {};
	var self = {};

	//table itself
	self.table = '';

	//columns / keys
	self.columns = [];
	self.primaryKey = 'id';
	self.references = {};
	self.referencedBy = {};

	self.getConnection = function (db, callback) {
		db = db || 'SLAVE';
		callback = callback || function () { return false; };
		pool.getConnection(db, function (err, conn) {
			callback(err, conn);
		});
		return self;
	};

	self.query = function (db, q, values, callback, conn) {
		db = db || 'SLAVE';
		values = values || [];
		callback = callback || function () { return false };

		if (!conn) {
			self.getConnection(db, function (err, connection) {
				self.query(db, q, values, callback, connection);
			});
		} else {
			query = conn.query(q, values, function (err, results) {
				callback(err, results);
				conn.release();
			});
		 	//console.log(query.sql);
			return self;
		}
	};

	self.select = function (db, q, values, callback) {
		db = db || 'SLAVE';
		values = values || [];
		callback = callback || function () { return false; };

		self.query(db, q, values, function (err, results) {
			if (err) {
				throw err;
			}
			var ret = [];
			for (var i=0,r; r = results[i]; i++) {
				var t = table_obj(self.table);
				for (var k in r) {
					t[k] = r[k];
				}
				ret.push(t);
			}
			callback(err, ret);
		});
	}

	self.insert = function (table_obj, callback) {
		callback = callback || function () { return false; };
		var q = "INSERT INTO ?? SET ?";
		var replace = [ table_obj.table, table_obj.getColumnValues() ];
		self.query('MASTER', q, replace, function (err, result) {
			if (typeof table_obj.id !== 'undefined') {
				table_obj.id = result.insertId;
			}
			callback(err, result);
		});
		return self;
	};

	self.update = function (table_obj, callback) {
		callback = callback || function () { return false; };
		var q = "UPDATE ?? SET ?";
		var replace = [ table_obj.table, table_obj.getColumnValues() ];
		self.query('MASTER', q, replace, callback);
		return self;
	};

	self.save = function (table_obj, callback) {
		callback = callback || function () { return false; };
		if (table_obj[self.primaryKey] == null) {
			self.insert(table_obj, callback);
		} else {
			self.update(table_obj, callback);
		}
		return self;
	};

	self.getByPk = function (value, callback) {
		callback = callback || function () { return false; };
		var q = "SELECT * FROM ?? WHERE ?? = ? LIMIT 1";
		var values = [ self.table, self.primaryKey, value ];
		self.select('SLAVE', q, values, function (err, rows) {
			if (rows.length > 0) {
				rows = rows[0];
				for (var k in rows) {
					self[k] = rows[k];
				}
				callback(err, rows);
			} else {
				callback(err, false);
			}
		});
		return self;
	};

	self.getById = function (value, callback) {
		callback = callback || function () { return false; };
		var q = "SELECT * FROM ?? WHERE id = ? LIMIT 1";
		var values = [ self.table, value ];
		self.select('SLAVE', q, values, function (err, rows) {
			if (rows.length > 0) {
				rows = rows[0];
				for (var k in rows) {
					self[k] = rows[k];
				}
				callback(err, rows);
			} else {
				callback(err, false);
			}
		});
		return self;
	};

	self.get = function (search_obj, callback) {
		var	q = "SELECT ?? FROM ??",
			limit = false,
			offset = false,
			orderby = false,
			orderby_direction = false,
			escape_column = true,
			escape_value = true,
			replace
		;
		if (search_obj.columns) {
			replace = [ search_obj.columns, self.table ];
			delete search_obj.columns;
		} else {
			replace = [ self.columns, self.table ];
		}
		if (search_obj.limit) {
			limit = search_obj.limit;
			delete search_obj.limit;
		}
		if (search_obj.offset) {
			offset = search_obj.offset;
			delete search_obj.offset;
		}
		if (search_obj.orderby) {
			orderby = search_obj.orderby;
			delete search_obj.orderby;
		}
		if (search_obj.orderby_direction) {
			orderby_direction = search_obj.orderby_direction;
			delete search_obj.orderby_direction;
		}
		if (search_obj.escape_column) {
			escape_column = seach_obj.escape_column;
			delete seach_obj.escape_column;
		}
		if (seach_obj.escape_value) {
			escape_value = search_obj.escape_value;
			delete search_obj.escape_value;
		}
		if (size(search_obj) > 0) {
			q += ' WHERE';
			var first = true;
			for (var k in search_obj) {
				if (first) {
					q += (escape_column) ? ' ??' : ' ' + k;
					first = false;
				} else {
					q += (escape_column) ? ' AND ??' : ' ' + k;
				}
				if (escape_column) { 
					replace.push(k);
				}
				if (typeof search_obj[k] == 'object') {
					if (escape_value) {
						q += ' ' + search_obj[k].operator + ' ?';
						replace.push(search_obj[k].value);
					} else {
						q += ' ' + search_obj[k].operator + ' ' + search_obj[k].value;
					}
				} else {
					if (escape_value) {
						q += ' = ?';
						replace.push(search_obj[k]);
					} else {
						q += ' = ' + search_obj[k];
					}
				}
			}
		}
		if (orderby) {
			q += ' ORDER BY ??';
			replace.push(orderby);
		}
		if (orderby_direction) {
			if (orderby_direction == 'DESC') {
				q += ' DESC';
			}
		}
		if (limit) {
			q += ' LIMIT ?';
			replace.push(limit);
		}
		if (offset) {
			q += ' OFFSET ?';
			replace.push(offset);
		}
		self.select('SLAVE', q, replace, callback);
		return self;
	};

	self.join = function (joins, search_obj, callback) {
		var	q = "SELECT * FROM ??",
			limit = false,
			offset = false,
			orderby = false,
			orderby_direction = false,
			replace,
			nest
		;
		if (search_obj.nest) {
			nest = search_obj.nest;
			delete search_obj.nest;
		} else {
			nest = true;
		}
		if (search_obj.columns) {
			q = "SELECT ?? FROM ??";
			replace = [ search_obj.columns, self.table ];
			delete search_obj.columns;
		} else {
			replace = [ self.table ];
		}
		if (search_obj.limit) {
			limit = search_obj.limit;
			delete search_obj.limit;
		}
		if (search_obj.offset) {
			offset = search_obj.offset;
			delete search_obj.offset;
		}
		if (search_obj.orderby) {
			orderby = search_obj.orderby;
			delete search_obj.orderby;
		}
		if (search_obj.orderby_direction) {
			orderby_direction = search_obj.orderby_direction;
			delete search_obj.orderby_direction;
		}
		if (typeof joins.length == 'undefined') {
			joins = [ joins ];
		}
		for (var i=0,join; join = joins[i]; i++) {
			if (join.type) {
				q += ' ' + join.type;
				delete join.type;
			}
			q += ' JOIN ?? ON ??';
			replace.push(join.table);
			replace.push(join.left);
			q += (join.operator) ? ' ' + join.operator + ' ??' : ' = ??';
			replace.push(join.right);
		}
		if (size(search_obj) > 0) {
			q += ' WHERE ?';
			replace.push(search_obj);
		}
		if (orderby) {
			q += ' ORDERBY ??';
			replace.push(orderby);
		}
		if (orderby_direction) {
			q += ' ??';
			replace.push(orderby_direction);
		}
		if (limit) {
			q += ' LIMIT ?';
			replace.push(limit);
		}
		if (offset) {
			q += ' OFFSET ?';
			replace.push(offset);
		}
		self.query('SLAVE', { sql: q, nestTables: nest }, replace, callback);
		return self;
	};

	self.walk = function (path, search_obj, callback) {
		search_obj = search_obj || {};
		callback = callback || function () { return false; };
		var joins = [];
		var current_table = tables[self.table];
		for (var i=0,t; t = path[i]; i++) {
			joins.push(current_table.references[t]);
			current_table = tables[t];
		}
		self.join(joins, search_obj, callback);
	}

	self.deleteRecord = function (primaryKey, callback) {
		callback = callback || function () { return false; };
		var q = "DELETE FROM ?? WHERE ?? = ?";
		var replace = [ self.table, self.primaryKey, primaryKey ];
		self.query('MASTER', q, replace, callback);
	};

	self.init = function (table_name, obj, callback) {
		callback = callback || function () { return false; };
		if (tables[table_name]) {
			var table_c = tables[table_name];
			obj = obj || {};

			table_c =  clone(table_c);
			for (var k in obj) {
				table_c[k] = obj[k];
			}
			callback(table_c);
			return table_c;
		} else {
			var q = "DESCRIBE ??";
			self.query('SLAVE', q, [ table_name ], function (err, res) {
				if (err) { throw err; }
				for (var i=0,field; field = res[i]; i++) {
					self[field.Field] = null;
					self.columns.push(field.Field);
					if (field.key == 'PRI') {
						self.primaryKey = field.Field
					}
				}
				self.table = table;
				tables[table_name] = clone(self);
			});
			while (!tables[table]) {
				deasync.runLoopOnce();
			}
			return self.init(table, obj, callback);
		}
	};

	return self.init(table, obj, callback);
};

function table (obj) {
	var self = {};
	for (var k in obj) {
		self[k] = obj[k];
	}
	for (var i=0,c; c = self.columns[i]; i++) {
		self[c] = null;
	}
	self.save = function (callback) {
		callback = callback || function () { return false; };
		gateway(self.table).save(self, callback);
	};
	self.deleteRecord = function (callback) {
		callback = callback || function () { return false; };
		gateway(self.table).deleteRecord(self[self.primaryKey], callback);
	};
	self.getColumnValues = function () {
		var ret = {};
		for (var i=0,c; c = self.columns[i]; i++) {
			ret[c] = self[c];
		}
		return ret;
	};
	return self;
}

function table_obj (table_name) {
	var t = gateway(table_name);
	var obj = {
		table: t.table,
		columns: t.columns.slice(0),
		primaryKey: t.primaryKey
	};
	return table(obj);
}

//helper functions
var size = function(obj) {
	var size = 0, key;
	for (key in obj) {
		if (obj.hasOwnProperty(key)) size++;
	}
	return size;
};

var initialize = false;
pool.getConnection('SLAVE', function (err, conn) {
	if (err) { throw err; }
	var fieldname = 'Tables_in_' + conn.config.database;
	conn.query('SHOW TABLES', [])
		.on('error', function (err) {
			throw err;
		})
		.on('result', function (row) {
			conn.pause();
			var table_name = row[fieldname];
			gateway(table_name, {}, function (table) {
				conn.resume();
			});
		})
		.on('end', function () {
			var q = "\
			SELECT * \
			FROM information_schema.TABLE_CONSTRAINTS i \
			LEFT JOIN information_schema.KEY_COLUMN_USAGE k ON i.CONSTRAINT_NAME = k.CONSTRAINT_NAME \
			WHERE i.CONSTRAINT_TYPE = 'FOREIGN KEY'\
			AND i.TABLE_SCHEMA = DATABASE()\
			";
			conn.query(q, [], function (err, res) {
				for (var n=0,fk; fk = res[n]; n++) {
					tables[fk['TABLE_NAME']].references[fk['REFERENCED_TABLE_NAME']] = {
						table: fk['REFERENCED_TABLE_NAME'],
						left: fk['TABLE_NAME'] + '.' + fk['COLUMN_NAME'],
						right: fk['REFERENCED_TABLE_NAME'] + '.' + fk['REFERENCED_COLUMN_NAME']
					};
					tables[fk['REFERENCED_TABLE_NAME']].references[fk['TABLE_NAME']] = {
						table: fk['TABLE_NAME'],
						left: fk['REFERENCED_TABLE_NAME'] + '.' + fk['REFERENCED_COLUMN_NAME'],
						right: fk['TABLE_NAME'] + '.' + fk['COLUMN_NAME']
					};
					//self.foreignKeys.push(fk['REFERENCED_TABLE_NAME'] + '.' + fk['REFERENCED_COLUMN_NAME']);
					//self.foreignKeys.push({ fk['REFERENCED_TABLE_NAME']: fk['REFERENCED_COLUMN_NAME'] });
				}
				initialize = true;
			});
		})
	;
});

while (!initialize) {
	deasync.runLoopOnce();
}

//exports.gateway = gateway;
exports.table = table_obj;
exports.gateways = tables;
