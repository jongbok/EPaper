var mysql = require('mysql');
var fs = require('fs');
var config = require('./config');
var gcm = require('node-gcm');
var async = require('async');
var trycatch = require('trycatch');
var sender = new gcm.Sender(config.gcm.senderId);

var query = {
	selectList: "select id, registration_id from users",
	insert : "insert into messages(phone_no, sex, age1, age2, age3, age4, age5, age6, distance, paper_cnt, content) \n"
		+ "values('00000', 'A', 1, 1, 1, 1, 1, 1, 0, ?, ?)",
        insertMessageUser : "insert into message_user(message_id, user_id) \n"
                + "values(?, ?)"
	};
var connection = mysql.createConnection(config.mysql);
var content = fs.readFileSync('message.txt');

function createInsertMessageUserFunction(connection, args){
	return function(callback){
		connection.query(query.insertMessageUser, args, function(err, result){
			if(err) {
				callback(err);
				return;
			}
			callback(null);
		});
	};
}

trycatch(function(){
	connection.connect(function(err){
		if(err) { throw err; }
		connection.beginTransaction(function(err) {
			if(err) { throw err; }
			async.waterfall([
				function(callback){
					connection.query(query.selectList, [], function(err, results){
						if(err) { throw err; }
						if(!results || results.length < 1){
							callback(new Error('empty list'));
							return;
						}
						callback(null, results);
					});
				},
				function(targetList, callback){
					var args = [targetList.length, content];
					connection.query(query.insert, args, function(err, result){
						if(err) { throw err; }
						console.log('message send:: insert message success!');
						callback(null, targetList, result.insertId);
					});
				},
				function(targetList, messageId, callback){
					var fns = [];
					for(var i=0; i<targetList.length; i++){
						var args = [messageId, targetList[i].id];
						fns.push(createInsertMessageUserFunction(connection, args));
					}
					async.parallel(fns, function(err, result){
						if(err) {
							callback(err);
						}else{ 
							callback(null, targetList);
						}
					});
				},
				function(targetList, callback){
					var message = new gcm.Message({
						collapseKey: 'EPaperNotification',
						delayWhileIdle: true,
						timeToLive: 3,
						data: {
							title: '번개전단 메세지',
							message: content,
							msgcnt: 3
						}
					});

					var registrationIds = [];
					for(var i=0; i<targetList.length; i++){
						registrationIds.push(targetList[i].registration_id);
					}

					sender.send(message, registrationIds, 4, function(err, result){
						if(err) { 
							callbakc(err);
							return;
						}
						console.log('message send:: gcm push success!');
						callback(null, registrationIds.length);
					});
				}
			], 
			function(err, send_count){
				if(err){ 
					connection.rollback(function(){
						connection.end();
						throw err; 
					});
					return;
				}
				connection.commit(function(err){
					if(err){
						connection.rollback(function(){
							connection.end();
							throw err;
						});
						return;
					}
					connection.end();
					console.log('message send :: success:' + send_count);
				});
			});
		});	
	});
},
function(err){
	console.error('message send:: error!', err.stack);
});

