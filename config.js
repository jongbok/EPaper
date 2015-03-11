var config = {};

config.mysql = {
        host : 'epaper.clpilgc0yifo.ap-northeast-1.rds.amazonaws.com',
        user : 'epaper',
        password : 'epaper#app$446',
	connectionLimit:20,
	waitForConnections:false,
	database: 'epaperDB',
	debug: true
        };

config.gcm = {
	senderId: 'AIzaSyDKmynK-Xc2Gfn8sVUZGMoGTc-eKTWdsqI'
	};

module.exports = config;
