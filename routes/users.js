var express = require('express');
var router = express.Router();
var mysql = require('mysql');
var config = require('../config');
var async = require('async');
var trycatch = require('trycatch');
var pool = mysql.createPool(config.mysql);

var query = {
        selectByPhoneNoOrRegistrationId : "select *     \n"
                + "from users \n"
                + "where phone_no = ? \n"
                + "     or registration_id = ?",
        updateRegIdAndLocation : "update users \n"
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
	increasePaperCoin : "update users \n"
		+ "set paper_coin = paper_coin + ? \n"
		+ ", update_dt = NOW() \n"
		+ "where id = ?",
	insertCharge : "insert into charges(user_id, coin_id, paper_cnt) \n"
		+ "values(?, ?, ?)",
	update : "update users \n"
		+ "set sex = ?, age = ?, update_dt = NOW() \n"
		+ "where id = ?",
	deleteReject : "delete from user_rejects where user_id = ?",
	resetRejectCnt : "update users \n"
		+ "set reject_cnt = 0, update_dt = NOW() \n"
		+ "where id = ?"
};


/* GET users listing. */
router.post('/', function(req, res, next){
	var registration_id = req.param('registration_id');
	var phone_no = req.param('phone_no');
	var latitude = req.param('latitude');
	var longitude = req.param('longitude');

	trycatch(function(){
		pool.getConnection(function(err, connection) {
			if(err) { throw err; }
			async.waterfall([
				function(callback){
					var args = [phone_no, registration_id];
					connection.query(query.selectByPhoneNoOrRegistrationId, args, function(err, results){
						if(err) { throw err; }
						if(results && results.length > 1){
							throw new Error('중복된 사용자가 존재합니다.');	
						}
						callback(null, results && results.length > 0? results[0]: null);
					});
				},
				function(user, callback){
					if(user){
						var args = [registration_id, latitude, longitude, user.id];
						connection.query(query.updateRegIdAndLocation, args, function(err, result){
							if(err) throw err;
							console.log('regist user:: update success');
							callback(null, user);
						});
					}else{
						var args = [phone_no, registration_id, latitude, longitude];
						connection.query(query.insert, args, function(err, result){
							if(err) throw err;
							console.log('regist user:: insert success');
							var newUser = {id: result.insertId,
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
				if(err){
					connection.release();
					throw err;
				}
				connection.release();
				res.json(result);
			});
		});
	},
	function(err){
		console.error('regist user:: error!\n', err.stack);
		res.json({result: 'fail', message:err.message});
	});
});

router.post('/reject', function(req, res, next){
	var user_id = req.param('user_id');
	var phone_no = req.param('phone_no');

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
							console.log('reject:: insert success');
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
	});

	},
	function(err){
		console.error('reject:: error!\n', err.stack);
		res.json({result:'fail', message: err.message});
	});
});

router.post('/charge', function(req, res, next){
	var user_id = req.param('user_id');
	var coin_id = req.param('coin_id');
	var paper_cnt = req.param('paper_cnt');

	trycatch(function(){
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
							console.log('charge:: insert success');
							callback(null);
						});
					},
					function(callback){
						var args = [paper_cnt, user_id];
						connection.query(query.increasePaperCoin, args, function(err, result){
							if(err) { throw err; }
							console.log('charge:: update success');
							callback(null);
						});
					}
				], afterTransaction );
			}); 
		});
	},
	function(err){
		console.error('charge:: error!\n', err.stack);
		res.json({result:'fail', message: err.message});
	});

});

router.put('/', function(req, res, next){
	var user_id = req.param('user_id');
	var sex = req.param('sex');
	var age = req.param('age');

	trycatch(function(){
		pool.getConnection(function(err, connection) {
			if(err) { throw err; }

			var args = [sex, age, user_id];
			connection.query(query.update, args, function(err, result){
				if(err){ 
					connection.release();
					throw err; 
				}
				connection.release();
				console.log('user config:: update success');
				res.json({result:'success'});
			});
		});
	},
	function(err){
		console.error('user config:: error!\n', err.stack);
		res.json({result:'fail', message: err.message});
	});

});

router.put('/resetReject', function(req, res, next){
	var user_id = req.param('user_id');
	
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
							console.log('reset reject:: delete success');
							callback(null); 
						});
					},
					function(callback){
						var args = [user_id];
						connection.query(query.resetRejectCnt, args, function(err, result){
							if(err) { throw err; }
							console.log('reset reject:: update user success');
							callback(null);
						});
					}
				], afterTransaction );
			});
		});
	},
	function(err){
		console.error('reset reject:: error!\n', err.stack);
		res.json({result:'fail'});
	});
});

module.exports = router;
