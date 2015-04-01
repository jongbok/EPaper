var mysql = require('mysql');
var fs = require('fs');
var config = require('./config');
var gcm = require('node-gcm');
var async = require('async');
var trycatch = require('trycatch');

var query = {
	selectList: "select id, registration_id from users where use_yn = 1",
	insert : "insert into messages(phone_no, sex, age1, age2, age3, age4, age5, age6, distance, paper_cnt, content) \n"
		+ "values('00000', 'A', 1, 1, 1, 1, 1, 1, 0, ?, ?)",
        insertMessageUser : "insert into message_user(message_id, user_id) \n"
                + "values(?, ?)",
	updateUseYn : "update users set use_yn = 0 where id = ?"
	};
var connection = mysql.createConnection(config.mysql);
var content = fs.readFileSync('message.txt').toString(); 
console.log(content);

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

function createUpdateUseYn(user_id){
	return function(callback){
                connection.query(query.updateUseYn, [user_id], function(err, result){
                        if(err) {
				console.error('update use_yn error!', err.stack);
                        }
                        callback(null);
                });
        };
}

function createSendGcmFunction(registrationIds, targets){
	var sender = new gcm.Sender(config.gcm.senderId);
	var message = new gcm.Message({
		delayWhileIdle: false,
		timeToLive: 1800,
		data: {
			title: '번개전단 메세지',
			message: content
		}
	});

	return function(send_count, callback){
		console.log('gcm sned ::' + registrationIds.length);
		sender.send(message, registrationIds, 4, function(err, result){
			if(err) {
				console.error('gcm send error!', err.stack);
				callback(err);
				return;
			}
			var success = result.success;
			
			var fns = [];
			for(var i=0; i<result.results.length; i++){
				var ret = result.results[i];
				if(ret.error){
					fns.push(createUpdateUseYn(targets[i].id));
				}
			}	

			async.waterfall(fns,
			function(err, result){
				if(err){
					console.error('gcm send error!', err.stack);
					throw err;
					return;
				}
				console.log('gcm send success! => ' + registrationIds.length);
				callback(null, send_count + success);	
			});
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
					var registrationIds = [];
					var targets = [];
					var fns = [function(cb){
						cb(null, 0);
					}];
					for(var i=0; i<targetList.length; i++){
						if(i>0 && (i%1000) === 0){
							fns.push(createSendGcmFunction(registrationIds, targets));	
							registrationIds = [];
							targets = [];
						}	
						registrationIds.push(targetList[i].registration_id);
						targets.push(targetList[i]);
					}

					if(registrationIds.length > 0){
						fns.push(createSendGcmFunction(registrationIds, targets));
					}

					async.waterfall(fns, 
						function(err, send_count){
							if(err){
								console.error('message send :: error!', err.stack);
								if(send_count && send_count > 0){
									callback(null, send_count);
								}else{
									callback(err);
								}
								return;
							}
							console.log('gcm push end!');
							callback(null, send_count);
						}
					);
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

