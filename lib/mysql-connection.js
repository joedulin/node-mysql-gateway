var mysql = require('mysql');
var pool = null;

var main = function () {
	if (pool === null) {
		pool = mysql.createPoolCluster();

		pool.add('MASTER', {
			database: 'nmt',
			host: 'localhost',
			user: 'master_user',
			password: 'something super secret and special'
		});

		pool.add('SLAVE', {
			database: 'nmt',
			host: 'localhost',
			user: 'slave_user',
			password: 'something else that is super secret'
		});
		//console.log('pool created');

		return pool;
	} else {
		return pool;
	}
}

module.exports = (main)();
