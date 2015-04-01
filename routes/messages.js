var express = require('express');
var router = express.Router();
var mysql = require('mysql');
var config = require('../config');
var gcm = require('node-gcm');
var async = require('async');
var trycatch = require('trycatch');
var pool = mysql.createPool(config.mysql);
var logger = config.getLogger();

var query = {
	selectReceive : "select \n"
		+ "	  a.id	\n"
		+ "	, a.phone_no \n"
		+ "	, DATE_FORMAT(a.create_dt, '%Y-%m-%d %H:%i:%s') as create_dt \n"
		+ "	, a.content \n"
		+ "	, b.message_id \n"
		+ "	, b.user_id \n"
		+ "from messages a inner join message_user b \n"
		+ "on a.id = b.message_id \n"
		+ "where b.user_id = ? \n"
		+ "	and receive_yn = 0 \n"
		+ "order by message_id asc",
	updateReceive : "update message_user "
		+ "	set receive_yn = 1 "
		+ "where message_id = ? "
		+ "	and user_id = ?",
	selectPaperCoin : "select paper_coin, latitude, longitude from users where id = ?",
	getSelectSend : function(distance, latitude, longitude, ages, sex, connection){
		logger.debug('sql make:: distance=' + distance + ',latitude' + latitude + ',longitude=' + longitude + ',sex=' + sex);
		var sql =  "SELECT id, registration_id \n"
			+ "FROM users a \n"
			+ "where not exists(select 'x' \n"
			+ "		from user_rejects b \n"
			+ "		where a.id = b.user_id \n"
			+ "			and b.reject_id = ?) \n"
			+ "and use_yn = 1 \n";
		if(distance && distance > 0){
			sql += "        and ( 6371 * acos( cos( radians(" + connection.escape(latitude) + ") ) * cos( radians( latitude ) ) \n";
			sql += "          * cos( radians( longitude ) - radians(" + connection.escape(longitude) + ") ) \n";
			sql += "          + sin( radians(" + connection.escape(latitude) + ") ) * sin( radians( latitude ) ) ) ) * 1000 < " + connection.escape(distance) + " \n";
		}
		if(ages && ages.length > 0){
			var tx_age = ages.join(',');
			logger.debug('sql make:: tx_age=' + tx_age);
			sql += "        and age in(" + tx_age + ", 0) \n";
		}
		if(sex && sex !== 'A'){
			sql += "        and sex in(" + connection.escape(sex) + ",'A')";
		}
		sql += "LIMIT ?";
		return sql;
	},
	insert : "insert into messages(phone_no, sex, age1, age2, age3, age4, age5, age6, distance, paper_cnt, content) \n"
		+ "values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
	insertMessageUser : "insert into message_user(message_id, user_id) \n"
		+ "values(?, ?)",
	decreaseCoin : "update users \n"
		+ "	set paper_coin = paper_coin - ? \n"
		+ "	, update_dt = NOW() \n"
		+ "where id = ?"
};

/* GET users listing. */
/* 로딩시 또는 Push가 왔을 경우 안받은 메세지 정보조회 */
router.get('/:user_id', function(req, res, next){
	var user_id = req.params.user_id;
	function createUpdateFunction(args, connection){
		return function(callback){
			connection.query(query.updateReceive, args, function(err, result){
				if(err) { 
					callback(err); 
				}else{
					callback(null);
				}
			});
		};
	}

	trycatch(function(){	
		pool.getConnection(function(err, connection) {
			if(err) { throw err; }
			connection.beginTransaction(function(err) {
				if(err) { throw err; }
				var afterTransaction = config.afterTransaction(connection, res);
				var args = [user_id];
				connection.query(query.selectReceive, args, function(err, results){	
					if(err){ throw err; }
					logger.debug('message recevie:: select success![' + user_id + ']');
					var fns = [];
					for(var i=0; i<results.length; i++){
						var args = [results[i].message_id, user_id];
						fns.push(createUpdateFunction(args, connection));
					}
					fns.push(function(callback){
						logger.debug('message recevie:: update recevei_yn success [' + user_id + ']'); 
						callback(null, results);	
					});
					async.waterfall(fns, afterTransaction);
				});
					
			});	
		});
	},
	function(err){
		logger.error('message recevie:: error![' + user_id + ']', err.stack);
		res.send({result:'fail'});
	});
});

