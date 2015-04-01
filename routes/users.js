var express = require('express');
var router = express.Router();
var mysql = require('mysql');
var config = require('../config');
var async = require('async');
var trycatch = require('trycatch');
var pool = mysql.createPool(config.mysql);
var logger = config.getLogger();

var query = {
        selectByPhoneNoOrRegistrationId : "select *     \n"
                + "from users \n"
                + "where phone_no = ? \n"
                + "     or registration_id = ?",
	selectById: "select * from users where id = ?",
	updateLocation: "update users set latitude = ?, longitude = ?, use_yn =1, update_dt =  NOW() where id = ?",
        updateRegIdAndLocation : "update users \n"
                + "set registration_id = ? \n"
                + ",latitude = ifnull(?, latitude) \n"
                + ",longitude = ifnull(?, longitude) \n"
		+ ",phone_no = ifnull(?, phone_no) \n"
		+ ",use_yn = 1 \n"
		+ ",update_dt = NOW() \n"
                + "where id = ?",
	updateRegistrationId : "update users \n"
		+ "set registration_id = ? \n"
		+ ",use_yn = 1 \n"
		+ ",update_dt = NOW() \n"
		+ "where id = ?",
        insert : "insert into users(phone_no, registration_id, latitude, longitude) \n"
                + "values(?, ?, ?, ?)",
        updateRejectCnt : "update users \n"
                + "     set reject_cnt = reject_cnt + 1 \n"
		+ "	, use_yn = 1 \n"
                + "     , update_dt = NOW() \n"
                + "where id = ?",
        insertReject : "insert into user_rejects(user_id, reject_id) \n"
                + "select ?, id \n"
                + "from users \n"
                + "where phone_no = ?",
	increasePaperCoin : "update users \n"
		+ "set paper_coin = paper_coin + ? \n"
		+ ", update_dt = NOW() \n"
		+ "where id = ?",
	insertCharge : "insert into charges(user_id, coin_id, paper_cnt) \n"
		+ "values(?, ?, ?)",
	update : "update users \n"
		+ "set sex = ?, name = ?, age = ?, use_yn = 1, update_dt = NOW() \n"
		+ "where id = ?",
	deleteReject : "delete from user_rejects where user_id = ?",
	resetRejectCnt : "update users \n"
		+ "set reject_cnt = 0, use_yn = 1, update_dt = NOW() \n"
		+ "where id = ?"
};


/* GET users listing. */
router.post('/', function(req, res, next){
	var registration_id = req.body.registration_id;
	var phone_no = req.body.phone_no;
	var latitude = req.body.latitude;
	var longitude = req.body.longitude;

	trycatch(function(){
		pool.getConnection(function(err, connection) {
			if(err) { throw err; }
			async.waterfall([
				function(callback){
					var args = [phone_no, registration_id];
					connection.query(query.selectByPhoneNoOrRegistrationId, args, function(err, results){
						if(err) { throw err; }
						if(results && results.length > 1){
							var err = new Error('중복된 사용자가 존재합니다.');	
							err.type = 'user';
							throw err;
						}
						logger.debug('regist user:: select user success[' + phone_no + ']');
						callback(null, results && results.length > 0? results[0]: null);
					});
				},
				function(user, callback){
					if(user){
						var args = [registration_id, latitude, longitude, phone_no, user.id];
						connection.query(query.updateRegIdAndLocation, args, function(err, result){
							if(err) throw err;
							logger.debug('regist user:: update success[' + user.id + ']');
							callback(null, user);
						});
					}else{
						var args = [phone_no, registration_id, latitude, longitude];
						connection.query(query.insert, args, function(err, result){
							if(err) throw err;
							var user_id = result.insertId;
							logger.debug('regist user:: insert success[' + user_id + ']');
							var newUser = {id: user_id, 
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
							};	
							callback(null, newUser);
						});
					}
				} 
			],function(err, result){
				connection.release();
				if(err){ throw err; }
				res.json(result);
			});
		});
	},
	function(err){
		logger.error('regist user:: error! [' + phone_no + ']\n', err.stack);
		res.json({result: 'fail', message:err.message});
	});
});

router.get('/:id', function(req, res, next){
	var id = req.params.id;
        trycatch(function(){
                pool.getConnection(function(err, connection) {
                        if(err) { throw err; }
			connection.query(query.selectById, [id], function(err, results){
				connection.release();
				if(err){ throw err; }
				logger.debug('get user by id:: success!['+ id + ']');
				if(results.length < 1){
					throw new Error('사용자정보가 존재하지 않습니다.');
					return;
				}
				res.json(results[0]);
			});
		});
	},
	function(err){
		logger.error('get user by id:: error! [' + id + ']\n', err.stack);	
		res.json({result: 'fail'});
	});
});

router.put('/:id/registration_id', function(req, res, next){
	var id = req.params.id;
	var registration_id = req.body.registration_id;
        trycatch(function(){
                pool.getConnection(function(err, connection) {
                        if(err) { throw err; }
                        var args = [registration_id, id];
                        connection.query(query.updateRegistrationId, args, function(err, result){
                                connection.release();
                                if(err){ throw err; };
                                res.json({result: 'success'});
                        });
                });
        },
        function(err){
                logger.error('update registration_id:: error! [' + id + ']\n', err.stack);
                res.json({result: 'fail'});
        });
});

