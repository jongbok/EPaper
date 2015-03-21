var config = require('./config');
var gcm = require('node-gcm');
var async = require('async');
var trycatch = require('trycatch');

var content = '테스트';
console.log(content);

var sender = new gcm.Sender(config.gcm.senderId);
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

var registrationIds = ['APA91bEWsW13JFrylmWuX6j_WtjtW_0tvNYMgkVAaal9rYC-fRa9152uZoOcFP8YN0JysUJzxFcereufWffoA932TXVLeb9dWluv4l5_flnSwCLv7N0CRIb7fDAmGbt3IXaex7sVlUttLJqs1z1La4q0znqAwlSlfF9oXIs2X_XdyYk1KCTuyck', 'asldfksaldfkasdf', 'asdlfkasdlfkgefke'];
sender.send(message, registrationIds, 4, function(err, result){
	if(err) {
		console.error('gcm send error!', err.stack);
		callback(err);
		return;
	}
	console.log('gcm send success! => ' + registrationIds.length);
	console.dir(result);
});


