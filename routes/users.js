var express = require('express');
var router = express.Router();
var mysql = require('mysql');
var config = require('../config');
var connection = mysql.createConnection(config.mysql);

var query = {
        selectByPhoneNoOrRegistrationId : "select *     \n"
                + "from users \n"
                + "where phone_no = ? \n"
                + "     or registration_id = ?",
        updateRegIdAndLocation : 'update users \n"
                + "set registration_id = ? \n"
                + ",latitude = ? \n"
                + ",longitude = ?"
                + "where id = ?",
        insert : "insert into users(phone_no, registration_id, latitude, longitude) \n"
                + "values(?, ?, ?, ?)",
        updateRejectCnt : "update users \n"
                + "     set reject_cnt = reject_cnt + 1 \n"
                + "     , update_dt = NOW() \n"
                + "where id = ?",
        insertReject : "insert into user_rejects(user_id, reject_id) \n"
                + "select ?, id \n"
                + "from users \n"
                + "where phone_no = ?",
	increasePaperCoin : 'update users \n"
		+ "set paper_coin = paper_coin + ? \n"
		+ ", update_dt = NOW() \n"
		+ "where id = ?",
	insertCharge : "insert into charges(user_id, coin_id, paper_cnt) \n"
		+ "values(?, ?, ?)",
	update : "update users \n"
		+ "set sex = ?, age = ?, update_dt = NOW() \n"
		+ "where id = ?"
};


/* GET users listing. */
router.post('/', function(req, res, next){
	var registration_id = req.param('registration_id');
	var phone_no = req.param('phone_no');
	var latitude = req.param('latitude');
	var longitude = req.param('longitude');

	connection.connect();
        var args = [phone_no, registration_id];
	connection.query(query.selectByPhoneNoOrRegistrationId, args, function(err, results){
		if(err) throw err;
		if(results && results.length === 1){
			var args = [registration_id, latitude, longitude, results[0].id];
			connection.query(query.updateRegIdAndLocation, args, function(err, result){
				if(err) throw err;
				console.log('regist user:: update success');
				res.json(results[0]);
			});
		}else if(!results || results.length === 0){
			var args = [phone_no, registration_id, latitude, longitude];
			connection.query(query.insert, args, function(err, result){
				if(err) throw err;
				console.log('regist user:: insert success');
				res.json({id: result.insertId,
					phone_no: phone_no,
					registration_id: registration_id,
					latitude: latitude,
					longitude: longitude,
					sex: 'A',
					age: 0,
					paper_coin: 30,
					reject_cnt: 0,
					join_dt: new Date(),
					update_dt: new Date()
				});
			});
		}else{
			throw new Error('user regist:: 중복된 사용자가 존재합니다.');
		}
		res.json(results[0]);
	});
	connection.end();
});

router.post('/reject', function(req, res, next){
	var user_id = req.param('user_id');
	var phone_no = req.param('phone_no');

        connection.connect();
	connection.beginTransaction(function(err){
		if(err) { throw err; }
		var args = [user_id, phone_no];
		connection.query(query.insertReject, args, function(err, result){
			if(err) { 
				connection.rollback(function(){
					throw err;
				});
			}
			console.log('reject:: insert success');

			var args = [user_id];
			connection.query(query.updateRejectCnt, args, function(err, result){
				if(err){
                                	connection.rollback(function(){
                                        	throw err;
                                	});
                        	}
				connection.commit(function(err){
					if(err) {
						connection.rollback(function(){
							throw err;
						});
					}
					res.json({result:'success'});
					console.log('reject:: update success');
				});
			});

		});
	});
        connection.end();
});

router.post('/charge', function(req, res, next){
	var user_id = req.param('user_id');
	var coin_id = req.param('coin_id');
	var paper_cnt = req.param('paper_cnt');

        connection.connect();
	connection.beginTransaction(function(err){
		if(err) { throw err; }
		var args = [user_id, coin_id, paper_cnt];
		connection.query(query.insertCharge, args, function(err, result){
			if(err){
				connection.rollback(function(){
					throw err;
				});
			}
			console.log('charge:: insert success');
			
			var args = [paper_cnt, user_id];
			connection.query(query.increasePaperCoin, args, function(err, result){
				if(err){
					connection.rollback(function(){
						throw err;
					});
				}

				connection.commit(function(err){
					if(err) {
						connection.rollback(function(){
							throw err;
						});
					}
					res.json({result:'success'});
					console.log('charge:: update success');
				});
			}); 
		});
	});

        connection.end();
});

router.put('/', function(req, res, next){
	var user_id = req.param('user_id');
	var sex = req.param('sex');
	var age = req.param('age');

        connection.connect();
	var args = [sex, age, user_id];
	connection.query(query.update, args, function(err, result){
		if(err){ throw err; }
		console.log('user config:: update success');
		res.send({result:'success'});
	});

        connection.end();
});

module.exports = router;
