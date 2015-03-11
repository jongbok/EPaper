var express = require('express');
var router = express.Router();
var mysql = require('mysql');
var config = require('../config');
var gcm = require('node-gcm');
var async = require('async');
var trycatch = require('trycatch');
var pool = mysql.createPool(config.mysql);
var sender = new gcm.Sender(config.gcm.senderId);

var query = {
	selectReceive : "select \n"
		+ "	  a.phone_no \n"
		+ "	, DATE_FORMAT(a.create_dt, '%Y-%m-%d %H:%m:%s') as create_dt \n"
		+ "	, a.content \n"
		+ "	, b.message_id \n"
		+ "	, b.user_id \n"
		+ "from messages a inner join message_user b \n"
		+ "on a.id = b.message_id \n"
		+ "where b.user_id = ? \n"
		+ "	and receive_yn = 0",
	updateReceive : "update message_user \n"
		+ "	set receive_yn = 1 \n"
		+ "where message_id = ? \n"
		+ "	and user_id = ? \n",
	selectPaperCoin : "select paper_coin, latitude, longitude from users where id = ?",
	getSelectSend : "SELECT id, registration_id \n"
		+ "FROM users a \n"
		+ "where 1=1 \n"
		+ "and not exists(select 'x' \n"
		+ "		from user_rejects b \n"
		+ "		where a.id = b.user_id \n"
		+ "			and b.reject_id = ?) \n"
		+ "?? ?? ?? "
		+ "LIMIT 0 , ?",
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

	trycatch(function(){	
		pool.getConnection(function(err, connection) {
			if(err) { throw err; }
			connection.beginTransaction(function(err) {
				if(err) { throw err; }
				var afterTransaction = config.afterTransaction(connection, res);
				var args = [user_id];
				connection.query(query.selectReceive, args, function(err, results){	
					if(err){ throw err; }
					console.log('message recevie:: select success');
					var fns = [];
					for(var i=0; i<results.length; i++){
						fns.push(function(callback){
							var args = [[results[i].message_id, user_id]];
							connection.query(query.updateReceive, args, function(err, result){
								if(err) { throw err; }
								callback(null);
							});
						});
					}
					async.parallel(fns, afterTransaction);
				});
					
			});	
		});
	},
	function(err){
		console.error('message recevie:: error!', err.stack);
		res.json({result:'fail', message: err.message});
	});
});

/*메세지 발송 */
router.post('/', function(req, res, next){
	var user_id = req.param('user_id');
	var phone_no = req.param('phone_no');
	var sex = req.param('sex');
	var age1 = req.param('age1');
	var age2 = req.param('age2');
	var age3 = req.param('age3');
	var age4 = req.param('age4');
	var age5 = req.param('age5');
	var age6 = req.param('age6');
	var distance = req.param('distance');
	var paper_cnt = req.param('paper_cnt');
	var content = req.param('content');

	var ages = [];
	if(age1 === '1') { ages.push(10); }
	if(age2 === '1') { ages.push(20); }
	if(age3 === '1') { ages.push(30); }
	if(age4 === '1') { ages.push(40); }
	if(age5 === '1') { ages.push(50); }
	if(age6 === '1') { ages.push(60); }

	trycatch(function(){
		pool.getConnection(function(err, connection) {
			if(err) { throw err; }
			connection.beginTransaction(function(err) {{
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
								throw new Error('코인이 부족해서 발송할 수 없습니다.[요청:' 
									+ paper_cnt + ', 보유:' + (results[0].paper_coin + ']');
							}
							console.log('message send:: select user info success');
							callback(null, results[0]);
						});
					},
					function(user, callback){
						var latitude = user.latitude;
						var longitude = user.longitude;
						var query_distance = "";
						if(distance && distance > 0){
							query_distance = "        and ( 6371 * acos( cos( radians(" + connection.escape(latitude) + ") ) * cos( radians( latitude ) ) \n";
							query_distance += "          * cos( radians( longitude ) - radians(" + connection.escape(longitude) + ") ) \n";
							query_distance += "          + sin( radians(" + connection.escape(latitude) + ") ) * sin( radians( latitude ) ) ) ) * 1000 < " + connection.escape(distance) + " \n";
						}

						var query_age = "";
						if(ages && ages.length > 0){
							var tx_age = ages.join("','");
							query_age = "        and age in('" + tx_age + "', 0) \n";
						}

						var query_sex = "";
						if(sex){
							query_sex = "        and sex in(" + connection.escape(sex) + ",'A')";
						}
						var args = [user_id, query_distance, query_age, query_sex, paper_cnt];
						connection.query(query.getSelectSend, args, function(err, results){
							if(err) { throw err; }
							if(!results || results.length < 1){
								throw new Error('조건에 해당하는 사용자가 존재하지 않습니다.');
							}
							console.log('message send:: select target list success');
							callback(null, results);
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
							registrationIds.push(results[i].registration_id);
						}
						sender.send(message, registrationIds, 4, function(err, result){
							if(err) { throw err; }
							console.log('message send:: gcm push success');
							callback(null, {result:'success', send_count: registrationIds.length});
						});
					}
				], afterTransaction);
			});	
		});
	},
	function(err){
		console.error('message send:: error!', err.stack);
		res.json({result:'fail', message: err.message});
	});

});

module.exports = router;