/*메세지 발송 */
router.post('/', function(req, res, next){
	var user_id = req.body.user_id;
	var phone_no = req.body.phone_no;
	var sex = req.body.sex;
	var age1 = req.body.age1 * 1;
	var age2 = req.body.age2 * 1;
	var age3 = req.body.age3 * 1;
	var age4 = req.body.age4 * 1;
	var age5 = req.body.age5 * 1;
	var age6 = req.body.age6 * 1;
	var distance = req.body.distance;
	var paper_cnt = req.body.paper_cnt;
	var content = req.body.content;

	var ages = [];
	if(age1 === 1) { ages.push(10); }
	if(age2 === 1) { ages.push(20); }
	if(age3 === 1) { ages.push(30); }
	if(age4 === 1) { ages.push(40); }
	if(age5 === 1) { ages.push(50); }
	if(age6 === 1) { ages.push(60); }

	function createInsertMessageUserFunction(connection, args){
		return function(callback){
			connection.query(query.insertMessageUser, args, function(err, result){
				if(err){
					callback(err);
				}else{
					callback(null);
				}
			});
		};
	}

	function createSendGcmFunction(registrationIds, targets){
		var sender = new gcm.Sender(config.gcm.senderId);
		var message = new gcm.Message({
			collapseKey: (new Date()).getTime() + '', 
			delayWhileIdle: true,
			timeToLive: 300,
			data: {
				title: '번개전단 메세지',
				message: content,
				msgcnt: 3
			}
		});

		return function(sendList, callback){
			sender.send(message, registrationIds, 4, function(err, result){
				if(err) {
					logger.error('gcm send error!', err.stack);
					callback(err);
					return;
				}
				callback(null, sendList.concat(targets)); 
			});
		};
	}

	trycatch(function(){
		pool.getConnection(function(err, connection) {
			if(err) { throw err; }
			connection.beginTransaction(function(err) {
				if(err) { throw err; }
				var afterTransaction = config.afterTransaction(connection, res);
				async.waterfall([
					function(callback){
						var args = [user_id];
						connection.query(query.selectPaperCoin, args, function(err, results){
							if(err) { throw err; }
							if(!results || results.length !== 1){
								throw new Error('사용자정보가 존재하지 않습니다.[' + user_id + ']');
							}
							logger.debug('message send:: select user info success[' + user_id + ']');
							callback(null, results[0]);
						});
					},
					function(user, callback){
						var latitude = user.latitude;
						var longitude = user.longitude;
						var args = [user_id, paper_cnt];
						var sql = query.getSelectSend(distance * 1
									, latitude * 1
									, longitude * 1
									, ages
									, sex
									, connection);

						 connection.query(sql, args, function(err, results){
							if(err) { throw err; }
							if(!results || results.length < 1){
								logger.error('조건에 해당하는 사용자가 존재하지 않습니다.[user_id:' + user_id + ']');
								var err = new Error('조건에 해당하는 사용자가 존재하지 않습니다.');
								err.isCustom = true;	
								throw err;
								return;
							}
							if(user.paper_coin < paper_cnt){
								logger.error('보유중인 전단지가 부족해서 발송할 수 없습니다.[id:' + user_id
									+ ',보유:' + user.paper_coin + ',요청:' + paper_cnt + ']');
								var err = new Error('보유중인 전단지가 부족해서 발송할 수 없습니다.');
								err.isCustom = true;
								throw err;
								return;
							}
							logger.debug('message send:: select target list success[' + user_id + ']');
							callback(null, results);
						});
					},
					function(targetList, callback){
						var args = [phone_no, sex, age1, age2, age3, age4, age5, age6, distance, targetList.length, content];
						connection.query(query.insert, args, function(err, result){
							if(err) { throw err; }
							logger.debug('message send:: insert message success![' + user_id + ']');
							callback(null, targetList, result.insertId);
						});
					},
					function(targetList, messageId, callback){
						var registrationIds = [];
						var targets = [];
						var fns = [function(cb){
							cb(null, []);
						}];

						for(var i=0; i<targetList.length; i++){
						        if(i>0 && (i%1000) === 0){
								fns.push(createSendGcmFunction(registrationIds, targets));
								registrationIds = [];
								targets = [];
							}
							targets.push(targetList[i]);
							registrationIds.push(targetList[i].registration_id);
						}

						if(registrationIds.length > 0){
							fns.push(createSendGcmFunction(registrationIds, targets));
						}

						async.waterfall(fns,
							function(err, sendList){
								if(err){
									logger.error('message send :: error![' + user_id + ']', err.stack);
									if(sendList && sendList > 0){
										callback(null, sendList, messageId);
									}else{
										callback(err);
									}
									return;
								}
								callback(null, sendList, messageId); 
							}
						);
					},
					function(sendList, messageId, callback){
						var fns = [];
						for(var i=0; i<sendList.length; i++){
							var args = [messageId, sendList[i].id];
							fns.push(createInsertMessageUserFunction(connection, args));
						}
						async.parallel(fns, function(err, result){
							if(err) {
								callback(err);
								return;
							}
							logger.debug('message send :: insert message_user success![' + user_id + ']');
							callback(null, sendList, messageId);
						});
					},
					function(sendList, messageId, callback){
						var args = [sendList.length, user_id];
						connection.query(query.decreaseCoin, args, function(err, result){
							if(err) { 
								callback(err);
								return;
							}
							logger.debug('message send :: decreate coin success![' + user_id + ']');
							callback(null, sendList, messageId);
						});
					},
					function(sendList, messageId, callback){
						callback(null, {result:'success', id: messageId, send_count: sendList.length});
					}
				], afterTransaction);
			});	
		});
	},
	function(err){
		logger.error('message send:: error![' + user_id + ']', err.stack);
		if(err.isCustom){
			res.json({result:'fail', message:err.message});
		}else{
			res.json({result:'fail'});
		}
	});

});

module.exports = router;