router.put('/:id/coords', function(req, res, next){
	var id = req.params.id;
	var latitude = req.body.latitude;
	var longitude = req.body.longitude;
        trycatch(function(){
                pool.getConnection(function(err, connection) {
                        if(err) { throw err; }
			var args = [latitude, longitude, id];
                        connection.query(query.updateLocation, args, function(err, result){
				connection.release();
                                if(err){ throw err; };
                                res.json({result: 'success'});
                        });
                });
        },
        function(err){
                logger.error('update coords:: error! [' + id + ']\n', err.stack);
                res.json({result: 'fail'});
        });
});

router.post('/:id/reject', function(req, res, next){
	var user_id = req.params.id;
	var phone_no = req.body.phone_no;

	trycatch(function(){
		pool.getConnection(function(err, connection) {
			if(err) { throw err; }
			var afterTransaction = config.afterTransaction(connection, res);
			connection.beginTransaction(function(err){
				if(err) { throw err; }
				async.waterfall([
					function(callback){
						var args = [user_id, phone_no];
						connection.query(query.insertReject, args, function(err, result){
							if(err) { throw err; }
							logger.debug('reject:: insert success[' + user_id + ']');
							callback(null);
						});
					},
					function(callback){
						var args = [user_id];
						connection.query(query.updateRejectCnt, args, function(err, result){
							if(err) { throw err; }
							callback(null);
						});	
					}
				], afterTransaction );
			});
		});
	},
	function(err){
		logger.error('reject:: error! [' + user_id + ']\n', err.stack);
		res.json({result:'fail', message: err.message});
	});
});

router.post('/:id/charge', function(req, res, next){
	var user_id = req.params.id;
	var coin_id = req.body.coin_id;
	var paper_cnt = 0;

	trycatch(function(){
		switch(coin_id){
			case 'paper_coin_50': 
				paper_cnt = 50;
				break;
			case 'paper_coin_100':
				paper_cnt = 100;
				break;
			case 'paper_coin_500':
				paper_cnt = 500; 
				break;
			case 'paper_coin_1000':
				paper_cnt = 1000;
				break;
			case 'paper_coin_5000':
				paper_cnt = 5000;
				break;
			case 'paper_coin_10000':
				paper_cnt = 10000;
				break;
		}

		pool.getConnection(function(err, connection) {
			if(err){ throw err; }
			connection.beginTransaction(function(err){
				if(err) { throw err; }
				var afterTransaction = config.afterTransaction(connection, res);
				async.waterfall([
					function(callback){
						var args = [user_id, coin_id, paper_cnt];
						connection.query(query.insertCharge, args, function(err, result){
							if(err) { throw err; }
							logger.debug('charge:: insert success[' + user_id + ',' + coin_id + ']');
							callback(null);
						});
					},
					function(callback){
						var args = [paper_cnt, user_id];
						connection.query(query.increasePaperCoin, args, function(err, result){
							if(err) { throw err; }
							logger.debug('charge:: update success[' + user_id + ',' + coin_id + ']');
							callback(null);
						});
					}
				], afterTransaction );
			}); 
		});
	},
	function(err){
		logger.error('charge:: error![' + user_id + ',' + coin_id + ']\n', err.stack);
		res.json({result:'fail', message: err.message});
	});

});

router.put('/:id', function(req, res, next){
	var user_id = req.params.id;
	var sex = req.body.sex;
	var age = req.body.age;
	var name = req.body.name;

	trycatch(function(){
		pool.getConnection(function(err, connection) {
			if(err) { throw err; }

			var args = [sex, name, age, user_id];
			connection.query(query.update, args, function(err, result){
				connection.release();
				if(err){ throw err; }
				logger.debug('user config:: update success[' + user_id + ']');
				res.json({result:'success'});
			});
		});
	},
	function(err){
		logger.error('user config:: error![' + user_id + ']\n', err.stack);
		res.json({result:'fail', message: err.message});
	});

});

router.delete('/:id/reject', function(req, res, next){
	var user_id = req.params.id;
	
	trycatch(function(){
		pool.getConnection(function(err, connection) {
			if(err) { throw err; }
			connection.beginTransaction(function(err) {
				if(err) { throw err; }
				var afterTransaction = config.afterTransaction(connection, res);
				async.waterfall([
					function(callback){
						var args = [user_id];
						connection.query(query.deleteReject, args, function(err, result){
							if(err) { throw err; }
							logger.debug('reset reject:: delete success[' + user_id + ']');
							callback(null); 
						});
					},
					function(callback){
						var args = [user_id];
						connection.query(query.resetRejectCnt, args, function(err, result){
							if(err) { throw err; }
							logger.debug('reset reject:: update user success[' + user_id + ']');
							callback(null);
						});
					}
				], afterTransaction );
			});
		});
	},
	function(err){
		logger.error('reset reject:: error![' + user_id + ']\n', err.stack);
		res.json({result:'fail'});
	});
});

module.exports = router;
