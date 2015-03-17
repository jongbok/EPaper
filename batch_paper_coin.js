var mysql = require('mysql');
var config = require('./config');

var connection = mysql.createConnection(config.mysql);
connection.connect(function(err){
	if(err){
		console.error('error connecting!', err.stack);
		return;
	}
	connection.query('update users set paper_coin = 30 where paper_coin < 30',function(err, rows){
		if(err){
			console.error('paper_coin update error!', err.stack);
			return;
		}
		console.log('paper_coin update success!');
		connection.end();
	});
});
