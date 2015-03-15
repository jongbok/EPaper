var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var dateFormat = require('dateformat');
var config = require('./config');

var rotatingLogStream = require('file-stream-rotator').getStream(config.express.logStream);
var users = require('./routes/users');
var messages = require('./routes/messages');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

logger.token('ldate', function getDate(){
	return dateFormat(new Date(), "yyyy-mm-dd HH:MM:ss");	
});

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger(config.express.logFormat, {stream: rotatingLogStream}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/users', users);
app.use('/messages', messages);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    console.error(JSON.stringify(err));
    res.json({result:'fail', message: err.message});
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.json({result:'fail', message: err.message});
});

module.exports = app;
