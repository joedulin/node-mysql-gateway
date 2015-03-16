node-mysql-gateway
=============
### Purpose
The purpose of this library is to create an Gateway/Table class API for MySQL development. It uses the flixge/node-mysql library to create a pool cluster with a MASTER and a SLAVE tagged MySQL connection pool. From there it automatically generates gateway classes for all tables available from the SLAVE pool.

This is simply a quick and easy way to implement CRUD for a database

**Notice:** Currently only supports one MASTER/SLAVE database combo. Extending this should not be a problem, but I haven't gotten there yet.

**More Important Notice:** I've just finished this/uploaded it. It hasn't been thoroughly tested yet

## Usage
#### Installation
*Not currently in npm registry*
``` bash
npm install joedulin/node-mysql-gateway
```

#### Configuration
I'll actually write a config for this sometime, but for now....

Open the lib/mysql-connection.js file and fix up:
``` javascript
pool.add('MASTER', {
    database: 'testing',
    host: 'localhost',
    user: 'master_user',
    password: 'something super secret and special'
});

pool.add('SLAVE', {
    database: 'testing',
    host: 'localhost',
    user: 'slave_user',
    password: 'something else that is super secret'
});
```

### Initialize
``` javascript
var msyqlGateway = require('mysql-gateway'),
    gateways = mysqlGateway.gateways,
    table = mysqlGateway.table;

//For demonstration purposes assume callback =
var callback = function (err, results) {
	console.log(results);
};
```

### Gateways
*Used primarily for SELECT type statements*
``` javascript
/* gateways.table1 is automatically created
given your database has a table named table1 */
var table1 = gateways.table1;
//gateway.get(search_obj, callback);
table1.get({ name: 'bob' }, function (err, results) {
    console.log(results);
});
/*
[ {
	table: 'table1',
	columns: [ 'id', 'name', 'description' ],
	primaryKey: 'id',
    id: 1,
	name: 'bob',
	description: 'Nothing special. Just Bob.',
	save: [Function],
	getColumnValues: [Function]
} ]
*/

```

##### search_obj
The search object can be made up of a few things. Passing in an empty object {} will result in a query with no WHERE clause or modifiers.

``` javascript
table1.get({}, callback);
// SELECT `id`, `name`, `description` FROM `table1`;
```

_SELECT `id`, `name`, `description` FROM table1;_

You can build the WHERE clause by passing in "column name": "column value" in the search object.

``` javascript
table1.get({ name: 'bob', description: 'blarg' }, callback);
// SELECT `id`, `name`, `description` FROM `table1` WHERE `name` = 'bob' AND `description` = 'blarg';
```

Alternatively, you can have the value in a column: value be an object with an operator and value.

**Notice:** The operator portion of this is not escaped. I intend to implement this somehow, someday, but for now use at your own risk.

``` javascript
table1.get({ name: { operator: '!=', value: 'bob' }, description: { operator: 'LIKE', value: '%blarg%' }});
// SELECT `id`, `name`, `description` FROM `table1` WHERE `name` != 'bob' AND `description` LIKE '%blarg%';
```

The search object also has some extra functionality built in.

``` javascript
var search_obj = {
	description: {
		operator: 'LIKE',
		value: '%blarg%'
	},
    columns: [ 'name', 'description' ],
	limit: 5,
	offset: 2,
	orderby: 'name',
	orderby_direction: 'DESC'
};
table1.get(search_obj, callback);
//SELECT `name`, `description` FROM `table1` WHERE `description` LIKE '%blarg%' ORDER BY `name` DESC LIMIT 5 OFFSET 2;
```

For simplicity there is also the function gateway.getByPk(value, callback);

Note that results in the callback will be a single table object rather than an array

``` javascript
table1.getByPk(1, callback);
// SELECT `id`, `name`, `description` FROM `table1` WHERE id = 1;
```

#### Simple Joins

Using this gateway framework you can perform some simple table joins.

``` javascript
var joins = [
    {
        table: 'table1_table2',
        left: 'table1.id',
        right: 'table1_table2.table1_id'
    },
    {
        table: 'table2',
        left: 'table1_table2.table2_id',
        right: 'table2.id'
    }
];
var search_obj = { 'table1.name': 'bob' };
table1.join(joins, search_obj, callback);

/*
    SELECT * FROM `table1`
    JOIN `table1_table2` ON `table1.id` = `table1_table2.table1_id`
    JOIN `table2` ON `table1_table2.table2_id` = `table2.id`
    WHERE `table1.name` = 'bob';
*/
```

But that is a little verbose. You can shorthand it a little with...

``` javascript
var joins = [ 'table1_table2', 'table2' ],
    search_obj = { 'table1.name': 'bob' };
table1.walk(joins, search_obj, callback);
```

Just note that walk requires foreign keys to be defined for the whole path. In the example table1_table2 has a foreign key for table1_table2.table1_id that references table1.id, and table1_table2.table2_id that references table2.id

### Table objects

Gateway results are an array of table objects. These are simply JSON objects with the column: value of the table plus a couple of extra bits of info / functions.

#### save

``` javascript
var table_row = table('table1');
console.log(table_row);

/*
{
	table: 'table1',
	columns: [ 'id', 'name', 'description' ],
	primaryKey: 'id',
	id: null,
	name: null,
	description: null,
	save: [Function],
	getColumnValues: [Function]
}
*/

table_row.name = 'bob';
table_row.description = 'some description';
table_row.save(callback); //Insert

// OR ------------------------------------

gateways.table1.getById(1, function (err, result) {
	result.name = 'Bob McFrob';
	result.save(callback); //Update
});
```

The determining factor between an insert and an update is whether or not the table_row[table_row.primaryKey] is null.

#### deleteRecord

``` javascript
gateways.table1.getById(1, function (err, result) {
	result.deleteRecord(callback);
});

// Will delete the record based on result.primaryKey
// DELETE FROM `table1` WHERE `id` = 1;
```

#### getColumnValues

``` javascript
gateways.table1.getById(1, function (err, result) {
	console.log(result.getColumnValues());
});

/*
{
	id: 1
	name: 'bob',
	description: 'some description'
}
*/
```
