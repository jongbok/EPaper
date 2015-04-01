var socket = require('socket.io');
var config = require('./config');
var redis = require('redis');
var redisAdapter = require('socket.io-redis');
var redisOptions = require('parse-redis-url')(redis).parse(config.redis.url);
var pub = redis.createClient(redisOptions.port, redisOptions.host, {
  detect_buffers: true,
  auth_pass: redisOptions.password
});
var sub = redis.createClient(redisOptions.port, redisOptions.host, {
  detect_buffers: true,
  auth_pass: redisOptions.password
});
var logger = config.getLogger();

var chat = function(server){
	var io = socket(server);
	io.adapter(redisAdapter({
	  pubClient: pub,
	  subClient: sub
	}));

	console.log('Redis adapter started');
	io.set('authorization', function (handshakeData, accept) {
		var reqAuthToken =  handshakeData._query.tocken;
		var reqTime = handshakeData._query.timestamp;
		var authToken = config.express.authToken;
		var currTime = new Date().getTime();
		if(!reqAuthToken){
			accept('Deny1', false);
			logger.error('chat:: auth-token is empty!');
			return;
		}
		if(!reqTime){
			accept('Deny2', false);
			logger.error('chat:: timestamp is empty!');
			return;
		}
		reqTime *= 1;
		var gapTime = Math.abs(currTime - reqTime);
		if(gapTime > (1000 * 60 * 3)){
			accept('Deny3', false);
			logger.error('chat:: timestamp is expired![' + currTime + ',' + reqTime + ']');
			return;
		}
		if(reqAuthToken !== authToken){
			accept('Deny4', false);
			logger.error('chat:: auth-token is invalid!');
			return;
		}
		accept(null, true);
	});

	io.sockets.on('connection', function(socket){
		socket.emit('connected');
		socket.on('create', function(data){
			socket.userName = data.userName;
			socket.userId = data.userId;
			socket.roomId = data.roomId;
			socket.isOwner = true;
			socket.join(data.roomId);
			socket.emit('created');
			logger.debug('chat:: created![' + data.roomId + ',' + data.userId + ']');
		});

		socket.on('isroom', function(roomId){
			var room = io.sockets.adapter.rooms[roomId];
			socket.emit('isroom', room? true: false);
		});

		socket.on('join', function(data){
			var room = io.sockets.adapter.rooms[data.roomId];
			if(room){
				socket.userName = data.userName;
				socket.userId = data.userId;
				socket.roomId = data.roomId;
				socket.isOwner = false;
				socket.join(data.roomId);
				io.sockets.in(data.roomId).emit('joined', data); 
			}else{
				socket.emit('end');
			}
			logger.debug('chat:: joined![' + data.roomId + ',' + data.userId + ']');
		});

		socket.on('send', function(data){
			var message = {userId: socket.userId, userName: socket.userName, text:data, date: new Date()};
			io.sockets.in(socket.roomId).emit('chat', message); 
			logger.debug('chat:: send! - ' + JSON.stringify(message));
		});


		socket.on('leave', function(){
			if(socket.isOwner){
				logger.debug('chat:: leave owner![' + socket.roomId + ',' + socket.userId + ']');
				io.sockets.in(socket.roomId).emit('leave1');
				var room = io.sockets.adapter.rooms[socket.roomId];
				for(var clientId in room){
					var clientSocket = io.sockets.connected[clientId];
					clientSocket.leave(socket.roomId);
				}
				delete io.sockets.adapter.rooms[socket.roomId];
			}else{
				logger.debug('chat:: leave member![' + socket.roomId + ',' + socket.userId + ']');
				socket.leave(socket.roomId);
				io.sockets.in(socket.roomId).emit('leave2', {userId: socket.userId, userName: socket.userName}); 
			}
		});
			
	});
};

module.exports = chat;
