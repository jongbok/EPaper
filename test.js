var mysql = require('mysql');
var connection = mysql.createConnection({
        host : 'epaper.clpilgc0yifo.ap-northeast-1.rds.amazonaws.com',
        user : 'epaper',
        password : 'epaper#app$446'
        });

connection.connect();

connection.query('SELECT 1 + 1 AS solution', function(err, rows, fields) {
  if (err) throw err;

  console.log('The solution is: ', rows[0].solution);
});

connection.end();
