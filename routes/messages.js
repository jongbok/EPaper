var express = require('express');
var router = express.Router();
var mysql = require('mysql');
var config = require('../config');
var gcm = require('node-gcm');
var connection = mysql.createConnection(config.mysql);
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
	
	connection.connect();
	var args = [user_id];
	connection.query(query.selectReceive, args, function(err, results){
		if(err) { throw err; }
		console.log('message recevie:: select success');

		var args = [];
		for(var i=0; i<results.length; i++){
			args.push([results[i].id, user_id]);
		}
		connection.query(query.updateReceive, args, function(err, result){
			if(err) { throw err; }
			connection.end();
			res.json(results);
		});	
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

	connection.connect();
	var ages = [];
	if(age1 === '1') { ages.push(10); }
	if(age2 === '1') { ages.push(20); }
	if(age3 === '1') { ages.push(30); }
	if(age4 === '1') { ages.push(40); }
	if(age5 === '1') { ages.push(50); }
	if(age6 === '1') { ages.push(60); }

	var args = [user_id];
	connection.query(query.selectPaperCoin, args, function(err, results){
		if(err){ throw err; }
		if(!results || results.length !== 1){
			throw new Error('message send:: 사용자정보가 존재하지 않습니다.');
		}
		if(results[0].paper_coin < paper_cnt){
			throw new Error('message sned:: 코인이 부족해서 발송할 수 없습니다.');
		}

		var latitude = results[0].latitude;
		var longitude = results[0].longitude;
		var query_distance = '';
		if(distance && distance > 0){
			query_distance = "        and ( 6371 * acos( cos( radians(" + connection.escape(latitude) + ") ) * cos( radians( latitude ) ) \n";
			query_distance += "          * cos( radians( longitude ) - radians(" + connection.escape(longitude) + ") ) \n";
			query_distance += "          + sin( radians(" + connection.escape(latitude) + ") ) * sin( radians( latitude ) ) ) ) * 1000 < " + connection.escape(distance) + " \n";
		}
		
		var query_age = '';
		if(ages && ages.length > 0){
			var tx_age = ages.join("','");
			query_age = "        and age in('" + tx_age + "', 0) \n";
		}

		var query_sex = '';
		if(sex){
			query_sex = "        and sex in(" + connection.escape(sex) + ",'A')";
		}

		var args = [user_id, query_distance, query_age, query_sex, paper_cnt];
		connection.query(query.getSelectSend, args, function(err, results){
			if(err){ throw err; }
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
			
			if(!results || results.length < 1){
				throw new Error('message send:: 조건에 해당하는 사용자가 존재하지 않습니다.');
			}
			
			var registrationIds = [];
			for(var i=0; i<results.length; i++){
				registrationIds.push(results[i].registration_id);	
			}
			sender.send(message, registrationIds, 4, function(err, result){
				if(err) { throw err; }
				console.log('message send:: gcm push success');
			});
		});
	});	
	res.send('ok');
});

module.exports = router;
