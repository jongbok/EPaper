var express = require('express');
var router = express.Router();
var mysql = require('mysql');
var config = require('../config');
var gcm = require('node-gcm');
var async = require('async');
var trycatch = require('trycatch');
var pool = mysql.createPool(config.mysql);
var sender = new gcm.Sender(config.gcm.senderId);
var logger = config.getLogger();

var query = {
	selectReceive : "select \n"
		+ "	  a.phone_no \n"
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
	getSelectSend : function(distance, latitude, longitude, ages, sex){
		var sql =  "SELECT id, registration_id \n"
			+ "FROM users a \n"
			+ "where not exists(select 'x' \n"
			+ "		from user_rejects b \n"
			+ "		where a.id = b.user_id \n"
			+ "			and b.reject_id = ?) \n";
		if(distance && distance > 0){
			sql += "        and ( 6371 * acos( cos( radians(" + latitude + ") ) * cos( radians( latitude ) ) \n";
			sql += "          * cos( radians( longitude ) - radians(" + longitude + ") ) \n";
			sql += "          + sin( radians(" + latitude + ") ) * sin( radians( latitude ) ) ) ) * 1000 < " + distance + " \n";
		}
		if(ages && ages.length > 0){
			var tx_age = ages.join("','");
			sql += "        and age in('" + tx_age + "', 0) \n";
		}
		if(sex && sex !== 'A'){
			sql += "        and sex in(" + sex + ",'A')";
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
	var age1 = req.body.age1;
	var age2 = req.body.age2;
	var age3 = req.body.age3;
	var age4 = req.body.age4;
	var age5 = req.body.age5;
	var age6 = req.body.age6;
	var distance = req.body.distance;
	var paper_cnt = req.body.paper_cnt;
	var content = req.body.content;

	var ages = [];
	if(age1 === '1') { ages.push(10); }
	if(age2 === '1') { ages.push(20); }
	if(age3 === '1') { ages.push(30); }
	if(age4 === '1') { ages.push(40); }
	if(age5 === '1') { ages.push(50); }
	if(age6 === '1') { ages.push(60); }

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
							if(results[0].paper_coin < paper_cnt){
								logger.error('코인이 부족해서 발송할 수 없습니다.[id:' + user_id 
										+ ',보유:' + results[0].paper_coin + ',요청:' + paper_cnt + ']');
								var err = new Error('코인이 부족해서 발송할 수 없습니다.');
								err.isCustom = true;
								callback(err);
								return;
							}
							logger.debug('message send:: select user info success[' + user_id + ']');
							callback(null, results[0]);
						});
					},
					function(user, callback){
						var latitude = user.latitude;
						var longitude = user.longitude;
						var args = [user_id, paper_cnt];
						var sql = query.getSelectSend(connection.escape(distance)
									, connection.escape(latitude)
									, connection.escape(longitude)
									, ages
									, connection.escape(sex));

						 connection.query(sql, args, function(err, results){
							if(err) { throw err; }
							if(!results || results.length < 1){
								logger.error('조건에 해당하는 사용자가 존재하지 않습니다.[user_id:' + user_id + ']');
								var err = new Error('조건에 해당하는 사용자가 존재하지 않습니다.');
								err.isCustom = true;	
								callback(err);
								return;
							}
							logger.debug('message send:: select target list success[' + user_id + ']');
							callback(null, results);
						});
					},
					function(targetList, callback){
						var args = [phone_no, sex, age1, age2, age3, age4, age5, age6, distance, paper_cnt, content];
						connection.query(query.insert, args, function(err, result){
							if(err) { throw err; }
							logger.debug('message send:: insert message success![' + user_id + ']');
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
						var args = [targetList.length, user_id];
						connection.query(query.decreaseCoin, args, function(err, result){
							if(err) { throw err; }
							callback(null, targetList);
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
							if(err) { throw err; }
							logger.debug('message send:: gcm push success![' + user_id + ']');
							callback(null, {result:'success', send_count: registrationIds.length});
						});
					}
				], afterTransaction);
			});	
		});
	},
	function(err){
		logger.error('message send:: error![' + user_id + ']', err.stack);
		res.json({result:'fail'});
	});

});

module.exports = router;
